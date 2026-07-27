// Analytics routes — real numbers only, computed from what we already store
// (CampaignRecipient for sent/opened/clicked/failed, Suppression for
// unsubscribe/bounce/complaint). Nothing here is estimated or faked.
import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

// Dates are bucketed by UTC day so the numbers are the same wherever the
// server runs (dev laptop vs. company server).
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

// rate() returns null (not 0) when there is nothing to divide by — the UI
// shows "—" instead of a misleading 0%.
const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);

// GET /brands/:brandId/analytics?days=30
router.get("/brands/:brandId/analytics", async (req, res) => {
  const brandId = req.params.brandId;
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return res.status(404).json({ error: "brand not found" });

  // Everything ever sent for this brand (volume is small — a few thousand rows).
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaign: { brandId } },
    select: {
      campaignId: true,
      status: true,
      sentAt: true,
      openedAt: true,
      clickedAt: true,
    },
  });

  const suppressions = await prisma.suppression.findMany({
    where: { brandId },
    select: { reason: true, createdAt: true },
  });

  const campaigns = await prisma.campaign.findMany({
    where: { brandId },
    select: { id: true, name: true, category: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const contactCount = await prisma.contact.count({ where: { brandId } });
  const subscribedCount = await prisma.contact.count({
    where: { brandId, status: "subscribed" },
  });

  // ---- Totals ----
  const sentRows = recipients.filter((r) => r.status === "sent");
  const totals = {
    contacts: contactCount,
    subscribed: subscribedCount,
    campaigns: campaigns.length,
    campaignsSent: campaigns.filter((c) => c.status === "sent").length,
    sent: sentRows.length,
    failed: recipients.filter((r) => r.status === "failed").length,
    opened: sentRows.filter((r) => r.openedAt).length,
    clicked: sentRows.filter((r) => r.clickedAt).length,
  };

  const bounces = suppressions.filter((s) => s.reason === "bounce").length;
  const complaints = suppressions.filter((s) => s.reason === "complaint").length;
  const unsubscribes = suppressions.filter((s) => s.reason === "unsubscribe").length;

  // Rates are against total successfully-sent emails. Bounce/complaint/
  // unsubscribe counts are per brand (all-time), which is how SES judges us.
  const rates = {
    open: rate(totals.opened, totals.sent),
    click: rate(totals.clicked, totals.sent),
    bounce: rate(bounces, totals.sent),
    complaint: rate(complaints, totals.sent),
    unsubscribe: rate(unsubscribes, totals.sent),
  };

  // ---- Daily series (last `days` days, zero-filled) ----
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const series: { date: string; sent: number; opened: number; clicked: number }[] = [];
  const byDate = new Map<string, (typeof series)[number]>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const row = { date: dayKey(d), sent: 0, opened: 0, clicked: 0 };
    series.push(row);
    byDate.set(row.date, row);
  }

  // Each event lands on the day it happened (an open can be days after the
  // send). Anything outside the window simply has no bucket and is skipped.
  const bump = (d: Date, field: "sent" | "opened" | "clicked") => {
    const row = byDate.get(dayKey(d));
    if (row) row[field]++;
  };
  for (const r of sentRows) {
    bump(r.sentAt, "sent");
    if (r.openedAt) bump(r.openedAt, "opened");
    if (r.clickedAt) bump(r.clickedAt, "clicked");
  }

  // ---- Per-campaign performance ----
  const perCampaign = campaigns.map((c) => {
    const rows = recipients.filter((r) => r.campaignId === c.id && r.status === "sent");
    const opened = rows.filter((r) => r.openedAt).length;
    const clicked = rows.filter((r) => r.clickedAt).length;
    const lastSentAt = rows.reduce<Date | null>(
      (max, r) => (!max || r.sentAt > max ? r.sentAt : max),
      null
    );
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      status: c.status,
      createdAt: c.createdAt,
      sentAt: lastSentAt,
      sent: rows.length,
      opened,
      clicked,
      openRate: rate(opened, rows.length),
      clickRate: rate(clicked, rows.length),
    };
  });

  res.json({
    days,
    totals,
    rates,
    suppressions: { bounce: bounces, complaint: complaints, unsubscribe: unsubscribes, total: suppressions.length },
    series,
    campaigns: perCampaign,
  });
});

export default router;
