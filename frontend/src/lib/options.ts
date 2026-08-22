// Dropdown option lists for the free-text-ish contact fields (plan, country).
//
// These fields feed send filters, and a filter that matched exactly turned one
// audience into two: the data really did hold "Paid" and "paid", so filtering on
// one of them quietly dropped the people stored as the other. The pickers here
// (and the case-insensitive matching in lib/audience.ts) are what stop that.
//
// Shared by the Contacts screen, the send page's filters and the segment editor —
// three copies of "which plans exist" would drift back into the same problem.

/** The usual plans. Whatever a brand already uses is merged in at render time. */
export const COMMON_PLANS = ["Free", "Trial", "Paid"];

/**
 * Merge the standard options with the values already in the data, treating
 * spellings that differ only by case as ONE option.
 *
 * Without this the list showed "Paid" AND "paid" — the two spellings already
 * sitting in the database, which is the very problem a dropdown is here to end.
 * `preferred` comes first, so the standard spelling is the one that survives.
 */
export function mergeOptions(preferred: string[], existing: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const take = (raw: string | null | undefined) => {
    const value = raw?.trim();
    if (!value) return null;
    const key = value.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    return value;
  };
  // `preferred` keeps its own order — "Free, Trial, Paid" is a progression, and
  // alphabetising it into "Free, Paid, Trial" reads as a jumble.
  const head = preferred.map(take).filter((v): v is string => v !== null);
  // Anything else is whatever order the contacts came back in (newest first),
  // which is no order at all to a reader looking for a company name.
  const tail = existing.map(take).filter((v): v is string => v !== null).sort((a, b) => a.localeCompare(b));
  return [...head, ...tail];
}

/**
 * The option this stored value means, in the list's own spelling.
 *
 * A contact saved as "paid" shows as "Paid" and is stored that way the next time
 * anyone saves them — so the old spellings clean themselves up through normal use
 * instead of needing a migration.
 */
export function canonical(value: string | null | undefined, options: string[]): string {
  const v = value?.trim();
  if (!v) return "";
  return options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
}
