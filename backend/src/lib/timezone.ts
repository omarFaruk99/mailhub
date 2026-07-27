// Turning "28 July 2026, 2:30 pm in Asia/Dhaka" into a real UTC instant.
// Done with the built-in Intl database — no timezone library needed, and it
// stays correct through daylight-saving changes.

/** How far ahead of UTC `timeZone` is at this instant, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // hour12:false can render midnight as "24" in some engines.
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - date.getTime();
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a wall-clock time ("2026-07-28T14:30") in `timeZone` to the UTC instant.
 * Returns null if the input is not a valid date/time or zone.
 */
export function zonedTimeToUtc(localDateTime: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(localDateTime)) return null;
  if (!isValidTimeZone(timeZone)) return null;

  // Read the wall clock as if it were UTC, then subtract the zone's offset.
  const asIfUtc = new Date(`${localDateTime}Z`);
  if (Number.isNaN(asIfUtc.getTime())) return null;

  const firstGuess = new Date(asIfUtc.getTime() - offsetMs(asIfUtc, timeZone));
  // Near a DST change the offset at the guessed instant can differ from the one
  // we used; re-measure there and correct. (A second pass is enough in practice.)
  const corrected = new Date(asIfUtc.getTime() - offsetMs(firstGuess, timeZone));
  return Number.isNaN(corrected.getTime()) ? null : corrected;
}
