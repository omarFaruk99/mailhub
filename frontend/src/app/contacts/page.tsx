"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function ContactsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const emptyForm = { email: "", name: "", plan: "", country: "", type: "client" as ContactType, company: "" };
  const [form, setForm] = useState(emptyForm);
  const [typeFilter, setTypeFilter] = useState<ContactType | "all">("all");
  // The contact being edited — null when the edit dialog is closed.
  const [editing, setEditing] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const contacts = useQuery({ queryKey: ["contacts", brandId], queryFn: () => api.contacts(brandId!), enabled: !!brandId });
  // Who we are forbidden to email. Their address cannot be edited: a new address
  // would quietly undo the unsubscribe, since suppression is keyed by address.
  const suppressions = useQuery({
    queryKey: ["suppressions", brandId],
    queryFn: () => api.suppressions(brandId!),
    enabled: !!brandId,
  });
  const suppressedSet = new Set((suppressions.data ?? []).map((s) => s.email));
  // Until we actually know, treat every address as locked. An empty set while the
  // query loads or fails would silently offer to edit the address of someone who
  // unsubscribed — the one change this screen must never make easy. (The backend
  // refuses it anyway; this keeps the UI from promising something it cannot do.)
  const suppressionKnown = suppressions.isSuccess;
  const emailLocked = (email: string) => !suppressionKnown || suppressedSet.has(email);

  function openEdit(c: Contact) {
    setEditing(c);
    setEditForm({
      email: c.email,
      name: c.name ?? "",
      plan: c.plan ?? "",
      country: c.country ?? "",
      type: c.type,
      company: c.company ?? "",
    });
  }

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
          ? "Contact deleted — they stay on the do-not-send list"
          : r.historyDeleted > 0
            ? `Contact deleted — ${r.historyDeleted} send records removed with them`
            : "Contact deleted"
      );
      qc.invalidateQueries({ queryKey: ["contacts", brandId] });
      qc.invalidateQueries({ queryKey: ["analytics", brandId] });
    },
    onError: (e: Error) => toast.error("Could not delete: " + e.message),
  });

  const addMut = useMutation({
    mutationFn: () => api.addContact(brandId!, form),
    onSuccess: () => {
      toast.success("Contact added");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["contacts", brandId] });
    },
    onError: (e: Error) => toast.error("Could not add: " + e.message),
  });

  const shown = (contacts.data ?? []).filter((c) => typeFilter === "all" || c.type === typeFilter);

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
                // Two things worth saying out loud before they agree: the history
                // goes, and (reassuringly) an unsubscribe does not.
                const parts = [`Delete ${c.email}?`];
                if (suppressionKnown && suppressedSet.has(c.email)) {
                  parts.push("They stay on the do-not-send list, so deleting them here does not start emails again.");
                }
                parts.push("Their send history (opens and clicks) will be deleted too. This cannot be undone.");
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

  const importMut = useMutation({
    mutationFn: (file: File) => api.importCsv(brandId!, file),
    onSuccess: (r) => {
      toast.success(`Imported: ${r.added} added, ${r.skipped} skipped`);
      // A type the file used but we don't know was imported as "client" — and
      // clients are in almost every category's default audience, so say it out
      // loud instead of letting it show up later as mail to the wrong person.
      if (r.unknownTypes?.length) {
        toast.warning(
          `Unknown contact type ${r.unknownTypes.map((t) => `"${t}"`).join(", ")} — those rows were imported as "client". Fix the type column and re-import, or edit them.`,
          { duration: 12_000 }
        );
      }
      qc.invalidateQueries({ queryKey: ["contacts", brandId] });
    },
    onError: () => toast.error("Import failed"),
  });

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
            <Button disabled={!brandId} onClick={() => setOpen(true)}><Plus className="size-4" /> Add contact</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></Field>
                  <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Type">
                      <Select
                        value={form.type}
                        onValueChange={(v) => {
                          const t = (v ?? form.type) as ContactType;
                          // internal (our colleagues) never carry a company → clear it.
                          setForm({ ...form, type: t, company: t === "internal" ? "" : form.company });
                        }}
                      >
                        <SelectTrigger className="w-full"><SelectValue>{typeLabel}</SelectValue></SelectTrigger>
                        <SelectContent>
                          {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Company">
                      <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                        placeholder={form.type === "internal" ? "— (leave blank)" : "e.g. ABC Travel"}
                        disabled={form.type === "internal"} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Plan"><Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="Paid / Trial" /></Field>
                    <Field label="Country"><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => addMut.mutate()} disabled={!form.email || addMut.isPending}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
        {/* Type filter chips */}
        <div className="flex flex-wrap gap-2">
          <Chip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All ({contacts.data?.length ?? 0})
          </Chip>
          {TYPES.map((t) => (
            <Chip key={t.value} active={typeFilter === t.value} onClick={() => setTypeFilter(t.value)}>
              {t.label} ({(contacts.data ?? []).filter((c) => c.type === t.value).length})
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
              empty={contacts.data?.length ? "No contacts of this type." : "No contacts yet. Add one or import a CSV."}
            />
          </CardContent>
        </Card>
      </div>

      {/* Edit one contact. Same fields as Add, minus status — status records what the
          PERSON did (unsubscribed, bounced, complained) and must never be typed over. */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
            <DialogDescription>
              Status is set by what the contact did, so it is not editable here.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="flex flex-col gap-4 py-2">
              {emailLocked(editing.email) && (
                <Callout tone="warn" icon={<Lock className="size-4" />}>
                  {suppressionKnown ? (
                    <>
                      This address is on the do-not-send list, so it cannot be changed — a new
                      address would quietly bring them back into the audience. If it was simply
                      mistyped, delete this contact and add the correct one.
                    </>
                  ) : suppressions.isError ? (
                    // Without a retry this stays locked forever on a temporary
                    // network blip, with no way out of the dialog but Cancel.
                    <>
                      Could not load the do-not-send list, so the address stays locked — changing it
                      blindly could undo someone&apos;s unsubscribe.{" "}
                      <button onClick={() => suppressions.refetch()} className="underline">Try again</button>
                    </>
                  ) : (
                    <>Checking the do-not-send list — the address stays locked until we know.</>
                  )}
                </Callout>
              )}
              <Field label="Email">
                <Input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  disabled={emailLocked(editing.email)}
                />
              </Field>
              <Field label="Name">
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Type">
                  <Select
                    value={editForm.type}
                    onValueChange={(v) => {
                      const t = (v ?? editForm.type) as ContactType;
                      // internal (our colleagues) never carry a company → clear it.
                      setEditForm({ ...editForm, type: t, company: t === "internal" ? "" : editForm.company });
                    }}
                  >
                    <SelectTrigger className="w-full"><SelectValue>{typeLabel}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Company">
                  <Input
                    value={editForm.company}
                    onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                    placeholder={editForm.type === "internal" ? "— (leave blank)" : "e.g. ABC Travel"}
                    disabled={editForm.type === "internal"}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Plan">
                  <Input value={editForm.plan} onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })} />
                </Field>
                <Field label="Country">
                  <Input value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editMut.mutate()} disabled={!editForm.email || editMut.isPending}>
              {editMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
