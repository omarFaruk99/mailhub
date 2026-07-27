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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tag } from "@/components/ui/tag";
import { Upload, Plus } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { Contact, ContactType } from "@/lib/api";

// Contact type options.
const TYPES: { value: ContactType; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "prospect", label: "Prospect" },
  { value: "internal", label: "Internal" },
];

export default function ContactsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const emptyForm = { email: "", name: "", plan: "", country: "", type: "client" as ContactType, company: "" };
  const [form, setForm] = useState(emptyForm);
  const [typeFilter, setTypeFilter] = useState<ContactType | "all">("all");

  const contacts = useQuery({ queryKey: ["contacts", brandId], queryFn: () => api.contacts(brandId!), enabled: !!brandId });

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
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
