"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Plus } from "lucide-react";
import type { Campaign } from "@/lib/api";

export default function CampaignsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const router = useRouter();

  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });

  const columns: Column<Campaign>[] = [
    { key: "name", header: "Name", width: 240, cell: (c) => <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.name}</Link> },
    { key: "category", header: "Category", cell: (c) => c.category },
    { key: "subject", header: "Subject", cell: (c) => c.subject },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle={campaigns.data ? `${campaigns.data.length} campaigns` : "Loading…"}
        action={
          <Button disabled={!brandId} onClick={() => router.push("/campaigns/new")}>
            <Plus className="size-4" /> New campaign
          </Button>
        }
      />

      <div className="w-full max-w-6xl p-6">
        <Card>
          <CardContent className="p-0">
            <DataTable
              indexed
              loading={!campaigns.data}
              columns={columns}
              rows={campaigns.data ?? []}
              rowKey={(c) => c.id}
              empty="No campaigns yet. Create one to get started."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
