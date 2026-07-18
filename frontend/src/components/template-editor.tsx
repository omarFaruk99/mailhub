"use client";
import { useState } from "react";
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

const CATEGORIES = ["Product updates", "Marketing/Offers", "Tips & Onboarding", "Transactional"];

// Full-page template editor. Users pick a ready-made design (or write HTML),
// edit the HTML, and see a live preview. Used by /templates/new and /templates/[id].
export function TemplateEditor({ template }: { template?: Template }) {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const router = useRouter();

  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [html, setHtml] = useState(template?.html ?? "");
  const [starterLabel, setStarterLabel] = useState("");

  const starters = useQuery({ queryKey: ["starterTemplates"], queryFn: () => api.starterTemplates() });

  // Match by label (unique) so the Select trigger shows the design name, not its key.
  function applyStarter(label: string) {
    const d = starters.data?.find((s) => s.label === label);
    if (!d) return;
    setStarterLabel(label);
    setHtml(d.html);
    setSubject((s) => s || d.subject);
    setCategory((c) => c || d.category);
    setName((n) => n || d.label);
  }

  // Deselect the ready-made design and empty everything it filled
  // (name, subject, category, HTML) — consistent with campaign "Clear".
  function clearStarter() {
    setStarterLabel("");
    setName("");
    setSubject("");
    setCategory("");
    setHtml("");
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { name, subject, category, html };
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
            <Button onClick={() => saveMut.mutate()} disabled={!name || !html || saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save template"}
            </Button>
          </div>
        }
      />

      <div className="grid w-full flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,460px)_1fr]">
        {/* Left: form */}
        <div className="flex flex-col gap-4">
          {!template && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Start from a ready-made design (optional)</Label>
                {starterLabel && (
                  <button type="button" onClick={clearStarter}
                    className="text-xs text-muted-foreground underline hover:text-foreground">
                    Clear
                  </button>
                )}
              </div>
              <Select value={starterLabel} onValueChange={(v) => { if (v) applyStarter(v); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Pick a design…" /></SelectTrigger>
                <SelectContent>
                  {(starters.data ?? []).map((d) => <SelectItem key={d.key} value={d.label}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Loads a design into the HTML box below — then edit it.</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label required>Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dark Mode Launch" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Default category (optional)</Label>
            <Select value={category} onValueChange={(v) => setCategory(v ?? category)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick a category…" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="🚀 What's new" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label required>Body (HTML)</Label>
            <Textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<table>…</table>"
              className="min-h-[300px] flex-1 font-mono text-xs" />
            <p className="text-xs text-muted-foreground">Use <code>{"{{name}}"}</code> for the recipient&apos;s name.</p>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="flex flex-col gap-1.5">
          <Label>Live preview</Label>
          <iframe title="preview" srcDoc={html || "<p style='font-family:sans-serif;color:#999;padding:16px'>Pick a design or write HTML to see a preview.</p>"} sandbox=""
            className="min-h-[70vh] w-full flex-1 rounded-lg border bg-white" />
        </div>
      </div>
    </>
  );
}
