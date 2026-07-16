// Routes for brands and their contacts.
import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "../prisma.js";

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
const contactSchema = z.object({
  email: z.email(),
  name: z.string().optional(),
  country: z.string().optional(),
  plan: z.string().optional(),
});

// Add one contact
router.post("/brands/:brandId/contacts", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const email = parsed.data.email.trim().toLowerCase();
  try {
    const contact = await prisma.contact.create({
      data: { ...parsed.data, email, brandId: req.params.brandId },
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

// Import many contacts from a CSV file (field name: "file")
// Expected columns: email, name, country, plan
router.post("/brands/:brandId/contacts/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no CSV file uploaded (form field 'file')" });

  const csv = req.file.buffer.toString("utf8");
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const rows = parsed.data;

  const brandId = String(req.params.brandId);
  const data = rows
    .filter((r) => r.email && r.email.trim())
    .map((r) => ({
      brandId,
      email: r.email.trim().toLowerCase(),
      name: r.name?.trim() || null,
      country: r.country?.trim() || null,
      plan: r.plan?.trim() || null,
    }));

  // skipDuplicates: an email already in this brand is skipped (no duplicates).
  const result = await prisma.contact.createMany({ data, skipDuplicates: true });
  res.json({ received: rows.length, added: result.count, skipped: rows.length - result.count });
});

export default router;
