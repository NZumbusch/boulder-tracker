import type { ExerciseValues } from "../types";

/**
 * Reading `ExerciseValues.reps`, which is either one number or one per set.
 *
 * The array form predates this module - real exports have carried
 * `[10, 7, 8, 8]` for months against a `number`-only type - and the
 * self-paced set timer now writes it deliberately. Every reader goes
 * through here rather than touching the field, so "is it an array?" is
 * answered in one place.
 */

/** Normalises whatever is in `reps` into a per-set list, dropping junk entries. */
export function toRepsArray(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const perSet = raw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  return perSet.length > 0 ? perSet : null;
}

/**
 * An exercise's reps laid out across its sets.
 *
 * Where a per-set array exists it is authoritative about the set count
 * too: a slot whose `sets` says 4 while its array holds 5 did five sets -
 * `sets` was the plan and the array is what happened.
 */
export function repsPerSet(values: ExerciseValues): number[] {
  const perSet = toRepsArray(values.reps);
  if (perSet) return perSet;

  const sets = Math.max(1, Math.floor(positiveNumber(values.sets) ?? 1));
  const reps = positiveNumber(typeof values.reps === "number" ? values.reps : undefined) ?? 1;
  return Array(sets).fill(reps);
}

/**
 * Total reps across every set, or `undefined` when the exercise never
 * recorded any.
 *
 * Deliberately not `repsPerSet().reduce(...)`: that fills in one rep per
 * set so the duration maths has something to work with, which is fine for
 * an estimate and a fabrication in a report. An exercise that tracks sets
 * but not reps has no rep count, and should say so.
 */
export function repsTotal(values: ExerciseValues): number | undefined {
  const perSet = toRepsArray(values.reps);
  if (perSet) return perSet.reduce((sum, reps) => sum + reps, 0);

  const reps = positiveNumber(typeof values.reps === "number" ? values.reps : undefined);
  if (reps === undefined) return undefined;

  const sets = Math.max(1, Math.floor(positiveNumber(values.sets) ?? 1));
  return reps * sets;
}

/**
 * One number to show where only one fits (a form field, a target hint).
 * The mean of a per-set array, rounded - not the first set, which flatters
 * a descending series like `[10, 7, 8, 8]`.
 */
export function repsRepresentative(reps: number | number[] | undefined): number | undefined {
  const perSet = toRepsArray(reps);
  if (perSet) return Math.round(perSet.reduce((a, b) => a + b, 0) / perSet.length);
  return positiveNumber(typeof reps === "number" ? reps : undefined);
}

/** How many sets the reps themselves imply, or `undefined` if they imply nothing. */
export function setsFromReps(reps: number | number[] | undefined): number | undefined {
  return toRepsArray(reps)?.length;
}

function positiveNumber(value: number | undefined): number | undefined {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) && n > 0 ? n : undefined;
}
