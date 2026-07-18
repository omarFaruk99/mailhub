"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ContactType } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import type { Contact, Recipient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Send, Monitor, Smartphone, ChevronRight, PanelRightClose, Settings2, Check, X, Search,
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

// The email preview mimics a real inbox, which renders on a white card with dark
// text regardless of the app's light/dark theme. So these are intentionally fixed
// colors, NOT app theme tokens — theming them would wrongly recolor the email.
const EMAIL = {
  border: "#f0f0f2",
  from: "#8a8a92",
  subject: "#131316",
  body: "#2e2e35",
  placeholder: "#9a9aa2",
};

export default function CampaignSendPage() {
  const { id } = useParams();
  // Key the page by campaign id so navigating to a different campaign fully
  // resets local state (picked audience, filters, search, canvas view) instead
  // of carrying it over from the previous campaign.
  return <CampaignSend key={String(id)} />;
}

function CampaignSend() {
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
  const [canvasView, setCanvasView] = useState<"recipients" | "email">("recipients");
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
  // email → contact, so the results table can show each recipient's name & type
  const contactByEmail = new Map((contacts.data ?? []).map((c) => [c.email, c]));
  const isSent = campaign?.status === "sent" || recs.length > 0;
  const sentCount = recs.filter((r) => r.status === "sent").length;
  const openedCount = recs.filter((r) => r.openedAt).length;
  const clickedCount = recs.filter((r) => r.clickedAt).length;
  // Open/click rates are measured against successfully-sent emails, not total
  // attempts (a failed send can't be opened). Fall back to 1 to avoid /0.
  const rateBase = sentCount || 1;
  const pct = (n: number) => Math.round((n / rateBase) * 100);

  // How many contacts match the current audience but have NOT been sent yet
  // (backend is exactly-once, so a re-send only reaches these).
  const sentEmails = new Set(recs.map((r) => r.email));
  const remaining = audience.filter((c) => !sentEmails.has(c.email)).length;
  const canSend = !!campaign && !sendMut.isPending && (isSent ? remaining > 0 : total > 0);

  // email preview: show {{name}} as a friendly placeholder
  const previewHtml = (campaign?.html ?? "").replace(/\{\{\s*name\s*\}\}/gi, "there");

  // checklist
  const checks = [
    { ok: !!campaign?.subject, label: "Subject line added" },
    { ok: !!campaign?.html, label: "Email body has content" },
    { ok: total > 0, label: total > 0 ? `Audience selected (${total} people)` : "No one matches yet" },
    { ok: true, label: "Unsubscribe link present" },
  ];
  const failingChecks = checks.filter((c) => !c.ok).length;
  const allGood = failingChecks === 0;

  const fromLine = brand ? `${brand.name} <no-reply@${brand.domain}>` : "…";

  // send button label
  const sendLabel = sendMut.isPending
    ? "Sending…"
    : isSent
      ? remaining > 0 ? `Send to ${remaining} more →` : "Sent"
      : `Send to ${total} →`;

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
        <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
          Send test
        </Button>
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={!canSend}
          style={{ background: "var(--sidebar-primary)", color: "white" }}
        >
          <Send className="size-4" />
          {sendLabel}
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
          <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4">
            {isSent && (
              <>
                {/* Performance stats */}
                <div className="grid w-full grid-cols-3 gap-2.5">
                  <StatCard label="Sent" value={sentCount} />
                  <StatCard label="Opened" value={openedCount} pct={pct(openedCount)} good />
                  <StatCard label="Clicked" value={clickedCount} pct={pct(clickedCount)} good />
                </div>
                {/* After sending, the canvas shows results; toggle back to the email if needed. */}
                <div className="inline-flex rounded-full border bg-card p-0.5 shadow-sm">
                  <ToggleBtn active={canvasView === "recipients"} onClick={() => setCanvasView("recipients")} label="Recipients" />
                  <ToggleBtn active={canvasView === "email"} onClick={() => setCanvasView("email")} label="Email" />
                </div>
              </>
            )}

            {isSent && canvasView === "recipients" ? (
              <RecipientsTable recs={recs} contactByEmail={contactByEmail} />
            ) : (
              <>
                {!isSent && (
                  <div className="inline-flex rounded-full border bg-card p-0.5 shadow-sm">
                    <ToggleBtn active={device === "desktop"} onClick={() => setDevice("desktop")} icon={Monitor} label="Desktop" />
                    <ToggleBtn active={device === "mobile"} onClick={() => setDevice("mobile")} icon={Smartphone} label="Mobile" />
                  </div>
                )}
                <div
                  className="w-full overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(30,20,60,0.14)]"
                  style={{ maxWidth: device === "mobile" ? 300 : 520, transition: "max-width .2s ease" }}
                >
                  <div className="border-b px-5 py-3.5" style={{ borderColor: EMAIL.border }}>
                    <div className="text-[13px]" style={{ color: EMAIL.from }}>{fromLine}</div>
                    <div className="mt-1 text-[16px] font-semibold" style={{ color: EMAIL.subject }}>
                      {campaign?.subject ?? "…"}
                    </div>
                  </div>
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;padding:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.7;color:${EMAIL.body}">${previewHtml || `<p style='color:${EMAIL.placeholder}'>No content yet.</p>`}</body>`}
                    className="block w-full border-0"
                    style={{ height: 340, background: "white" }}
                  />
                </div>
              </>
            )}
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
                <span className="text-[13px] text-muted-foreground">
                  {isSent ? "people match now" : "people will receive this"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(breakdown) as ContactType[]).map((t) => (
                  <span key={t} className="rounded-full bg-card px-2.5 py-0.5 text-xs tabular-nums">
                    {TYPE_LABEL[t]} · {breakdown[t]}
                  </span>
                ))}
              </div>
              {isSent && remaining > 0 && (
                <div className="mt-2 text-[12px] text-muted-foreground">
                  {remaining} not yet sent — a re-send reaches only those.
                </div>
              )}
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
                      onClick={() => toggleType(a.value)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted",
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
              <FilterSelect label="Plan" value={plan} onChange={setPlan} options={planOptions} anyLabel="Any plan" />
              <FilterSelect label="Company" value={company} onChange={setCompany} options={companyOptions} anyLabel="Any company" />
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

            <Accordion num={4} title="Pre-send checklist" summary={allGood ? "All good" : `${failingChecks} to fix`}
              summaryTone={allGood ? "ok" : "warn"}
              openState={open.checklist} onToggle={() => setOpen((o) => ({ ...o, checklist: !o.checklist }))}>
              <div className="flex flex-col gap-2">
                {checks.map((c, i) => (
                  <div key={i} className={cn("flex items-center gap-2 text-[13px]", !c.ok && "text-destructive")}>
                    <span
                      className="grid size-[17px] flex-none place-items-center rounded-full text-[10px]"
                      style={{
                        background: c.ok ? "color-mix(in oklch, var(--good) 20%, transparent)" : "color-mix(in oklch, var(--destructive) 15%, transparent)",
                        color: c.ok ? "var(--good)" : "var(--destructive)",
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
              <strong className="text-foreground">{isSent ? remaining : total}</strong> people will receive
              {" "}<strong className="text-foreground">“{campaign?.subject}”</strong>.
              {isSent
                ? " Contacts who already got it are skipped automatically."
                : " This can’t be undone."}
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

      {/* ===== Recipients (matched audience) ===== */}
      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Matching contacts ({total})</DialogTitle>
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
          ? { background: "color-mix(in oklch, var(--good) 16%, transparent)", color: "var(--good)" }
          : { background: "var(--muted)", color: "var(--muted-foreground)" }
      }
    >
      {sent ? "Sent" : "Draft"}
    </span>
  );
}

function ToggleBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon?: typeof Monitor; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[12.5px] font-semibold text-muted-foreground",
        active && "bg-muted text-foreground"
      )}
    >
      {Icon && <Icon className="size-3.5" />} {label}
    </button>
  );
}

function StatCard({ label, value, pct, good }: { label: string; value: number; pct?: number; good?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3.5 text-center shadow-sm">
      <div className={cn("font-mono text-2xl font-bold tabular-nums", good && "text-good")}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
      {pct !== undefined && <div className="text-[11px] font-semibold text-good">{pct}%</div>}
    </div>
  );
}

const REC_FILTERS: { key: "all" | "sent" | "failed" | "opened"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "opened", label: "Opened" },
];

function RecipientsTable({ recs, contactByEmail }: { recs: Recipient[]; contactByEmail: Map<string, Contact> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "sent" | "failed" | "opened">("all");

  const q = query.trim().toLowerCase();
  const rows = recs
    .map((r) => ({ rec: r, contact: contactByEmail.get(r.email) }))
    .filter(({ rec, contact }) => {
      if (status === "sent" && rec.status !== "sent") return false;
      if (status === "failed" && rec.status !== "failed") return false;
      if (status === "opened" && !rec.openedAt) return false;
      if (!q) return true;
      return rec.email.toLowerCase().includes(q) || (contact?.name ?? "").toLowerCase().includes(q);
    });

  return (
    <div className="w-full overflow-hidden rounded-xl border bg-card">
      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or name…"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {REC_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium text-muted-foreground",
                status === f.key && "bg-card text-foreground shadow-sm"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[430px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Opened</TableHead>
              <TableHead className="text-center">Clicked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ rec, contact }) => (
              <TableRow key={rec.id}>
                <TableCell className="text-muted-foreground">{rec.email}</TableCell>
                <TableCell>{contact?.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{contact ? TYPE_LABEL[contact.type] : "—"}</TableCell>
                <TableCell><RecStatus status={rec.status} /></TableCell>
                <TableCell className="text-center">{rec.openedAt ? <Check className="mx-auto size-3.5 text-good" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-center">{rec.clickedAt ? <Check className="mx-auto size-3.5 text-good" /> : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {recs.length === 0 ? "No recipients yet." : "No recipients match your search."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="border-t px-4 py-2 text-[12px] text-muted-foreground tabular-nums">
        Showing {rows.length} of {recs.length}
      </div>
    </div>
  );
}

function RecStatus({ status }: { status: string }) {
  const failed = status === "failed";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={
        failed
          ? { background: "color-mix(in oklch, var(--destructive) 12%, transparent)", color: "var(--destructive)" }
          : { background: "color-mix(in oklch, var(--good) 16%, transparent)", color: "var(--good)" }
      }
    >
      {status}
    </span>
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
  const tone = warn || summaryTone === "warn" ? "text-destructive" : summaryTone === "ok" ? "text-good" : "text-muted-foreground";
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
        {!openState && <span className={cn("max-w-[150px] truncate text-[12.5px] tabular-nums", tone)}>{summary}</span>}
        <ChevronRight className={cn("ml-auto size-3.5 flex-none text-muted-foreground transition-transform", openState && "rotate-90")} />
      </button>
      {openState && <div className="flex flex-col gap-2.5 px-4 pb-4">{children}</div>}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, anyLabel,
}: { label: string; value: string; onChange: (v: string) => void; options: string[]; anyLabel: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border bg-card px-2.5 text-[13.5px]"
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
