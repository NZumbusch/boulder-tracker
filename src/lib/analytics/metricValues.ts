import type { DailyMetricEntry } from "../types";

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
