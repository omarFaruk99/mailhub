// Amazon SES → SNS webhook: auto-suppress bounced / complained emails.
import express, { Router } from "express";
import MessageValidator from "sns-validator";
import { prisma } from "../prisma.js";

const router = Router();
const validator = new MessageValidator();

// Verify the message really came from AWS SNS (skip only in local dev).
function validate(msg: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.env.SNS_SKIP_VERIFY === "true") return resolve();
    validator.validate(msg, (err: any) => (err ? reject(err) : resolve()));
  });
}

// Add an email to suppression for every brand it belongs to, and mark the contact.
async function suppressEmail(email: string, reason: "bounce" | "complaint") {
  const contacts = await prisma.contact.findMany({ where: { email: email.toLowerCase() } });
  for (const c of contacts) {
    await prisma.suppression.upsert({
      where: { brandId_email: { brandId: c.brandId, email: c.email } },
      update: { reason },
      create: { brandId: c.brandId, email: c.email, reason },
    });
    await prisma.contact.update({
      where: { id: c.id },
      data: { status: reason === "complaint" ? "complained" : "bounced" },
    });
  }
  return contacts.length;
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
    if (type === "Bounce") {
      for (const r of event.bounce?.bouncedRecipients || [])
        suppressed += await suppressEmail(r.emailAddress, "bounce");
    } else if (type === "Complaint") {
      for (const r of event.complaint?.complainedRecipients || [])
        suppressed += await suppressEmail(r.emailAddress, "complaint");
    }
    return res.json({ ok: true, type, suppressed });
  }

  res.status(200).send("ok");
});

export default router;
