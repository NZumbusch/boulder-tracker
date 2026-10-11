/**
 * The "pro" training metrics on Analytics: Foster's monotony and strain,
 * finger load, strength relative to bodyweight, and the training-day
 * heatmap. Pure functions over day indices (see `recoverySeries.ts`).
 */
import type { AnalyticsCategory, Benchmark, DailyMetricEntry, ExerciseSlot, ExerciseTypeDef, Workout } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { slotActualLoads } from "./load";
import { loggedMetrics } from "./metricValues";
import { weekStartDay } from "./range";
import { BODYWEIGHT_METRIC_ID } from "../constants";

// --- Monotony & strain (Foster, 1998) ---

/**
 * Foster's classic warning line: a week whose daily loads vary this little
 * relative to their mean (monotony = mean / SD) has too few easy days, and
 * illness and overreaching follow hard, monotonous weeks.
 */
export const MONOTONY_WARNING = 2;

export interface WeekStrain {
  load: number;
  /** Mean daily load / its standard deviation, rest days counted as 0. Undefined for an empty week, or one with identical loads every day. */
  monotony?: number;
  /** Weekly load x monotony. */
  strain?: number;
}

/** Monotony and strain for the seven days starting `mondayDay`. */
export function weekStrain(loadByDay: Map<number, number>, mondayDay: number): WeekStrain {
  const loads = Array.from({ length: 7 }, (_, i) => loadByDay.get(mondayDay + i) ?? 0);
  const load = loads.reduce((a, b) => a + b, 0);
  if (load === 0) return { load };
  const mean = load / 7;
  // Population SD, as Foster computed it over the week's seven days.
  const sd = Math.sqrt(loads.reduce((acc, l) => acc + (l - mean) ** 2, 0) / 7);
  if (sd === 0) return { load };
  const monotony = mean / sd;
  return { load, monotony, strain: load * monotony };
}

/** A column's strain: one week's, or the mean over the weeks of a month column. */
export function bucketStrain(loadByDay: Map<number, number>, weekIds: string[]): WeekStrain {
  const weeks = weekIds
    .map((id) => weekStartDay(id))
    .filter((d): d is number => d !== undefined)
    .map((d) => weekStrain(loadByDay, d));
  if (weeks.length === 1) return weeks[0];
  const withValues = weeks.filter((w) => w.monotony !== undefined);
  const load = weeks.reduce((a, w) => a + w.load, 0) / Math.max(weeks.length, 1);
  if (withValues.length === 0) return { load };
  return {
    load,
    monotony: withValues.reduce((a, w) => a + w.monotony!, 0) / withValues.length,
    strain: withValues.reduce((a, w) => a + w.strain!, 0) / withValues.length,
  };
}

// --- Finger load ---

/** Categories treated as finger-intensive until the athlete picks their own. */
const FINGER_CATEGORY_PATTERN = /finger|hang|board|campus|power boulder|limit/i;

/** The finger-intensive category ids: the athlete's own choice, or a guess from the category names. */
export function fingerCategoryIds(categories: AnalyticsCategory[], chosen: string[] | null): Set<string> {
  if (chosen) return new Set(chosen);
  return new Set(categories.filter((c) => FINGER_CATEGORY_PATTERN.test(c.name)).map((c) => c.id));
}

/** A slot's analytics category id - its own override, else its exercise type's category (stored by name). */
export function slotCategoryId(slot: ExerciseSlot, typeById: Map<string, ExerciseTypeDef>, categories: AnalyticsCategory[]): string | undefined {
  if (slot.categoryId) return slot.categoryId;
  const name = typeById.get(slot.typeId)?.category;
  return categories.find((c) => c.name === name)?.id;
}

/**
 * Completed exercise load over the given weeks: from finger-intensive
 * exercises, and from all exercises. The share is finger / total - both
 * measured per exercise, since a session's stored load need not equal the
 * sum of its exercises.
 */
export function fingerLoad(
  workouts: Workout[],
  weekIds: string[],
  { types, categories, fingerIds }: { types: ExerciseTypeDef[]; categories: AnalyticsCategory[]; fingerIds: Set<string> },
): { finger: number; total: number } {
  const weeks = new Set(weekIds);
  const typeById = new Map(types.map((t) => [t.id, t]));
  let finger = 0;
  let total = 0;
  for (const w of workouts) {
    if (w.status !== "completed" || !weeks.has(w.weekId)) continue;
    const loads = slotActualLoads(w.exercises ?? [], w.groups);
    for (const slot of w.exercises ?? []) {
      const load = loads.get(slot.id) ?? 0;
      total += load;
      const id = slotCategoryId(slot, typeById, categories);
      if (id && fingerIds.has(id)) finger += load;
    }
  }
  return { finger, total };
}

// --- Relative strength ---

/** How far from a benchmark a bodyweight reading may be and still be used for it. */
export const BODYWEIGHT_MATCH_DAYS = 14;

export interface RelativeStrengthPoint {
  date: string;
  value: number;
  bodyweight: number;
  /** Total load lifted / bodyweight: 1.3 = 130% of bodyweight. */
  ratio: number;
}

/**
 * A weight benchmark relative to bodyweight on the day, using the nearest
 * bodyweight reading within `BODYWEIGHT_MATCH_DAYS`. `valueIsAdded` - the
 * common case for max hangs and weighted pull-ups - means the result is
 * weight added on top of the body, so the total is bodyweight + value;
 * otherwise the value already is the total.
 */
export function relativeStrength(results: Benchmark[], dailyMetrics: DailyMetricEntry[], valueIsAdded: boolean): RelativeStrengthPoint[] {
  const weights = loggedMetrics(dailyMetrics)
    .filter((m) => m.metricId === BODYWEIGHT_METRIC_ID)
    .map((m) => ({ day: toUtcDayIndex(m.date), value: m.value }));
  if (weights.length === 0) return [];

  return results
    .slice()
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .flatMap((b) => {
      const day = toUtcDayIndex(b.date);
      let best: { day: number; value: number } | undefined;
      for (const w of weights) {
        if (Math.abs(w.day - day) > BODYWEIGHT_MATCH_DAYS) continue;
        if (!best || Math.abs(w.day - day) < Math.abs(best.day - day)) best = w;
      }
      if (!best) return [];
      const total = valueIsAdded ? best.value + b.value : b.value;
      return [{ date: b.date, value: b.value, bodyweight: best.value, ratio: total / best.value }];
    });
}

// --- Heatmap ---

export interface HeatmapDay {
  day: number;
  load: number;
  /** 0 = rest, 1-4 = quartile of the training days' loads in view. */
  level: 0 | 1 | 2 | 3 | 4;
}

/** `weeks` Monday-start columns of seven days, ending with the week containing `endDay`. */
export function heatmap(loadByDay: Map<number, number>, endDay: number, weeks = 53): HeatmapDay[][] {
  const lastMonday = endDay - ((new Date(endDay * 86400000).getUTCDay() + 6) % 7);
  const firstMonday = lastMonday - (weeks - 1) * 7;

  const loads: number[] = [];
  for (let d = firstMonday; d < lastMonday + 7; d++) {
    const l = loadByDay.get(d) ?? 0;
    if (l > 0) loads.push(l);
  }
  loads.sort((a, b) => a - b);
  const q = (p: number) => loads[Math.max(0, Math.ceil(loads.length * p) - 1)] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const levelOf = (l: number): HeatmapDay["level"] => {
    if (l <= 0) return 0;
    if (l <= cuts[0]) return 1;
    if (l <= cuts[1]) return 2;
    if (l <= cuts[2]) return 3;
    return 4;
  };

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const day = firstMonday + w * 7 + i;
      const load = loadByDay.get(day) ?? 0;
      return { day, load, level: levelOf(load) };
    }),
  );
}
