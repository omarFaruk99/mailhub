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
 * `types` is passed in already resolved — a campaign falls back to its
 * category's default audience, which only the caller knows.
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
