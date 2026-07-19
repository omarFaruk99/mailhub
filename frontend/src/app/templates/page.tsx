"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Template } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Plus, Trash2, Copy, Pencil, MoreHorizontal } from "lucide-react";

// Build a unique "X (copy)" name that doesn't collide with existing names.
function uniqueCopyName(base: string, existing: string[]) {
  let name = `${base} (copy)`;
  let i = 2;
  while (existing.includes(name)) { name = `${base} (copy ${i})`; i++; }
  return name;
}

export default function TemplatesPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const router = useRouter();

  const templates = useQuery({ queryKey: ["templates", brandId], queryFn: () => api.templates(brandId!), enabled: !!brandId });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["templates", brandId] });
    },
    onError: (e: Error) => toast.error("Could not delete: " + e.message),
  });

  const dupMut = useMutation({
    mutationFn: (t: Template) => {
      const name = uniqueCopyName(t.name, (templates.data ?? []).map((x) => x.name));
      return api.createTemplate(brandId!, { name, subject: t.subject, category: t.category, html: t.html });
    },
    onSuccess: () => {
      toast.success("Template duplicated");
      qc.invalidateQueries({ queryKey: ["templates", brandId] });
    },
    onError: (e: Error) => toast.error("Could not duplicate: " + e.message),
  });

  const columns: Column<Template>[] = [
    {
      key: "name", header: "Name", width: 300,
      cell: (t) => (
        <span className="inline-flex items-center gap-2">
          <Link href={`/templates/${t.id}`} className="hover:underline">{t.name}</Link>
          {t.isStarter ? (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              Starter
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Yours
            </span>
          )}
        </span>
      ),
    },
    { key: "category", header: "Category", cell: (t) => t.category || "—" },
    { key: "subject", header: "Subject", cell: (t) => t.subject || "—" },
    {
      key: "actions", header: "Actions", align: "right", width: 90,
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Actions"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => router.push(`/templates/${t.id}`)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dupMut.mutate(t)}>
              <Copy className="size-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => { if (confirm(`Delete "${t.name}"?`)) delMut.mutate(t.id); }}
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
        title="Templates"
        subtitle={templates.data ? `${templates.data.length} templates` : "Loading…"}
        action={
          <Button disabled={!brandId} onClick={() => router.push("/templates/new")}>
            <Plus className="size-4" /> New template
          </Button>
        }
      />

      <div className="w-full max-w-6xl p-6">
        <Card>
          <CardContent className="p-0">
            <DataTable
              indexed
              loading={!templates.data}
              columns={columns}
              rows={templates.data ?? []}
              rowKey={(t) => t.id}
              empty="No templates yet. Create one to reuse in campaigns."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
