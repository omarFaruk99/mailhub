"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { sendingStatusKey } from "@/lib/use-sending-status";
import { countryNames } from "@/lib/countries";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tag } from "@/components/ui/tag";
import { Callout } from "@/components/callout";
import { Upload, Plus, Pencil, Trash2, MoreHorizontal, Lock } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { Contact, ContactType } from "@/lib/api";

// Contact type options.
const TYPES: { value: ContactType; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "prospect", label: "Prospect" },
  { value: "internal", label: "Internal" },
];

// Base UI's <SelectValue /> renders the stored VALUE, not the chosen item's label —
// so the trigger read "client" while the list said "Client". Pass the lookup
// explicitly. (Elsewhere the value and the label happen to be the same string,
// which is why this only shows up here.)
const typeLabel = (v: unknown) => TYPES.find((t) => t.value === v)?.label ?? String(v ?? "");

// The usual plans. Whatever a brand already uses is added to this at render time,
// so switching to a dropdown never hides or rewrites existing data.
const COMMON_PLANS = ["Free", "Trial", "Paid"];

/**
 * Merge the standard options with the values already in the data, treating
 * spellings that differ only by case as one option.
 *
 * Without this the list showed "Paid" AND "paid" — the two spellings already
 * sitting in the database, which is the very problem a dropdown is here to end.
 * `preferred` comes first, so the standard spelling is the one that survives.
 */
function mergeOptions(preferred: string[], existing: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...preferred, ...existing]) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * The option this stored value means, in the list's own spelling.
 *
 * A contact saved as "paid" shows as "Paid" and is stored that way the next time
 * anyone saves them — so the old spellings clean themselves up through normal use
 * instead of needing a migration.
 */
function canonical(value: string | null | undefined, options: string[]): string {
  const v = value?.trim();
  if (!v) return "";
  return options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
}

// Why someone is blocked, in words the reader does not have to decode.
const BLOCK_REASON: Record<string, string> = {
  unsubscribe: "they unsubscribed",
  bounce: "their address did not work",
  complaint: "they marked an email as spam",
};

type ContactForm = {
  email: string;
  name: string;
  plan: string;
  country: string;
  type: ContactType;
  company: string;
};

const EMPTY_FORM: ContactForm = { email: "", name: "", plan: "", country: "", type: "client", company: "" };

export default function ContactsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [typeFilter, setTypeFilter] = useState<ContactType | "all">("all");
  // The contact being edited — null when the edit dialog is closed.
  const [editing, setEditing] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<ContactForm>(EMPTY_FORM);

  const contacts = useQuery({ queryKey: ["contacts", brandId], queryFn: () => api.contacts(brandId!), enabled: !!brandId });
  // Who we must not email. Their address cannot be edited: a new address would
  // quietly undo the unsubscribe, since the block is stored per address.
  const suppressions = useQuery({
    queryKey: ["suppressions", brandId],
    queryFn: () => api.suppressions(brandId!),
    enabled: !!brandId,
  });
  const blockedBy = new Map((suppressions.data ?? []).map((s) => [s.email, s.reason]));
  // Until we actually know, treat every address as locked. An empty map while the
  // query loads or fails would silently offer to edit the address of someone who
  // unsubscribed — the one change this screen must never make easy. (The backend
  // refuses it anyway; this keeps the UI from promising something it cannot do.)
  const blockKnown = suppressions.isSuccess;
  const emailLocked = (email: string) => !blockKnown || blockedBy.has(email);

  // Dropdown options: the usual values plus anything this brand already uses, so a
  // country or plan typed before this screen existed stays selectable.
  const rows = contacts.data ?? [];
  const planOptions = mergeOptions(COMMON_PLANS, rows.map((c) => c.plan));
  const countryOptions = mergeOptions(countryNames(), rows.map((c) => c.country))
    .sort((a, b) => a.localeCompare(b));

  function openEdit(c: Contact) {
    setEditing(c);
    setEditForm({
      email: c.email,
      name: c.name ?? "",
      // Shown in the list's spelling, so saving quietly fixes an old "paid".
      plan: canonical(c.plan, planOptions),
      country: canonical(c.country, countryOptions),
      type: c.type,
      company: c.company ?? "",
    });
  }

  const addMut = useMutation({
    mutationFn: () => api.addContact(brandId!, form),
    onSuccess: () => {
      toast.success("Contact added");
      setAddOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["contacts", brandId] });
    },
    onError: (e: Error) => toast.error("Could not add: " + e.message),
  });

  const editMut = useMutation({
    mutationFn: () => api.updateContact(editing!.id, editForm),
    onSuccess: () => {
      toast.success("Contact updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["contacts", brandId] });
    },
    onError: (e: Error) => toast.error("Could not save: " + e.message),
  });

  const delMut = useMutation({
    mutationFn: (c: Contact) => api.deleteContact(c.id),
    onSuccess: (r) => {
      toast.success(
        r.stillSuppressed
          ? "Contact deleted. They stay on the blocked list."
          : r.historyDeleted > 0
            ? `Contact deleted, with ${r.historyDeleted} email records.`
            : "Contact deleted"
      );
      qc.invalidateQueries({ queryKey: ["contacts", brandId] });
      // Their recipient rows counted towards analytics and towards the auto-pause
      // denominator, so both have to re-read after they are removed.
      qc.invalidateQueries({ queryKey: ["analytics", brandId] });
      qc.invalidateQueries({ queryKey: sendingStatusKey(brandId) });
    },
    onError: (e: Error) => toast.error("Could not delete: " + e.message),
  });

  const importMut = useMutation({
    mutationFn: (file: File) => api.importCsv(brandId!, file),
    onSuccess: (r) => {
      toast.success(`Imported: ${r.added} added, ${r.skipped} skipped`);
      // A type the file used but we do not know was imported as "client" — and
      // clients receive almost every category, so say it out loud instead of
      // letting it show up later as mail to the wrong person.
      if (r.unknownTypes?.length) {
        toast.warning(
          `We do not know the type ${r.unknownTypes.map((t) => `"${t}"`).join(", ")}. Those rows were added as "client". Fix the type column and import again, or edit them here.`,
          { duration: 12_000 }
        );
      }
      qc.invalidateQueries({ queryKey: ["contacts", brandId] });
    },
    onError: () => toast.error("Import failed"),
  });

  const shown = rows.filter((c) => typeFilter === "all" || c.type === typeFilter);

  // Shared contact column order/look (matches the send-page recipients table).
  const columns: Column<Contact>[] = [
    { key: "email", header: "Email", width: 280, cell: (c) => c.email },
    { key: "name", header: "Name", cell: (c) => c.name || "—" },
    { key: "type", header: "Type", cell: (c) => <Tag>{c.type}</Tag> },
    { key: "company", header: "Company", cell: (c) => c.company || "—" },
    { key: "plan", header: "Plan", cell: (c) => c.plan || "—" },
    { key: "country", header: "Country", cell: (c) => c.country || "—" },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
    {
      key: "actions", header: "Actions", align: "right", width: 90,
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Actions"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => openEdit(c)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                // Two things worth saying before they agree: the history goes, and
                // (reassuringly) a block does not.
                const parts = [`Delete ${c.email}?`];
                parts.push("This also deletes their email history: which emails they received, opened, and clicked. Your analytics and the sending-guard numbers will change.");
                if (blockedBy.has(c.email)) {
                  // Worth spelling out both halves: the block survives, but the
                  // bounce/complaint behind it stops counting towards the guard —
                  // which is the honest description of "cleaning the list".
                  parts.push("They stay on the blocked list, so they will not receive emails even if you add them again.");
                }
                parts.push("You cannot undo this.");
                if (confirm(parts.join("\n\n"))) delMut.mutate(c);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={contacts.data ? `${contacts.data.length} contacts` : "Loading…"}
        action={
          <div className="flex gap-2">
            <input
              ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importMut.mutate(f); e.target.value = ""; }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!brandId || importMut.isPending}>
              <Upload className="size-4" /> Import CSV
            </Button>
            <Button disabled={!brandId} onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add contact</Button>
          </div>
        }
      />

      <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
        {/* Type filter chips */}
        <div className="flex flex-wrap gap-2">
          <Chip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All ({rows.length})
          </Chip>
          {TYPES.map((t) => (
            <Chip key={t.value} active={typeFilter === t.value} onClick={() => setTypeFilter(t.value)}>
              {t.label} ({rows.filter((c) => c.type === t.value).length})
            </Chip>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <DataTable
              indexed
              loading={!contacts.data}
              columns={columns}
              rows={shown}
              rowKey={(c) => c.id}
              empty={rows.length ? "No contacts of this type." : "No contacts yet. Add one or import a CSV."}
            />
          </CardContent>
        </Card>
      </div>

      {/* ---- Add ---- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>Add one person to this brand&apos;s contact list.</DialogDescription>
          </DialogHeader>
          <ContactFields
            form={form}
            setForm={setForm}
            planOptions={planOptions}
            countryOptions={countryOptions}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMut.mutate()} disabled={!form.email || addMut.isPending}>
              {addMut.isPending ? "Adding…" : "Add contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Edit ---- */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <DialogTitle>Edit contact</DialogTitle>
              {/* The record's state belongs next to its name, not in a form field:
                  it is not something you fill in. */}
              {editing && <StatusBadge status={editing.status} />}
            </div>
            <DialogDescription>
              Status changes on its own — when someone unsubscribes, or an email
              cannot be delivered. You cannot set it here.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <>
              {emailLocked(editing.email) && (
                <Callout tone="warn" icon={<Lock className="size-4" />}>
                  {blockKnown ? (
                    <>
                      <strong>
                        This contact will not receive emails ({BLOCK_REASON[blockedBy.get(editing.email) ?? ""] ?? "they are blocked"}).
                      </strong>
                      <br />
                      We block emails by address, not by person. So the email address cannot be
                      changed here — a new address would not be blocked, and emails would start
                      going to them again.
                      <br />
                      Is the address wrong? Delete this contact, then add the correct address.
                    </>
                  ) : suppressions.isError ? (
                    // Without a retry this stays locked forever on a temporary
                    // network problem, with no way out of the dialog but Cancel.
                    <>
                      We could not load the blocked list, so the email address stays locked.{" "}
                      <button onClick={() => suppressions.refetch()} className="underline">Try again</button>
                    </>
                  ) : (
                    <>Checking the blocked list. The email address stays locked until this finishes.</>
                  )}
                </Callout>
              )}
              <ContactFields
                form={editForm}
                setForm={setEditForm}
                planOptions={planOptions}
                countryOptions={countryOptions}
                emailDisabled={emailLocked(editing.email)}
              />
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editMut.mutate()} disabled={!editForm.email || editMut.isPending}>
              {editMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The contact fields, shared by Add and Edit so the two can never drift apart.
 *
 * Two columns on anything wider than a phone: six stacked fields made a tall,
 * narrow column that pushed the buttons off small laptop screens.
 */
function ContactFields({
  form, setForm, planOptions, countryOptions, emailDisabled,
}: {
  form: ContactForm;
  setForm: (f: ContactForm) => void;
  planOptions: string[];
  countryOptions: string[];
  emailDisabled?: boolean;
}) {
  // Three even rows, paired by what each field answers: who they are, how we group
  // them, what we know about them. (Status is not here — it is a badge next to the
  // dialog title, which is where a record's state belongs and keeps the rows even.)
  return (
    <div className="grid gap-x-4 gap-y-4 py-1 sm:grid-cols-2">
      <Field label="Email address" required>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="name@company.com"
          disabled={emailDisabled}
        />
      </Field>

      <Field label="Full name">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Jane Smith"
        />
      </Field>

      <Field label="Type" hint="Decides which emails they receive">
        <Select
          value={form.type}
          onValueChange={(v) => {
            const t = (v ?? form.type) as ContactType;
            // Internal people are our own colleagues, so they have no company.
            setForm({ ...form, type: t, company: t === "internal" ? "" : form.company });
          }}
        >
          <SelectTrigger className="h-9 w-full"><SelectValue>{typeLabel}</SelectValue></SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Company"
        hint={form.type === "internal" ? "Not used for internal people" : "Used to filter who receives an email"}
      >
        <Input
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder={form.type === "internal" ? "—" : "ABC Travel"}
          disabled={form.type === "internal"}
        />
      </Field>

      <Field label="Plan">
        {/* A dropdown, not free text: send filters match exactly, so one contact
            typed "paid" and another "Paid" would land in different audiences. */}
        <Combobox
          value={form.plan}
          onChange={(v) => setForm({ ...form, plan: v })}
          options={planOptions}
          placeholder="No plan"
          clearLabel="No plan"
          searchPlaceholder="Search plans…"
        />
      </Field>

      <Field label="Country">
        <Combobox
          value={form.country}
          onChange={(v) => setForm({ ...form, country: v })}
          options={countryOptions}
          placeholder="No country"
          clearLabel="No country"
          searchPlaceholder="Search countries…"
          emptyText="No country matches."
        />
      </Field>
    </div>
  );
}

function Field({
  label, hint, required, className, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label required={required}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
