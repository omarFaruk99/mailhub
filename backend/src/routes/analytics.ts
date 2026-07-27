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
//
// Everything except `contacts`/`campaigns` counts and the per-campaign table is
// scoped to the last `days` days, so the number on screen always matches the
// range the user picked. The window is a COHORT: an email counts on the day it
// was sent, and its later open/click counts against that same day. That keeps
// the rates honest (opens can never exceed the sends they are divided by).
router.get("/brands/:brandId/analytics", async (req, res) => {
  const brandId = req.params.brandId;
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return res.status(404).json({ error: "brand not found" });

  // Start of the window, midnight UTC.
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  windowStart.setUTCDate(windowStart.getUTCDate() - (days - 1));

  // Only rows the window can use — the per-campaign table needs all of them,
  // so it is queried separately and grouped in the database.
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaign: { brandId }, sentAt: { gte: windowStart } },
    select: { status: true, sentAt: true, openedAt: true, clickedAt: true },
  });

  const suppressions = await prisma.suppression.findMany({
    where: { brandId, createdAt: { gte: windowStart } },
    select: { reason: true },
  });

  const campaigns = await prisma.campaign.findMany({
    where: { brandId },
    select: { id: true, name: true, category: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const [contactCount, subscribedCount, campaignsSent] = await Promise.all([
    prisma.contact.count({ where: { brandId } }),
    prisma.contact.count({ where: { brandId, status: "subscribed" } }),
    prisma.campaign.count({ where: { brandId, status: "sent" } }),
  ]);

  // ---- Totals for the window ----
  const sentRows = recipients.filter((r) => r.status === "sent");
  const totals = {
    contacts: contactCount, // all-time — a contact list is not a per-period number
    subscribed: subscribedCount,
    campaigns: campaigns.length,
    campaignsSent,
    sent: sentRows.length,
    failed: recipients.filter((r) => r.status === "failed").length,
    // Rows still marked "sending" = a send that crashed mid-flight. Surfaced
    // separately so they are never silently missing from sent + failed.
    pending: recipients.filter((r) => r.status === "sending").length,
    opened: sentRows.filter((r) => r.openedAt).length,
    clicked: sentRows.filter((r) => r.clickedAt).length,
  };

  const bounces = suppressions.filter((s) => s.reason === "bounce").length;
  const complaints = suppressions.filter((s) => s.reason === "complaint").length;
  const unsubscribes = suppressions.filter((s) => s.reason === "unsubscribe").length;

  // All rates are (events in window) ÷ (emails sent in window) — the same shape
  // SES uses for its rolling bounce/complaint limits.
  const rates = {
    open: rate(totals.opened, totals.sent),
    click: rate(totals.clicked, totals.sent),
    bounce: rate(bounces, totals.sent),
    complaint: rate(complaints, totals.sent),
    unsubscribe: rate(unsubscribes, totals.sent),
  };

  // ---- Daily series (zero-filled, bucketed on the send day) ----
  const series: { date: string; sent: number; opened: number; clicked: number }[] = [];
  const byDate = new Map<string, (typeof series)[number]>();
  for (let i = 0; i < days; i++) {
    const d = new Date(windowStart);
    d.setUTCDate(windowStart.getUTCDate() + i);
    const row = { date: dayKey(d), sent: 0, opened: 0, clicked: 0 };
    series.push(row);
    byDate.set(row.date, row);
  }

  for (const r of sentRows) {
    const row = byDate.get(dayKey(r.sentAt));
    if (!row) continue; // sent before the window started
    row.sent++;
    if (r.openedAt) row.opened++;
    if (r.clickedAt) row.clicked++;
  }

  // ---- Per-campaign performance (all-time, grouped in the database) ----
  const [sentByCampaign, openedByCampaign, clickedByCampaign] = await Promise.all([
    prisma.campaignRecipient.groupBy({
      by: ["campaignId"],
      where: { campaign: { brandId }, status: "sent" },
      _count: { _all: true },
      _max: { sentAt: true },
    }),
    prisma.campaignRecipient.groupBy({
      by: ["campaignId"],
      where: { campaign: { brandId }, status: "sent", openedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.campaignRecipient.groupBy({
      by: ["campaignId"],
      where: { campaign: { brandId }, status: "sent", clickedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const sentMap = new Map(sentByCampaign.map((g) => [g.campaignId, g]));
  const openedMap = new Map(openedByCampaign.map((g) => [g.campaignId, g._count._all]));
  const clickedMap = new Map(clickedByCampaign.map((g) => [g.campaignId, g._count._all]));

  const perCampaign = campaigns.map((c) => {
    const sent = sentMap.get(c.id)?._count._all ?? 0;
    const opened = openedMap.get(c.id) ?? 0;
    const clicked = clickedMap.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      status: c.status,
      createdAt: c.createdAt,
      sentAt: sentMap.get(c.id)?._max.sentAt ?? null,
      sent,
      opened,
      clicked,
      openRate: rate(opened, sent),
      clickRate: rate(clicked, sent),
    };
  });

  res.json({
    days,
    windowStart,
    totals,
    rates,
    suppressions: { bounce: bounces, complaint: complaints, unsubscribe: unsubscribes, total: suppressions.length },
    series,
    campaigns: perCampaign,
  });
});

export default router;
