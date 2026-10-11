import type { ExerciseSlot, ExerciseTypeDef, Workout } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { slotValues } from "../exerciseSlot";
import { setRows } from "../exercise/setRows";

/**
 * How one exercise has gone over the sessions it was logged in: its best
 * weight, longest hold or most reps each time, and the records among them.
 * Built from the sets as logged (per-set values included), so a pyramid of
 * 60/70/80 kg counts as 80. Pure.
 */

export type ProgressMetric = "weight" | "timeOn" | "reps" | "volume";

export interface ExerciseSession {
  workoutId: string;
  /** UTC day index of the session. */
  day: number;
  date: string;
  /** Heaviest set (kg) and the reps done at it. */
  weight?: number;
  repsAtWeight?: number;
  /** Longest hold (s). */
  timeOn?: number;
  /** Most reps in a set. */
  reps?: number;
  sets: number;
  /** Total reps x weight over the sets (reps alone when unweighted). */
  volume?: number;
}

/** The one number to follow for a slot when only one can be: heaviest set, else longest hold, else most reps. */
export function bestOfSlot(slot: ExerciseSlot): { value: number; unit: "kg" | "s" | "reps" } | undefined {
  if (slot.skipped || !slot.logged) return undefined;
  const rows = setRows(slotValues(slot), ["weight", "timeOn", "reps"]);
  const max = (k: "weight" | "timeOn" | "reps") => Math.max(0, ...rows.map((r) => r[k] ?? 0));
  if (max("weight") > 0) return { value: max("weight"), unit: "kg" };
  if (max("timeOn") > 0) return { value: max("timeOn"), unit: "s" };
  if (max("reps") > 0) return { value: max("reps"), unit: "reps" };
  return undefined;
}

function sessionOf(slot: ExerciseSlot, w: Workout): ExerciseSession | undefined {
  if (slot.skipped || !slot.logged || !w.date) return undefined;
  const rows = setRows(slotValues(slot), ["weight", "timeOn", "reps"]);
  const weights = rows.map((r) => r.weight ?? 0);
  const heaviest = Math.max(0, ...weights);
  const atHeaviest = heaviest > 0 ? rows.find((r) => (r.weight ?? 0) === heaviest) : undefined;
  const timeOn = Math.max(0, ...rows.map((r) => r.timeOn ?? 0));
  const reps = Math.max(0, ...rows.map((r) => r.reps ?? 0));
  if (heaviest <= 0 && timeOn <= 0 && reps <= 0) return undefined;
  const volume = rows.reduce((s, r) => s + (r.reps ?? 0) * (r.weight && r.weight > 0 ? r.weight : 1), 0);
  return {
    workoutId: w.id,
    day: toUtcDayIndex(w.date),
    date: w.date,
    ...(heaviest > 0 ? { weight: heaviest, ...(atHeaviest?.reps ? { repsAtWeight: atHeaviest.reps } : {}) } : {}),
    ...(timeOn > 0 ? { timeOn } : {}),
    ...(reps > 0 ? { reps } : {}),
    sets: rows.length,
    ...(volume > 0 ? { volume } : {}),
  };
}

/** One entry per session the exercise was logged in (the best of it if it appears twice), oldest first. */
export function exerciseHistory(workouts: readonly Workout[], typeId: string, asOf: Date): ExerciseSession[] {
  const today = toUtcDayIndex(asOf.toISOString());
  const byWorkout = new Map<string, ExerciseSession>();
  for (const w of workouts) {
    if (w.status !== "completed" || !w.date || toUtcDayIndex(w.date) > today) continue;
    for (const slot of w.exercises) {
      if (slot.typeId !== typeId || slot.test) continue;
      const s = sessionOf(slot, w);
      if (!s) continue;
      const prev = byWorkout.get(w.id);
      byWorkout.set(w.id, prev ? { ...prev, ...s, weight: Math.max(prev.weight ?? 0, s.weight ?? 0) || undefined, volume: (prev.volume ?? 0) + (s.volume ?? 0) } : s);
    }
  }
  return [...byWorkout.values()].sort((a, b) => a.day - b.day);
}

/** The metrics this exercise has data for, in the order to offer them. */
export function metricsOf(history: readonly ExerciseSession[]): ProgressMetric[] {
  const out: ProgressMetric[] = [];
  if (history.some((s) => s.weight)) out.push("weight");
  if (history.some((s) => s.timeOn)) out.push("timeOn");
  if (history.some((s) => s.reps)) out.push("reps");
  if (history.length > 1 && history.some((s) => s.volume)) out.push("volume");
  return out;
}

export function valueOf(s: ExerciseSession, metric: ProgressMetric): number | undefined {
  return metric === "weight" ? s.weight : metric === "timeOn" ? s.timeOn : metric === "reps" ? s.reps : s.volume;
}

export interface ExerciseRecords {
  heaviest?: { weight: number; reps?: number; date: string };
  longestHold?: { seconds: number; date: string };
  mostReps?: { reps: number; date: string };
  bestVolume?: { volume: number; date: string };
}

/** The best of each, with when it happened (the earliest session on a tie). */
export function recordsOf(history: readonly ExerciseSession[]): ExerciseRecords {
  const out: ExerciseRecords = {};
  for (const s of history) {
    if (s.weight && (!out.heaviest || s.weight > out.heaviest.weight)) out.heaviest = { weight: s.weight, ...(s.repsAtWeight ? { reps: s.repsAtWeight } : {}), date: s.date };
    if (s.timeOn && (!out.longestHold || s.timeOn > out.longestHold.seconds)) out.longestHold = { seconds: s.timeOn, date: s.date };
    if (s.reps && (!out.mostReps || s.reps > out.mostReps.reps)) out.mostReps = { reps: s.reps, date: s.date };
    if (s.volume && (!out.bestVolume || s.volume > out.bestVolume.volume)) out.bestVolume = { volume: s.volume, date: s.date };
  }
  return out;
}

export interface ExerciseSummary {
  typeId: string;
  name: string;
  sessions: number;
  metric: Exclude<ProgressMetric, "volume">;
  /** Latest value and the value `compareWeeks` ago (the best of the window before it). */
  latest: number;
  change?: number;
  lastDay: number;
  series: { day: number; value: number }[];
}

const COMPARE_WEEKS = 8;

/** The exercises with enough logged sessions to show a trend, most recently done first. */
export function summariseExercises(workouts: readonly Workout[], exerciseTypes: readonly ExerciseTypeDef[], asOf: Date, minSessions = 3): ExerciseSummary[] {
  const typeIds = new Set<string>();
  for (const w of workouts) if (w.status === "completed") for (const s of w.exercises) if (s.logged && !s.test) typeIds.add(s.typeId);
  const out: ExerciseSummary[] = [];
  for (const typeId of typeIds) {
    const name = exerciseTypes.find((t) => t.id === typeId)?.name;
    if (!name) continue;
    const history = exerciseHistory(workouts, typeId, asOf);
    if (history.length < minSessions) continue;
    const metric = (metricsOf(history).find((m) => m !== "volume") ?? undefined) as ExerciseSummary["metric"] | undefined;
    if (!metric) continue;
    const series = history.map((s) => ({ day: s.day, value: valueOf(s, metric)! })).filter((p) => p.value > 0);
    if (series.length < minSessions) continue;
    const latest = series[series.length - 1];
    const cutoff = latest.day - COMPARE_WEEKS * 7;
    const before = series.filter((p) => p.day <= cutoff);
    const reference = before.length ? Math.max(...before.slice(-3).map((p) => p.value)) : undefined;
    out.push({ typeId, name, sessions: series.length, metric, latest: latest.value, ...(reference ? { change: (latest.value / reference - 1) * 100 } : {}), lastDay: latest.day, series: series.slice(-24) });
  }
  return out.sort((a, b) => b.lastDay - a.lastDay);
}
