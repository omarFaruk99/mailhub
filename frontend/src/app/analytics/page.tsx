"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Minus, PauseCircle, ShieldCheck } from "lucide-react";
import { api, type Analytics } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { sendingStatusKey, useSendingStatus } from "@/lib/use-sending-status";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tag } from "@/components/ui/tag";
import { LineChart } from "@/components/charts/line-chart";
import { LoadError } from "@/components/load-error";

const RANGES = [7, 30, 90];

// A rate is null when there is nothing to divide by — show "—", never a fake 0%.
const pct = (r: number | null | undefined, digits = 1) =>
  r === null || r === undefined ? "—" : `${(r * 100).toFixed(digits)}%`;

const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

type Row = Analytics["campaigns"][number];

export default function AnalyticsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const [days, setDays] = React.useState(30);

  const q = useQuery({
    queryKey: ["analytics", brandId, days],
    queryFn: () => api.analytics(brandId!, days),
    enabled: !!brandId,
  });
  const a = q.data;
  // A query that is still disabled (no brand yet) reports isLoading=false in
  // TanStack v5 — without the brand check the empty state flashes on first paint.
  const loading = !brandId || q.isPending;

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Campaign",
      width: 260,
      emphasis: true,
      cell: (c) => (
        <Link href={`/campaigns/${c.id}`} className="hover:underline">
          {c.name}
        </Link>
      ),
    },
    { key: "category", header: "Category", width: 160, cell: (c) => <Tag>{c.category}</Tag> },
    { key: "sent", header: "Sent", align: "right", width: 80, tabular: true, cell: (c) => c.sent || "—" },
    { key: "opened", header: "Opened", align: "right", width: 90, tabular: true, cell: (c) => c.opened || "—" },
    { key: "clicked", header: "Clicked", align: "right", width: 90, tabular: true, cell: (c) => c.clicked || "—" },
    {
      key: "openRate",
      header: "Open rate",
      align: "right",
      width: 100,
      tabular: true,
      emphasis: true,
      cell: (c) => pct(c.openRate, 0),
    },
    {
      key: "clickRate",
      header: "Click rate",
      align: "right",
      width: 100,
      tabular: true,
      emphasis: true,
      cell: (c) => pct(c.clickRate, 0),
    },
  ];

  // Only campaigns that actually went out can have performance numbers.
  const sentCampaigns = (a?.campaigns ?? []).filter((c) => c.sent > 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle={brand ? `${brand.name} · ${brand.domain}` : "Loading…"}
        action={
          <div className="flex gap-1.5">
            {RANGES.map((d) => (
              <Chip key={d} active={days === d} onClick={() => setDays(d)}>
                {d}d
              </Chip>
            ))}
          </div>
        }
      />

      <div className="flex w-full max-w-6xl flex-col gap-6 p-6">
        {/* Never let a failed fetch read as "this brand has no activity". */}
        {q.isError ? (
          <LoadError message={(q.error as Error)?.message} onRetry={() => q.refetch()} />
        ) : (
        <>
        {/* Every number below is scoped to the selected range. */}
        <p className="-mb-2 text-sm text-muted-foreground">
          Showing the last <span className="text-foreground">{days} days</span>. Emails count
          on the day they were sent; a later open or click counts against that same day.
        </p>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label="Emails sent"
            value={a ? a.totals.sent.toLocaleString() : "—"}
            hint={
              a
                ? [
                    a.totals.failed > 0 ? `${a.totals.failed} failed` : null,
                    a.totals.pending > 0 ? `${a.totals.pending} stuck` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                : undefined
            }
          />
          <Stat
            label="Open rate"
            value={pct(a?.rates.open)}
            hint={a ? `${a.totals.opened} of ${a.totals.sent} opened` : undefined}
          />
          <Stat
            label="Click rate"
            value={pct(a?.rates.click)}
            hint={a ? `${a.totals.clicked} of ${a.totals.sent} clicked` : undefined}
          />
          <Stat
            label="Bounce rate"
            value={pct(a?.deliverability.rates.bounce)}
            hint={a ? `${a.deliverability.bounce} bounced · all time` : undefined}
          />
        </div>

        {/* Engagement over time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement</CardTitle>
            <CardDescription>
              Emails sent per day, and how many of those were opened or clicked — last{" "}
              {days} days (UTC).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              labels={(a?.series ?? []).map((s) => s.date)}
              formatLabel={shortDate}
              emptyMessage={loading ? "Loading…" : "No sends in this period."}
              series={[
                { key: "sent", label: "Sent", color: "var(--series-1)", values: (a?.series ?? []).map((s) => s.sent) },
                { key: "opened", label: "Opened", color: "var(--series-2)", values: (a?.series ?? []).map((s) => s.opened) },
                { key: "clicked", label: "Clicked", color: "var(--series-3)", values: (a?.series ?? []).map((s) => s.clicked) },
              ]}
            />
          </CardContent>
        </Card>

        {/* Deliverability health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deliverability</CardTitle>
            <CardDescription>
              All time, not the selected range — share of every email this brand has sent.
              Keep bounce under 5% and complaints under 0.1%: above that, Amazon SES can
              block sending.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Health
              label="Bounce"
              rate={a?.deliverability.rates.bounce ?? null}
              count={a?.deliverability.bounce}
              limit={0.05}
              limitLabel="limit 5%"
            />
            <Health
              label="Complaint"
              rate={a?.deliverability.rates.complaint ?? null}
              count={a?.deliverability.complaint}
              limit={0.001}
              limitLabel="limit 0.1%"
            />
            <Health
              label="Unsubscribe"
              rate={a?.deliverability.rates.unsubscribe ?? null}
              count={a?.deliverability.unsubscribe}
              limitLabel="no hard limit"
            />
          </CardContent>
        </Card>

        {/* Auto-pause — the live guard, not a report */}
        <SendingGuardCard />

        {/* Per-campaign performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign performance</CardTitle>
            <CardDescription>
              All time, not the selected range — only campaigns that have been sent appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              indexed
              loading={loading}
              columns={columns}
              rows={sentCampaigns}
              rowKey={(c) => c.id}
              empty="No campaign has been sent yet."
            />
          </CardContent>
        </Card>
        </>
        )}
      </div>
    </>
  );
}

/**
 * Auto-pause, shown as its own card because it answers a different question from
 * the Deliverability card above it.
 *
 * Deliverability = "how have we done, all time". This = "may we send RIGHT NOW",
 * measured over a short rolling window. A list that goes bad today barely moves an
 * all-time rate, which is exactly why the guard uses its own window.
 */
function SendingGuardCard() {
  const { brand } = useBrand();
  const { data: s, isPending } = useSendingStatus();
  const qc = useQueryClient();

  const pause = useMutation({
    mutationFn: () => api.pauseSending(brand!.id, "Paused by hand from Analytics"),
    onSuccess: () => {
      toast.success("Sending paused — nothing will go out until you resume it");
      qc.invalidateQueries({ queryKey: sendingStatusKey(brand?.id) });
    },
    onError: (e: Error) => toast.error("Could not pause: " + e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sending guard (auto-pause)</CardTitle>
        <CardDescription>
          Sending stops by itself if bounces or spam complaints spike, so a bad list
          cannot burn the brand&apos;s reputation. Measured over a short rolling window —
          separate from the all-time numbers above.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending || !s ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold"
                style={
                  s.paused
                    ? { background: "color-mix(in oklch, var(--destructive) 14%, transparent)", color: "var(--destructive)" }
                    : { background: "color-mix(in oklch, var(--good) 16%, transparent)", color: "var(--good)" }
                }
              >
                {s.paused ? <PauseCircle className="size-4" /> : <ShieldCheck className="size-4" />}
                {s.paused ? "Paused" : "Sending allowed"}
              </span>
              {s.paused ? (
                <span className="text-sm text-muted-foreground">
                  {s.pauseReason} · {s.pausedBy === "manual" ? "paused by hand" : "paused automatically"}
                </span>
              ) : (
                // The button lives here, not in the banner: the banner only exists
                // when something is wrong, and this is the deliberate "hold
                // everything" switch for when a person spots a problem first.
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => pause.mutate()}
                  disabled={pause.isPending || !brand}
                >
                  <PauseCircle className="size-4" />
                  {pause.isPending ? "Pausing…" : "Pause sending"}
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Guard
                label="Bounce"
                rate={s.bounceRate}
                count={s.bounces}
                limit={s.thresholds.bounceRate}
                enoughData={s.enoughData}
              />
              <Guard
                label="Complaint"
                rate={s.complaintRate}
                count={s.complaints}
                limit={s.thresholds.complaintRate}
                enoughData={s.enoughData}
              />
              <div className="rounded-xl border p-4">
                <div className="text-sm text-muted-foreground">Window</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                  {s.windowDays} days
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {s.sent} emails sent · needs {s.thresholds.minSent}+ to act
                </div>
              </div>
            </div>

            {!s.enoughData && (
              // Without this the card looks broken during normal small-volume use:
              // the rates are shown but nothing happens when they look terrible.
              <p className="text-xs text-muted-foreground">
                Only {s.sent} emails in the last {s.windowDays} days. Below{" "}
                {s.thresholds.minSent} the rates are too small to mean anything, so
                sending is never paused automatically yet.
              </p>
            )}
            {s.enoughData && (
              // The limits here are looser than the targets in the Deliverability
              // card above, and that difference is deliberate — say so, or the two
              // cards look like they disagree.
              <p className="text-xs text-muted-foreground">
                These are emergency limits, set a little looser than the targets above:
                a pause stops every send until someone resumes it, so it needs at least{" "}
                {s.thresholds.minEvents} bounces or complaints behind it — never a single one.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// One threshold box for the guard card. Greyed out while there is too little data,
// so a scary-looking 50% on two test emails never reads as a real alarm.
function Guard({
  label, rate, count, limit, enoughData,
}: { label: string; rate: number | null; count: number; limit: number; enoughData: boolean }) {
  const over = rate !== null && rate > limit;
  const active = enoughData && rate !== null;
  const Icon = !active ? Minus : over ? AlertTriangle : CheckCircle2;
  const state = !active ? "Not enough data" : over ? "Over limit" : "Healthy";
  const tone = !active ? "text-muted-foreground" : over ? "text-destructive" : "text-good";

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`flex items-center gap-1 text-xs font-medium ${tone}`}>
          <Icon className="size-3.5" />
          {state}
        </span>
      </div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${active ? "" : "text-muted-foreground"}`}>
        {pct(rate, 2)}
      </div>
      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
        {count} in window · limit {pct(limit, limit < 0.01 ? 2 : 0)}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 h-4 text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

// One deliverability row. Status is icon + word + colour — never colour alone.
function Health({
  label,
  rate,
  count,
  limit,
  limitLabel,
}: {
  label: string;
  rate: number | null;
  count?: number;
  limit?: number;
  limitLabel: string;
}) {
  const noLimit = limit === undefined;
  const over = !noLimit && rate !== null && rate > limit;
  const Icon = rate === null || noLimit ? Minus : over ? AlertTriangle : CheckCircle2;
  const state = rate === null ? "No data" : noLimit ? "Tracked" : over ? "Over limit" : "Healthy";
  const tone = rate === null || noLimit ? "text-muted-foreground" : over ? "text-destructive" : "text-good";

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`flex items-center gap-1 text-xs font-medium ${tone}`}>
          <Icon className="size-3.5" />
          {state}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{pct(rate, 2)}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {count ?? 0} {count === 1 ? "contact" : "contacts"} · {limitLabel}
      </div>
    </div>
  );
}
