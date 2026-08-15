// Routes for brands and their contacts.
import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { seedStarterTemplates } from "../data/starter-templates.js";
import { pauseSending, resumeSending, sendingStatus } from "../email/auto-pause.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---- Brands ----
const brandSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
});

router.post("/brands", async (req, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  try {
    const brand = await prisma.brand.create({ data: parsed.data });
    // Every new brand starts with the ready-made templates in its gallery.
    // Don't fail brand creation if seeding hiccups — just log it.
    try {
      await seedStarterTemplates(brand.id);
    } catch (seedErr) {
      console.error("seed starter templates failed for brand", brand.id, seedErr);
    }
    res.status(201).json(brand);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "domain already exists" });
    throw e;
  }
});

router.get("/brands", async (_req, res) => {
  res.json(await prisma.brand.findMany({ orderBy: { createdAt: "asc" } }));
});

// ---- Auto-pause (circuit breaker) ----
// Whether this brand may send, plus the rolling bounce/complaint numbers behind
// that answer. Every screen polls this, so it stays a cheap read.
router.get("/brands/:brandId/sending-status", async (req, res) => {
  const status = await sendingStatus(req.params.brandId);
  if (!status) return res.status(404).json({ error: "brand not found" });
  res.json(status);
});

// Let this brand send again. Refused while the thresholds are still crossed —
// pass { force: true } to override, which is the "I have already cleaned the list"
// case (the rolling window still carries the old events for days).
const resumeSchema = z.object({ force: z.boolean().optional() });

router.post("/brands/:brandId/resume-sending", async (req, res) => {
  const parsed = resumeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const brand = await prisma.brand.findUnique({ where: { id: req.params.brandId } });
  if (!brand) return res.status(404).json({ error: "brand not found" });

  const result = await resumeSending(brand.id, parsed.data.force ?? false);
  if (!result.ok) {
    return res.status(409).json({
      error: `Still over the limit — ${result.reason}. Clean the list first, or resume anyway.`,
      canForce: true,
      health: result.health,
    });
  }
  res.json(await sendingStatus(brand.id));
});

// Stop this brand's sending by hand — the "something looks wrong, hold everything"
// switch. Same block as an automatic pause; only a resume clears it.
const pauseSchema = z.object({ reason: z.string().min(1).optional() });

router.post("/brands/:brandId/pause-sending", async (req, res) => {
  const parsed = pauseSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const brand = await prisma.brand.findUnique({ where: { id: req.params.brandId } });
  if (!brand) return res.status(404).json({ error: "brand not found" });

  await pauseSending(brand.id, parsed.data.reason?.trim() || "Paused by hand");
  res.json(await sendingStatus(brand.id));
});

// ---- Contacts (inside a brand) ----
// Allowed contact types. internal = our own colleagues.
const CONTACT_TYPES = ["client", "prospect", "internal"] as const;

const contactSchema = z.object({
  email: z.email(),
  name: z.string().optional(),
  country: z.string().optional(),
  plan: z.string().optional(),
  type: z.enum(CONTACT_TYPES).optional(),
  company: z.string().optional(),
});

// Add one contact
router.post("/brands/:brandId/contacts", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const email = parsed.data.email.trim().toLowerCase();
  // Store blank optional fields as null (not ""), same as the CSV importer.
  const clean = (s?: string) => {
    const t = s?.trim();
    return t ? t : null;
  };
  try {
    const contact = await prisma.contact.create({
      data: {
        brandId: req.params.brandId,
        email,
        name: clean(parsed.data.name),
        country: clean(parsed.data.country),
        plan: clean(parsed.data.plan),
        type: parsed.data.type ?? "client",
        // internal (our colleagues) never carry a company.
        company: parsed.data.type === "internal" ? null : clean(parsed.data.company),
      },
    });
    res.status(201).json(contact);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "email already exists in this brand" });
    if (e.code === "P2003") return res.status(404).json({ error: "brand not found" });
    throw e;
  }
});

// List contacts of a brand
router.get("/brands/:brandId/contacts", async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { brandId: req.params.brandId },
    orderBy: { createdAt: "desc" },
  });
  res.json(contacts);
});

// ---- Edit one contact ----
// Everything except `status` may change. Status is deliberately read-only: it is
// set by what PEOPLE did (unsubscribed, bounced, complained), and letting an
// operator type "subscribed" over it would re-enrol someone who asked to be left
// alone — the one mistake that is both illegal and reputation-destroying.
const contactEditSchema = contactSchema.partial();

router.put("/contacts/:id", async (req, res) => {
  const parsed = contactEditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact) return res.status(404).json({ error: "contact not found" });

  const clean = (s?: string) => {
    const t = s?.trim();
    return t ? t : null;
  };

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = clean(parsed.data.name);
  if (parsed.data.country !== undefined) data.country = clean(parsed.data.country);
  if (parsed.data.plan !== undefined) data.plan = clean(parsed.data.plan);
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.company !== undefined) data.company = clean(parsed.data.company);
  // internal (our colleagues) never carry a company — same rule as create/import.
  // Applied against the type this contact will HAVE, not the one it had.
  const finalType = (data.type as string | undefined) ?? contact.type;
  if (finalType === "internal") data.company = null;

  if (parsed.data.email !== undefined) {
    const email = parsed.data.email.trim().toLowerCase();
    if (email !== contact.email) {
      // Changing the address of someone we are forbidden to email would hand them
      // a fresh, unsuppressed identity — an unsubscribe undone by a typo fix. The
      // suppression list is keyed by address, so it cannot follow the rename.
      // Fixing a genuinely mistyped address is still possible: delete the contact
      // and add the correct one, which is the honest description of what happened.
      const suppressed = await prisma.suppression.findUnique({
        where: { brandId_email: { brandId: contact.brandId, email: contact.email } },
      });
      if (suppressed) {
        return res.status(409).json({
          // Same words as the dialog that normally prevents this, so a user who
          // reaches it another way is not told a second, different story.
          error:
            `This contact is blocked (${suppressed.reason}). If you change their email address, ` +
            `they will start receiving emails again. Wrong address? Delete this contact and add ` +
            `the correct one.`,
        });
      }
      data.email = email;
    }
  }

  try {
    const updated = await prisma.contact.update({ where: { id: contact.id }, data });
    res.json(updated);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Another contact already uses that email address." });
    throw e;
  }
});

// ---- Delete one contact ----
// Their send history goes too (recipient rows point at the contact). The
// suppression row does NOT: it is keyed by email, not by contact, and it is the
// only thing standing between us and emailing an unsubscribed person again after
// a future CSV import re-adds them. Deleting a contact must never be a way to
// clear a suppression.
router.delete("/contacts/:id", async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact) return res.status(404).json({ error: "contact not found" });

  // The send loop walks a list of contacts it read at the start and writes a
  // recipient row for each. Delete the one it is about to reach and that write
  // fails on a missing foreign key, taking the whole broadcast down mid-flight.
  // Any send running for this brand is enough reason to wait — a send is minutes,
  // and deleting a contact is never urgent.
  const sending = await prisma.campaign.count({
    where: { brandId: contact.brandId, status: "sending" },
  });
  if (sending > 0) {
    return res.status(409).json({
      error: "a campaign is being sent right now — wait for it to finish before deleting contacts",
    });
  }

  let historyDeleted: number;
  try {
    [{ count: historyDeleted }] = await prisma.$transaction([
      prisma.campaignRecipient.deleteMany({ where: { contactId: contact.id } }),
      prisma.contact.deleteMany({ where: { id: contact.id } }),
    ]);
  } catch (e: any) {
    // The check above is read-then-act, so a send can still claim a campaign and
    // write a recipient row for this contact between the two. The foreign key
    // catches it; answer the same way the guard would rather than a 500.
    if (e?.code === "P2003") {
      return res.status(409).json({
        error: "a campaign started sending just now and reached this contact — nothing was deleted",
      });
    }
    throw e;
  }

  const stillSuppressed = await prisma.suppression.findUnique({
    where: { brandId_email: { brandId: contact.brandId, email: contact.email } },
  });
  res.json({ ok: true, historyDeleted, stillSuppressed: !!stillSuppressed });
});

// List suppressed emails of a brand (used e.g. for an accurate send preview).
router.get("/brands/:brandId/suppressions", async (req, res) => {
  const rows = await prisma.suppression.findMany({
    where: { brandId: req.params.brandId },
    select: { email: true, reason: true },
  });
  res.json(rows);
});

// Import many contacts from a CSV file (field name: "file")
// Expected columns: email, name, country, plan, type, company
router.post("/brands/:brandId/contacts/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no CSV file uploaded (form field 'file')" });

  const csv = req.file.buffer.toString("utf8");
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const rows = parsed.data;

  const brandId = String(req.params.brandId);
  // A misspelt type ("cliennt", "staff") used to become "client" in silence — and
  // "client" is in the default audience of almost every category, so the mistake
  // only surfaced as an email to the wrong person. Blank still means client; a
  // value we don't recognise is imported as client too (never lose a contact) but
  // reported back so the importer can be told.
  const unknownTypes = new Set<string>();
  const data = rows
    .filter((r) => r.email && r.email.trim())
    .map((r) => {
      const raw = r.type?.trim();
      const t = raw?.toLowerCase();
      const known = !!t && (CONTACT_TYPES as readonly string[]).includes(t);
      if (raw && !known) unknownTypes.add(raw);
      const type = known ? t! : "client";
      return {
        brandId,
        email: r.email.trim().toLowerCase(),
        name: r.name?.trim() || null,
        country: r.country?.trim() || null,
        plan: r.plan?.trim() || null,
        type,
        // internal (our colleagues) never carry a company.
        company: type === "internal" ? null : r.company?.trim() || null,
      };
    });

  // skipDuplicates: an email already in this brand is skipped (no duplicates).
  const result = await prisma.contact.createMany({ data, skipDuplicates: true });
  res.json({
    received: rows.length,
    added: result.count,
    skipped: rows.length - result.count,
    // Empty unless the file had a type column value we don't know.
    unknownTypes: [...unknownTypes],
  });
});

export default router;
