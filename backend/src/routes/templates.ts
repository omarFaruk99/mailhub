// Template routes: CRUD for saved, filled email designs.
// The frontend renders layout+fields into `html` (via React Email) and sends it here;
// the backend just stores strings — no rendering here.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

const templateSchema = z.object({
  name: z.string().min(1),
  layoutKey: z.string().min(1),
  subject: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(), // filled field values
  html: z.string().min(1), // rendered HTML (may contain {{name}} merge tags)
});

// Create
router.post("/brands/:brandId/templates", async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  try {
    const t = await prisma.template.create({
      data: {
        brandId: req.params.brandId,
        name: parsed.data.name,
        layoutKey: parsed.data.layoutKey,
        subject: parsed.data.subject ?? "",
        fields: JSON.stringify(parsed.data.fields ?? {}),
        html: parsed.data.html,
      },
    });
    res.status(201).json(t);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "template name already exists in this brand" });
    if (e.code === "P2003") return res.status(404).json({ error: "brand not found" });
    throw e;
  }
});

// List
router.get("/brands/:brandId/templates", async (req, res) => {
  res.json(
    await prisma.template.findMany({
      where: { brandId: req.params.brandId },
      orderBy: { updatedAt: "desc" },
    })
  );
});

// Update (partial)
router.put("/templates/:id", async (req, res) => {
  const parsed = templateSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.layoutKey !== undefined) data.layoutKey = parsed.data.layoutKey;
  if (parsed.data.subject !== undefined) data.subject = parsed.data.subject;
  if (parsed.data.fields !== undefined) data.fields = JSON.stringify(parsed.data.fields);
  if (parsed.data.html !== undefined) data.html = parsed.data.html;
  try {
    const t = await prisma.template.update({ where: { id: req.params.id }, data });
    res.json(t);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "template not found" });
    if (e.code === "P2002") return res.status(409).json({ error: "template name already exists in this brand" });
    throw e;
  }
});

// Delete
router.delete("/templates/:id", async (req, res) => {
  try {
    await prisma.template.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "template not found" });
    throw e;
  }
});

export default router;
