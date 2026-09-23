import type { ExerciseSlot } from "../types";

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
export function slotPlannedLoad(slot: ExerciseSlot): number {
  return slot.prescribed ? calculatePlannedLoad(slot.prescribed) : 0;
}

/**
 * A slot's contribution to its workout's *actual* load - what was logged,
 * falling back to the plan for a slot that was reached but never explicitly
 * logged. A skipped slot contributes nothing, and neither does one that is
 * neither planned nor logged.
 */
export function slotActualLoad(slot: ExerciseSlot): number {
  if (slot.skipped) return 0;
  const values = slot.logged ?? slot.prescribed;
  return values ? calculatePlannedLoad(values) : 0;
}

/** Sums `slotPlannedLoad` across a workout's slots - the one definition of a workout's planned load. */
export function workoutPlannedLoad(exercises: ExerciseSlot[]): number {
  return (exercises ?? []).reduce((sum, slot) => sum + slotPlannedLoad(slot), 0);
}
