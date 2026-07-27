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

/** The wall clock this instant shows in `timeZone`, as "YYYY-MM-DDTHH:mm". */
function wallClockIn(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
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

  const offsetA = offsetMs(asIfUtc, timeZone);
  const firstGuess = new Date(asIfUtc.getTime() - offsetA);
  // Near a DST change the offset at the guessed instant can differ from the one
  // we used; re-measure there and correct.
  const offsetB = offsetMs(firstGuess, timeZone);
  let result = new Date(asIfUtc.getTime() - offsetB);
  if (Number.isNaN(result.getTime())) return null;

  // Spring forward skips an hour, so a time inside the gap never happens. Reading
  // it back gives a different clock time — and the naive answer lands an hour
  // BEFORE what the user asked for, which would send early. Roll forward instead
  // (02:30 in a 02:00→03:00 gap becomes 03:30), by taking the offset that yields
  // the later instant. Never send earlier than the time on screen.
  if (wallClockIn(result, timeZone) !== localDateTime.slice(0, 16)) {
    result = new Date(asIfUtc.getTime() - Math.min(offsetA, offsetB));
  }
  return Number.isNaN(result.getTime()) ? null : result;
}
