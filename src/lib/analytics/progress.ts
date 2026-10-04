import type { Benchmark, BenchmarkTypeDef, OutdoorAscent, ValueDef, Workout } from "../types";
import type { WeightUnit } from "../units";
import { buildSeries, defaultMetric, isImprovement, metricPoints, primaryText, type Bodyweight } from "../benchmarks/series";
import { formatFieldValue, primaryField } from "../benchmarks/model";
import { decrementWeekId, getWeekId, toUtcDayIndex } from "../dateUtils";
import { parseFontGrade } from "./grades";
import { isoDayIndex, workoutDay } from "../planning/weekStatus";

export interface BenchmarkProgress {
  /** The series (a test done one way) - unique per row. */
  typeKey: string;
  /** "Max Hang · 20 mm". */
  name: string;
  unit: string;
  latest: number;
  latestDate: string;
  /** latest - previous; undefined with only one result. */
  change?: number;
  previousDate?: string;
  /** The latest result as text in the chosen weight unit, and the change likewise (signed). */
  latestText: string;
  changeText?: string;
  /** Whether the change is a gain: lower is better for a test that says so. */
  improved?: boolean;
}

/** How many benchmark types the card shows (most recently tested first). */
export const PROGRESS_BENCHMARKS = 3;
/** A benchmark untested for this many weeks gets a retest nudge. */
export const RETEST_WEEKS = 6;

/**
 * Latest result per test-and-conditions with its change from the previous
 * one of the same, most recently tested first - "Max Hang at 20 mm" and "at
 * 15 mm" are separate rows, so they are never subtracted from each other.
 */
export function latestBenchmarks(benchmarks: Benchmark[], types: BenchmarkTypeDef[], defs: ValueDef[] = [], weight: WeightUnit = "kg"): BenchmarkProgress[] {
  return buildSeries(benchmarks, types, defs, weight).map((s) => {
    const latest = s.results[s.results.length - 1];
    const previous = s.results.length > 1 ? s.results[s.results.length - 2] : undefined;
    const change = previous ? Math.round((latest.value - previous.value) * 100) / 100 : undefined;
    const primary = primaryField(s.fields);
    return {
      typeKey: s.key,
      name: s.label,
      unit: latest.unit || s.type.unit || "",
      latest: latest.value,
      latestDate: latest.date,
      change,
      previousDate: previous?.date,
      latestText: primaryText(latest, s, weight),
      changeText: change !== undefined && primary ? `${change > 0 ? "+" : "−"}${formatFieldValue(primary, Math.abs(change), weight)}` : undefined,
      improved: change !== undefined ? isImprovement(change, s.type) : undefined,
    };
  });
}

/** Benchmark types last tested `RETEST_WEEKS` or more weeks before `asOf`, longest-untested first, with how many weeks. */
export function retestDue(progress: BenchmarkProgress[], asOf: Date, afterWeeks = RETEST_WEEKS): { name: string; weeks: number }[] {
  const today = toUtcDayIndex(asOf.toISOString());
  return progress
    .map((p) => ({ name: p.name, weeks: Math.floor((today - toUtcDayIndex(p.latestDate)) / 7) }))
    .filter((p) => p.weeks >= afterWeeks)
    .sort((a, b) => b.weeks - a.weeks);
}

export interface SendsSummary {
  last?: OutdoorAscent;
  /** Hardest Font-parseable grade in the last 12 months. */
  hardest?: OutdoorAscent;
  countThisSeason: number;
}

export function sendsSummary(ascents: OutdoorAscent[], asOf: Date): SendsSummary {
  const today = toUtcDayIndex(asOf.toISOString());
  const sorted = [...ascents].filter((a) => a.date).sort((a, b) => b.date.localeCompare(a.date));
  const season = sorted.filter((a) => today - toUtcDayIndex(a.date) <= 365 && toUtcDayIndex(a.date) <= today);
  let hardest: OutdoorAscent | undefined;
  let hardestRank = -Infinity;
  for (const a of season) {
    const rank = parseFontGrade(a.grade);
    if (rank !== undefined && rank > hardestRank) {
      hardest = a;
      hardestRank = rank;
    }
  }
  return { last: sorted[0], hardest, countThisSeason: season.length };
}

export interface Consistency {
  /** Of the last `window` sessions that were due, how many were done. */
  done: number;
  due: number;
  /** Consecutive weeks, up to this one (or last, if this week has nothing logged yet), with at least one logged session. */
  weekStreak: number;
}

/** How many past sessions the consistency figure looks back over. */
export const CONSISTENCY_WINDOW = 14;

/**
 * Consistency from the stored workouts. A session is "due" once its day has
 * passed (or it's been logged); logged ones count as done, whether or not
 * they were planned. Skipped sessions count as due and not done - skipping
 * is honest, but it's still a session that didn't happen.
 */
export function consistency(workouts: Workout[], asOf: Date): Consistency {
  const currentWeekId = getWeekId(asOf);
  const todayIndex = (asOf.getUTCDay() + 6) % 7;
  const due = workouts.filter((w) => {
    if (w.status === "completed") return true;
    if (w.weekId < currentWeekId) return true;
    if (w.weekId > currentWeekId) return false;
    const day = workoutDay(w);
    return day !== undefined && isoDayIndex(day) < todayIndex;
  });
  const order = (w: Workout) => `${w.weekId}-${workoutDay(w) ? isoDayIndex(workoutDay(w)!) : 9}`;
  const recent = due.sort((a, b) => order(b).localeCompare(order(a))).slice(0, CONSISTENCY_WINDOW);

  const weeksWithSessions = new Set(workouts.filter((w) => w.status === "completed").map((w) => w.weekId));
  let week = weeksWithSessions.has(currentWeekId) ? currentWeekId : decrementWeekId(currentWeekId);
  let weekStreak = 0;
  while (weeksWithSessions.has(week)) {
    weekStreak++;
    week = decrementWeekId(week);
  }

  return { done: recent.filter((w) => w.status === "completed").length, due: recent.length, weekStreak };
}

export interface BenchmarkChangeSeries {
  typeKey: string;
  name: string;
  /** Each result in the window as % change from the first result ever of its series (a gain is positive, also for a test where lower is better). */
  points: { day: number; value: number; pct: number }[];
}

/**
 * Every test-and-conditions with results in [firstDay, lastDay], each result
 * as % change from that series' very first result - so benchmarks in kg,
 * seconds and reps share one axis. Archived tests are left out. The
 * number followed is the test's own chosen score (its primary result unless
 * it says otherwise).
 */
export function benchmarkChanges(benchmarks: Benchmark[], types: BenchmarkTypeDef[], firstDay: number, lastDay: number, defs: ValueDef[] = [], weight: WeightUnit = "kg", bodyweights: Bodyweight[] = []): BenchmarkChangeSeries[] {
  const out: BenchmarkChangeSeries[] = [];
  for (const s of buildSeries(benchmarks, types, defs, weight)) {
    const metric = defaultMetric(s, weight);
    if (!metric) continue;
    const all = metricPoints(metric, s, weight, bodyweights);
    if (all.length === 0 || all[0].value <= 0) continue;
    const first = all[0].value;
    const sign = s.type.direction === "lower" ? -1 : 1;
    const points = all
      .map((p) => ({ day: p.day, value: p.value, pct: sign * (p.value / first - 1) * 100 + 0 }))
      .filter((p) => p.day >= firstDay && p.day <= lastDay);
    if (points.length > 0) out.push({ typeKey: s.key, name: s.label, points });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
