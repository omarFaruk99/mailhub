// Auto-pause (circuit breaker) — the guardrail that stops sending when bounce or
// complaint rates spike.
//
// Why it matters here more than anywhere else: this system has no consent gate
// (owner's decision — importing a contact means subscribed). Unsubscribe and
// suppression clean up AFTER a bad address is mailed; auto-pause is the only thing
// that stops the *next thousand*. Amazon SES suspends accounts that cross these
// rates, so this protects the sending account itself, not just the reputation.
//
// Scope is per BRAND, because reputation is per brand: one brand's bad import must
// never stop another brand from sending.
//
// Recovery is MANUAL on purpose. Auto-resuming would restart the very send that
// caused the spike; a person has to look at the list first.
import { prisma } from "../prisma.js";

/** A number from env, or the default when unset/not a number. */
function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export type Thresholds = {
  /** Rolling window in days that bounce/complaint events are counted over. */
  windowDays: number;
  /** Below this many emails sent in the window, never auto-pause (see below). */
  minSent: number;
  /** Below this many bounce/complaint events, never auto-pause (see below). */
  minEvents: number;
  /** Fraction, e.g. 0.05 = 5%. */
  bounceRate: number;
  /** Fraction, e.g. 0.003 = 0.3%. */
  complaintRate: number;
};

/**
 * These are EMERGENCY-BRAKE levels, deliberately looser than the targets shown on
 * the Analytics screen (bounce 5%, complaint 0.1%). A target is something to watch;
 * this stops the company's email dead and needs a person to undo it, so it must
 * fire on a real problem and not on a bad day.
 *
 *  * bounce 5% — same as the target. Amazon SES itself acts around this level, and
 *    5% of a list bouncing genuinely means the list is wrong.
 *  * complaint 0.3% — the level at which Gmail/Yahoo actually penalise a sender.
 *    At the 0.1% target, ONE spam complaint in an 800-person send is 0.125% and
 *    would halt everything; one annoyed reader is not a crisis. The Analytics
 *    screen still shows 0.1% as the target to aim at.
 *
 * Two floors stop small numbers from looking like disasters:
 *  * `minSent` — two bounces out of three test sends is 67%, and means nothing.
 *  * `minEvents` — one bounce in a 30-person send is 3.3%; still one bounce.
 */
export const THRESHOLDS: Thresholds = {
  windowDays: envNumber("AUTOPAUSE_WINDOW_DAYS", 7),
  minSent: envNumber("AUTOPAUSE_MIN_SENT", 50),
  minEvents: envNumber("AUTOPAUSE_MIN_EVENTS", 2),
  bounceRate: envNumber("AUTOPAUSE_BOUNCE_RATE", 0.05),
  complaintRate: envNumber("AUTOPAUSE_COMPLAINT_RATE", 0.003),
};

export type BrandSendingHealth = {
  windowDays: number;
  /** Emails successfully sent in the window — the denominator. */
  sent: number;
  bounces: number;
  complaints: number;
  /** null when `sent` is 0 — the UI shows "—" rather than a fake 0%. */
  bounceRate: number | null;
  complaintRate: number | null;
  /** True once `sent` is large enough for the rates to mean anything. */
  enoughData: boolean;
  /** Set when a threshold is crossed AND there is enough data. */
  breach: string | null;
  thresholds: Thresholds;
};

export type SendingStatus = BrandSendingHealth & {
  paused: boolean;
  pausedAt: string | null;
  pauseReason: string | null;
  pausedBy: string | null;
};

const asPercent = (r: number) => `${(r * 100).toFixed(2)}%`;

/**
 * Measure this brand's recent sending health. Read-only — it never pauses.
 *
 * Both sides of the division are the SAME rolling window, so the rates are
 * comparable. (The analytics screen shows all-time deliverability instead; that
 * is a different question — "how are we doing overall" vs "is something going
 * wrong right now".)
 */
export async function checkBrandHealth(
  brandId: string,
  thresholds: Thresholds = THRESHOLDS
): Promise<BrandSendingHealth> {
  const since = new Date(Date.now() - thresholds.windowDays * 24 * 60 * 60 * 1000);

  const [sentRows, events] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where: { campaign: { brandId }, status: "sent", sentAt: { gte: since } },
      select: { email: true },
    }),
    // lastEventAt, not createdAt: an address that unsubscribed months ago and
    // bounced today must count as today's bounce.
    prisma.suppression.findMany({
      where: { brandId, reason: { in: ["bounce", "complaint"] }, lastEventAt: { gte: since } },
      select: { email: true, reason: true },
    }),
  ]);

  const sent = sentRows.length;

  // The two sides of this fraction are stamped by different clocks: a send is
  // stamped when it goes out, a bounce when SES tells us — which can be days
  // later. A big send just before the window opened, with its bounces landing
  // inside it, would divide those bounces by a small recent denominator and read
  // as 40%+ when nothing is wrong. So only count an event against a list we
  // actually mailed IN this window; every counted event then has its own send in
  // the denominator, and the rate cannot run away.
  const mailedInWindow = new Set(sentRows.map((r) => r.email));
  const counted = events.filter((e) => mailedInWindow.has(e.email));
  const bounces = counted.filter((e) => e.reason === "bounce").length;
  const complaints = counted.filter((e) => e.reason === "complaint").length;

  const bounceRate = sent > 0 ? bounces / sent : null;
  const complaintRate = sent > 0 ? complaints / sent : null;
  const enoughData = sent >= thresholds.minSent;

  // A rate needs BOTH a big enough list and more than a stray event behind it.
  const actionable = (count: number) => enoughData && count >= thresholds.minEvents;

  let breach: string | null = null;
  if (actionable(bounces) && bounceRate !== null && bounceRate > thresholds.bounceRate) {
    breach =
      `Bounce rate ${asPercent(bounceRate)} is over the ${asPercent(thresholds.bounceRate)} limit ` +
      `(${bounces} bounces in ${sent} emails, last ${thresholds.windowDays} days)`;
  } else if (actionable(complaints) && complaintRate !== null && complaintRate > thresholds.complaintRate) {
    breach =
      `Complaint rate ${asPercent(complaintRate)} is over the ${asPercent(thresholds.complaintRate)} limit ` +
      `(${complaints} spam complaints in ${sent} emails, last ${thresholds.windowDays} days)`;
  }

  return {
    windowDays: thresholds.windowDays,
    sent,
    bounces,
    complaints,
    bounceRate,
    complaintRate,
    enoughData,
    breach,
    thresholds,
  };
}

/** Is this brand currently blocked from sending? Cheap — one indexed read. */
export async function isPaused(brandId: string): Promise<{ paused: boolean; reason: string | null }> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { sendingPaused: true, pauseReason: true },
  });
  return { paused: !!brand?.sendingPaused, reason: brand?.pauseReason ?? null };
}

/**
 * Evaluate the thresholds and pause the brand if one is crossed.
 *
 * Returns the pause state so callers can stop what they are doing. Safe to call
 * often and from anywhere — the write only happens on the transition into paused,
 * so an already-paused brand keeps its original reason and timestamp (the first
 * cause is the useful one; overwriting it every call would hide what started it).
 *
 * This never un-pauses. Only `resumeSending` does.
 */
export async function pauseIfUnhealthy(
  brandId: string
): Promise<{ paused: boolean; reason: string | null; justPaused: boolean; health: BrandSendingHealth }> {
  const health = await checkBrandHealth(brandId);
  const current = await isPaused(brandId);

  if (current.paused) return { ...current, justPaused: false, health };
  if (!health.breach) return { paused: false, reason: null, justPaused: false, health };

  // Conditional write: two bounce webhooks arriving together both see "not paused"
  // and both try to pause. Matching on sendingPaused=false means exactly one wins,
  // so the stored reason is the first one measured rather than the last to land.
  const done = await prisma.brand.updateMany({
    where: { id: brandId, sendingPaused: false },
    data: { sendingPaused: true, pausedAt: new Date(), pauseReason: health.breach, pausedBy: "auto" },
  });
  if (done.count > 0) {
    console.error(`[auto-pause] SENDING PAUSED for brand ${brandId} — ${health.breach}`);
  }
  return { paused: true, reason: health.breach, justPaused: done.count > 0, health };
}

/** Stop this brand's sending by hand (e.g. "something looks wrong, hold everything"). */
export async function pauseSending(brandId: string, reason: string): Promise<void> {
  await prisma.brand.updateMany({
    where: { id: brandId, sendingPaused: false },
    data: { sendingPaused: true, pausedAt: new Date(), pauseReason: reason, pausedBy: "manual" },
  });
}

/**
 * Let this brand send again.
 *
 * Refused while the thresholds are still crossed, unless `force` is set: resuming
 * into the same breach would pause again on the next event and teach people to
 * click "Resume" without reading. `force` exists because the person may have just
 * deleted the bad contacts and knows better than the rolling window, which still
 * carries the old events for up to `windowDays`.
 */
export async function resumeSending(
  brandId: string,
  force = false
): Promise<{ ok: boolean; reason?: string; health: BrandSendingHealth }> {
  const health = await checkBrandHealth(brandId);
  if (health.breach && !force) {
    return { ok: false, reason: health.breach, health };
  }
  await prisma.brand.update({
    where: { id: brandId },
    data: { sendingPaused: false, pausedAt: null, pauseReason: null, pausedBy: null },
  });
  console.warn(`[auto-pause] sending resumed for brand ${brandId}${force ? " (forced)" : ""}`);
  return { ok: true, health };
}

/** Everything a screen needs to show the banner: the pause state plus the numbers. */
export async function sendingStatus(brandId: string): Promise<SendingStatus | null> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { sendingPaused: true, pausedAt: true, pauseReason: true, pausedBy: true },
  });
  if (!brand) return null;
  const health = await checkBrandHealth(brandId);
  return {
    ...health,
    paused: brand.sendingPaused,
    pausedAt: brand.pausedAt?.toISOString() ?? null,
    pauseReason: brand.pauseReason,
    pausedBy: brand.pausedBy,
  };
}
