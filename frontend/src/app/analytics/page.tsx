"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Minus } from "lucide-react";
import { api, type Analytics } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
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
