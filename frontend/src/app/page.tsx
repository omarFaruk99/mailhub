"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function Dashboard() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const contacts = useQuery({ queryKey: ["contacts", brandId], queryFn: () => api.contacts(brandId!), enabled: !!brandId });
  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });

  const subscribed = contacts.data?.filter((c) => c.status === "subscribed").length ?? 0;
  const sent = campaigns.data?.filter((c) => c.status === "sent").length ?? 0;

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
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaigns.data ?? []).slice(0, 6).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.category}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
                {campaigns.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No campaigns yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
