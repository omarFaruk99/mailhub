"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Template } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

// Full-page template editor (used by /templates/new and /templates/[id]).
// Left = fill-in form; right = large live preview. Save returns to the list.
export function TemplateEditor({ template }: { template?: Template }) {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const router = useRouter();

  const layouts = useQuery({ queryKey: ["layouts"], queryFn: () => api.layouts() });

  const [name, setName] = useState(template?.name ?? "");
  const [layoutKey, setLayoutKey] = useState(template?.layoutKey ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [fields, setFields] = useState<Record<string, string>>(() => {
    try { return template ? JSON.parse(template.fields || "{}") : {}; } catch { return {}; }
  });
  const [preview, setPreview] = useState(template?.html ?? "");

  // For a new template, default to the first layout once layouts load.
  useEffect(() => {
    if (!layoutKey && layouts.data?.length) setLayoutKey(layouts.data[0].key);
  }, [layouts.data, layoutKey]);

  const layoutMeta = useMemo(() => layouts.data?.find((l) => l.key === layoutKey), [layouts.data, layoutKey]);

  // Live preview: re-render (debounced) when the layout or fields change.
  useEffect(() => {
    if (!layoutKey) return;
    const t = setTimeout(async () => {
      try {
        const { html } = await api.renderTemplate(layoutKey, fields);
        setPreview(html);
      } catch {
        /* ignore transient preview errors */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [layoutKey, fields]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { html } = await api.renderTemplate(layoutKey, fields);
      const payload = { name, layoutKey, subject, fields, html };
      return template ? api.updateTemplate(template.id, payload) : api.createTemplate(brandId!, payload);
    },
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["templates", brandId] });
      router.push("/templates");
    },
    onError: (e: Error) => toast.error("Could not save: " + e.message),
  });

  return (
    <>
      <PageHeader
        title={template ? "Edit template" : "New template"}
        subtitle={brand?.name}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/templates")}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={!name || !layoutKey || saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save template"}
            </Button>
          </div>
        }
      />

      <div className="grid w-full flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,440px)_1fr]">
        {/* Left: fill-in form */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dark Mode Launch" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Layout</Label>
            <Select value={layoutKey} onValueChange={(v) => setLayoutKey(v ?? layoutKey)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick a layout…" /></SelectTrigger>
              <SelectContent>
                {(layouts.data ?? []).map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {layoutMeta && <p className="text-xs text-muted-foreground">{layoutMeta.description}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="🚀 What's new" />
          </div>
          {(layoutMeta?.fields ?? []).map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label>{f.label}{f.optional ? " (optional)" : ""}</Label>
              {f.type === "textarea" ? (
                <Textarea rows={4} value={fields[f.key] ?? ""} placeholder={f.placeholder}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
              ) : (
                <Input value={fields[f.key] ?? ""} placeholder={f.placeholder}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">The greeting uses the recipient&apos;s name automatically.</p>
        </div>

        {/* Right: large live preview */}
        <div className="flex flex-col gap-1.5">
          <Label>Live preview</Label>
          <iframe title="preview" srcDoc={preview} sandbox=""
            className="min-h-[70vh] w-full flex-1 rounded-lg border bg-white" />
        </div>
      </div>
    </>
  );
}
