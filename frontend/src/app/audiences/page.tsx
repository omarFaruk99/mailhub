"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Segment, SegmentInput } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { describeRule, segmentTypes } from "@/lib/audience";
import { canonical } from "@/lib/options";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Callout } from "@/components/callout";
import {
  EMPTY_SEGMENT_FORM, SegmentDialog, useSegmentOptions, type SegmentForm,
} from "@/components/segment-dialog";
import { Plus, Pencil, Trash2, MoreHorizontal, Users } from "lucide-react";

export default function AudiencesPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();

  // `editing` null = creating a new one; a segment = changing that one.
  const [editing, setEditing] = useState<Segment | null>(null);
  const [form, setForm] = useState<SegmentForm>(EMPTY_SEGMENT_FORM);
  const [open, setOpen] = useState(false);

  const segments = useQuery({
    queryKey: ["segments", brandId],
    queryFn: () => api.segments(brandId!),
    enabled: !!brandId,
  });
  // Dropdown values + the live count inside the editor.
  const options = useSegmentOptions(brandId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["segments", brandId] });
  };

  const saveMut = useMutation({
    mutationFn: (f: SegmentForm) => {
      const body: SegmentInput = {
        name: f.name.trim(),
        includeTypes: f.includeTypes,
        plan: f.plan || null,
        country: f.country || null,
        company: f.company || null,
      };
      return editing ? api.updateSegment(editing.id, body) : api.createSegment(brandId!, body);
    },
    onSuccess: () => {
      toast.success(editing ? "Segment updated" : "Segment saved");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error("Could not save: " + e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteSegment(id),
    onSuccess: () => {
      toast.success("Segment deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error("Could not delete: " + e.message),
  });

  function startNew() {
    setEditing(null);
    setForm(EMPTY_SEGMENT_FORM);
    setOpen(true);
  }

  function startEdit(s: Segment) {
    setEditing(s);
    setForm({
      name: s.name,
      // A legacy row with no types means everyone; open it with all three ticked
      // so saving it again writes that explicitly rather than leaving it unsaid.
      includeTypes: segmentTypes(s.includeTypes),
      // Show the list's spelling, so a rule saved as "paid" before the pickers
      // existed opens on "Paid" rather than looking like an unknown value.
      plan: canonical(s.plan, options.planOptions),
      country: canonical(s.country, options.countryOptions),
      company: canonical(s.company, options.companyOptions),
    });
    setOpen(true);
  }

  const columns: Column<Segment>[] = [
    { key: "name", header: "Name", width: 240, emphasis: true, cell: (s) => s.name },
    {
      key: "rule", header: "Who is in it", width: 320,
      cell: (s) => describeRule(
        { plan: s.plan ?? undefined, country: s.country ?? undefined, company: s.company ?? undefined },
        segmentTypes(s.includeTypes)
      ),
    },
    {
      key: "count", header: "People", align: "right", width: 90, tabular: true, emphasis: true,
      cell: (s) => s.count ?? "—",
    },
    {
      key: "actions", header: "Actions", align: "right", width: 90,
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Actions"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => startEdit(s)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                // Worth spelling out that this is not a contact delete — the row
                // says "412 people" right next to it, and that reads alarming.
                if (confirm(`Delete the segment "${s.name}"?\n\nThis removes the saved shortcut only. No contact is deleted, and campaigns you already sent or scheduled are not affected.`))
                  delMut.mutate(s.id);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Audiences"
        subtitle={
          segments.data
            ? `${segments.data.length} saved ${segments.data.length === 1 ? "segment" : "segments"}`
            : "Loading…"
        }
        action={
          <Button disabled={!brandId} onClick={startNew}>
            <Plus className="size-4" /> New segment
          </Button>
        }
      />

      <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
        <Callout icon={<Users className="size-4" />}>
          A segment saves a <strong>rule</strong>, not a list of names — &ldquo;clients on the Paid
          plan in Bangladesh&rdquo;. Pick it when you send, instead of setting the filters again
          every time. Anyone who matches the rule later joins on their own.
        </Callout>

        <Card>
          <CardContent className="p-0">
            <DataTable
              indexed
              loading={!segments.data}
              columns={columns}
              rows={segments.data ?? []}
              rowKey={(s) => s.id}
              empty="No segments yet. Save one here, or from a campaign's Filters panel."
            />
          </CardContent>
        </Card>
      </div>

      <SegmentDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        options={options}
        saving={saveMut.isPending}
        onSave={() => saveMut.mutate(form)}
      />
    </>
  );
}
