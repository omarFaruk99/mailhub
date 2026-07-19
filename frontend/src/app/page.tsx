"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Campaign } from "@/lib/api";

export default function Dashboard() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const contacts = useQuery({ queryKey: ["contacts", brandId], queryFn: () => api.contacts(brandId!), enabled: !!brandId });
  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });

  const subscribed = contacts.data?.filter((c) => c.status === "subscribed").length ?? 0;
  const sent = campaigns.data?.filter((c) => c.status === "sent").length ?? 0;

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
          <Stat label="Total contacts" value={contacts.data?.length ?? "—"} />
          <Stat label="Subscribed" value={subscribed} />
          <Stat label="Campaigns" value={campaigns.data?.length ?? "—"} />
          <Stat label="Sent" value={sent} />
        </div>

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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
