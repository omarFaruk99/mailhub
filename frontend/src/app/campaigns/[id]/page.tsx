"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ContactType } from "@/lib/api";
import { Chip } from "@/components/ui/chip";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Send } from "lucide-react";

const AUDIENCE: { value: ContactType; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "prospect", label: "Prospect" },
  { value: "internal", label: "Internal (colleagues)" },
];
// Which types are pre-checked for a category (user can change).
// Keep in sync with backend `defaultTypesForCategory` in routes/campaigns.ts —
// that is the authoritative rule; this only pre-checks the boxes.
function defaultTypes(category?: string): ContactType[] {
  return category === "Marketing/Offers" ? ["client", "prospect"] : ["client"];
}

export default function CampaignDetail() {
  const params = useParams();
  const id = String(params.id);
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const [plan, setPlan] = useState("");
  const [company, setCompany] = useState("");
  // null = not touched yet → use the category default.
  const [pickedTypes, setPickedTypes] = useState<ContactType[] | null>(null);

  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });
  const campaign = campaigns.data?.find((c) => c.id === id);
  const recipients = useQuery({ queryKey: ["recipients", id], queryFn: () => api.recipients(id) });
  const contacts = useQuery({ queryKey: ["contacts", brandId], queryFn: () => api.contacts(brandId!), enabled: !!brandId });
  const suppressions = useQuery({ queryKey: ["suppressions", brandId], queryFn: () => api.suppressions(brandId!), enabled: !!brandId });

  const types = pickedTypes ?? defaultTypes(campaign?.category);
  const toggleType = (t: ContactType) =>
    setPickedTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);

  // Live audience preview — mirrors the backend send filter so "~N" is accurate:
  // subscribed + selected types + optional plan/company, minus suppressed emails.
  // Company match is trimmed + case-insensitive.
  const companyQ = company.trim().toLowerCase();
  const suppressedSet = new Set((suppressions.data ?? []).map((s) => s.email));
  const audience = (contacts.data ?? []).filter(
    (c) =>
      c.status === "subscribed" &&
      !suppressedSet.has(c.email) &&
      types.includes(c.type) &&
      (!plan || c.plan === plan) &&
      (!companyQ || (c.company ?? "").trim().toLowerCase() === companyQ)
  );

  const sendMut = useMutation({
    mutationFn: () =>
      api.sendCampaign(id, {
        includeTypes: types,
        ...(plan ? { plan } : {}),
        ...(company ? { company } : {}),
      }),
    onSuccess: (r) => {
      toast.success(`Sent ${r.sent} · skipped ${r.skippedSuppressed + r.skippedAlready} · failed ${r.failed}`);
      qc.invalidateQueries({ queryKey: ["recipients", id] });
      qc.invalidateQueries({ queryKey: ["campaigns", brandId] });
    },
    onError: (e: Error) => toast.error("Send failed: " + e.message),
  });

  const recs = recipients.data ?? [];
  const opened = recs.filter((r) => r.openedAt).length;
  const clicked = recs.filter((r) => r.clickedAt).length;

  return (
    <>
      <PageHeader
        title={campaign?.name ?? "Campaign"}
        subtitle={campaign ? `${campaign.category} · ${campaign.subject}` : "Loading…"}
        action={campaign ? <StatusBadge status={campaign.status} /> : null}
      />

      <div className="flex w-full max-w-6xl flex-col gap-6 p-6">
        {/* Send panel */}
        <Card>
          <CardHeader><CardTitle className="text-base">Send this campaign</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Audience: who receives this */}
            <div className="flex flex-col gap-2">
              <Label>Send to</Label>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE.map((a) => (
                  <Chip key={a.value} active={types.includes(a.value)} onClick={() => toggleType(a.value)}>
                    {types.includes(a.value) ? "✓ " : ""}{a.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Filter by plan (optional)</Label>
                <Input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="blank = any plan" className="w-52" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Filter by company (optional)</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. ABC Travel" className="w-52" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || types.length === 0 || !campaign}>
                <Send className="size-4" /> {sendMut.isPending ? "Sending…" : "Send now"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {!campaign
                  ? "Loading campaign…"
                  : types.length === 0
                  ? "Pick at least one audience above."
                  : `This email goes to: ${types.map((t) => AUDIENCE.find((a) => a.value === t)?.label).join(" + ")} · ~${audience.length} people`}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Only subscribed, non-suppressed contacts receive it. Unsubscribe link is added automatically.
              {campaign ? ` Defaults for "${campaign.category}" are pre-selected — you can change them.` : ""}
            </p>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Sent" value={recs.filter((r) => r.status === "sent").length} />
          <Stat label="Opened" value={opened} />
          <Stat label="Clicked" value={clicked} />
        </div>

        {/* Recipients */}
        <Card>
          <CardHeader><CardTitle className="text-base">Recipients</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Clicked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>{r.openedAt ? "✓" : "—"}</TableCell>
                    <TableCell>{r.clickedAt ? "✓" : "—"}</TableCell>
                  </TableRow>
                ))}
                {recs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      Not sent yet. Use “Send now” above.
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
