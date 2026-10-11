import type { AnalyticsCategory, ExerciseSlot, ExerciseTypeDef, ExerciseValues, Workout } from "../types";
import { slotActualLoads } from "./load";
import { planProgress } from "../planning/weekRecap";
import { slotTypeName } from "../exerciseSlot";
import { setRows } from "../exercise/setRows";

/**
 * A finished session read back against its plan: how much of the planned
 * work was done and where it differed, where its load came from, and how it
 * compares with the last sessions of the same name. Pure.
 */

export type ExerciseOutcome = "asPlanned" | "less" | "more" | "skipped" | "extra" | "unmeasured";

export interface ExerciseReview {
  slotId: string;
  name: string;
  outcome: ExerciseOutcome;
  /** Done against planned, as a ratio, when both can be measured. */
  ratio?: number;
  planned?: ExerciseValues;
  done?: ExerciseValues;
}

export interface SessionReview {
  /** Done against planned, from the exercises (the same scale as "% of the plan"). */
  planProgress?: number;
  exercises: ExerciseReview[];
  /** Where the load came from, biggest first. */
  categories: { name: string; load: number; share: number }[];
  similar?: { count: number; name: string; avgLoad: number; avgMinutes?: number; loadChange: number };
}

/** A rough size of the work a set of values describes: weight x reps x sets, or reps x sets, or hold time, or minutes. */
export function workAmount(v: ExerciseValues | undefined): number {
  if (!v) return 0;
  const rows = setRows(v, ["weight", "reps", "timeOn"]);
  const sum = rows.reduce((s, r) => {
    const reps = r.reps ?? 1;
    if (r.weight && r.weight > 0) return s + reps * r.weight;
    if (r.timeOn) return s + reps * r.timeOn;
    return s + (r.reps ?? 0);
  }, 0);
  if (sum > 0) return sum;
  return typeof v.duration === "number" ? v.duration : 0;
}

const SAME = 0.1;

function outcomeOf(slot: ExerciseSlot): ExerciseReview {
  const name = "";
  const base = { slotId: slot.id, name };
  if (slot.skipped) return { ...base, outcome: "skipped", ...(slot.prescribed ? { planned: slot.prescribed } : {}) };
  if (!slot.logged) return { ...base, outcome: "skipped", ...(slot.prescribed ? { planned: slot.prescribed } : {}) };
  if (!slot.prescribed) return { ...base, outcome: "extra", done: slot.logged };
  const planned = workAmount(slot.prescribed);
  const done = workAmount(slot.logged);
  if (planned <= 0 || done <= 0) return { ...base, outcome: "unmeasured", planned: slot.prescribed, done: slot.logged };
  const ratio = done / planned;
  return { ...base, outcome: ratio < 1 - SAME ? "less" : ratio > 1 + SAME ? "more" : "asPlanned", ratio, planned: slot.prescribed, done: slot.logged };
}

const MAX_SIMILAR = 3;

export function buildSessionReview(opts: {
  workout: Workout;
  /** Every session, for the comparison. */
  workouts: readonly Workout[];
  exerciseTypes: readonly ExerciseTypeDef[];
  analyticsCategories: readonly AnalyticsCategory[];
}): SessionReview {
  const { workout, exerciseTypes, analyticsCategories } = opts;
  const exercises = workout.exercises.map((slot) => ({ ...outcomeOf(slot), name: slotTypeName(slot, exerciseTypes as ExerciseTypeDef[]) }));

  const loads = slotActualLoads(workout.exercises, workout.groups);
  const byCategory = new Map<string, number>();
  for (const slot of workout.exercises) {
    const load = loads.get(slot.id) ?? 0;
    if (load <= 0) continue;
    const raw = slot.categoryId ?? exerciseTypes.find((t) => t.id === slot.typeId)?.category;
    const name = analyticsCategories.find((c) => c.id === raw || c.name === raw)?.name ?? raw ?? "Other";
    byCategory.set(name, (byCategory.get(name) ?? 0) + load);
  }
  const total = [...byCategory.values()].reduce((a, b) => a + b, 0);
  const categories = [...byCategory.entries()].map(([name, load]) => ({ name, load, share: total > 0 ? load / total : 0 })).sort((a, b) => b.load - a.load);

  const key = (workout.notes ?? "").trim().toLowerCase();
  const similar = key
    ? opts.workouts
        .filter((w) => w.id !== workout.id && w.status === "completed" && (w.notes ?? "").trim().toLowerCase() === key && w.date && (!workout.date || w.date < workout.date))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .slice(0, MAX_SIMILAR)
    : [];
  const avgLoad = similar.length ? similar.reduce((s, w) => s + (w.loadFactor || 0), 0) / similar.length : 0;

  return {
    ...(planProgress([workout]) !== undefined ? { planProgress: planProgress([workout]) } : {}),
    exercises,
    categories,
    ...(similar.length && avgLoad > 0 ? { similar: { count: similar.length, name: workout.notes!.trim(), avgLoad, loadChange: ((workout.loadFactor || 0) / avgLoad - 1) * 100 } } : {}),
  };
}

