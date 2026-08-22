// Who an audience rule selects — the ONE definition of that question.
//
// Two places need it and must never disagree: the send loop, and (mirrored in
// frontend/src/lib/audience.ts) the send page's live preview. When the send and
// the preview use different rules, the number on screen is a lie about who is
// about to be emailed.
import type { ContactType, SendFilter } from "./filter-types.js";

/**
 * Match a text filter (plan / country / company) case-insensitively.
 *
 * The data genuinely holds both spellings — a real brand had five contacts on
 * "Paid" and one on "paid" — so an exact match silently dropped that person from
 * every send filtered by plan. Nobody sees a contact that is missing; they only
 * see a total that looks about right. Company was already insensitive; plan and
 * country were not, which is the bug.
 *
 * Blank/whitespace means "any", so an empty box never narrows anything.
 */
const textMatch = (value?: string | null) => {
  const v = value?.trim();
  return v ? { equals: v, mode: "insensitive" as const } : undefined;
};

/**
 * The Prisma `where` for "contacts of this brand that this rule selects".
 *
 * Suppressed addresses are NOT excluded here — that is a separate step, because
 * the send loop needs to count them ("skipped: unsubscribed") rather than have
 * them silently vanish from the query.
 */
export function audienceWhere(brandId: string, filter: SendFilter, includeTypes: ContactType[]) {
  const plan = textMatch(filter.plan);
  const country = textMatch(filter.country);
  const company = textMatch(filter.company);
  return {
    brandId,
    status: "subscribed",
    type: { in: includeTypes },
    ...(plan ? { plan } : {}),
    ...(country ? { country } : {}),
    ...(company ? { company } : {}),
  };
}
