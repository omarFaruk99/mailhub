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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";

export default function CampaignsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const router = useRouter();

  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaigns.data ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.category}</TableCell>
                    <TableCell className="text-muted-foreground">{c.subject}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
                {campaigns.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No campaigns yet. Create one to get started.
                    </TableCell>
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
