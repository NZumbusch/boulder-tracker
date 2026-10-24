import type { Workout } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import type { ReadingsModel } from "./daily/readingsModel";

/**
 * Day-by-day recovery data for the Analytics recovery chart: HRV, sleep
 * score and resting HR, each against the athlete's own recent baseline, plus
 * the daily training load and readiness score drawn under them.
 *
 * Everything is keyed by calendar-day index (days since the epoch, as
 * `toUtcDayIndex` counts them) so days line up across metrics, load and
 * readiness without any Date arithmetic across DST changes.
 *
 * This file is the pure maths of one day. Working it out for a whole history, keeping the results, rebuilding them when
 * the data changes and warming them in the background is the job of the daily models (`./daily`).
 */

export interface RecoveryMetricSpec {
  id: string;
  /** False for resting HR, where a lower reading is the better one. */
  higherIsBetter: boolean;
}

export const RECOVERY_METRICS: readonly RecoveryMetricSpec[] = [
  { id: "hrv", higherIsBetter: true },
  { id: "sleep-score", higherIsBetter: true },
  { id: "rhr", higherIsBetter: false },
];

/**
 * Which metric fills the charts' single "Sleep" slot over a window: the
 * sleep score if any is logged in it, else hours asleep (Health Connect has
 * no score). One slot rather than two lines, so a wearable user and a
 * score-typing user each see one Sleep line in their own unit.
 */
export function sleepMetricId(readings: ReadingsModel, firstDay: number, lastDay: number): "sleep-score" | "sleep-duration" {
  if (readings.hasReadings("sleep-score", firstDay, lastDay)) return "sleep-score";
  return readings.hasReadings("sleep-duration", firstDay, lastDay) ? "sleep-duration" : "sleep-score";
}

/** `RECOVERY_METRICS` for a window, with the Sleep slot resolved (`sleepMetricId`). */
export function recoveryMetrics(readings: ReadingsModel, firstDay: number, lastDay: number): RecoveryMetricSpec[] {
  const sleepId = sleepMetricId(readings, firstDay, lastDay);
  return RECOVERY_METRICS.map((spec) => (spec.id === "sleep-score" ? { ...spec, id: sleepId } : spec));
}

/** The baseline is the mean of this many days *before* each day - the day itself never moves its own baseline. */
export const BASELINE_DAYS = 28;
/** Fewer readings than this in the baseline window and there is no baseline yet - a mean of two nights is not "normal". */
export const MIN_BASELINE_READINGS = 7;
/** The smoothed line: mean of the readings in the last seven days, today included. */
export const ROLLING_AVG_DAYS = 7;
/**
 * After a break (fewer than `MIN_BASELINE_READINGS` in the last
 * `BASELINE_DAYS`), the baseline is the last readings before the day - up
 * to `BASELINE_DAYS` of them, from at most this far back. Without it the %
 * view dropped every reading after a break while the lanes still showed
 * them.
 */
export const BREAK_LOOKBACK_DAYS = 365;
export const MIN_AVG_READINGS = 2;

export interface RecoveryDay {
  day: number;
  /** YYYY-MM-DD */
  date: string;
  value?: number;
  /** Rolling mean over `ROLLING_AVG_DAYS`. */
  avg?: number;
  baseline?: number;
  /** Sample standard deviation of the baseline window - the "normal range" is baseline ± sd. */
  sd?: number;
  /** `value` as % away from baseline, signed so + always means better (resting HR is flipped). */
  deviation?: number;
  /** `avg` as % away from baseline, signed the same way. */
  avgDeviation?: number;
  /** The baseline is the readings before a break, not the last 28 days (see `BREAK_LOOKBACK_DAYS`). */
  baselineAfterBreak?: true;
}

/** A local calendar date as a day index - Monday 00:00 in Berlin is still Monday, not Sunday 22:00 UTC. */
export function localDayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

export function dayIndexToIso(day: number): string {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

/** Noon UTC of a day index, for the "as of" functions - safely inside that day in any time zone's reading of it. */
export function dayIndexToAsOf(day: number): Date {
  return new Date(day * 86400000 + 12 * 3600000);
}

function valuesBetween(byDay: Map<number, number>, from: number, to: number): number[] {
  const values: number[] = [];
  for (let d = from; d <= to; d++) {
    const v = byDay.get(d);
    if (v !== undefined) values.push(v);
  }
  return values;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sampleSd(values: number[], m: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1));
}

function percentAway(value: number, baseline: number, higherIsBetter: boolean): number {
  const pct = ((value - baseline) / baseline) * 100;
  return higherIsBetter ? pct : -pct;
}

/** One day of a series, from the readings alone - so it does not depend on which window is being drawn. */
export function recoveryDay(byDay: Map<number, number>, metric: RecoveryMetricSpec, day: number): RecoveryDay {
  const entry: RecoveryDay = { day, date: dayIndexToIso(day), value: byDay.get(day) };

  const recent = valuesBetween(byDay, day - ROLLING_AVG_DAYS + 1, day);
  if (recent.length >= MIN_AVG_READINGS) entry.avg = mean(recent);

  let history = valuesBetween(byDay, day - BASELINE_DAYS, day - 1);
  if (history.length < MIN_BASELINE_READINGS) {
    const before = valuesBetween(byDay, day - BREAK_LOOKBACK_DAYS, day - 1).slice(-BASELINE_DAYS);
    if (before.length >= MIN_BASELINE_READINGS) {
      history = before;
      entry.baselineAfterBreak = true;
    }
  }
  if (history.length >= MIN_BASELINE_READINGS) {
    const baseline = mean(history);
    entry.baseline = baseline;
    entry.sd = sampleSd(history, baseline);
    if (baseline > 0) {
      if (entry.value !== undefined) entry.deviation = percentAway(entry.value, baseline, metric.higherIsBetter);
      if (entry.avg !== undefined) entry.avgDeviation = percentAway(entry.avg, baseline, metric.higherIsBetter);
    }
  }
  return entry;
}

/** One entry per day from `firstDay` to `lastDay` inclusive - days without a reading still get their avg/baseline. Pure and uncached: the models keep the results. */
export function buildRecoverySeries(byDay: Map<number, number>, metric: RecoveryMetricSpec, firstDay: number, lastDay: number): RecoveryDay[] {
  const days: RecoveryDay[] = [];
  for (let day = firstDay; day <= lastDay; day++) days.push(recoveryDay(byDay, metric, day));
  return days;
}

/** Completed-session load summed per day. */
export function dailyLoadByDay(workouts: Workout[]): Map<number, number> {
  const byDay = new Map<number, number>();
  for (const w of workouts) {
    if (w.status !== "completed" || !w.date) continue;
    const day = toUtcDayIndex(w.date);
    byDay.set(day, (byDay.get(day) ?? 0) + (w.loadFactor || 0));
  }
  return byDay;
}

export interface RecoveryInsight {
  metricId: string;
  /** Mean next-day % vs baseline after the hardest training days (+ = better). */
  afterHard: number;
  /** Mean next-day % vs baseline after rest days. */
  afterRest: number;
  hardDays: number;
  restDays: number;
}

/** How far back insights look - long enough for a pattern, short enough to reflect current fitness. */
export const INSIGHT_LOOKBACK_DAYS = 180;
/** Fewer comparable days than this on either side and the difference is noise. */
export const INSIGHT_MIN_SAMPLES = 4;
/** Differences smaller than this (percentage points) are not worth a line. */
export const INSIGHT_MIN_GAP_PCT = 3;
/** A "hard day" is one at or above this quantile of the training days' loads. */
export const HARD_DAY_QUANTILE = 0.75;

/**
 * How each recovery metric reads the morning after a hard training day,
 * compared with the morning after a rest day - over the last
 * `INSIGHT_LOOKBACK_DAYS` up to `lastDay`. Only metrics with enough days on
 * both sides and a difference worth mentioning are returned.
 */
export function loadRecoveryInsights(readings: ReadingsModel, workouts: Workout[], lastDay: number): RecoveryInsight[] {
  const firstDay = lastDay - INSIGHT_LOOKBACK_DAYS;
  const load = dailyLoadByDay(workouts);

  const trainingLoads = [...load].filter(([d, l]) => d >= firstDay && d < lastDay && l > 0).map(([, l]) => l).sort((a, b) => a - b);
  if (trainingLoads.length === 0) return [];
  const hardThreshold = trainingLoads[Math.min(trainingLoads.length - 1, Math.floor(trainingLoads.length * HARD_DAY_QUANTILE))];

  const insights: RecoveryInsight[] = [];
  for (const metric of recoveryMetrics(readings, firstDay, lastDay)) {
    const series = readings.recoveryRange(metric, firstDay, lastDay);
    const deviationOn = new Map(series.map((d) => [d.day, d.deviation]));
    const hard: number[] = [];
    const rest: number[] = [];
    for (let day = firstDay; day < lastDay; day++) {
      const next = deviationOn.get(day + 1);
      if (next === undefined) continue;
      const l = load.get(day) ?? 0;
      if (l === 0) rest.push(next);
      else if (l >= hardThreshold) hard.push(next);
    }
    if (hard.length < INSIGHT_MIN_SAMPLES || rest.length < INSIGHT_MIN_SAMPLES) continue;
    const afterHard = mean(hard);
    const afterRest = mean(rest);
    if (Math.abs(afterHard - afterRest) < INSIGHT_MIN_GAP_PCT) continue;
    insights.push({ metricId: metric.id, afterHard, afterRest, hardDays: hard.length, restDays: rest.length });
  }
  return insights;
}
