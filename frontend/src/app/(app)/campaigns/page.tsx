"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { sendingStatusKey } from "@/lib/use-sending-status";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Plus, Pencil, Copy, Trash2, MoreHorizontal } from "lucide-react";
import type { Campaign } from "@/lib/api";

// A scheduled time is shown in the timezone it was set in, so it reads back
// exactly as the person typed it.
function formatScheduled(iso: string, timeZone?: string | null) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString("en-GB", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return d.toLocaleString();
  }
}

// Build a unique "X (copy)" name. Campaign names are not unique in the database,
// but a list full of identically-named rows is unusable, so the UI keeps them apart.
function uniqueCopyName(base: string, existing: string[]) {
  let name = `${base} (copy)`;
  let i = 2;
  while (existing.includes(name)) { name = `${base} (copy ${i})`; i++; }
  return name;
}

export default function CampaignsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const router = useRouter();
  const qc = useQueryClient();

  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });

  const delMut = useMutation({
    mutationFn: (c: Campaign) => api.deleteCampaign(c.id),
    onSuccess: (r) => {
      toast.success(
        r.recipientsDeleted > 0
          ? `Campaign deleted, with ${r.recipientsDeleted} email records.`
          : "Campaign deleted"
      );
      qc.invalidateQueries({ queryKey: ["campaigns", brandId] });
      // Its recipient rows were part of the numbers on those screens — including
      // auto-pause, which measures bounces against emails sent in the last week.
      // Removing a campaign moves that denominator, so the banner has to re-read.
      qc.invalidateQueries({ queryKey: ["analytics", brandId] });
      qc.invalidateQueries({ queryKey: sendingStatusKey(brandId) });
    },
    onError: (e: Error) => toast.error("Could not delete: " + e.message),
  });

  // Duplicating is the answer to "I need to change an email that already went out":
  // a fresh draft with the same content, which can then be edited freely.
  const dupMut = useMutation({
    mutationFn: (c: Campaign) => {
      const name = uniqueCopyName(c.name, (campaigns.data ?? []).map((x) => x.name));
      return api.createCampaign(brandId!, { name, category: c.category, subject: c.subject, html: c.html });
    },
    onSuccess: (c) => {
      toast.success("Duplicated as a new draft");
      // Put the new campaign into the cache before navigating. Invalidating alone
      // refetches in the background while the cached list still says "success", so
      // the edit page would open, fail to find the campaign, and show "this campaign
      // no longer exists" — on the copy just created. The list is newest-first, so
      // the new draft belongs at the front.
      qc.setQueryData<Campaign[]>(["campaigns", brandId], (old) => [c, ...(old ?? [])]);
      qc.invalidateQueries({ queryKey: ["campaigns", brandId] });
      router.push(`/campaigns/${c.id}/edit`);
    },
    onError: (e: Error) => toast.error("Could not duplicate: " + e.message),
  });

  const columns: Column<Campaign>[] = [
    { key: "name", header: "Name", width: 240, cell: (c) => <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.name}</Link> },
    { key: "category", header: "Category", cell: (c) => c.category },
    { key: "subject", header: "Subject", cell: (c) => c.subject },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
    {
      key: "when",
      header: "Scheduled for",
      width: 190,
      align: "right",
      // Only while it is still waiting: after the send the time is history, and
      // leaving it under "Scheduled for" reads like it is going out again.
      cell: (c) =>
        c.status === "scheduled" && c.scheduledAt ? formatScheduled(c.scheduledAt, c.timezone) : "—",
    },
    {
      key: "actions", header: "Actions", align: "right", width: 90,
      cell: (c) => {
        // A send in progress owns the campaign — editing or deleting it underneath
        // the running loop is the one thing the backend refuses outright.
        const busy = c.status === "sending";
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              title="Actions"
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem disabled={busy} onClick={() => router.push(`/campaigns/${c.id}/edit`)}>
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => dupMut.mutate(c)}>
                <Copy className="size-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  // Say what actually disappears. "Delete this campaign?" hides the
                  // part that matters — the send history behind the analytics.
                  //
                  // The history warning is NOT conditional on status: a campaign
                  // auto-pause stopped halfway is back to "draft" while holding
                  // hundreds of send records, so keying off status would stay
                  // silent for exactly the campaigns with the most to lose.
                  const lines = [`Delete "${c.name}"?`];
                  if (c.status === "scheduled") lines.push("This campaign is scheduled. The scheduled send will be cancelled.");
                  // Deleting send records removes them from the deliverability
                  // maths too. Bounce/complaint records survive (they are kept per
                  // address), so deleting a clean campaign leaves the same problems
                  // over a smaller total — which can read as a worse rate.
                  lines.push("This also deletes its email history: who received it, who opened it, and who clicked. Your analytics and the sending-guard numbers will change.");
                  lines.push("You cannot undo this.");
                  if (confirm(lines.join("\n\n"))) delMut.mutate(c);
                }}
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
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
