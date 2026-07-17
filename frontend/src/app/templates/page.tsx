"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";

export default function TemplatesPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const router = useRouter();

  const templates = useQuery({ queryKey: ["templates", brandId], queryFn: () => api.templates(brandId!), enabled: !!brandId });
  const layouts = useQuery({ queryKey: ["layouts"], queryFn: () => api.layouts() });
  const labelFor = (key: string) => layouts.data?.find((l) => l.key === key)?.label ?? key;

  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["templates", brandId] });
    },
    onError: (e: Error) => toast.error("Could not delete: " + e.message),
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
                  <TableHead>Layout</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-16 text-right">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(templates.data ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link href={`/templates/${t.id}`} className="hover:underline">{t.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{labelFor(t.layoutKey)}</TableCell>
                    <TableCell className="text-muted-foreground">{t.subject || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Delete "${t.name}"?`)) delMut.mutate(t.id); }}>
                        <Trash2 className="size-4" />
                      </Button>
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
