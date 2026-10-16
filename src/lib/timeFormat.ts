/**
 * The one way to write a time of day on screen. 24-hour ("18:30") is the app's
 * own format; with the 12-hour option (Settings > Views, `ui.clock12`) the same
 * time reads "6:30 PM". Every calendar view, event sheet and session time goes
 * through here - callers hand in the option (`trainingState.clock12`), so these
 * stay pure.
 *
 * Not for machine text: ICS export, the AI prompts and stored values
 * ("HH:MM" in `Workout.startTime`) stay 24-hour.
 */

/** Minutes after midnight (1440 = end of the day) as "18:30" or "6:30 PM". */
export function formatClock(minutes: number, clock12 = false): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  if (!clock12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** A stored "HH:MM" as above; anything that is not a time comes back unchanged. */
export function formatClockText(hhmm: string, clock12 = false): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  return formatClock(Number(m[1]) * 60 + Number(m[2]), clock12);
}

/** A Date's local time as above, optionally with seconds ("18:30:05", "6:30:05 PM"). */
export function formatClockDate(date: Date, clock12 = false, seconds = false): string {
  const base = formatClock(date.getHours() * 60 + date.getMinutes(), clock12);
  if (!seconds) return base;
  const s = String(date.getSeconds()).padStart(2, '0');
  return clock12 ? base.replace(/ (AM|PM)$/, `:${s} $1`) : `${base}:${s}`;
}

/** An hour on the calendar's side gutter: "18" or "6 PM" (noon "12 PM", midnight "12 AM"). */
export function formatHourLabel(hour: number, clock12 = false): string {
  if (!clock12) return String(hour);
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}
