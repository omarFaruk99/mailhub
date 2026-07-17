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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(templates.data ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Link href={`/templates/${t.id}`} className="hover:underline">{t.name}</Link>
                        <span className={
                          "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (t.isStarter
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
                            : "bg-muted text-muted-foreground")
                        }>
                          {t.isStarter ? "Starter" : "Yours"}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.category || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.subject || "—"}</TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
                {templates.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No templates yet. Create one to reuse in campaigns.
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
