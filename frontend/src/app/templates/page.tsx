"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Template, LayoutMeta } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";

type Draft = { id: string | null; name: string; layoutKey: string; subject: string; fields: Record<string, string> };

export default function TemplatesPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();

  const templates = useQuery({ queryKey: ["templates", brandId], queryFn: () => api.templates(brandId!), enabled: !!brandId });
  const layouts = useQuery({ queryKey: ["layouts"], queryFn: () => api.layouts() });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState("");

  const layoutMeta: LayoutMeta | undefined = useMemo(
    () => layouts.data?.find((l) => l.key === draft?.layoutKey),
    [layouts.data, draft?.layoutKey]
  );

  // Live preview: re-render (debounced) whenever the layout or fields change.
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(async () => {
      try {
        const { html } = await api.renderTemplate(draft.layoutKey, draft.fields);
        setPreview(html);
      } catch {
        /* ignore transient preview errors */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft?.layoutKey, draft?.fields]);

  function startNew() {
    const first = layouts.data?.[0];
    if (!first) return toast.error("No layouts available yet");
    setDraft({ id: null, name: "", layoutKey: first.key, subject: "", fields: {} });
    setPreview("");
    setOpen(true);
  }

  function startEdit(t: Template) {
    let fields: Record<string, string> = {};
    try { fields = JSON.parse(t.fields || "{}"); } catch {}
    setDraft({ id: t.id, name: t.name, layoutKey: t.layoutKey, subject: t.subject, fields });
    setPreview(t.html);
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("no draft");
      // Always render fresh HTML on save so it matches the fields exactly.
      const { html } = await api.renderTemplate(draft.layoutKey, draft.fields);
      const payload = { name: draft.name, layoutKey: draft.layoutKey, subject: draft.subject, fields: draft.fields, html };
      return draft.id ? api.updateTemplate(draft.id, payload) : api.createTemplate(brandId!, payload);
    },
    onSuccess: () => {
      toast.success("Template saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["templates", brandId] });
    },
    onError: (e: Error) => toast.error("Could not save: " + e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["templates", brandId] });
    },
    onError: (e: Error) => toast.error("Could not delete: " + e.message),
  });

  const labelFor = (key: string) => layouts.data?.find((l) => l.key === key)?.label ?? key;

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle={templates.data ? `${templates.data.length} templates` : "Loading…"}
        action={<Button disabled={!brandId} onClick={startNew}><Plus className="size-4" /> New template</Button>}
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
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(templates.data ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">{labelFor(t.layoutKey)}</TableCell>
                    <TableCell className="text-muted-foreground">{t.subject || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(t)}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Delete "${t.name}"?`)) delMut.mutate(t.id); }}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
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

      {/* Editor dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Left: fill-in form */}
              <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
                <div className="flex flex-col gap-1.5">
                  <Label>Template name</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Dark Mode Launch" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Layout</Label>
                  <Select value={draft.layoutKey} onValueChange={(v) => setDraft({ ...draft, layoutKey: (v ?? draft.layoutKey) })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(layouts.data ?? []).map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {layoutMeta && <p className="text-xs text-muted-foreground">{layoutMeta.description}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Subject</Label>
                  <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="🚀 What's new" />
                </div>
                {(layoutMeta?.fields ?? []).map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label>{f.label}{f.optional ? " (optional)" : ""}</Label>
                    {f.type === "textarea" ? (
                      <Textarea rows={4} value={draft.fields[f.key] ?? ""} placeholder={f.placeholder}
                        onChange={(e) => setDraft({ ...draft, fields: { ...draft.fields, [f.key]: e.target.value } })} />
                    ) : (
                      <Input value={draft.fields[f.key] ?? ""} placeholder={f.placeholder}
                        onChange={(e) => setDraft({ ...draft, fields: { ...draft.fields, [f.key]: e.target.value } })} />
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Tip: the greeting uses the recipient&apos;s name automatically.</p>
              </div>

              {/* Right: live preview */}
              <div className="flex flex-col gap-1.5">
                <Label>Live preview</Label>
                <iframe title="preview" srcDoc={preview} sandbox=""
                  className="h-[60vh] w-full rounded-lg border bg-white" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => saveMut.mutate()} disabled={!draft?.name || saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
