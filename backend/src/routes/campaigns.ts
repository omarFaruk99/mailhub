// Campaign routes: create, list, send (broadcast), schedule, and unsubscribe.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import {
  base as publicBase,
  CONTACT_TYPES,
  personalizeHtml,
  sendCampaign,
  SendingPausedError,
  type SendFilter,
} from "../email/send-campaign.js";
import { sendEmail } from "../email/ses.js";
import { isPaused } from "../email/auto-pause.js";
import { getQueue, SEND_QUEUE, type SendJobData } from "../queue.js";
import { zonedTimeToUtc } from "../lib/timezone.js";

const router = Router();

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

// ---- Edit a campaign ----
// What may change depends on whether the email has actually reached anybody —
// not on `status`. A "sent" campaign where every attempt failed reached nobody, and
// a draft with leftover rows from an interrupted send did reach some people. The
// count of delivered rows is the only honest test.
//
// Once ONE person has the email, the content is history:
//   * their inbox still shows the old text, so editing here makes our record a lie;
//   * /track/click only follows links that appear in `campaign.html`, so rewriting
//     it turns every link already sitting in someone's inbox into a dead 400.
// The name is different — it is our internal label, never sent — so it stays editable.
const campaignEditSchema = campaignSchema.partial();

router.put("/campaigns/:campaignId", async (req, res) => {
  const parsed = campaignEditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
  if (!campaign) return res.status(404).json({ error: "campaign not found" });
  if (campaign.status === "sending") {
    return res.status(409).json({ error: "this campaign is being sent right now" });
  }

  const { name, ...content } = parsed.data;
  const changesContent = Object.values(content).some((v) => v !== undefined);

  // The audience is frozen into `sendOptions` at schedule time, and the category
  // is what decides that audience by default. Change the category now and the two
  // silently disagree: a campaign scheduled as "Product updates" carries internal
  // staff in its frozen audience, so relabelling it "Marketing/Offers" would send
  // marketing to colleagues — the one thing the category rule exists to prevent.
  // Cancelling the schedule releases the frozen audience, so that is the way out.
  if (
    campaign.status === "scheduled" &&
    parsed.data.category !== undefined &&
    parsed.data.category !== campaign.category
  ) {
    return res.status(409).json({
      error:
        "Cancel the schedule first, then change the category. The audience was saved for the current " +
        "category, so changing it now could send this email to the wrong people.",
    });
  }
  if (changesContent) {
    const delivered = await prisma.campaignRecipient.count({
      // Rows stuck at "sending" count as delivered. The row is created BEFORE the
      // SES call, so a crash right after SES accepted the message leaves exactly
      // this state — the person has the email, we just never recorded it. Treating
      // those as "nobody got it" would let the content be rewritten under them.
      where: { campaignId: campaign.id, status: { in: ["sent", "sending"] } },
    });
    if (delivered > 0) {
      return res.status(409).json({
        error:
          `This campaign was already sent to ${delivered} ${delivered === 1 ? "person" : "people"}. ` +
          `You cannot change the subject or the content. Use Duplicate to make a new version. ` +
          `You can still change the name.`,
        delivered,
      });
    }
  }

  // Guard the write with the status we just read: a scheduled send could fire in
  // between, and an unconditional update would then rewrite an email mid-flight.
  const updated = await prisma.campaign.updateMany({
    where: { id: campaign.id, status: campaign.status },
    data: parsed.data,
  });
  if (updated.count === 0) {
    return res.status(409).json({ error: "the campaign changed while you were editing — reload and try again" });
  }
  res.json(await prisma.campaign.findUnique({ where: { id: campaign.id } }));
});

// ---- Delete a campaign ----
// Deleting a campaign that went out also deletes its recipient rows, and those
// rows ARE the analytics — open/click history disappears with them. That is the
// caller's decision to make (clearing out test campaigns is a real need), so it is
// allowed; the UI says plainly what will be lost. Only a send in progress is
// refused, because deleting the row underneath a running loop breaks it.
router.delete("/campaigns/:campaignId", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
  if (!campaign) return res.status(404).json({ error: "campaign not found" });
  if (campaign.status === "sending") {
    return res.status(409).json({ error: "this campaign is being sent right now — wait for it to finish" });
  }

  // One transaction, and the campaign row goes LAST with the same "not sending"
  // guard as the check above. Recipient rows have to be removed first (they point
  // at the campaign), which means the destructive half happens before we know we
  // are allowed to finish — so if a scheduled send claimed the campaign in the
  // meantime, throwing here rolls the whole transaction back and the history
  // survives. Deleting the rows and keeping the campaign was the worst outcome:
  // exactly-once forgets who was already emailed.
  class CampaignBusy extends Error {}
  let recipientsDeleted: number;
  try {
    recipientsDeleted = await prisma.$transaction(async (tx) => {
      const { count } = await tx.campaignRecipient.deleteMany({ where: { campaignId: campaign.id } });
      const removed = await tx.campaign.deleteMany({
        where: { id: campaign.id, status: { not: "sending" } },
      });
      if (removed.count === 0) throw new CampaignBusy();
      return count;
    });
  } catch (e) {
    if (e instanceof CampaignBusy) {
      return res.status(409).json({ error: "this campaign started sending just now — nothing was deleted" });
    }
    throw e;
  }

  // Only now that the campaign is really gone. Cancelling first meant a rolled-back
  // transaction left a still-"scheduled" campaign pointing at a job that no longer
  // exists — showing "Scheduled" forever and never firing. The other order is safe:
  // a job that outlives its campaign finds nothing and says so in the log.
  if (campaign.jobId) await getQueue()?.cancel(SEND_QUEUE, campaign.jobId).catch(() => {});

  res.json({ ok: true, recipientsDeleted });
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
// Optional filter in body: { plan, country, company, includeTypes }
//
// A text filter must be either absent or a real value. Present-but-blank is
// refused rather than ignored, because ignoring it WIDENS the send: the matcher
// treats blank as "any", so a caller who meant "only this plan" and sent " " by
// accident would email the entire brand. Refusing costs a 400; guessing costs
// hundreds of wrong emails that cannot be recalled. The UI never sends a blank
// value — it omits the key — so nothing on screen can trip this.
const textFilter = z
  .string()
  .refine((v) => v.trim().length > 0, "Leave the filter out entirely instead of sending a blank value.")
  .optional();

const filterSchema = z.object({
  plan: textFilter,
  country: textFilter,
  company: textFilter,
  includeTypes: z.array(z.enum(CONTACT_TYPES)).optional(),
});

router.post("/campaigns/:campaignId/send", async (req, res) => {
  const filter = filterSchema.safeParse(req.body ?? {});
  if (!filter.success) return res.status(400).json({ error: filter.error.issues });

  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
  if (!campaign) return res.status(404).json({ error: "campaign not found" });
  // A scheduled send may already be running in the worker — don't start a second
  // pass on top of it (exactly-once protects the emails; this protects the status).
  if (campaign.status === "sending") {
    return res.status(409).json({ error: "this campaign is being sent right now" });
  }

  // Auto-pause. Checked BEFORE the claim below so a refused send leaves the
  // campaign exactly as it was — no status churn, no cleared schedule.
  const paused = await isPaused(campaign.brandId);
  if (paused.paused) {
    return res.status(423).json({
      error: `Sending is paused for this brand — ${paused.reason ?? "resume it to send again"}`,
      paused: true,
    });
  }

  // Claim it the same way the worker does, in one conditional write. Without
  // this the status stays "draft" for the whole loop, and the "being sent right
  // now" guards above and in /schedule would never actually trigger.
  // Clearing jobId here is what stops a pending scheduled job from firing later:
  // the worker only sends when Campaign.jobId still matches its own job id.
  const claimed = await prisma.campaign.updateMany({
    where: { id: campaign.id, status: { in: ["draft", "scheduled", "sent", "failed"] } },
    // lastError is cleared here: it describes the PREVIOUS attempt, and leaving it
    // would put a stale "sending is paused" warning on a send that is happening
    // right now. sendCampaign writes the new one if this attempt also stops.
    data: { status: "sending", jobId: null, scheduledAt: null, timezone: null, lastError: null },
  });
  if (claimed.count === 0) {
    return res.status(409).json({ error: "this campaign is being sent right now" });
  }
  // Best-effort tidy-up; the jobId check above is the real guarantee.
  if (campaign.jobId) await getQueue()?.cancel(SEND_QUEUE, campaign.jobId).catch(() => {});

  try {
    const result = await sendCampaign(campaign.id, filter.data as SendFilter);
    return res.json(result);
  } catch (e) {
    // sendCampaign sets the final status itself; it only throws before getting
    // there, so release the claim instead of leaving the campaign stuck.
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "draft" } });
    // Auto-pause tripped between the check above and the send starting. It is a
    // blocked request, not a server fault — answer it the same way as the check.
    if (e instanceof SendingPausedError) {
      return res.status(423).json({ error: `Sending is paused for this brand — ${e.reason}`, paused: true });
    }
    throw e;
  }
});

// ---- Send a one-off test copy to one address ----
//
// A test send is a REAL message leaving the shared production SES account, so
// it obeys the same guardrails as a real send: auto-pause, and suppression.
// Neither is optional here — sendCampaign() is the choke point that normally
// enforces both, and this route deliberately does not go through it.
//
// It carries the unsubscribe footer and RFC 8058 headers every email must have,
// but pointed at the `test=1` no-op page rather than a real contact's link: a
// test's whole audience is the person checking it, and clicking a live
// unsubscribe (or a mail scanner prefetching it) would lock that address out of
// every future campaign with no way to undo it.
//
// Deliberate differences from the real loop: no CampaignRecipient row, so no
// open pixel and no /track/click rewriting (both are built from that row) and
// no send recorded in analytics. "[TEST]" on the subject keeps it out of a real
// thread. Note this cuts one way only — the send is not counted, but if the
// test bounces or is marked as spam, SES tells us and that IS recorded against
// the address, exactly as it should be.
const testSendSchema = z.object({ to: z.email() });

router.post("/campaigns/:campaignId/send-test", async (req, res) => {
  const parsed = testSendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address." });

  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
  if (!campaign) return res.status(404).json({ error: "campaign not found" });

  const email = parsed.data.to.trim().toLowerCase();

  const paused = await isPaused(campaign.brandId);
  if (paused.paused) {
    return res.status(423).json({
      error: `Sending is paused for this brand — ${paused.reason ?? "resume it to send again"}`,
      paused: true,
    });
  }

  // Suppression is keyed by address, and a test is still an email. Without this,
  // typing a client's address in here would mail someone who had opted out.
  const suppressed = await prisma.suppression.findUnique({
    where: { brandId_email: { brandId: campaign.brandId, email } },
  });
  if (suppressed) {
    return res.status(409).json({
      error: `${email} has unsubscribed or bounced, so no email can be sent to it.`,
    });
  }

  // If the address happens to be a contact, greet them by their real name, so
  // the test shows the merge tag exactly as that person would receive it.
  const contact = await prisma.contact.findUnique({
    where: { brandId_email: { brandId: campaign.brandId, email } },
    select: { name: true },
  });

  // MUST MIRROR the footer + headers in `sendCampaign` (email/send-campaign.ts).
  // If that changes and this does not, the test stops being a sample of the real
  // thing — which is the only reason the feature exists.
  const unsubUrl = `${publicBase()}/unsubscribe?b=${campaign.brandId}&test=1`;
  const html =
    personalizeHtml(campaign.html, contact?.name) +
    `<hr><p style="font-size:12px;color:#888">Don't want these emails?
       <a href="${unsubUrl}">Unsubscribe</a></p>`;

  try {
    const messageId = await sendEmail({
      to: email,
      subject: `[TEST] ${campaign.subject}`,
      html,
      headers: [
        { Name: "List-Unsubscribe", Value: `<${unsubUrl}>` },
        { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
      ],
    });
    res.json({ messageId });
  } catch (e: any) {
    // `error` must be the whole sentence: the frontend's shared error handler
    // only ever reads `body.error`, so putting the detail anywhere else drops it.
    res.status(500).json({ error: e.message || e.name });
  }
});

// ---- Schedule a campaign (send later) ----
// The audience/filter is frozen here, because the send runs later with nobody
// on screen. `localDateTime` is wall-clock time ("2026-07-28T14:30") in `timezone`.
const scheduleSchema = filterSchema.extend({
  localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/),
  timezone: z.string().min(1),
});

router.post("/campaigns/:campaignId/schedule", async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { localDateTime, timezone, ...filter } = parsed.data;

  const queue = getQueue();
  if (!queue) return res.status(503).json({ error: "the scheduler is not running" });

  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
  if (!campaign) return res.status(404).json({ error: "campaign not found" });
  if (campaign.status === "sending") {
    return res.status(409).json({ error: "this campaign is being sent right now" });
  }
  if (campaign.status === "sent") {
    return res.status(409).json({ error: "this campaign has already been sent" });
  }

  const runAt = zonedTimeToUtc(localDateTime, timezone);
  if (!runAt) return res.status(400).json({ error: "invalid date/time or timezone" });
  // A minute of slack: a time that has just passed is a mistake, not an instant send.
  if (runAt.getTime() < Date.now() + 60_000) {
    return res.status(400).json({ error: "pick a time at least a minute from now" });
  }

  // New job FIRST. Cancelling the old one first would, if this send failed,
  // leave the campaign showing its old time with nothing left to fire it.
  // (singletonKey is only a readable handle for queries — pg-boss's default
  // `standard` policy does not deduplicate on it, so it is not a safety net.)
  const jobId = await queue.send(
    SEND_QUEUE,
    { campaignId: campaign.id } satisfies SendJobData,
    { startAfter: runAt, singletonKey: campaign.id, retryLimit: 2 }
  );
  if (!jobId) return res.status(500).json({ error: "could not create the scheduled job" });

  // Conditional, like /send and /unschedule: if the worker claimed the campaign
  // between the read above and this write, an unconditional update would return
  // 200 for a schedule that the in-flight send then wipes — leaving an orphaned
  // job and a campaign that never fires.
  const saved = await prisma.campaign.updateMany({
    where: { id: campaign.id, status: { in: ["draft", "scheduled", "failed"] } },
    // lastError belongs to the attempt that failed; giving the campaign a new time
    // is the answer to it. Leaving it would keep "sending is paused" on screen long
    // after the pause was resolved and the send re-booked.
    data: { status: "scheduled", scheduledAt: runAt, timezone, sendOptions: filter, jobId, lastError: null },
  });
  if (saved.count === 0) {
    // Nothing was stored, so the job we just created must not survive.
    await queue.cancel(SEND_QUEUE, jobId).catch(() => {});
    return res.status(409).json({ error: "this campaign is being sent right now" });
  }

  // Now the row points at the new job, the old one is already powerless (the
  // worker checks jobId); cancelling just keeps the queue tidy.
  if (campaign.jobId) await queue.cancel(SEND_QUEUE, campaign.jobId).catch(() => {});

  const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
  return res.json(updated);
});

// ---- Cancel a schedule (back to draft) ----
router.post("/campaigns/:campaignId/unschedule", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
  if (!campaign) return res.status(404).json({ error: "campaign not found" });

  // Release it in one conditional write, for the same reason the worker claims it
  // in one: if the job has just started, `status` is already "sending" and this
  // must fail rather than tell the user a running send was cancelled.
  const released = await prisma.campaign.updateMany({
    where: { id: campaign.id, status: "scheduled" },
    // Same as /schedule: the old failure notice must not outlive the decision the
    // user has just made about this campaign.
    data: { status: "draft", scheduledAt: null, timezone: null, jobId: null, lastError: null },
  });
  if (released.count === 0) {
    return res.status(409).json({
      error:
        campaign.status === "sending"
          ? "this campaign is being sent right now — too late to cancel"
          : "this campaign is not scheduled",
    });
  }

  if (campaign.jobId) await getQueue()?.cancel(SEND_QUEUE, campaign.jobId).catch(() => {});

  const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
  return res.json(updated);
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

// `test=1` — the link inside a test send (see /send-test). It shows what a
// recipient would see and changes NOTHING. It must stay a no-op: there is no
// route anywhere that deletes a Suppression row, so a real unsubscribe fired by
// someone checking their own test email — or by a mail scanner prefetching the
// link — would silently lock that address out of every future campaign.
const TEST_UNSUB_PAGE = `<div style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center">
     <h2>This was a test email</h2>
     <p>Nothing has changed. A real recipient would be unsubscribed here.</p>
   </div>`;

// Fail CLOSED. `req.query.test` is a string, so a bare truthy check treats
// "?test=0" as a test and quietly refuses to unsubscribe a real person — the one
// direction this must never break. Exact "1", and no contact id present, so a
// real link that somehow picks the param up still unsubscribes.
const isTestUnsub = (req: { query: Record<string, unknown> }) =>
  req.query.test === "1" && !req.query.c;

router.get("/unsubscribe", async (req, res) => {
  if (isTestUnsub(req)) return res.status(200).send(TEST_UNSUB_PAGE);
  const b = String(req.query.b || "");
  const c = String(req.query.c || "");
  const ok = await doUnsubscribe(b, c);
  res
    .status(ok ? 200 : 400)
    .send(
      ok
        ? `<div style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center">
             <h2>You're unsubscribed</h2>
             <p>You will no longer receive these emails.</p>
           </div>`
        : `<p style="font-family:sans-serif">Invalid unsubscribe link.</p>`
    );
});

router.post("/unsubscribe", async (req, res) => {
  // Gmail's one-click POST lands here. Same no-op rule for a test's link.
  if (isTestUnsub(req)) return res.status(200).json({ ok: true, test: true });
  const b = String(req.query.b || "");
  const c = String(req.query.c || "");
  await doUnsubscribe(b, c);
  res.status(200).json({ ok: true });
});

export default router;
