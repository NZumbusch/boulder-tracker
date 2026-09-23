import type { Benchmark, BenchmarkTypeDef, OutdoorAscent, Workout } from "../types";
import { decrementWeekId, getWeekId, toUtcDayIndex } from "../dateUtils";
import { parseFontGrade } from "./grades";
import { isoDayIndex, workoutDay } from "../planning/weekStatus";

export interface BenchmarkProgress {
  typeKey: string;
  name: string;
  unit: string;
  latest: number;
  latestDate: string;
  /** latest - previous; undefined with only one result. */
  change?: number;
  previousDate?: string;
}

/** How many benchmark types the card shows (most recently tested first). */
export const PROGRESS_BENCHMARKS = 3;
/** A benchmark untested for this many weeks gets a retest nudge. */
export const RETEST_WEEKS = 6;

function benchmarkKey(b: Benchmark): string {
  return b.typeId || b.type;
}

/** Latest result per benchmark type with its change from the previous one, most recently tested first. */
export function latestBenchmarks(benchmarks: Benchmark[], types: BenchmarkTypeDef[]): BenchmarkProgress[] {
  const byType = new Map<string, Benchmark[]>();
  for (const b of benchmarks) {
    const key = benchmarkKey(b);
    byType.set(key, [...(byType.get(key) ?? []), b]);
  }
  const result: BenchmarkProgress[] = [];
  for (const [key, list] of byType) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const previous = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
    const def = types.find((t) => t.id === latest.typeId);
    if (def?.archived) continue;
    result.push({
      typeKey: key,
      name: def?.name ?? latest.type,
      unit: latest.unit || def?.unit || "",
      latest: latest.value,
      latestDate: latest.date,
      change: previous ? Math.round((latest.value - previous.value) * 100) / 100 : undefined,
      previousDate: previous?.date,
    });
  }
  return result.sort((a, b) => b.latestDate.localeCompare(a.latestDate));
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
