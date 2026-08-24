// The actual broadcast. Lives here (not in the route) because two callers need it:
// the "Send now" endpoint and the scheduled-send worker.
import { prisma } from "../prisma.js";
import { sendEmail } from "./ses.js";
import { isPaused, pauseIfUnhealthy } from "./auto-pause.js";
import { selectAudience } from "./audience.js";

/** Thrown when a send is refused because the brand's sending is paused. */
export class SendingPausedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "SendingPausedError";
  }
}

// The audience vocabulary lives in ./filter-types.js so that ./audience.js can
// use it without importing this module — this one imports ./audience.js, and the
// two pointing at each other is a cycle. Re-exported here because every existing
// caller reaches for these through send-campaign.
export { CONTACT_TYPES, type ContactType, type SendFilter } from "./filter-types.js";
import type { ContactType, SendFilter } from "./filter-types.js";

export type SendResult = {
  matched: number;
  sent: number;
  skippedSuppressed: number;
  skippedAlready: number;
  failed: number;
  includeTypes: string[];
  /** Set when auto-pause stopped the send before it reached everyone. */
  stoppedReason?: string;
};

// How often the send loop re-checks whether auto-pause has tripped. Bounces
// arrive by webhook WHILE a long send is running, so checking only at the start
// would let a bad list run to the end — exactly the case auto-pause exists for.
const PAUSE_CHECK_EVERY = 25;

// The public address this server is reachable at. Every unsubscribe link, open
// pixel and tracked link in an email points here, and those links are opened days
// later from a stranger's inbox — so it must be the real outside URL, never
// "localhost" (which would resolve to the RECIPIENT's own machine).
// Exported so the test-send route builds its unsubscribe link from the same
// rule; a second copy of this fallback would drift.
export const base = () => {
  const url = process.env.PUBLIC_URL?.trim();
  if (url) return url.replace(/\/+$/, "");
  return `http://localhost:${process.env.BACKEND_PORT || 4000}`;
};

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
 * Merge tags: replace {{name}} with this contact's name (fallback "there").
 *
 * Exported because the click-tracking route has to reproduce it EXACTLY: links are
 * rewritten from the personalized HTML, so a link containing {{name}} is not the
 * link stored on the campaign. Two copies of this rule would drift and start
 * rejecting real links — one function, called from both places.
 *
 * The value is HTML-escaped and passed as a function replacement, so a name
 * containing <, &, " or $ can neither break the markup nor the replacement pattern.
 */
export function personalizeHtml(html: string, name?: string | null): string {
  const safeName = escapeHtml(name?.trim() || "there");
  return html.replace(/\{\{\s*name\s*\}\}/gi, () => safeName);
}

/** Every http(s) link in a piece of email HTML. */
export function linksIn(html: string): Set<string> {
  const found = new Set<string>();
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) found.add(m[1]);
  return found;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MERGE_TAG = /\{\{\s*name\s*\}\}/gi;

/**
 * Is `url` one of the links this campaign puts in its emails?
 *
 * Compared against the campaign's STORED html, with each merge tag standing for
 * "whatever was substituted here". Comparing against one recipient's personalized
 * copy instead would tie every past link to the value the tag has NOW — so
 * renaming a contact would silently kill the links already in their inbox.
 *
 * The security boundary is the ORIGIN, checked separately from the shape. A tag
 * may stand for anything (names contain slashes, question marks, spaces), but the
 * scheme+host must be exactly the one the campaign's author wrote. Redirecting
 * within a site the sender chose is not an open redirect; redirecting to another
 * host is, and that is what this refuses.
 */
export function isCampaignLink(campaignHtml: string, url: string): boolean {
  // Control characters only. A CR/LF would slip past an anchored pattern and make
  // res.redirect throw on an illegal header value, so those are refused — but a
  // plain SPACE has to be allowed: a contact called "John Smith" substituted into
  // a link gives `.../u/John Smith`, and Express percent-encodes it on the way out.
  // Rejecting whitespace broke every personalized link for anyone whose name has a
  // space in it, which is most people.
  if (/[\u0000-\u001f\u007f]/.test(url)) return false;

  let candidate: URL;
  try {
    candidate = new URL(url);
  } catch {
    return false;
  }
  if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return false;

  for (const raw of linksIn(campaignHtml)) {
    if (raw === url) return true;
    if (!raw.match(MERGE_TAG)) continue;

    // Same origin as the stored link — measured with the tag filled by a harmless
    // placeholder, so a tag inside the host cannot widen this.
    let base: URL;
    try {
      base = new URL(raw.replace(MERGE_TAG, "x"));
    } catch {
      continue;
    }
    if (base.origin !== candidate.origin) continue;

    // The substituted value may contain slashes and spaces — real names do
    // ("R&D / Ops", "John Smith") — but never `?` or `#`. Excluding those two
    // stops a query string or fragment being bolted onto the end, which is how a
    // link would otherwise be turned into `…/u/x?next=<somewhere else>`. Together
    // with the origin check above, a click can only ever land on a page of the
    // site the campaign's author linked to.
    const pattern = raw.split(MERGE_TAG).map(escapeRegex).join("[^?#]*");
    if (new RegExp(`^${pattern}$`).test(url)) return true;
  }
  return false;
}

/**
 * Send one campaign to everyone matching `filter`.
 *
 * Exactly-once: a `CampaignRecipient` row is unique per (campaign, contact), so a
 * retry, a crash, or a duplicate job can never email the same person twice.
 */
export async function sendCampaign(campaignId: string, filter: SendFilter): Promise<SendResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("campaign not found");

  // Last line of defence. The route and the worker both check before they get
  // here, but this is the one function every send goes through, so a future
  // caller cannot forget it.
  const pausedAtStart = await isPaused(campaign.brandId);
  if (pausedAtStart.paused) {
    throw new SendingPausedError(pausedAtStart.reason ?? "sending is paused for this brand");
  }

  const includeTypes =
    filter.includeTypes && filter.includeTypes.length > 0
      ? filter.includeTypes
      : defaultTypesForCategory(campaign.category);

  // 1) Suppressed emails for this brand (unsubscribe/bounce/complaint).
  const suppressed = await prisma.suppression.findMany({
    where: { brandId: campaign.brandId },
    select: { email: true },
  });
  const suppressedSet = new Set(suppressed.map((s) => s.email));

  // 2) Contacts of this brand matching the filter, only subscribed. The rule
  // itself is in audience.ts, mirrored by the send page, so the count the sender
  // approved is the set this loop emails — one definition, not two that drift.
  const contacts = await selectAudience(campaign.brandId, filter, includeTypes);

  let sent = 0;
  let skippedSuppressed = 0;
  let skippedAlready = 0;
  let failed = 0;
  let processed = 0;
  let stoppedReason: string | null = null;

  for (const c of contacts) {
    // Re-check auto-pause every so often. A bounce webhook can trip the breaker
    // halfway through a 700-person send; stopping here is the whole point.
    if (processed > 0 && processed % PAUSE_CHECK_EVERY === 0) {
      const state = await pauseIfUnhealthy(campaign.brandId);
      if (state.paused) {
        stoppedReason = state.reason ?? "sending is paused for this brand";
        console.error(`[auto-pause] stopping campaign ${campaign.id} mid-send — ${stoppedReason}`);
        break;
      }
    }
    processed++;

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

    const personalized = personalizeHtml(campaign.html, c.name);

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
  // scheduledAt/timezone are cleared too: a leftover past time pre-fills the
  // schedule picker with a moment that has gone, and the server then rejects it.
  // When it was sent is already recorded on every recipient row.
  //
  // "failed" means this campaign has never reached anybody — counted across ALL
  // passes, not just this one. A "send to the remaining N" where those N fail
  // must not relabel a campaign that already delivered to hundreds.
  const deliveredEver = await prisma.campaignRecipient.count({
    where: { campaignId: campaign.id, status: "sent" },
  });
  // Auto-pause stopped the loop with people still on the list. "sent" would claim
  // it finished — and worse, both /schedule and the send page refuse a "sent"
  // campaign, so the ~hundreds left over could never be scheduled, only blasted
  // by hand. "failed" blames the email for a brand-level block. Draft is the
  // truthful and actionable state: the campaign still has work to do. The send
  // page keeps showing the results and "Send to N more" (it goes by recipient
  // rows, not status), and `lastError` says why it stopped.
  const unfinished = stoppedReason !== null && processed < contacts.length;
  const finalStatus = unfinished
    ? "draft"
    : deliveredEver === 0 && failed > 0
      ? "failed"
      : "sent";
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: finalStatus,
      jobId: null,
      scheduledAt: null,
      timezone: null,
      // Why it did not finish, kept for the send page. Cleared on a clean run so
      // an old reason never lingers on a campaign that has since gone out fine.
      lastError: stoppedReason ? `Stopped early — ${stoppedReason}` : null,
    },
  });

  return {
    matched: contacts.length,
    sent,
    skippedSuppressed,
    skippedAlready,
    failed,
    includeTypes,
    ...(stoppedReason ? { stoppedReason } : {}),
  };
}
