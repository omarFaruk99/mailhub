// Routes for brands and their contacts.
import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { seedStarterTemplates } from "../data/starter-templates.js";

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
