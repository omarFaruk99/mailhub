// The actual broadcast. Lives here (not in the route) because two callers need it:
// the "Send now" endpoint and the scheduled-send worker.
import { prisma } from "../prisma.js";
import { sendEmail } from "./ses.js";

export const CONTACT_TYPES = ["client", "prospect", "internal"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export type SendFilter = {
  plan?: string;
  country?: string;
  company?: string;
  includeTypes?: ContactType[];
};

export type SendResult = {
  matched: number;
  sent: number;
  skippedSuppressed: number;
  skippedAlready: number;
  failed: number;
  includeTypes: string[];
};

const base = () => `http://localhost:${process.env.BACKEND_PORT || 4000}`;

// Which contact types each category is sent to BY DEFAULT (when the caller does
// not pass includeTypes). This is the authoritative server-side rule; the UI
// mirrors it to pre-check boxes (frontend `defaultTypes` in campaigns/[id]/page.tsx)
// — keep the two in sync.
export function defaultTypesForCategory(category: string): ContactType[] {
  if (category === "Marketing/Offers") return ["client", "prospect"];
  if (category === "Product updates") return ["client", "prospect", "internal"]; // everyone
  return ["client"]; // Tips / Transactional: clients by default
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));

/**
 * Send one campaign to everyone matching `filter`.
 *
 * Exactly-once: a `CampaignRecipient` row is unique per (campaign, contact), so a
 * retry, a crash, or a duplicate job can never email the same person twice.
 */
export async function sendCampaign(campaignId: string, filter: SendFilter): Promise<SendResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("campaign not found");

  const includeTypes =
    filter.includeTypes && filter.includeTypes.length > 0
      ? filter.includeTypes
      : defaultTypesForCategory(campaign.category);

  // Company filter: trim + case-insensitive so "abc travel" matches "ABC Travel".
  const companyFilter = filter.company?.trim();

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
      ...(filter.plan ? { plan: filter.plan } : {}),
      ...(filter.country ? { country: filter.country } : {}),
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
    // The unique (campaign, contact) index is what actually enforces exactly-once:
    // if two sends race — "Send now" pressed just as the scheduled job fires — one
    // of them loses this insert, and that contact is simply skipped, not emailed
    // twice and not crashed on.
    let rec;
    try {
      rec = await prisma.campaignRecipient.create({
        data: { campaignId: campaign.id, contactId: c.id, email: c.email, status: "sending" },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        skippedAlready++;
        continue;
      }
      throw e;
    }

    const b = base();
    const unsubUrl = `${b}/unsubscribe?b=${campaign.brandId}&c=${c.id}`;

    // Merge tags: replace {{name}} with this contact's name (fallback "there").
    // HTML-escape the value and use a function replacement so names containing
    // <, &, ", or $ can't break the markup or the replacement pattern.
    const safeName = escapeHtml(c.name?.trim() || "there");
    const personalized = campaign.html.replace(/\{\{\s*name\s*\}\}/gi, () => safeName);

    // Click tracking: rewrite every http(s) link through /track/click.
    const body = personalized.replace(
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
    } catch {
      failed++;
      await prisma.campaignRecipient.update({
        where: { id: rec.id },
        data: { status: "failed" },
      });
    }
  }

  // The send is over: clear any scheduling state so a finished campaign never
  // looks like it is still waiting to go out.
  // "failed" when every attempt failed — on a scheduled send nobody is watching
  // the result, and a green "Sent" badge on a campaign that delivered nothing
  // would be a lie. Zero matches is not a failure: there was nothing to send.
  const finalStatus = sent === 0 && failed > 0 ? "failed" : "sent";
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: finalStatus, jobId: null },
  });

  return { matched: contacts.length, sent, skippedSuppressed, skippedAlready, failed, includeTypes };
}
