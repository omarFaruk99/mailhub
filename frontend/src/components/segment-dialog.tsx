"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Contact, ContactType, Segment } from "@/lib/api";
import { ALL_TYPES, audienceOf } from "@/lib/audience";
import { COMMON_PLANS, mergeOptions } from "@/lib/options";
import { countryNames } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

/**
 * The segment editor, shared by the Audiences screen and the send page's
 * "Save as segment". Both must offer the same plan/country lists and count the
 * same way — a segment that means one thing where it is created and another
 * where it is used is worse than no segment at all.
 *
 * Presentational on purpose: the parent owns the form state and the save
 * mutation, matching how every other dialog in this app works.
 */
export type SegmentForm = {
  name: string;
  /**
   * Always at least one type — the editor refuses to save an empty list.
   *
   * "Empty means everyone" was tempting and wrong: on the send page an empty
   * audience means NOBODY, so the two screens would have read the same stored
   * value in opposite ways and a 0-person send could carry the name of a segment
   * covering the whole list.
   */
  includeTypes: ContactType[];
  plan: string;
  country: string;
  company: string;
};

// A new segment starts as "everyone", then gets narrowed — the same direction of
// travel as the filters themselves, and never an empty list.
export const EMPTY_SEGMENT_FORM: SegmentForm = {
  name: "", includeTypes: [...ALL_TYPES], plan: "", country: "", company: "",
};

const TYPE_LABELS: { value: ContactType; label: string; desc: string }[] = [
  { value: "client", label: "Clients", desc: "Paying customers" },
  { value: "prospect", label: "Prospects", desc: "Potential customers" },
  { value: "internal", label: "Internal", desc: "Our own colleagues" },
];

/**
 * The dropdown values for the segment fields: the standard list plus whatever
 * this brand already uses, merged case-insensitively so the picker never offers
 * both "Paid" and "paid" — which is the split-audience bug, not a cosmetic one.
 */
export function useSegmentOptions(brandId?: string) {
  const contacts = useQuery({
    queryKey: ["contacts", brandId],
    queryFn: () => api.contacts(brandId!),
    enabled: !!brandId,
  });
  const suppressions = useQuery({
    queryKey: ["suppressions", brandId],
    queryFn: () => api.suppressions(brandId!),
    enabled: !!brandId,
  });
  const rows = contacts.data ?? [];
  return {
    contacts: rows,
    suppressed: new Set((suppressions.data ?? []).map((s) => s.email)),
    ready: !!contacts.data && !!suppressions.data,
    planOptions: mergeOptions(COMMON_PLANS, rows.map((c) => c.plan)),
    countryOptions: mergeOptions(countryNames(), rows.map((c) => c.country)),
    companyOptions: mergeOptions([], rows.map((c) => c.company)),
  };
}

export function SegmentDialog({
  open, onOpenChange, editing, form, setForm, options, saving, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The segment being changed, or null when creating one. */
  editing: Segment | null;
  form: SegmentForm;
  setForm: (f: SegmentForm) => void;
  options: {
    contacts: Contact[];
    suppressed: Set<string>;
    ready: boolean;
    planOptions: string[];
    countryOptions: string[];
    companyOptions: string[];
  };
  saving: boolean;
  onSave: () => void;
}) {
  const matched = audienceOf(
    options.contacts,
    options.suppressed,
    { plan: form.plan || undefined, country: form.country || undefined, company: form.company || undefined },
    form.includeTypes
  );
  const toggleType = (t: ContactType) =>
    setForm({
      ...form,
      includeTypes: form.includeTypes.includes(t)
        ? form.includeTypes.filter((x) => x !== t)
        : [...form.includeTypes, t],
    });
  const noTypes = form.includeTypes.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit segment" : "New segment"}</DialogTitle>
          <DialogDescription>
            Choose who is in it. You can pick this segment when sending a campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seg-name" required>Name</Label>
            <Input
              id="seg-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Paid clients · Bangladesh"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Contact type</Label>
            <div className="flex flex-col gap-1.5">
              {TYPE_LABELS.map((t) => (
                <label
                  key={t.value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={form.includeTypes.includes(t.value)}
                    onChange={() => toggleType(t.value)}
                    className="size-4 accent-[color:var(--sidebar-primary)]"
                  />
                  <span>
                    <span className="block text-[13.5px] font-medium">{t.label}</span>
                    <span className="block text-[12px] text-muted-foreground">{t.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className={cn("text-[12px]", noTypes ? "text-destructive" : "text-muted-foreground")}>
              {noTypes ? "Tick at least one — a segment with none would reach nobody." : "Only the ticked types are included."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seg-plan">Plan</Label>
              <Combobox
                id="seg-plan"
                value={form.plan}
                onChange={(v) => setForm({ ...form, plan: v })}
                options={options.planOptions}
                placeholder="Any plan"
                clearLabel="Any plan"
                searchPlaceholder="Search plans…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seg-country">Country</Label>
              <Combobox
                id="seg-country"
                value={form.country}
                onChange={(v) => setForm({ ...form, country: v })}
                options={options.countryOptions}
                placeholder="Any country"
                clearLabel="Any country"
                searchPlaceholder="Search countries…"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seg-company">Company</Label>
            <Combobox
              id="seg-company"
              value={form.company}
              onChange={(v) => setForm({ ...form, company: v })}
              options={options.companyOptions}
              placeholder="Any company"
              clearLabel="Any company"
              searchPlaceholder="Search companies…"
            />
          </div>

          {/* The live count is the whole reason this is a dialog and not a form:
             a rule that selects nobody (Internal + plan "Paid" — staff have no
             plan) is easy to build by accident, and without the number that only
             turns up at send time. */}
          <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-[13px]">
            {!options.ready ? (
              <span className="text-muted-foreground">Counting…</span>
            ) : (
              <>
                <strong className="tabular-nums">{matched.length}</strong>
                {matched.length === 1 ? " person is" : " people are"} in this segment right now.
                {matched.length === 0 && (
                  <span className="block text-muted-foreground">
                    Nobody matches these choices. Check the plan and country — internal
                    colleagues usually have neither.
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.name.trim() || noTypes || saving} onClick={onSave}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
