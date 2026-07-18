"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ContactType } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Send, Monitor, Smartphone, ChevronRight, PanelRightClose, Settings2, Check, X,
} from "lucide-react";

// Which contact types are pre-checked for a category (user can change).
// Mirrors backend `defaultTypesForCategory` in routes/campaigns.ts.
function defaultTypes(category?: string): ContactType[] {
  if (category === "Marketing/Offers") return ["client", "prospect"];
  if (category === "Product updates") return ["client", "prospect", "internal"];
  return ["client"];
}

const AUDIENCE: { value: ContactType; label: string; desc: string }[] = [
  { value: "client", label: "Clients", desc: "Paying customers" },
  { value: "prospect", label: "Prospects", desc: "Potential customers" },
  { value: "internal", label: "Internal", desc: "Our own colleagues" },
];
const TYPE_LABEL: Record<ContactType, string> = { client: "Client", prospect: "Prospect", internal: "Internal" };

export default function CampaignSendPage() {
  const { id: rawId } = useParams();
  const id = String(rawId);
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();

  // ---- data ----
  const campaigns = useQuery({ queryKey: ["campaigns", brandId], queryFn: () => api.campaigns(brandId!), enabled: !!brandId });
  const campaign = campaigns.data?.find((c) => c.id === id);
  const contacts = useQuery({ queryKey: ["contacts", brandId], queryFn: () => api.contacts(brandId!), enabled: !!brandId });
  const suppressions = useQuery({ queryKey: ["suppressions", brandId], queryFn: () => api.suppressions(brandId!), enabled: !!brandId });
  const recipients = useQuery({ queryKey: ["recipients", id], queryFn: () => api.recipients(id) });

  // ---- local UI state ----
  const [pickedTypes, setPickedTypes] = useState<ContactType[] | null>(null);
  const [plan, setPlan] = useState("");
  const [company, setCompany] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({ audience: true, filters: false, when: false, checklist: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);

  const types = pickedTypes ?? defaultTypes(campaign?.category);
  const toggleType = (t: ContactType) =>
    setPickedTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);

  // filter option lists (distinct values found in this brand's contacts).
  // No manual useMemo — Next 16's React Compiler memoizes automatically.
  const planOptions = [...new Set((contacts.data ?? []).map((c) => c.plan).filter(Boolean) as string[])].sort();
  const companyOptions = [...new Set((contacts.data ?? []).map((c) => c.company).filter(Boolean) as string[])].sort();

  // live audience — mirrors the backend send filter so counts are accurate
  const suppressedSet = new Set((suppressions.data ?? []).map((s) => s.email));
  const companyQ = company.trim().toLowerCase();
  const audience = (contacts.data ?? []).filter(
    (c) =>
      c.status === "subscribed" &&
      !suppressedSet.has(c.email) &&
      types.includes(c.type) &&
      (!plan || c.plan === plan) &&
      (!companyQ || (c.company ?? "").trim().toLowerCase() === companyQ)
  );
  const total = audience.length;
  const breakdown: Partial<Record<ContactType, number>> = {};
  audience.forEach((c) => (breakdown[c.type] = (breakdown[c.type] ?? 0) + 1));

  // ---- send ----
  const sendMut = useMutation({
    mutationFn: () =>
      api.sendCampaign(id, { includeTypes: types, ...(plan ? { plan } : {}), ...(company ? { company } : {}) }),
    onSuccess: (r) => {
      toast.success(`Sent ${r.sent} · skipped ${r.skippedSuppressed + r.skippedAlready} · failed ${r.failed}`);
      qc.invalidateQueries({ queryKey: ["recipients", id] });
      qc.invalidateQueries({ queryKey: ["campaigns", brandId] });
    },
    onError: (e: Error) => toast.error("Send failed: " + e.message),
  });

  const recs = recipients.data ?? [];
  const isSent = campaign?.status === "sent" || recs.length > 0;
  const sentCount = recs.filter((r) => r.status === "sent").length;
  const openedCount = recs.filter((r) => r.openedAt).length;
  const clickedCount = recs.filter((r) => r.clickedAt).length;
  const denom = recs.length || 1;
  const pct = (n: number) => Math.round((n / denom) * 100);

  // email preview: show {{name}} as a friendly placeholder
  const previewHtml = (campaign?.html ?? "").replace(/\{\{\s*name\s*\}\}/gi, "there");

  // checklist
  const checks = [
    { ok: !!campaign?.subject, label: "Subject line added" },
    { ok: !!campaign?.html, label: "Email body has content" },
    { ok: total > 0, label: total > 0 ? `Audience selected (${total} people)` : "No one matches yet" },
    { ok: true, label: "Unsubscribe link present" },
  ];
  const allGood = checks.every((c) => c.ok);

  const fromLine = brand ? `${brand.name} <no-reply@${brand.domain}>` : "…";

  return (
    <div className="flex min-w-0 flex-col" style={{ height: "100vh" }}>
      {/* ===== Top action bar ===== */}
      <div className="flex items-center gap-2.5 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link href="/campaigns" className="text-muted-foreground hover:text-foreground">Campaigns</Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="truncate font-semibold">{campaign?.name ?? "…"}</span>
        </div>
        <StatusPill sent={isSent} />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setTestOpen(true)} disabled={isSent}>
          Send test
        </Button>
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={isSent || total === 0 || sendMut.isPending || !campaign}
          style={{ background: "var(--sidebar-primary)", color: "white" }}
        >
          <Send className="size-4" />
          {isSent ? "Sent" : sendMut.isPending ? "Sending…" : `Send to ${total} →`}
        </Button>
      </div>

      {/* ===== Body: canvas + inspector ===== */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: inspectorOpen ? "1fr 350px" : "1fr 0px", transition: "grid-template-columns .2s ease" }}>
        {/* Canvas */}
        <div className="relative overflow-y-auto bg-muted/40 px-6 py-8">
          {!inspectorOpen && (
            <button
              onClick={() => setInspectorOpen(true)}
              className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted"
            >
              <Settings2 className="size-4" /> Settings
            </button>
          )}
          <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4">
            {isSent && (
              <div className="grid w-full grid-cols-3 gap-2.5">
                <StatCard label="Sent" value={sentCount || recs.length} />
                <StatCard label="Opened" value={openedCount} pct={pct(openedCount)} good />
                <StatCard label="Clicked" value={clickedCount} pct={pct(clickedCount)} good />
              </div>
            )}
            <div className="inline-flex rounded-full border bg-card p-0.5 shadow-sm">
              <DeviceBtn active={device === "desktop"} onClick={() => setDevice("desktop")} icon={Monitor} label="Desktop" />
              <DeviceBtn active={device === "mobile"} onClick={() => setDevice("mobile")} icon={Smartphone} label="Mobile" />
            </div>
            <div
              className="w-full overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(30,20,60,0.14)]"
              style={{ maxWidth: device === "mobile" ? 300 : 520, transition: "max-width .2s ease" }}
            >
              <div className="border-b px-5 py-3.5" style={{ borderColor: "#f0f0f2" }}>
                <div className="text-[13px]" style={{ color: "#8a8a92" }}>{fromLine}</div>
                <div className="mt-1 text-[16px] font-semibold" style={{ color: "#131316" }}>
                  {campaign?.subject ?? "…"}
                </div>
              </div>
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;padding:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.7;color:#2e2e35">${previewHtml || "<p style='color:#9a9aa2'>No content yet.</p>"}</body>`}
                className="block w-full border-0"
                style={{ height: 340, background: "white" }}
              />
            </div>
          </div>
        </div>

        {/* Inspector */}
        {inspectorOpen && (
          <div className="overflow-y-auto border-l bg-card">
            <div className="sticky top-0 z-10 flex items-center border-b bg-card px-4 py-3">
              <span className="text-[13px] font-semibold">Send settings</span>
              <button
                onClick={() => setInspectorOpen(false)}
                className="ml-auto grid size-7 place-items-center rounded-lg border text-muted-foreground hover:bg-muted"
                title="Hide panel"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>

            {/* Recap */}
            <div
              className="m-4 mb-1 rounded-xl border p-3.5"
              style={{ background: "var(--accent)", borderColor: "color-mix(in oklch, var(--sidebar-primary) 20%, transparent)" }}
            >
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-mono text-[26px] font-bold tabular-nums tracking-tight"
                  style={{ color: total === 0 ? "var(--destructive)" : "var(--accent-foreground)" }}
                >
                  {total}
                </span>
                <span className="text-[13px] text-muted-foreground">people will receive this</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(breakdown) as ContactType[]).map((t) => (
                  <span key={t} className="rounded-full bg-card px-2.5 py-0.5 text-xs tabular-nums">
                    {TYPE_LABEL[t]} · {breakdown[t]}
                  </span>
                ))}
              </div>
              <button
                onClick={() => setRecOpen(true)}
                className="mt-2.5 text-[12.5px] font-medium underline underline-offset-2"
                style={{ color: "var(--accent-foreground)" }}
              >
                See exactly who →
              </button>
            </div>

            {/* Sender identity */}
            <div className="mx-4 mt-1.5 flex flex-col gap-1.5 rounded-xl border p-3">
              <SenderRow k="From" v={fromLine} />
              <SenderRow k="Reply-to" v={`no-reply@${brand?.domain ?? "…"}`} note="set in Brand settings" />
            </div>

            {/* Accordions */}
            <Accordion num={1} title="Audience" summary={`${total} people`} warn={total === 0}
              openState={open.audience} onToggle={() => setOpen((o) => ({ ...o, audience: !o.audience }))}>
              <div className="flex flex-col gap-1.5">
                {AUDIENCE.map((a) => {
                  const count = (contacts.data ?? []).filter((c) => c.type === a.value && c.status === "subscribed").length;
                  const on = types.includes(a.value);
                  return (
                    <button
                      key={a.value}
                      onClick={() => !isSent && toggleType(a.value)}
                      disabled={isSent}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60",
                        on && "border-[color:var(--sidebar-primary)] bg-[color-mix(in_oklch,var(--sidebar-primary)_5%,transparent)]"
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-[17px] flex-none place-items-center rounded-[5px] border text-[10px] text-white",
                          on && "border-transparent"
                        )}
                        style={on ? { background: "var(--sidebar-primary)" } : undefined}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span>
                        <span className="block text-[13.5px] font-medium">{a.label}</span>
                        <span className="block text-[12px] text-muted-foreground">{a.desc}</span>
                      </span>
                      <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
            </Accordion>

            <Accordion num={2} title="Filters" summary={[plan, company].filter(Boolean).join(", ") || "None"}
              openState={open.filters} onToggle={() => setOpen((o) => ({ ...o, filters: !o.filters }))}>
              <FilterSelect label="Plan" value={plan} onChange={setPlan} options={planOptions} anyLabel="Any plan" disabled={isSent} />
              <FilterSelect label="Company" value={company} onChange={setCompany} options={companyOptions} anyLabel="Any company" disabled={isSent} />
              {(plan || company) && (
                <div className="flex flex-wrap gap-1.5">
                  {plan && <FilterChip label={plan} onClear={() => setPlan("")} />}
                  {company && <FilterChip label={company} onClear={() => setCompany("")} />}
                </div>
              )}
            </Accordion>

            <Accordion num={3} title="When to send" summary="Send now"
              openState={open.when} onToggle={() => setOpen((o) => ({ ...o, when: !o.when }))}>
              <div className="flex flex-col gap-1.5">
                <div className="rounded-lg border border-[color:var(--sidebar-primary)] bg-[color-mix(in_oklch,var(--sidebar-primary)_6%,transparent)] px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                    <span className="relative grid size-3.5 place-items-center rounded-full border-[1.5px] border-[color:var(--sidebar-primary)]">
                      <span className="size-1.5 rounded-full" style={{ background: "var(--sidebar-primary)" }} />
                    </span>
                    Send now
                  </div>
                  <div className="ml-[22px] mt-0.5 text-[12px] text-muted-foreground">Goes out immediately</div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 opacity-60">
                  <span className="size-3.5 flex-none rounded-full border-[1.5px]" />
                  <span className="text-[13.5px] font-medium">Schedule for later</span>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Soon</span>
                </div>
              </div>
            </Accordion>

            <Accordion num={4} title="Pre-send checklist" summary={allGood ? "All good" : "1 to fix"}
              summaryTone={allGood ? "ok" : "warn"}
              openState={open.checklist} onToggle={() => setOpen((o) => ({ ...o, checklist: !o.checklist }))}>
              <div className="flex flex-col gap-2">
                {checks.map((c, i) => (
                  <div key={i} className={cn("flex items-center gap-2 text-[13px]", !c.ok && "text-destructive")}>
                    <span
                      className="grid size-[17px] flex-none place-items-center rounded-full text-[10px]"
                      style={{
                        background: c.ok ? "color-mix(in oklch, var(--good, oklch(0.62 0.14 155)) 20%, transparent)" : "color-mix(in oklch, var(--destructive) 15%, transparent)",
                        color: c.ok ? "oklch(0.55 0.14 155)" : "var(--destructive)",
                      }}
                    >
                      {c.ok ? <Check className="size-3" /> : <X className="size-3" />}
                    </span>
                    {c.label}
                  </div>
                ))}
              </div>
            </Accordion>
          </div>
        )}
      </div>

      {/* ===== Confirm send ===== */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this campaign?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{total}</strong> people will receive
              {" "}<strong className="text-foreground">“{campaign?.subject}”</strong>. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={() => { setConfirmOpen(false); sendMut.mutate(); }}
              style={{ background: "var(--sidebar-primary)", color: "white" }}
            >
              Yes, send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Send test ===== */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a test email</DialogTitle>
            <DialogDescription>
              A test send to your own address is coming in a later step (it needs SES production access).
              For now, use the preview on the left to check how the email looks.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Recipients ===== */}
      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recipients ({total})</DialogTitle>
            <DialogDescription>These contacts match your audience and filters right now.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[260px] overflow-y-auto rounded-lg border">
            {audience.length === 0 && <div className="p-3 text-sm text-muted-foreground">No one matches.</div>}
            {audience.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border-b px-3 py-2 text-[13px] last:border-b-0">
                {c.email}
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {TYPE_LABEL[c.type]}
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- small local components ---------- */

function StatusPill({ sent }: { sent: boolean }) {
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
      style={
        sent
          ? { background: "color-mix(in oklch, oklch(0.62 0.14 155) 16%, transparent)", color: "oklch(0.5 0.14 155)" }
          : { background: "var(--muted)", color: "var(--muted-foreground)" }
      }
    >
      {sent ? "Sent" : "Draft"}
    </span>
  );
}

function DeviceBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Monitor; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[12.5px] font-semibold text-muted-foreground",
        active && "bg-muted text-foreground"
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

function StatCard({ label, value, pct, good }: { label: string; value: number; pct?: number; good?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3.5 text-center shadow-sm">
      <div className={cn("font-mono text-2xl font-bold tabular-nums", good && "text-[oklch(0.55_0.14_155)]")}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
      {pct !== undefined && <div className="text-[11px] font-semibold text-[oklch(0.55_0.14_155)]">{pct}%</div>}
    </div>
  );
}

function SenderRow({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <span className="w-[62px] flex-none text-[12px] text-muted-foreground">{k}</span>
      <span className="min-w-0 truncate">{v}</span>
      {note && <span className="ml-auto flex-none text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function Accordion({
  num, title, summary, summaryTone, warn, openState, onToggle, children,
}: {
  num: number; title: string; summary: string; summaryTone?: "ok" | "warn"; warn?: boolean;
  openState: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const tone = warn || summaryTone === "warn" ? "text-destructive" : summaryTone === "ok" ? "text-[oklch(0.55_0.14_155)]" : "text-muted-foreground";
  return (
    <div className="border-b">
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left hover:bg-muted">
        <span
          className="grid size-[22px] flex-none place-items-center rounded-md text-[12px] font-bold"
          style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
        >
          {num}
        </span>
        <span className="text-[13.5px] font-semibold">{title}</span>
        {!openState && <span className={cn("ml-auto max-w-[150px] truncate text-[12.5px] tabular-nums", tone)}>{summary}</span>}
        <ChevronRight className={cn("size-3.5 flex-none text-muted-foreground transition-transform", openState ? "rotate-90" : "", !openState ? "" : "ml-auto")} />
      </button>
      {openState && <div className="flex flex-col gap-2.5 px-4 pb-4">{children}</div>}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, anyLabel, disabled,
}: { label: string; value: string; onChange: (v: string) => void; options: string[]; anyLabel: string; disabled?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border bg-card px-2.5 text-[13.5px] disabled:opacity-60"
      >
        <option value="">{anyLabel}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1.5 text-[12px] font-medium"
      style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
    >
      {label}
      <button onClick={onClear} className="opacity-70 hover:opacity-100" aria-label={`Remove ${label}`}>
        <X className="size-3" />
      </button>
    </span>
  );
}
