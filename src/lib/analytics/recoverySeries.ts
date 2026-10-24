import { painLevelOn } from "../pain/issues";
import type { PainIssue, PainLog } from "../types";
import type { DailyMetricEntry, Workout } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { loggedMetrics, readingsIndex } from "./metricValues";
import { computeFatigueDecay, hrvBaselineAt, hrvReadings, computeReadiness, DEFAULT_READINESS_CONFIG, type ReadinessConfig, type FatigueModel } from "./readiness";
import { calculateRollingAcwr } from "./loadAnalytics";

/**
 * Day-by-day recovery data for the Analytics recovery chart: HRV, sleep
 * score and resting HR, each against the athlete's own recent baseline, plus
 * the daily training load and readiness score drawn under them.
 *
 * Everything is keyed by calendar-day index (days since the epoch, as
 * `toUtcDayIndex` counts them) so days line up across metrics, load and
 * readiness without any Date arithmetic across DST changes.
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
export function sleepMetricId(entries: DailyMetricEntry[], firstDay: number, lastDay: number): "sleep-score" | "sleep-duration" {
  let hasHours = false;
  for (const e of loggedMetrics(entries)) {
    if (e.metricId !== "sleep-score" && e.metricId !== "sleep-duration") continue;
    const day = toUtcDayIndex(e.date);
    if (day < firstDay || day > lastDay) continue;
    if (e.metricId === "sleep-score") return "sleep-score";
    hasHours = true;
  }
  return hasHours ? "sleep-duration" : "sleep-score";
}

/** `RECOVERY_METRICS` for a window, with the Sleep slot resolved (`sleepMetricId`). */
export function recoveryMetrics(entries: DailyMetricEntry[], firstDay: number, lastDay: number): RecoveryMetricSpec[] {
  const sleepId = sleepMetricId(entries, firstDay, lastDay);
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
function dayIndexToAsOf(day: number): Date {
  return new Date(day * 86400000 + 12 * 3600000);
}

/** A metric's real readings by day; two readings on one day are averaged. */
export function readingsByDay(entries: DailyMetricEntry[], metricId: string): Map<number, number> {
  return readingsIndex(entries).get(metricId) ?? new Map();
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
function seriesDay(byDay: Map<number, number>, metric: RecoveryMetricSpec, day: number): RecoveryDay {
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

/**
 * Days already worked out, per readings map (`readingsIndex` hands out the same map while the entries are unchanged, so
 * this is dropped with them) and direction. A day's numbers don't depend on the window, so stepping to the next period
 * or widening the range only works out the days not seen before.
 */
const seriesCache = new WeakMap<Map<number, number>, { up: Map<number, RecoveryDay>; down: Map<number, RecoveryDay> }>();

/**
 * One entry per day from `firstDay` to `lastDay` inclusive - days without a reading still get their avg/baseline. The
 * entries are shared between calls: read them, don't change them.
 */
export function buildRecoverySeries(
  entries: DailyMetricEntry[],
  metric: RecoveryMetricSpec,
  firstDay: number,
  lastDay: number,
): RecoveryDay[] {
  const byDay = readingsByDay(entries, metric.id);
  let caches = seriesCache.get(byDay);
  if (!caches) seriesCache.set(byDay, (caches = { up: new Map(), down: new Map() }));
  const cache = metric.higherIsBetter ? caches.up : caches.down;
  const days: RecoveryDay[] = [];
  for (let day = firstDay; day <= lastDay; day++) {
    let entry = cache.get(day);
    if (!entry) cache.set(day, (entry = seriesDay(byDay, metric, day)));
    days.push(entry);
  }
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

/**
 * Home's readiness score, recomputed as it would have read on each day from
 * `firstDay` to `lastDay` - the same `computeReadiness` inputs Home uses, so
 * today's point here and Home's ring always agree.
 *
 * Each day only sees sessions up to and including that day: the fatigue
 * model treats anything "in the future" of its as-of date as happening
 * today, which would pull later hard sessions back into a rest day.
 */
export function readinessByDay(
  workouts: Workout[],
  entries: DailyMetricEntry[],
  firstDay: number,
  lastDay: number,
  { config = DEFAULT_READINESS_CONFIG, halfLife = 3, pain }: { config?: ReadinessConfig; halfLife?: number | Partial<FatigueModel>; pain?: { issues: PainIssue[]; logs: PainLog[] } } = {},
): Map<number, number> {
  const memo = readinessMemoFor(workouts, entries, pain, config, halfLife);
  const scores = new Map<number, number>();
  let prepared: ReadinessPrep | undefined;
  for (let day = firstDay; day <= lastDay; day++) {
    let score = memo.scores.get(day);
    if (score === undefined) {
      prepared ??= prepareReadiness(workouts, entries, halfLife);
      score = readinessOnDay(prepared, day, config, halfLife, pain);
      memo.scores.set(day, score);
    }
    if (score !== null) scores.set(day, score);
  }
  return scores;
}

// --- Readiness by day, kept between calls ----------------------------------------

/**
 * Readiness on one day depends only on the sessions and readings up to it, never on which window is drawn, so each day is
 * worked out once and kept for as long as its inputs are the same objects (the arrays are replaced whenever the data
 * changes). Stepping to the next period, or from 4 weeks to a year, then only works out the days not seen yet.
 */
interface ReadinessMemo {
  workouts: Workout[];
  entries: DailyMetricEntry[];
  issues?: PainIssue[];
  logs?: PainLog[];
  settings: string;
  /** day -> score, or null when no input was usable that day. */
  scores: Map<number, number | null>;
}
let lastReadinessMemo: ReadinessMemo | undefined;

function readinessMemoFor(workouts: Workout[], entries: DailyMetricEntry[], pain: { issues: PainIssue[]; logs: PainLog[] } | undefined, config: ReadinessConfig, halfLife: number | Partial<FatigueModel>): ReadinessMemo {
  const settings = JSON.stringify([config, halfLife]);
  const m = lastReadinessMemo;
  if (m && m.workouts === workouts && m.entries === entries && m.issues === pain?.issues && m.logs === pain?.logs && m.settings === settings) return m;
  return (lastReadinessMemo = { workouts, entries, issues: pain?.issues, logs: pain?.logs, settings, scores: new Map() });
}

/** Fatigue fades by half every half-life; what is older than this many of them is under a thousandth of a point. */
const FATIGUE_HALF_LIVES = 14;
/** The rolling load ratio looks 28 days back. */
const ACWR_DAYS = 28;
const AXES = ["fingers", "arms", "core", "systemic"] as const;

interface ReadinessPrep {
  completed: { w: Workout; day: number }[];
  sleep: Map<number, number>;
  sleepHours: Map<number, number>;
  napHours: Map<number, number>;
  hrv: Map<number, number>;
  hrvAll: { day: number; value: number }[];
  /** How many days of sessions can still matter to fatigue. */
  reachDays: number;
}

function prepareReadiness(workouts: Workout[], entries: DailyMetricEntry[], halfLife: number | Partial<FatigueModel>): ReadinessPrep {
  const completed = workouts
    .filter((w) => w.status === "completed" && w.date)
    .map((w) => ({ w, day: toUtcDayIndex(w.date!) }))
    .sort((a, b) => a.day - b.day);
  const halfLifeDays = typeof halfLife === "number" ? halfLife : halfLife.halfLifeDays ?? 3;
  return {
    completed,
    sleep: readingsByDay(entries, "sleep-score"),
    sleepHours: readingsByDay(entries, "sleep-duration"),
    napHours: readingsByDay(entries, "nap-duration"),
    hrv: readingsByDay(entries, "hrv"),
    hrvAll: hrvReadings(entries),
    reachDays: Math.max(ACWR_DAYS, Math.ceil(FATIGUE_HALF_LIVES * halfLifeDays)),
  };
}

function readinessOnDay(p: ReadinessPrep, day: number, config: ReadinessConfig, halfLife: number | Partial<FatigueModel>, pain?: { issues: PainIssue[]; logs: PainLog[] }): number | null {
  // Sessions up to and including the day; each day only sees its own past.
  let upTo = upperBound(p.completed, day);
  // The ones that can still matter: recent ones, plus the first session ever (the load ratio needs to know how long you have trained) and, per rating, the latest session that has it (an axis nobody rated lately is "not rated", not "fresh").
  let start = upTo;
  while (start > 0 && day - p.completed[start - 1].day < p.reachDays) start--;
  const seen: Workout[] = [];
  const extra = new Set<number>();
  if (start > 0) extra.add(0);
  for (const axis of AXES) {
    for (let i = start - 1; i >= 0; i--) {
      if (p.completed[i].w[axis] !== undefined) { extra.add(i); break; }
    }
  }
  for (const i of [...extra].sort((a, b) => a - b)) seen.push(p.completed[i].w);
  for (let i = start; i < upTo; i++) seen.push(p.completed[i].w);

  const asOf = dayIndexToAsOf(day);
  const fatigue = computeFatigueDecay(seen, asOf, halfLife);
  const result = computeReadiness(
    {
      fatigue: { fingers: fatigue.fingers, core: fatigue.core, systemic: fatigue.systemic },
      acwr: calculateRollingAcwr(seen, asOf),
      sleep: p.sleep.get(day),
      sleepHours: p.sleepHours.get(day),
      napHours: p.napHours.get(day),
      hrv: p.hrv.get(day),
      hrvBaseline: hrvBaselineAt(p.hrvAll, day),
      pain: pain ? painLevelOn(pain.issues, pain.logs, dayIndexToIso(day)) : undefined,
    },
    config,
  );
  return result.score ?? null;
}

/** The number of entries (sorted by day) whose day is at or before `day`. */
function upperBound(sorted: { day: number }[], day: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].day <= day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
export function loadRecoveryInsights(entries: DailyMetricEntry[], workouts: Workout[], lastDay: number): RecoveryInsight[] {
  const firstDay = lastDay - INSIGHT_LOOKBACK_DAYS;
  const load = dailyLoadByDay(workouts);

  const trainingLoads = [...load].filter(([d, l]) => d >= firstDay && d < lastDay && l > 0).map(([, l]) => l).sort((a, b) => a - b);
  if (trainingLoads.length === 0) return [];
  const hardThreshold = trainingLoads[Math.min(trainingLoads.length - 1, Math.floor(trainingLoads.length * HARD_DAY_QUANTILE))];

  const insights: RecoveryInsight[] = [];
  for (const metric of recoveryMetrics(entries, firstDay, lastDay)) {
    const series = buildRecoverySeries(entries, metric, firstDay, lastDay);
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
