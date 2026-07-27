// Campaign routes: create, list, send (broadcast), schedule, and unsubscribe.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { CONTACT_TYPES, sendCampaign, type SendFilter } from "../email/send-campaign.js";
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
  // A scheduled send may already be running in the worker — don't start a second
  // pass on top of it (exactly-once protects the emails; this protects the status).
  if (campaign.status === "sending") {
    return res.status(409).json({ error: "this campaign is being sent right now" });
  }

  // Sending now cancels any pending schedule, so it can't fire again later.
  if (campaign.jobId) {
    await getQueue()?.cancel(SEND_QUEUE, campaign.jobId).catch(() => {});
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { jobId: null, scheduledAt: null, timezone: null },
    });
  }

  const result = await sendCampaign(campaign.id, filter.data as SendFilter);
  return res.json(result);
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

  // Re-scheduling: drop the old job first so only one can ever fire.
  if (campaign.jobId) await queue.cancel(SEND_QUEUE, campaign.jobId).catch(() => {});

  const jobId = await queue.send(
    SEND_QUEUE,
    { campaignId: campaign.id } satisfies SendJobData,
    { startAfter: runAt, singletonKey: campaign.id, retryLimit: 2 }
  );
  if (!jobId) return res.status(500).json({ error: "could not create the scheduled job" });

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "scheduled", scheduledAt: runAt, timezone, sendOptions: filter, jobId },
  });
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
    data: { status: "draft", scheduledAt: null, timezone: null, jobId: null },
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
