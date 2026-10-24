import type { DailyMetricEntry } from "../types";
import { toUtcDayIndex } from "../dateUtils";

/**
 * Whether a daily metric value is a real reading.
 *
 * Every metric the app tracks (sleep score, HRV, resting HR, bodyweight) is
 * strictly positive when actually measured, so `0` - or anything at or
 * below it - means "nothing was measured that day": a tracker that ran out
 * of battery, or a 0 typed in as a placeholder. Counting those as readings
 * dragged the HRV baseline and week averages towards zero and made
 * readiness report a crash that never happened, so every consumer reads
 * values through this one definition instead.
 */
export function isLoggedMetricValue(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** `entries` with every not-really-logged value (see `isLoggedMetricValue`) dropped. Stored data is untouched. */
export function loggedMetrics(entries: DailyMetricEntry[]): DailyMetricEntry[] {
  return entries.filter((e) => isLoggedMetricValue(e.value));
}

/**
 * Average of `metricId`'s real readings over `days` days ending `offsetDays`
 * before `asOf` (inclusive), or undefined if there were none. `offsetDays = 7`
 * gives the week before the most recent one - what a trend arrow compares against.
 */
export function averageReading(
  entries: DailyMetricEntry[],
  metricId: string,
  asOf: Date,
  days = 7,
  offsetDays = 0,
): number | undefined {
  const end = toUtcDayIndex(asOf.toISOString()) - offsetDays;
  const values = loggedMetrics(entries)
    .filter((e) => e.metricId === metricId)
    .filter((e) => {
      const day = toUtcDayIndex(e.date);
      return day <= end && end - day < days;
    })
    .map((e) => e.value);
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}


/**
 * Every metric's real readings by day (two on one day are averaged), built in one pass over the entries and kept for as
 * long as the entries are the same. The charts ask for a dozen metrics' series at once, and each used to read all the
 * entries again (thousands, with a watch's daily values); this reads them once.
 *
 * The saved answer is only reused if the entries still look the same: same array, same length and the same total of
 * values and dates (a change to any value or date shifts the total). A day-by-day check of the whole array would cost
 * what this saves, the total is one cheap pass. Maps are shared: read them, never change them.
 */
export type ReadingsIndex = Map<string, Map<number, number>>;

interface Cached { length: number; fingerprint: number; index: ReadingsIndex }
const indexCache = new WeakMap<object, Cached>();

function fingerprintOf(entries: DailyMetricEntry[]): number {
  let f = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    // Value and the last digits of the date, weighted by position so that moving a value between entries shows too.
    f += (e.value + (e.date.charCodeAt(9) || 0) + (e.date.charCodeAt(8) || 0) * 10 + (e.date.charCodeAt(6) || 0) * 100) * ((i % 97) + 1);
  }
  return f;
}

export function readingsIndex(entries: DailyMetricEntry[]): ReadingsIndex {
  const length = entries.length;
  const fingerprint = fingerprintOf(entries);
  const hit = indexCache.get(entries);
  if (hit && hit.length === length && hit.fingerprint === fingerprint) return hit.index;
  const sums = new Map<string, Map<number, { sum: number; n: number }>>();
  for (const e of entries) {
    if (!isLoggedMetricValue(e.value)) continue;
    let byDay = sums.get(e.metricId);
    if (!byDay) sums.set(e.metricId, (byDay = new Map()));
    const day = toUtcDayIndex(e.date);
    const s = byDay.get(day);
    if (s) { s.sum += e.value; s.n += 1; }
    else byDay.set(day, { sum: e.value, n: 1 });
  }
  const index: ReadingsIndex = new Map([...sums].map(([id, days]) => [id, new Map([...days].map(([day, s]) => [day, s.sum / s.n]))]));
  indexCache.set(entries, { length, fingerprint, index });
  return index;
}
