// Who a filter selects — the browser's copy of the backend's rule.
//
// This MIRRORS backend/src/email/audience.ts and must keep mirroring it. The
// number on the send page ("412 people will receive this") is a promise about
// what the server is going to do; if the two rules disagree, the screen lies at
// exactly the moment it matters most. Change one, change the other.
import type { Contact, ContactType, SendFilter } from "./api";

/**
 * Compare a filter value to a contact's value.
 *
 * Case-insensitive and trimmed, because the data holds both "Paid" and "paid" —
 * an exact match dropped the people stored the other way, and nobody can see a
 * contact that is missing from a count. Blank means "any": an empty box narrows
 * nothing.
 */
const matches = (filterValue: string | undefined, contactValue: string | null | undefined) => {
  const want = filterValue?.trim().toLowerCase();
  if (!want) return true;
  return (contactValue ?? "").trim().toLowerCase() === want;
};

/**
 * The contacts this rule would email right now.
 *
 * `types` is passed in already resolved, because the fallback differs by caller:
 * a campaign falls back to its category's default audience, a segment to "every
 * type". Deciding that here would force one of them to be wrong.
 */
export function audienceOf(
  contacts: Contact[],
  suppressed: Set<string>,
  filter: SendFilter,
  types: ContactType[]
): Contact[] {
  return contacts.filter(
    (c) =>
      c.status === "subscribed" &&
      !suppressed.has(c.email) &&
      types.includes(c.type) &&
      matches(filter.plan, c.plan) &&
      matches(filter.country, c.country) &&
      matches(filter.company, c.company)
  );
}

/**
 * Every contact type.
 *
 * Also what an empty `includeTypes` on a STORED segment means. New segments
 * always save at least one type (the editor requires it), so this only covers
 * rows written before that rule existed.
 */
export const ALL_TYPES: ContactType[] = ["client", "prospect", "internal"];

/** A stored segment's types, with the legacy "empty = everyone" reading applied. */
export const segmentTypes = (t: ContactType[]): ContactType[] => (t.length ? t : ALL_TYPES);

const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();
// NOT "empty means all types" — that reading belongs to a stored segment and is
// applied by its caller. On the send page an empty list means NOBODY (every box
// unticked, 0 recipients, Send disabled), so folding the two together here would
// label a send that reaches no one with the name of a segment covering everyone.
const normTypes = (t: ContactType[]) => [...t].sort().join(",");

/**
 * Do two rules select the same people?
 *
 * Used to tell the send page WHICH saved segment the current filters amount to,
 * instead of storing a "selected segment" alongside them. Two sources of truth
 * for the same question drift: cancelling a schedule restores the frozen filter
 * values, and a separately-stored segment id would then label them with whatever
 * was picked last — a name that no longer describes who is about to be emailed.
 *
 * Compared the way the filters themselves are compared: trimmed, case-insensitive,
 * and blank meaning "any". Types are compared as given — resolve them first.
 */
export function sameRule(
  a: SendFilter,
  aTypes: ContactType[],
  b: SendFilter,
  bTypes: ContactType[]
): boolean {
  return (
    norm(a.plan) === norm(b.plan) &&
    norm(a.country) === norm(b.country) &&
    norm(a.company) === norm(b.company) &&
    normTypes(aTypes) === normTypes(bTypes)
  );
}

/** A segment's rule, said in words: "Clients · Paid · Bangladesh". */
export function describeRule(filter: SendFilter, types: ContactType[]): string {
  const labels: Record<ContactType, string> = {
    client: "Clients",
    prospect: "Prospects",
    internal: "Internal",
  };
  const parts: string[] = [];
  // All three types is no restriction at all, so saying it adds noise.
  if (types.length && types.length < ALL_TYPES.length) parts.push(types.map((t) => labels[t]).join(" + "));
  if (filter.plan) parts.push(filter.plan);
  if (filter.country) parts.push(filter.country);
  if (filter.company) parts.push(filter.company);
  return parts.length ? parts.join(" · ") : "Everyone";
}
