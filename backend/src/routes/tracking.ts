// Open & click tracking.
import { Router } from "express";
import { prisma } from "../prisma.js";
import { isCampaignLink } from "../email/send-campaign.js";

const router = Router();

// A 1x1 transparent GIF (loaded when the recipient opens the email).
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

router.get("/track/open", async (req, res) => {
  const r = String(req.query.r || "");
  if (r) {
    try {
      // Record the FIRST open only. Overwriting on every re-open would move an
      // old day's number to today and silently rewrite past analytics.
      await prisma.campaignRecipient.updateMany({
        where: { id: r, openedAt: null },
        data: { openedAt: new Date() },
      });
    } catch {
      /* ignore unknown ids */
    }
  }
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store");
  res.send(PIXEL);
});

router.get("/track/click", async (req, res) => {
  const r = String(req.query.r || "");
  // Express has already percent-decoded the query string, so this is the original
  // URL. Decoding again would corrupt any link with an encoded space, non-ASCII
  // path or encoded UTM parameter — and the allow-list below would then reject a
  // perfectly real link.
  const u = String(req.query.u || "");

  // An open redirect: without this check, anyone could send
  // `.../track/click?u=https://evil.example` and have OUR domain forward victims
  // to their phishing page. That is the classic way a sending domain's reputation
  // is destroyed by someone who never touched our account.
  //
  // The rule: only redirect to a link that appears in the campaign this recipient
  // was sent. `r` names the recipient row, which names the campaign, whose stored
  // HTML is the only source of legitimate targets (see isCampaignLink for how
  // personalized links are handled).
  let target: string | null = null;
  if (r && u) {
    const rec = await prisma.campaignRecipient
      .findUnique({ where: { id: r }, select: { campaign: { select: { html: true } } } })
      .catch(() => null);
    if (rec && isCampaignLink(rec.campaign.html, u)) target = u;
    if (!target) console.warn(`[track] refused click redirect to an unknown target: ${u}`);
  }

  if (r && target) {
    try {
      // First click only — same reason as the open pixel above. Only a real,
      // verified link counts; a rejected one is not engagement.
      await prisma.campaignRecipient.updateMany({
        where: { id: r, clickedAt: null },
        data: { clickedAt: new Date() },
      });
    } catch {
      /* ignore */
    }
  }

  if (!target) {
    return res
      .status(400)
      .send(
        `<div style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center">
           <h2>This link is not valid</h2>
           <p>It did not come from one of our emails, so we did not open it.</p>
         </div>`
      );
  }
  res.redirect(target);
});

export default router;
