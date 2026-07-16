// Campaign routes: create, list, send (broadcast), and unsubscribe.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { sendEmail } from "../email/ses.js";

const router = Router();

const base = () => `http://localhost:${process.env.BACKEND_PORT || 4000}`;

// ---- Create a campaign (draft) ----
const campaignSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
});

router.post("/brands/:brandId/campaigns", async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  try {
    const campaign = await prisma.campaign.create({
      data: { ...parsed.data, brandId: req.params.brandId },
    });
    res.status(201).json(campaign);
  } catch (e: any) {
    if (e.code === "P2003") return res.status(404).json({ error: "brand not found" });
    throw e;
  }
});

router.get("/brands/:brandId/campaigns", async (req, res) => {
  res.json(
    await prisma.campaign.findMany({
      where: { brandId: req.params.brandId },
      orderBy: { createdAt: "desc" },
    })
  );
});

// ---- Recipients of a campaign (with open/click status) ----
router.get("/campaigns/:campaignId/recipients", async (req, res) => {
  res.json(
    await prisma.campaignRecipient.findMany({
      where: { campaignId: req.params.campaignId },
      orderBy: { sentAt: "desc" },
    })
  );
});

// ---- Send a campaign (broadcast with filter) ----
// Which contact types each category is sent to BY DEFAULT (when the caller
// does not pass includeTypes). This is the safe server-side rule; the UI
// mirrors it to pre-check boxes, but the user can adjust and send its own list.
const CONTACT_TYPES = ["client", "prospect", "internal"] as const;
// Authoritative rule. Frontend `defaultTypes` (campaigns/[id]/page.tsx) mirrors
// this to pre-check boxes — keep the two in sync.
function defaultTypesForCategory(category: string): string[] {
  if (category === "Marketing/Offers") return ["client", "prospect"];
  return ["client"]; // Product updates / Tips / Transactional: clients by default
}

// Optional filter in body: { plan, country, company, includeTypes }
const filterSchema = z.object({
  plan: z.string().optional(),
  country: z.string().optional(),
  company: z.string().optional(),
  includeTypes: z.array(z.enum(CONTACT_TYPES)).optional(),
});

router.post("/campaigns/:campaignId/send", async (req, res) => {
  const filter = filterSchema.safeParse(req.body ?? {});
  if (!filter.success) return res.status(400).json({ error: filter.error.issues });

  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
  if (!campaign) return res.status(404).json({ error: "campaign not found" });

  // Which contact types receive this send.
  const includeTypes =
    filter.data.includeTypes && filter.data.includeTypes.length > 0
      ? filter.data.includeTypes
      : defaultTypesForCategory(campaign.category);

  // Company filter: trim + case-insensitive so "abc travel" matches "ABC Travel".
  const companyFilter = filter.data.company?.trim();

  // 1) Suppressed emails for this brand (unsubscribe/bounce/complaint).
  const suppressed = await prisma.suppression.findMany({
    where: { brandId: campaign.brandId },
    select: { email: true },
  });
  const suppressedSet = new Set(suppressed.map((s) => s.email));

  // 2) Contacts of this brand matching the filter, only subscribed.
  const contacts = await prisma.contact.findMany({
    where: {
      brandId: campaign.brandId,
      status: "subscribed",
      type: { in: includeTypes },
      ...(filter.data.plan ? { plan: filter.data.plan } : {}),
      ...(filter.data.country ? { country: filter.data.country } : {}),
      ...(companyFilter ? { company: { equals: companyFilter, mode: "insensitive" as const } } : {}),
    },
  });

  let sent = 0;
  let skippedSuppressed = 0;
  let skippedAlready = 0;
  let failed = 0;

  for (const c of contacts) {
    if (suppressedSet.has(c.email)) {
      skippedSuppressed++;
      continue;
    }

    // Exactly-once: skip if this contact already got this campaign.
    const already = await prisma.campaignRecipient.findUnique({
      where: { campaignId_contactId: { campaignId: campaign.id, contactId: c.id } },
    });
    if (already) {
      skippedAlready++;
      continue;
    }

    // Create the recipient row first, so we have an id for tracking links.
    const rec = await prisma.campaignRecipient.create({
      data: { campaignId: campaign.id, contactId: c.id, email: c.email, status: "sending" },
    });

    const b = base();
    const unsubUrl = `${b}/unsubscribe?b=${campaign.brandId}&c=${c.id}`;

    // Click tracking: rewrite every http(s) link through /track/click.
    let body = campaign.html.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (_m, url) => `href="${b}/track/click?r=${rec.id}&u=${encodeURIComponent(url)}"`
    );
    // Unsubscribe footer + open-tracking pixel.
    const html =
      body +
      `<hr><p style="font-size:12px;color:#888">Don't want these emails?
         <a href="${unsubUrl}">Unsubscribe</a></p>` +
      `<img src="${b}/track/open?r=${rec.id}" width="1" height="1" style="display:none" alt="">`;

    try {
      const messageId = await sendEmail({
        to: c.email,
        subject: campaign.subject,
        html,
        headers: [
          { Name: "List-Unsubscribe", Value: `<${unsubUrl}>` },
          { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
        ],
      });
      await prisma.campaignRecipient.update({
        where: { id: rec.id },
        data: { messageId, status: "sent" },
      });
      sent++;
      await new Promise((r) => setTimeout(r, 200)); // gentle rate limit
    } catch (e) {
      failed++;
      await prisma.campaignRecipient.update({
        where: { id: rec.id },
        data: { status: "failed" },
      });
    }
  }

  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "sent" } });

  res.json({ matched: contacts.length, sent, skippedSuppressed, skippedAlready, failed, includeTypes });
});

// ---- Unsubscribe (GET = user clicks link; POST = Gmail one-click) ----
async function doUnsubscribe(brandId: string, contactId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.brandId !== brandId) return false;

  await prisma.contact.update({ where: { id: contactId }, data: { status: "unsubscribed" } });
  await prisma.suppression.upsert({
    where: { brandId_email: { brandId, email: contact.email } },
    update: {},
    create: { brandId, email: contact.email, reason: "unsubscribe" },
  });
  return true;
}

router.get("/unsubscribe", async (req, res) => {
  const b = String(req.query.b || "");
  const c = String(req.query.c || "");
  const ok = await doUnsubscribe(b, c);
  res
    .status(ok ? 200 : 400)
    .send(
      ok
        ? `<div style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center">
             <h2>You're unsubscribed ✅</h2>
             <p>You will no longer receive these emails.</p>
           </div>`
        : `<p style="font-family:sans-serif">Invalid unsubscribe link.</p>`
    );
});

router.post("/unsubscribe", async (req, res) => {
  const b = String(req.query.b || "");
  const c = String(req.query.c || "");
  await doUnsubscribe(b, c);
  res.status(200).json({ ok: true });
});

export default router;
