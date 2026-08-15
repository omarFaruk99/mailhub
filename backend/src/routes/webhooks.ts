// Amazon SES → SNS webhook: auto-suppress bounced / complained emails.
import express, { Router } from "express";
import MessageValidator from "sns-validator";
import { prisma } from "../prisma.js";
import { pauseIfUnhealthy } from "../email/auto-pause.js";

const router = Router();
const validator = new MessageValidator();

// Verify the message really came from AWS SNS (skip only in local dev).
function validate(msg: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.env.SNS_SKIP_VERIFY === "true") return resolve();
    validator.validate(msg, (err: any) => (err ? reject(err) : resolve()));
  });
}

// Suppression holds ONE row per address, so a second event has to decide what
// the stored reason becomes. It only ever escalates — a complaint outranks a
// bounce, a bounce outranks an unsubscribe. Downgrading would quietly erase a
// bounce/complaint that the SES deliverability numbers are counted from.
const SEVERITY: Record<string, number> = { unsubscribe: 1, bounce: 2, complaint: 3 };

// Add an email to suppression for every brand it belongs to, and mark the contact.
// Returns the brands touched, so the caller can re-check their auto-pause
// thresholds once — not once per address in a batched bounce notification.
async function suppressEmail(email: string, reason: "bounce" | "complaint") {
  const contacts = await prisma.contact.findMany({ where: { email: email.toLowerCase() } });
  const brandIds = new Set<string>();
  for (const c of contacts) {
    const existing = await prisma.suppression.findUnique({
      where: { brandId_email: { brandId: c.brandId, email: c.email } },
    });
    const keepExisting =
      existing && (SEVERITY[existing.reason] ?? 0) >= SEVERITY[reason];
    await prisma.suppression.upsert({
      where: { brandId_email: { brandId: c.brandId, email: c.email } },
      // lastEventAt moves only when the reason actually changes. A second bounce
      // for an address that is already suppressed is not a new bounce against the
      // list — it is the same one, and counting it again would inflate the rate.
      update: keepExisting ? {} : { reason, lastEventAt: new Date() },
      create: { brandId: c.brandId, email: c.email, reason },
    });
    await prisma.contact.update({
      where: { id: c.id },
      data: { status: reason === "complaint" ? "complained" : "bounced" },
    });
    brandIds.add(c.brandId);
  }
  return { count: contacts.length, brandIds };
}

// SNS posts text/plain JSON, so parse the raw body ourselves.
router.post("/webhooks/ses", express.text({ type: () => true }), async (req, res) => {
  let msg: any;
  try {
    msg = JSON.parse(req.body);
  } catch {
    return res.status(400).send("invalid json");
  }

  // First-time handshake from SNS.
  if (msg.Type === "SubscriptionConfirmation") {
    console.log("SNS SubscriptionConfirmation — confirm via:", msg.SubscribeURL);
    return res.status(200).send("subscription pending");
  }

  try {
    await validate(msg);
  } catch {
    return res.status(403).send("bad signature");
  }

  if (msg.Type === "Notification") {
    const event = JSON.parse(msg.Message);
    const type = event.notificationType || event.eventType;
    let suppressed = 0;
    const touched = new Set<string>();
    if (type === "Bounce") {
      for (const r of event.bounce?.bouncedRecipients || []) {
        const s = await suppressEmail(r.emailAddress, "bounce");
        suppressed += s.count;
        s.brandIds.forEach((b) => touched.add(b));
      }
    } else if (type === "Complaint") {
      for (const r of event.complaint?.complainedRecipients || []) {
        const s = await suppressEmail(r.emailAddress, "complaint");
        suppressed += s.count;
        s.brandIds.forEach((b) => touched.add(b));
      }
    }

    // This is the fastest place auto-pause can react: SES tells us about a bounce
    // here, seconds after it happens, and a send may be running right now.
    // A failure here must not make SNS retry the notification (which would
    // re-suppress and eventually be dropped), so it is caught and logged.
    const paused: string[] = [];
    for (const brandId of touched) {
      try {
        const state = await pauseIfUnhealthy(brandId);
        if (state.justPaused) paused.push(brandId);
      } catch (err) {
        console.error("[auto-pause] check failed for brand", brandId, err);
      }
    }

    return res.json({ ok: true, type, suppressed, paused });
  }

  res.status(200).send("ok");
});

export default router;
