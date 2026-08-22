// Who an audience rule selects — the ONE definition of that question.
//
// Three places need it and must never disagree: the send loop, a segment's
// "N contacts" count, and (mirrored) the send page's live preview. When the send
// and the count use different rules, the number on screen is a lie about who is
// about to be emailed.
import { prisma } from "../prisma.js";
import { CONTACT_TYPES, type ContactType, type SendFilter } from "./filter-types.js";

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

/** Contact types this filter covers, falling back to `fallback` when unset. */
export function resolveTypes(
  includeTypes: ContactType[] | undefined,
  fallback: ContactType[]
): ContactType[] {
  return includeTypes && includeTypes.length > 0 ? includeTypes : fallback;
}

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

/** Addresses this brand must not email (unsubscribed / bounced / complained). */
export async function suppressedEmails(brandId: string): Promise<string[]> {
  const rows = await prisma.suppression.findMany({ where: { brandId }, select: { email: true } });
  return rows.map((r) => r.email);
}

/**
 * How many people this rule would actually email right now.
 *
 * Suppressed addresses are removed, because "1,204 contacts" next to a segment
 * has to mean 1,204 emails — anything else turns the number into decoration.
 *
 * `suppressed` is passed in when counting several segments at once, so listing
 * ten of them is ten counts and ONE suppression read rather than ten of each.
 */
export async function audienceCount(
  brandId: string,
  filter: SendFilter,
  includeTypes: ContactType[],
  suppressed?: string[]
): Promise<number> {
  const blocked = suppressed ?? (await suppressedEmails(brandId));
  return prisma.contact.count({
    where: {
      ...audienceWhere(brandId, filter, includeTypes),
      ...(blocked.length ? { email: { notIn: blocked } } : {}),
    },
  });
}

/** Every contact type — what an empty `includeTypes` on a segment means. */
export const ALL_TYPES: ContactType[] = [...CONTACT_TYPES];
