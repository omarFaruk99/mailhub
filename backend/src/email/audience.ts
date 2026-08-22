// Who an audience rule selects — the ONE definition of that question.
//
// Two places need it and must never disagree: the send loop, and (mirrored in
// frontend/src/lib/audience.ts) the send page's live preview. When the send and
// the preview use different rules, the number on screen is a lie about who is
// about to be emailed.
import { prisma } from "../prisma.js";
import type { ContactType, SendFilter } from "./filter-types.js";

/**
 * Does this contact's value satisfy the filter?
 *
 * Case-insensitive and trimmed, because the data genuinely holds both spellings
 * — a real brand had five contacts on "Paid" and one on "paid" — and an exact
 * match silently dropped whichever group was not typed. Blank means "any", so an
 * empty box never narrows anything.
 *
 * **Deliberately compared in JavaScript, not in SQL.** Prisma's
 * `{ equals, mode: "insensitive" }` compiles to `ILIKE`, where `%` and `_` are
 * wildcards and `equals` offers no way to escape them. Measured against this
 * project's own database: a plan filter of `"%"` matched every contact with a
 * plan, and `"_aid"` matched `Paid`. A plan named `Tier_1` would therefore also
 * pull in `Tier 1` — the confirm dialog counting one group while the send
 * emails two, which is the exact failure this file exists to prevent.
 *
 * This is byte-for-byte the same comparison as `matches` in
 * frontend/src/lib/audience.ts. **Change one, change the other.**
 */
export const matchesText = (filterValue: string | undefined, contactValue: string | null | undefined) => {
  const want = filterValue?.trim().toLowerCase();
  if (!want) return true;
  return (contactValue ?? "").trim().toLowerCase() === want;
};

/**
 * The part of the rule the database can decide safely on its own: the brand, the
 * subscribed check, and the contact type. All three are exact matches against
 * values we control, so no wildcard can leak in.
 *
 * Suppressed addresses are NOT excluded here — that is a separate step, because
 * the send loop needs to count them ("skipped: unsubscribed") rather than have
 * them silently vanish from the query.
 */
export function audienceWhere(brandId: string, includeTypes: ContactType[]) {
  return { brandId, status: "subscribed", type: { in: includeTypes } };
}

/**
 * The contacts this rule selects.
 *
 * Reads every subscribed contact of the chosen types, then applies the text
 * filters in memory. At this project's volume (~800 contacts per brand) that is
 * one small query; revisit only if a brand passes roughly 50k contacts, where
 * the row transfer starts to cost more than the correctness is worth — and then
 * fix it with `lower(plan) = lower($1)` in raw SQL, never by going back to ILIKE.
 */
export async function selectAudience(
  brandId: string,
  filter: SendFilter,
  includeTypes: ContactType[]
) {
  const rows = await prisma.contact.findMany({ where: audienceWhere(brandId, includeTypes) });
  return rows.filter(
    (c) =>
      matchesText(filter.plan, c.plan) &&
      matchesText(filter.country, c.country) &&
      matchesText(filter.company, c.company)
  );
}
