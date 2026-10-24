import type { DailyMetricEntry } from "../../types";
import { BODYWEIGHT_METRIC_ID } from "../../constants";
import { buildReadingsIndex, type ReadingsIndex } from "../metricValues";
import { localDayIndex, recoveryDay, RECOVERY_METRICS, type RecoveryDay, type RecoveryMetricSpec } from "../recoverySeries";
import { WELLNESS_MEASURES } from "../wellnessSeries";
import { DaySeries } from "./daySeries";
import type { Warmable } from "./warmer";

/**
 * Everything derived from the daily values (sleep, HRV, resting heart rate, Body Battery, steps, weight...), for one
 * snapshot of them: their index by metric and day, and each metric's series - reading, 7-day average and your own
 * 28-day normal range - kept day by day.
 *
 * Immutable: built from the entries when the model is made and never looking at them again, so nothing that changes the
 * entries later (or a reactive proxy around them) can change what it says. When the data changes the app builds a new
 * model from the new entries; see `AnalyticsStore`.
 */

/** The series worth having ready: what Recovery, Wellness and the insights draw, in the direction they draw it. */
const WARM_SPECS: readonly RecoveryMetricSpec[] = [
  ...RECOVERY_METRICS,
  { id: "sleep-duration", higherIsBetter: true },
  { id: BODYWEIGHT_METRIC_ID, higherIsBetter: true },
  ...WELLNESS_MEASURES.flatMap((m) => m.series.map((s) => ({ id: s.id, higherIsBetter: m.higherIsBetter ?? true }))),
];

/** How far back the warm-up goes, at most. */
const MAX_WARM_DAYS = 1100;

const EMPTY: ReadonlyMap<number, number> = new Map();

export class ReadingsModel implements Warmable {
  readonly #index: ReadingsIndex;
  readonly #series = new Map<string, DaySeries<RecoveryDay>>();
  #hrv: { day: number; value: number }[] | undefined;
  #warmAt = 0;

  constructor(entries: readonly DailyMetricEntry[]) {
    this.#index = buildReadingsIndex(entries);
  }

  /** A metric's real readings by day (two on one day averaged). Read-only. */
  readings(metricId: string): ReadonlyMap<number, number> {
    return this.#index.get(metricId) ?? EMPTY;
  }

  /** Whether the metric has a reading on any day from `firstDay` to `lastDay`. */
  hasReadings(metricId: string, firstDay: number, lastDay: number): boolean {
    for (const day of this.readings(metricId).keys()) if (day >= firstDay && day <= lastDay) return true;
    return false;
  }

  /** The first day the metric has a reading, or undefined without any. */
  firstReadingDay(metricId: string): number | undefined {
    let first: number | undefined;
    for (const day of this.readings(metricId).keys()) if (first === undefined || day < first) first = day;
    return first;
  }

  /** The HRV readings, oldest first - what each day's HRV baseline is looked up in. */
  hrvReadings(): { day: number; value: number }[] {
    return (this.#hrv ??= [...this.readings("hrv")].map(([day, value]) => ({ day, value })).sort((a, b) => a.day - b.day));
  }

  /** The metric's series, a day at a time. Same object for the same metric and direction. */
  recovery(spec: RecoveryMetricSpec): DaySeries<RecoveryDay> {
    const key = `${spec.id}|${spec.higherIsBetter}`;
    let series = this.#series.get(key);
    if (!series) {
      const byDay = this.#index.get(spec.id) ?? (EMPTY as Map<number, number>);
      this.#series.set(key, (series = new DaySeries((day) => recoveryDay(byDay, spec, day))));
    }
    return series;
  }

  /** The metric's days from `firstDay` to `lastDay`. The entries are shared between callers: read them, don't change them. */
  recoveryRange(spec: RecoveryMetricSpec, firstDay: number, lastDay: number): RecoveryDay[] {
    return this.recovery(spec).range(firstDay, lastDay);
  }

  warm(budgetMs: number): boolean {
    const top = localDayIndex(new Date());
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    let worked = false;
    while (this.#warmAt < WARM_SPECS.length) {
      const spec = WARM_SPECS[this.#warmAt];
      const first = this.firstReadingDay(spec.id);
      if (first === undefined) { this.#warmAt++; continue; }
      const left = budgetMs - ((typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
      // A slice always does some work (so it always gets there in the end), and stops as soon as its time is used.
      if (left <= 0 && worked) return false;
      const done = this.recovery(spec).warmDown(top, Math.max(first, top - MAX_WARM_DAYS), Math.max(left, 0));
      worked = true;
      if (!done) return false;
      this.#warmAt++;
    }
    return true;
  }
}
