"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LineChart } from "@/components/charts/line-chart";
import type { Campaign } from "@/lib/api";

// A rate is null when there is nothing to divide by — show "—", never a fake 0%.
const pct = (r: number | null | undefined) => (r === null || r === undefined ? "—" : `${(r * 100).toFixed(1)}%`);

const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export default function Dashboard() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });
  const analytics = useQuery({
    queryKey: ["analytics", brandId, 30],
    queryFn: () => api.analytics(brandId!, 30),
    enabled: !!brandId,
  });
  const a = analytics.data;

  const columns: Column<Campaign>[] = [
    { key: "name", header: "Name", width: 240, cell: (c) => <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.name}</Link> },
    { key: "category", header: "Category", cell: (c) => c.category },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
    { key: "created", header: "Created", align: "right", tabular: true, cell: (c) => new Date(c.createdAt).toLocaleDateString() },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={brand ? `${brand.name} · ${brand.domain}` : "Loading…"} />
      <div className="flex w-full max-w-6xl flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label="Subscribed contacts"
            value={a ? a.totals.subscribed.toLocaleString() : "—"}
            hint={a ? `${a.totals.contacts} total` : undefined}
          />
          <Stat
            label="Emails sent"
            value={a ? a.totals.sent.toLocaleString() : "—"}
            hint={a ? "last 30 days" : undefined}
          />
          <Stat label="Open rate" value={pct(a?.rates.open)} hint={a ? `${a.totals.opened} opened · 30 days` : undefined} />
          <Stat label="Click rate" value={pct(a?.rates.click)} hint={a ? `${a.totals.clicked} clicked · 30 days` : undefined} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement</CardTitle>
            <CardDescription>Last 30 days (UTC).</CardDescription>
            <CardAction>
              <Link
                href="/analytics"
                className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
              >
                Full analytics <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <LineChart
              labels={(a?.series ?? []).map((s) => s.date)}
              formatLabel={shortDate}
              emptyMessage={!brandId || analytics.isPending ? "Loading…" : "No sends in this period."}
              series={[
                { key: "sent", label: "Sent", color: "var(--series-1)", values: (a?.series ?? []).map((s) => s.sent) },
                { key: "opened", label: "Opened", color: "var(--series-2)", values: (a?.series ?? []).map((s) => s.opened) },
                { key: "clicked", label: "Clicked", color: "var(--series-3)", values: (a?.series ?? []).map((s) => s.clicked) },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent campaigns</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              indexed
              loading={!campaigns.data}
              columns={columns}
              rows={(campaigns.data ?? []).slice(0, 6)}
              rowKey={(c) => c.id}
              empty="No campaigns yet."
            />
          </CardContent>
        </Card>
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
