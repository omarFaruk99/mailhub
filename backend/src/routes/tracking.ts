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
      await prisma.campaignRecipient.update({
        where: { id: r },
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
      await prisma.campaignRecipient.update({
        where: { id: r },
        data: { clickedAt: new Date() },
      });
    } catch {
      /* ignore */
    }
  }
  res.redirect(u ? decodeURIComponent(u) : "https://example.com");
});

export default router;
