// A simple route to send ONE test email — to check SES works.
import { Router } from "express";
import { z } from "zod";
import { sendEmail } from "../email/ses.js";

const router = Router();
const schema = z.object({ to: z.email() });

router.post("/test-email", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    const messageId = await sendEmail({
      to: parsed.data.to,
      subject: "MailHub test",
      html: "<h2>It works!</h2><p>This is a test email from MailHub via Amazon SES.</p>",
      text: "It works! This is a test email from MailHub via Amazon SES.",
    });
    res.json({ ok: true, messageId });
  } catch (e: any) {
    // Show the real SES error so we can fix setup problems.
    res.status(500).json({ ok: false, error: e.name, message: e.message });
  }
});

export default router;
