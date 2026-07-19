"use client";
import { useEffect, useState } from "react";
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
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Send, Monitor, Smartphone, ChevronRight, ChevronDown, PanelRightClose, Settings2, Check, X, Search,
  Users, Mail, Maximize2, Minimize2, ZoomIn,
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
const ZOOM_LEVELS = [50, 75, 100, 125, 150];

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
  const [canvasView, setCanvasView] = useState<"recipients" | "email">("email");
  const [zoom, setZoom] = useState(100); // email-preview zoom %
  const [fullscreen, setFullscreen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ audience: true, filters: false, when: false, checklist: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  // Full screen: the toggle button shows on both tabs and Escape also exits, so
  // there is always a way out (no stranded overlay). Escape is the keyboard path.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

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

  // ---- send ----
  const sendMut = useMutation({
    mutationFn: () =>
      api.sendCampaign(id, { includeTypes: types, ...(plan ? { plan } : {}), ...(company ? { company } : {}) }),
    onSuccess: (r) => {
      toast.success(`Sent ${r.sent} · skipped ${r.skippedSuppressed + r.skippedAlready} · failed ${r.failed}`);
      qc.invalidateQueries({ queryKey: ["recipients", id] });
      qc.invalidateQueries({ queryKey: ["campaigns", brandId] });
      setCanvasView("recipients"); // jump to the results once the send finishes
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

  const replyTo = `no-reply@${brand?.domain ?? "…"}`;
  // avatar initials from the brand name, e.g. "Innovate Solution" → "IS"
  const brandInitials =
    (brand?.name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  // ---- email-preview header values ----
  // "to N recipients" = everyone it was addressed to. After a send that's all
  // attempted rows (including failures), not just the successful ones.
  const toCount = isSent ? recs.length : total;
  // earliest recipient sentAt = when this campaign actually went out. Compare by
  // Date value (not string sort) so any timestamp format orders correctly, and
  // drop invalid/blank timestamps so a bad row can't render "Invalid Date".
  // Short form, no seconds, 2-digit year → e.g. "18 Jul 26, 1:01 pm".
  const sentTimes = recs.map((r) => new Date(r.sentAt).getTime()).filter((t) => !Number.isNaN(t));
  const sentDate = sentTimes.length
    ? new Date(Math.min(...sentTimes)).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit", hour12: true,
      })
    : "";
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
        <div className={cn("relative flex min-h-0 flex-col bg-background", fullscreen && "fixed inset-0 z-50")}>
          {/* --- toolbar: tabs (left) + view controls (right) --- */}
          <div className="flex flex-wrap items-center gap-2.5 border-b px-5">
            <div className="flex">
              <CanvasTab active={canvasView === "recipients"} onClick={() => setCanvasView("recipients")} icon={Users} label="Recipients" />
              <CanvasTab active={canvasView === "email"} onClick={() => setCanvasView("email")} icon={Mail} label="Email Preview" />
            </div>
            <div className="flex-1" />
            {/* Device + zoom apply only to the email render */}
            {canvasView === "email" && (
              <div className="flex items-center gap-2 py-2">
                <div className="inline-flex rounded-lg border bg-muted p-0.5">
                  <ToggleBtn active={device === "desktop"} onClick={() => setDevice("desktop")} icon={Monitor} label="Desktop" />
                  <ToggleBtn active={device === "mobile"} onClick={() => setDevice("mobile")} icon={Smartphone} label="Mobile" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    title="Zoom"
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[12.5px] font-semibold tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ZoomIn className="size-4 text-muted-foreground" /> {zoom}%
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-28">
                    <DropdownMenuRadioGroup value={String(zoom)} onValueChange={(v) => setZoom(Number(v))}>
                      {ZOOM_LEVELS.map((z) => (
                        <DropdownMenuRadioItem key={z} value={String(z)} className="tabular-nums">
                          {z}%
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {/* Full screen — available on both tabs (big recipient tables benefit too) */}
            <button
              onClick={() => setFullscreen((f) => !f)}
              className="my-1.5 grid size-8 place-items-center rounded-lg border bg-card text-muted-foreground hover:bg-muted"
              title={fullscreen ? "Exit full screen" : "Full screen"}
            >
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            {!inspectorOpen && (
              <button
                onClick={() => setInspectorOpen(true)}
                className="my-1.5 flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-muted"
              >
                <Settings2 className="size-4" /> Settings
              </button>
            )}
          </div>

          {/* --- stage --- */}
          <div className="flex-1 overflow-auto bg-muted/40 px-6 py-8">
            {canvasView === "recipients" ? (
              <div className="mx-auto flex h-full min-h-140 w-full max-w-240 flex-col gap-4">
                {isSent && (
                  <div className="grid grid-cols-3 gap-2.5">
                    <StatCard label="Sent" value={sentCount} />
                    <StatCard label="Opened" value={openedCount} pct={pct(openedCount)} good />
                    <StatCard label="Clicked" value={clickedCount} pct={pct(clickedCount)} good />
                  </div>
                )}
                {isSent ? (
                  <RecipientsTable recs={recs} contactByEmail={contactByEmail} />
                ) : (
                  <AudiencePreview audience={audience} total={total} />
                )}
              </div>
            ) : (
              <div className="mx-auto flex h-full min-h-140 w-full flex-col" style={{ maxWidth: device === "mobile" ? 380 : 960 }}>
                {/* browser-window email preview; fills the stage height, `zoom` rescales */}
                <div
                  className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_18px_50px_rgba(30,20,60,0.16)]"
                  style={{ zoom: zoom / 100 }}
                >
                  {/* window chrome */}
                  <div
                    className="flex items-center gap-2 border-b px-4 py-3"
                    style={{ background: "color-mix(in oklch, var(--muted) 55%, var(--card))" }}
                  >
                    <span className="size-[11px] rounded-full" style={{ background: "#ff5f57" }} />
                    <span className="size-[11px] rounded-full" style={{ background: "#febc2e" }} />
                    <span className="size-[11px] rounded-full" style={{ background: "#28c840" }} />
                  </div>
                  {/* email-client header — Gmail style: subject on top, sender row below */}
                  <div className="border-b px-5 py-4">
                    <div className="mb-3.5 text-[18px] font-semibold text-foreground text-balance">
                      {campaign?.subject ?? "…"}
                    </div>
                    <div className="flex items-start gap-3">
                      <span
                        className="grid size-10 flex-none place-items-center rounded-full text-[14px] font-bold text-white"
                        style={{ background: "var(--sidebar-primary)" }}
                      >
                        {brandInitials}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13.5px] font-semibold">{brand?.name ?? "…"}</span>
                        <span className="truncate text-[12.5px] text-muted-foreground">{replyTo}</span>
                        <span className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
                          to {toCount} recipient{toCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span
                        className="flex-none rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                        style={
                          isSent
                            ? { background: "color-mix(in oklch, var(--good) 16%, transparent)", color: "var(--good)" }
                            : { background: "var(--muted)", color: "var(--muted-foreground)" }
                        }
                      >
                        {isSent ? (sentDate ? `Sent · ${sentDate}` : "Sent") : "Not sent yet"}
                      </span>
                    </div>
                  </div>
                  {/* body: white reading pane; the real email is centred at 600px
                     (its true width) so wide frames just add white margins */}
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.7;color:${EMAIL.body}"><div style="max-width:600px;margin:0 auto;padding:24px 26px">${previewHtml || `<p style='color:${EMAIL.placeholder}'>No content yet.</p>`}</div></body>`}
                    className="block min-h-0 w-full flex-1 border-0"
                    style={{ background: "white" }}
                  />
                </div>
              </div>
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

            {/* Recap + sender identity now live in the preview (card header + status
               bar), so the inspector jumps straight to the settings accordions. */}

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
        <DialogContent className="sm:max-w-120">
          <DialogHeader>
            <DialogTitle>Send this campaign?</DialogTitle>
            <DialogDescription>
              {isSent
                ? "Contacts who already got it are skipped automatically. This can’t be undone."
                : "The email goes out immediately. This can’t be undone."}
            </DialogDescription>
          </DialogHeader>
          {/* final recap — key facts right before sending */}
          <div className="divide-y overflow-hidden rounded-xl border text-[13.5px]">
            <ConfirmRow k="Recipients">
              <span className="font-semibold tabular-nums" style={{ color: "var(--sidebar-primary)" }}>
                {isSent ? remaining : total} {(isSent ? remaining : total) === 1 ? "person" : "people"}
              </span>
            </ConfirmRow>
            <ConfirmRow k="Audience">
              {types.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {AUDIENCE.filter((a) => types.includes(a.value)).map((a) => <Pill key={a.value}>{a.label}</Pill>)}
                </span>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </ConfirmRow>
            <ConfirmRow k="Filters">
              {plan || company ? (
                <span className="flex flex-wrap gap-1.5">
                  {plan && <Pill>{plan}</Pill>}
                  {company && <Pill>{company}</Pill>}
                </span>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </ConfirmRow>
            <ConfirmRow k="Subject"><span className="font-semibold">{campaign?.subject ?? "—"}</span></ConfirmRow>
            <ConfirmRow k="From">
              <span className="flex flex-col leading-snug">
                <span className="font-semibold">{brand?.name ?? "—"}</span>
                <span className="text-muted-foreground">{replyTo}</span>
              </span>
            </ConfirmRow>
            <ConfirmRow k="When"><span className="font-semibold">Send now</span></ConfirmRow>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={() => { setConfirmOpen(false); sendMut.mutate(); }}
              style={{ background: "var(--sidebar-primary)", color: "white" }}
            >
              <Send className="size-4" /> Send now
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

    </div>
  );
}

/* ---------- small local components ---------- */

// One label:value row in the send-confirmation recap.
function ConfirmRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2">
      <span className="w-20 flex-none text-[12.5px] text-muted-foreground">{k}:</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// Read-only tag pill used in the confirm recap (audience / filters).
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
    >
      {children}
    </span>
  );
}

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
        "flex items-center gap-1.5 rounded-md px-3 py-1 text-[12.5px] font-semibold text-muted-foreground",
        active && "bg-card text-foreground shadow-sm"
      )}
    >
      {Icon && <Icon className="size-3.5" />} {label}
    </button>
  );
}

// Toolbar tab (Recipients / Email Preview) — underline marks the active view.
function CanvasTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Monitor; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 pb-3 pt-3 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground",
        active && "text-foreground"
      )}
      style={active ? { borderBottomColor: "var(--sidebar-primary)", color: "var(--sidebar-primary)" } : undefined}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

// Shared card shell for the recipient tables: bordered card, a toolbar bar,
// a scrolling table area, and a footer count. Both tables plug into this.
function TableShell({ toolbar, footer, children }: { toolbar: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">{toolbar}</div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-1.5">{children}</div>
      <div className="border-t px-4 py-2 text-[12px] text-muted-foreground tabular-nums">{footer}</div>
    </div>
  );
}

// Search-by-email-or-name box, shared by both recipient tables.
function SearchBox({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cn("relative w-64 max-w-full", className)}>
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by email or name…"
        className="h-8 pl-8 text-[13px]"
      />
    </div>
  );
}

// The shared contact columns (identical before and after a send).
function ContactHead() {
  return (
    <>
      <TableHead className="w-10 text-muted-foreground">#</TableHead>
      <TableHead>Email</TableHead>
      <TableHead>Name</TableHead>
      <TableHead>Type</TableHead>
      <TableHead>Company</TableHead>
      <TableHead>Plan</TableHead>
      <TableHead>Country</TableHead>
    </>
  );
}
function ContactCells({ index, email, contact }: { index: number; email: string; contact?: Contact }) {
  return (
    <>
      <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
      <TableCell className="text-muted-foreground">{email}</TableCell>
      <TableCell className="text-muted-foreground">{contact?.name || "—"}</TableCell>
      <TableCell className="text-muted-foreground">{contact ? TYPE_LABEL[contact.type] : "—"}</TableCell>
      <TableCell className="text-muted-foreground">{contact?.company || "—"}</TableCell>
      <TableCell className="text-muted-foreground">{contact?.plan || "—"}</TableCell>
      <TableCell className="text-muted-foreground">{contact?.country || "—"}</TableCell>
    </>
  );
}

// Before a send, the Recipients tab previews who currently matches — read-only,
// same table shape as the after-send results (minus the delivery columns).
// Who receives is controlled by Audience + Filters, not per-contact selection.
function AudiencePreview({ audience, total }: { audience: Contact[]; total: number }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = audience.filter(
    (c) => !q || c.email.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q)
  );

  return (
    <TableShell
      toolbar={
        <>
          <span className="text-[13px] font-semibold tabular-nums">
            {total} {total === 1 ? "person" : "people"} will receive this
          </span>
          <SearchBox value={query} onChange={setQuery} className="ml-auto" />
        </>
      }
      footer={`Showing ${rows.length} of ${total}`}
    >
      <Table>
        <TableHeader><TableRow><ContactHead /></TableRow></TableHeader>
        <TableBody>
          {rows.map((c, i) => (
            <TableRow key={c.id}><ContactCells index={i} email={c.email} contact={c} /></TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                {audience.length === 0 ? "No one matches yet." : "No one matches your search."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableShell>
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
    <TableShell
      toolbar={
        <>
          <SearchBox value={query} onChange={setQuery} />
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 sm:ml-auto">
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
        </>
      }
      footer={`Showing ${rows.length} of ${recs.length}`}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <ContactHead />
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Opened</TableHead>
            <TableHead className="text-center">Clicked</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ rec, contact }, i) => (
            <TableRow key={rec.id}>
              <ContactCells index={i} email={rec.email} contact={contact} />
              <TableCell><RecStatus status={rec.status} /></TableCell>
              <TableCell className="text-center">{rec.openedAt ? <Check className="mx-auto size-3.5 text-good" /> : <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-center">{rec.clickedAt ? <Check className="mx-auto size-3.5 text-good" /> : <span className="text-muted-foreground">—</span>}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                {recs.length === 0 ? "No recipients yet." : "No recipients match your search."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableShell>
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
