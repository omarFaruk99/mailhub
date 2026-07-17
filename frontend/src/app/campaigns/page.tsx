"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
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
import { Plus } from "lucide-react";

const CATEGORIES = ["Product updates", "Marketing/Offers", "Tips & Onboarding", "Transactional"];

export default function CampaignsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0], subject: "", html: "" });
  const [templateId, setTemplateId] = useState("");

  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });
  const templates = useQuery({ queryKey: ["templates", brandId], queryFn: () => api.templates(brandId!), enabled: !!brandId });

  // Prefill subject + HTML from a saved template (name stays editable).
  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.data?.find((x) => x.id === id);
    if (t) setForm((f) => ({ ...f, subject: t.subject || f.subject, html: t.html, name: f.name || t.name }));
  }

  const createMut = useMutation({
    mutationFn: () => api.createCampaign(brandId!, form),
    onSuccess: () => {
      toast.success("Campaign created (draft)");
      setOpen(false);
      setForm({ name: "", category: CATEGORIES[0], subject: "", html: "" });
      setTemplateId("");
      qc.invalidateQueries({ queryKey: ["campaigns", brandId] });
    },
    onError: (e: Error) => toast.error("Could not create: " + e.message),
  });

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle={campaigns.data ? `${campaigns.data.length} campaigns` : "Loading…"}
        action={
          <>
            <Button disabled={!brandId} onClick={() => setOpen(true)}><Plus className="size-4" /> New campaign</Button>
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>New campaign</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-4 py-2">
                {(templates.data?.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Start from template (optional)</Label>
                    <Select value={templateId} onValueChange={(v) => { if (v) pickTemplate(v); }}>
                      <SelectTrigger><SelectValue placeholder="Pick a saved template…" /></SelectTrigger>
                      <SelectContent>
                        {(templates.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Fills subject + body below. You can still edit, or write HTML directly.</p>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product update — March" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v ?? form.category })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Subject</Label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="🚀 What's new" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Body (HTML)</Label>
                  <Textarea rows={5} value={form.html} onChange={(e) => setForm({ ...form, html: e.target.value })} placeholder="<h2>Hello!</h2><p>...</p>" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createMut.mutate()} disabled={!form.name || !form.subject || !form.html || createMut.isPending}>
                  Create draft
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
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
