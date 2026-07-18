"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
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

export default function NewCampaignPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", category: "", subject: "", html: "" });
  const [pickedName, setPickedName] = useState("");

  const templates = useQuery({ queryKey: ["templates", brandId], queryFn: () => api.templates(brandId!), enabled: !!brandId });

  // Deselect the template and empty everything it filled (name, subject, category, body).
  function clearTemplate() {
    setPickedName("");
    setForm((f) => ({ ...f, name: "", subject: "", category: "", html: "" }));
  }

  // Prefill subject + body from a saved template (name stays editable).
  // Select by template name (unique per brand) so the trigger shows the name, not an id.
  function pickTemplate(name: string) {
    setPickedName(name);
    const t = templates.data?.find((x) => x.name === name);
    if (t) setForm((f) => ({
      ...f,
      subject: t.subject || f.subject,
      html: t.html,
      name: f.name || t.name,
      category: t.category || f.category,
    }));
  }

  const createMut = useMutation({
    mutationFn: () => api.createCampaign(brandId!, form),
    onSuccess: (c) => {
      toast.success("Campaign created (draft)");
      qc.invalidateQueries({ queryKey: ["campaigns", brandId] });
      router.push(`/campaigns/${c.id}`); // go to the send screen
    },
    onError: (e: Error) => toast.error("Could not create: " + e.message),
  });

  return (
    <>
      <PageHeader
        title="New campaign"
        subtitle={brand?.name}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/campaigns")}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!form.name || !form.category || !form.subject || !form.html || createMut.isPending}
            >
              {createMut.isPending ? "Creating…" : "Create draft"}
            </Button>
          </div>
        }
      />

      <div className="grid w-full flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,460px)_1fr]">
        {/* Left: form */}
        <div className="flex flex-col gap-4">
          {(templates.data?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Start from template (optional)</Label>
                {pickedName && (
                  <button type="button" onClick={clearTemplate}
                    className="text-xs text-muted-foreground underline hover:text-foreground">
                    Clear
                  </button>
                )}
              </div>
              <Select value={pickedName} onValueChange={(v) => { if (v) pickTemplate(v); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Pick a saved template…" /></SelectTrigger>
                <SelectContent>
                  {(templates.data ?? []).map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Fills subject + body. You can still edit, or write HTML directly.</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Name (internal) <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product update — March" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category <span className="text-red-500">*</span></Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v ?? form.category })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick a category…" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Subject <span className="text-red-500">*</span></Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="🚀 What's new" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Body (HTML) <span className="text-red-500">*</span></Label>
            <Textarea rows={8} value={form.html} onChange={(e) => setForm({ ...form, html: e.target.value })} placeholder="<h2>Hello!</h2><p>…</p>" />
          </div>
        </div>

        {/* Right: live preview */}
        <div className="flex flex-col gap-1.5">
          <Label>Live preview</Label>
          <iframe title="preview" srcDoc={form.html || "<p style='font-family:sans-serif;color:#999;padding:16px'>Pick a template or write HTML to see a preview.</p>"} sandbox=""
            className="min-h-[70vh] w-full flex-1 rounded-lg border bg-white" />
        </div>
      </div>
    </>
  );
}
