// Segment routes: CRUD for saved, named audience rules ("Paid clients · Bangladesh").
//
// A segment holds a RULE, never a list of people. Nothing here copies contacts
// anywhere — the count is recomputed on every read, so a contact added this
// morning is inside the segment this morning.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { ALL_TYPES, audienceCount, resolveTypes, suppressedEmails } from "../email/audience.js";
import { CONTACT_TYPES, type ContactType } from "../email/filter-types.js";

const router = Router();

// A blank text filter means "any", and "" vs null vs "  " must not be three
// different ways to say that — they all become null before they are stored.
const optionalText = z
  .string()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : null;
  });

const segmentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // At least one type. "Empty means everyone" would have been read the opposite
  // way by the send page, where no types ticked means NOBODY — so a segment
  // covering the whole list could have labelled a send that reached no one.
  // Duplicates are removed so ["client","client"] cannot reach the database and
  // make the rule look like something it is not.
  includeTypes: z
    .array(z.enum(CONTACT_TYPES))
    .min(1, "Pick at least one contact type.")
    .transform((v) => [...new Set(v)]),
  plan: optionalText,
  country: optionalText,
  company: optionalText,
});

type Rule = { includeTypes: string[]; plan: string | null; country: string | null; company: string | null };

/**
 * The rule as one comparable string, stored in `Segment.ruleKey` and uniquely
 * indexed per brand.
 *
 * Normalised the way the filters themselves are compared, so two rules that
 * select the same people produce the same key. The migration that added the
 * column backfills with the same expression — change one, change both.
 */
const ruleKey = (s: Rule) =>
  [
    [...s.includeTypes].sort().join(","),
    (s.plan ?? "").toLowerCase(),
    (s.country ?? "").toLowerCase(),
    (s.company ?? "").toLowerCase(),
  ].join("|");

/**
 * A friendly sentence for a name or rule that is already taken — or null.
 *
 * The database is what actually enforces both (`@@unique` on name and on
 * ruleKey); this runs first only so the message can name the twin, which a
 * constraint violation cannot. The one thing it enforces alone is case: Postgres
 * unique is case-SENSITIVE, so "Paid clients" and "paid clients" would both save
 * and read as the same entry in the send page's picker.
 */
async function conflict(brandId: string, candidate: Rule & { name?: string }, ignoreId?: string): Promise<string | null> {
  const others = (await prisma.segment.findMany({ where: { brandId } })).filter((s) => s.id !== ignoreId);
  const name = candidate.name?.trim().toLowerCase();
  if (name && others.some((s) => s.name.trim().toLowerCase() === name)) {
    return "A segment with this name already exists.";
  }
  const twin = others.find((s) => s.ruleKey === ruleKey(candidate));
  if (twin) return `"${twin.name}" already selects exactly these people. Edit that one instead.`;
  return null;
}

/** Turn a unique-constraint violation into the sentence for the field that clashed. */
function uniqueMessage(e: { meta?: { target?: unknown } }): string {
  const target = Array.isArray(e.meta?.target) ? e.meta.target.join(",") : String(e.meta?.target ?? "");
  return target.includes("ruleKey")
    ? "Another segment already selects exactly these people."
    : "A segment with this name already exists.";
}

/** The saved rule, as the send filter that it is. */
const toFilter = (s: { includeTypes: string[]; plan: string | null; country: string | null; company: string | null }) => ({
  includeTypes: s.includeTypes as ContactType[],
  ...(s.plan ? { plan: s.plan } : {}),
  ...(s.country ? { country: s.country } : {}),
  ...(s.company ? { company: s.company } : {}),
});

// List, each with how many people it currently selects.
router.get("/brands/:brandId/segments", async (req, res) => {
  const { brandId } = req.params;
  const segments = await prisma.segment.findMany({
    where: { brandId },
    orderBy: { name: "asc" },
  });
  // Read the block list once for the whole page rather than once per segment.
  const blocked = await suppressedEmails(brandId);
  const withCounts = await Promise.all(
    segments.map(async (s) => ({
      ...s,
      count: await audienceCount(brandId, toFilter(s), resolveTypes(s.includeTypes as ContactType[], ALL_TYPES), blocked),
    }))
  );
  res.json(withCounts);
});

// There is deliberately no "preview this unsaved rule" endpoint: the editor
// already holds the brand's contacts (it needs them for the dropdown options),
// so it counts locally with the mirrored rule in lib/audience.ts and the number
// moves as you tick a box, with no round trip.

// Create
router.post("/brands/:brandId/segments", async (req, res) => {
  const parsed = segmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const clash = await conflict(req.params.brandId, parsed.data);
  if (clash) return res.status(409).json({ error: clash });
  try {
    const s = await prisma.segment.create({
      // ruleKey is derived, never sent by the client — it is the unique index
      // that makes "one rule per brand" true even when two requests race.
      data: { brandId: req.params.brandId, ...parsed.data, ruleKey: ruleKey(parsed.data) },
    });
    res.status(201).json(s);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: uniqueMessage(e) });
    if (e.code === "P2003") return res.status(404).json({ error: "brand not found" });
    throw e;
  }
});

// Update (partial).
//
// Editing a segment is safe for a campaign that is already scheduled: the send
// froze the resolved filter values in `Campaign.sendOptions`, so it never reads
// the segment again. Changing "Paid clients" tomorrow cannot redirect a send
// that was set up today.
router.put("/segments/:id", async (req, res) => {
  const parsed = segmentSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const current = await prisma.segment.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "segment not found" });

  // Check the segment as it WILL be, not just the fields that were sent: adding
  // a country to one segment can make it identical to another.
  const clash = await conflict(current.brandId, { ...current, ...parsed.data }, current.id);
  if (clash) return res.status(409).json({ error: clash });

  try {
    const s = await prisma.segment.update({
      where: { id: req.params.id },
      // Recomputed from the merged segment: a PUT that only changes `country`
      // still changes the rule, and a stale ruleKey would let a twin through.
      data: { ...parsed.data, ruleKey: ruleKey({ ...current, ...parsed.data }) },
    });
    res.json(s);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "segment not found" });
    if (e.code === "P2002") return res.status(409).json({ error: uniqueMessage(e) });
    throw e;
  }
});

// Delete. Nothing else points at a segment, so this removes a shortcut and
// nothing more — no contact, no campaign and no past send is touched.
router.delete("/segments/:id", async (req, res) => {
  try {
    await prisma.segment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "segment not found" });
    throw e;
  }
});

export default router;
