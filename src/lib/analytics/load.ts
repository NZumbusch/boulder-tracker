import type { ExerciseGroup, ExerciseSlot, ExerciseValues } from "../types";
import { groupMemberMinutes } from "../exercise/groups";
import { estimateExerciseDuration } from "../planning/sessionDuration";

/**
 * The load formulas: a completed session's load from its length and
 * ratings, and planned / actual load from an exercise's duration and
 * intensity. Everything that charts, sums or compares load goes through
 * these.
 */

/**
 * Calculates the stress/load factor of a workout based on duration and RPE.
 */
export function calculateLoadFactor(
  duration: number | undefined, // in minutes
  fingers: number,
  core: number,
  systemic: number,
): number {
  // 1. Weighted Average: Emphasize the fatigue that dictates recovery time
  const weightedFatigue = fingers * 0.45 + systemic * 0.45 + core * 0.1;

  // 2. Exponential Scaling: Penalize high-intensity fatigue to make the graph realistic
  // Using a power of 1.2 or 1.3 ensures that 8s, 9s, and 10s spike your load graph.
  const intensityScale = Math.pow(weightedFatigue || 5, 1.2);

  // 3. Calculate and round to keep your database and charts clean
  // We use Number() to handle potential string inputs from range sliders or legacy data
  const d = duration !== undefined ? Number(duration) : 60;
  return Math.round(d * intensityScale);
}

/**
 * Calculates the planned load for an exercise based on its duration and planned intensity.
 *
 * Takes the exercise itself (not two positional numbers) because every real
 * call site already called it that way (`calculatePlannedLoad(exercise)`) -
 * the previous two-arg signature didn't match, so `duration` silently
 * received the whole exercise object and `Number(duration)` produced NaN.
 */
export function calculatePlannedLoad(exercise: {
  duration?: number;
  plannedLoad?: number;
}): number {
  // Ensure we have numbers. "0" || 5 in JS is "0", which is a common bug source.
  const d = exercise.duration !== undefined ? Number(exercise.duration) : 60;
  const i = exercise.plannedLoad !== undefined ? Number(exercise.plannedLoad) : 5;
  const intensityScale = Math.pow(i, 1.2);
  return Math.round(d * intensityScale);
}

/**
 * A slot's contribution to its workout's *planned* load.
 *
 * A slot with no `prescribed` block contributes **nothing**: it was never
 * planned. This is the distinction `calculatePlannedLoad(e.prescribed ?? {})`
 * silently destroyed at every aggregation site - `{}` falls through to that
 * function's own 60-minute/intensity-5 defaults, so an unplanned slot
 * contributed ~414 phantom planned load, and a spontaneous session (every
 * slot unplanned) reported a large plan it never had. Exercises added
 * mid-session are the common case for this now: unless the "added exercises
 * inherit what you did" preference is on, they carry no `prescribed` at all
 * and must land as extra load on top of the plan, not as plan.
 */
export function slotPlannedLoad(slot: ExerciseSlot, minutes?: number): number {
  return slot.prescribed ? calculatePlannedLoad(withMinutes(slot.prescribed, minutes)) : 0;
}

/**
 * A slot's contribution to its workout's *actual* load - what was logged,
 * falling back to the plan for a slot that was reached but never explicitly
 * logged. A skipped slot contributes nothing, and neither does one that is
 * neither planned nor logged.
 */
export function slotActualLoad(slot: ExerciseSlot, minutes?: number): number {
  if (slot.skipped) return 0;
  const values = slot.logged ?? slot.prescribed;
  return values ? calculatePlannedLoad(withMinutes(values, minutes)) : 0;
}

/**
 * Sums `slotPlannedLoad` across a workout's slots - the one definition of a
 * workout's planned load. A circuit/superset member is timed by its share
 * of the group (`groupMemberMinutes`), not by a duration of its own: it
 * rarely has one, and the 60-minute default would count a five-exercise
 * core circuit as five hours.
 */
export function workoutPlannedLoad(exercises: ExerciseSlot[], groups?: ExerciseGroup[]): number {
  const minutes = groupMemberMinutes({ exercises: exercises ?? [], groups }, "planned");
  return (exercises ?? []).reduce((sum, slot) => sum + slotPlannedLoad(slot, minutes.get(slot.id)), 0);
}

/** Sums `slotActualLoad` across a workout's slots, grouped members timed as in `workoutPlannedLoad`. */
export function workoutActualLoad(exercises: ExerciseSlot[], groups?: ExerciseGroup[]): number {
  const minutes = groupMemberMinutes({ exercises: exercises ?? [], groups }, "actual");
  return (exercises ?? []).reduce((sum, slot) => sum + slotActualLoad(slot, minutes.get(slot.id)), 0);
}

/** Each slot's actual load by id, grouped members timed by their share of the group - for per-exercise breakdowns. */
export function slotActualLoads(exercises: ExerciseSlot[], groups?: ExerciseGroup[]): Map<string, number> {
  const minutes = groupMemberMinutes({ exercises: exercises ?? [], groups }, "actual");
  return new Map((exercises ?? []).map((slot) => [slot.id, slotActualLoad(slot, minutes.get(slot.id))]));
}

/**
 * The values load is read from: a group's share when the slot is in a
 * circuit, otherwise the exercise's own duration - estimated from its
 * sets/reps/rest when it has none, so 4x6 pull-ups
 * count as the minutes they take rather than `calculatePlannedLoad`'s
 * 60-minute default. Only an exercise with nothing to go on still gets
 * that default.
 */
function withMinutes<T extends ExerciseValues>(values: T, minutes: number | undefined): T {
  if (minutes !== undefined) return { ...values, duration: minutes };
  if (values.duration !== undefined && values.duration !== null) return values;
  const estimate = estimateExerciseDuration(values);
  return estimate === undefined ? values : { ...values, duration: estimate };
}
