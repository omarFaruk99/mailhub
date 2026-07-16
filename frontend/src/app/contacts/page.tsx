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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, Plus } from "lucide-react";

export default function ContactsPage() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", plan: "", country: "" });

  const contacts = useQuery({ queryKey: ["contacts", brandId], queryFn: () => api.contacts(brandId!), enabled: !!brandId });

  const addMut = useMutation({
    mutationFn: () => api.addContact(brandId!, form),
    onSuccess: () => {
      toast.success("Contact added");
      setOpen(false);
      setForm({ email: "", name: "", plan: "", country: "" });
      qc.invalidateQueries({ queryKey: ["contacts", brandId] });
    },
    onError: (e: Error) => toast.error("Could not add: " + e.message),
  });

  const importMut = useMutation({
    mutationFn: (file: File) => api.importCsv(brandId!, file),
    onSuccess: (r) => {
      toast.success(`Imported: ${r.added} added, ${r.skipped} skipped`);
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

      <div className="w-full max-w-6xl p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(contacts.data ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell>{c.plan || "—"}</TableCell>
                    <TableCell>{c.country || "—"}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
                {contacts.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No contacts yet. Add one or import a CSV.
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
