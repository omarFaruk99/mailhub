// Open & click tracking.
import { Router } from "express";
import { prisma } from "../prisma.js";

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
  const u = String(req.query.u || "");
  if (r) {
    try {
      // First click only — same reason as the open pixel above.
      await prisma.campaignRecipient.updateMany({
        where: { id: r, clickedAt: null },
        data: { clickedAt: new Date() },
      });
    } catch {
      /* ignore */
    }
  }
  res.redirect(u ? decodeURIComponent(u) : "https://example.com");
});

export default router;
