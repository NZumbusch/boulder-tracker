/**
 * Utility for standardizing date and week calculations.
 * Uses ISO-8601 standard for week numbers:
 * - Weeks start on Monday.
 * - Week 01 is the week with the first Thursday of the year.
 */

/**
 * Returns a unique string identifier for a week (e.g., "2024-W01").
 * Correctly handles year-end transitions where a week may belong to 
 * the previous or next year according to ISO-8601.
 */
export function getWeekId(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNo = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * How many ISO weeks a year has: 52, or 53 when it starts on a Thursday
 * (or is a leap year starting on a Wednesday) - 2026 is one. 28 December
 * always falls in a year's last week.
 */
export function isoWeeksInYear(year: number): number {
  return parseInt(getWeekId(new Date(year, 11, 28, 12)).split('-W')[1], 10);
}

/**
 * Returns the week id immediately following `weekId`, with true ISO week
 * counts. It used to assume 52 weeks a year, which skipped 2026-W53
 * entirely - a plan or block over New Year 2027 would have had a week
 * with nothing in it, and a weekly Plan B would have missed it.
 */
export function incrementWeekId(weekId: string): string {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekId;
  let year = parseInt(match[1], 10);
  let week = parseInt(match[2], 10) + 1;
  if (week > isoWeeksInYear(year)) {
    week = 1;
    year++;
  }
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Returns the week id immediately preceding `weekId` - `incrementWeekId`'s mirror image (2027-W01 -> 2026-W53). */
export function decrementWeekId(weekId: string): string {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekId;
  let year = parseInt(match[1], 10);
  let week = parseInt(match[2], 10) - 1;
  if (week < 1) {
    year--;
    week = isoWeeksInYear(year);
  }
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Returns every week id from `startWeekId` to `endWeekId` inclusive.
 * Relies on "YYYY-Www" sorting correctly as a plain string (confirmed
 * elsewhere in this codebase, e.g. `trainingBlocks.ts`). Returns an empty
 * array if `startWeekId` is after `endWeekId`. Capped at 500 iterations as a
 * guard against a malformed id that never reaches `endWeekId`.
 */
export function getWeekIdRange(startWeekId: string, endWeekId: string): string[] {
  const ids: string[] = [];
  let current = startWeekId;
  for (let i = 0; i < 500 && current <= endWeekId; i++) {
    ids.push(current);
    if (current === endWeekId) break;
    current = incrementWeekId(current);
  }
  return ids;
}

/**
 * Formats an ISO date string into a user-friendly display date.
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No Date';
  return new Date(dateStr).toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Returns the UTC start (Monday) and end (Sunday) `Date`s of a given ISO
 * week ID, or `null` if `weekId` isn't in `YYYY-Www` shape. Extracted out of
 * `getWeekDateRange` (below) so callers that need an actual sample `Date` -
 * e.g. the rolling-ACWR window arithmetic in `loadAnalytics.ts`, which
 * samples the ratio "as of" a week's end date - don't have to re-parse a
 * formatted display string back into one.
 */
export function getWeekDates(weekId: string): { start: Date; end: Date } | null {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // January 4th is always in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7; // Monday = 0
  const firstMonday = new Date(Date.UTC(year, 0, 4 - dayOfWeek));

  const start = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Returns the start and end dates (as a formatted string) for a given ISO week ID.
 */
export function getWeekDateRange(weekId: string): string {
  if (!weekId) return '';
  const dates = getWeekDates(weekId);
  if (!dates) return '';

  const formatOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${dates.start.toLocaleDateString(undefined, formatOpts)} - ${dates.end.toLocaleDateString(undefined, formatOpts)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A week's (or a run of weeks') Monday-to-Sunday dates as plain English,
 * the same wherever the phone is set to: "28 Sep – 4 Oct 2026". For text
 * a model reads (week ids alone are hard to place on a calendar).
 */
export function weekDatesText(firstWeekId: string, lastWeekId: string = firstWeekId): string {
  const a = getWeekDates(firstWeekId);
  const b = getWeekDates(lastWeekId);
  if (!a || !b) return '';
  const day = (d: Date, year: boolean) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`;
  const sameYear = a.start.getUTCFullYear() === b.end.getUTCFullYear();
  if (sameYear && a.start.getUTCMonth() === b.end.getUTCMonth()) return `${a.start.getUTCDate()} – ${day(b.end, true)}`;
  return `${day(a.start, !sameYear)} – ${day(b.end, true)}`;
}

/** "2026-W40 (28 Sep – 4 Oct 2026)". */
export function weekLabel(weekId: string): string {
  const dates = weekDatesText(weekId);
  return dates ? `${weekId} (${dates})` : weekId;
}

/**
 * The local calendar date as "YYYY-MM-DD" - what "today" means to the
 * person holding the phone. Not `toISOString().slice(0, 10)`: that's the
 * UTC date, which in Switzerland is still yesterday until 1-2 am, so
 * anything logged just after midnight landed on the day before.
 */
export function localIsoDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Converts a stored date to a calendar-day index (whole days since the
 * Unix epoch) - so day-window arithmetic (rolling ACWR, see
 * `loadAnalytics.ts`) is plain integer subtraction, DST-proof.
 *
 * The two shapes stored:
 *  - a bare "YYYY-MM-DD" (metrics, sends, goals) is that day as written;
 *  - a full timestamp (a completed session's `date`, `toISOString()`, UTC)
 *    is the LOCAL calendar day it happened on. Taking its UTC date instead
 *    put a session that ended at 00:30 on the previous day in every chart,
 *    while History (local) showed the right one.
 */
export function toUtcDayIndex(isoDate: string): number {
  const d = new Date(isoDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
  }
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

