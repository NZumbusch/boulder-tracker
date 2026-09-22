import type { ExerciseSlot, ExerciseValues, Workout } from "../types";
import { slotValues } from "../exerciseSlot";
import { repsPerSet } from "../exercise/reps";

/** Re-exported: reps live in `lib/exercise/reps.ts`, the duration maths just uses them. */
export { repsPerSet };

/**
 * The one place that answers "how long is/was this session?".
 *
 * Before this module the question had three different answers living in
 * three places: `ics.ts`'s `calculateWorkoutDuration` (sum of per-exercise
 * `duration`, 30 min per exercise with none, 60 for an empty session),
 * `History.svelte`'s own inline `reduce` (same sum but 0 for a missing
 * duration), and `Analytics.svelte`'s category weighting (same sum, 30 for
 * a missing one). None of them looked at `Workout.plannedDuration`, which
 * is the field that actually records the scheduled wall-clock length, and
 * none of them could estimate an exercise that tracks sets/reps/rest
 * instead of a flat duration - a 5x5 hangboard session with real timeOn/
 * timeOff/timeBetweenSets values was still guessed at "30 minutes".
 *
 * Three distinct questions, deliberately three functions:
 * - `estimateExerciseDuration` - how long one exercise should take.
 * - `estimateSessionDuration` - how long the session is *expected* to take,
 *   used before/during it (the bubble's "50/100 min", the ICS event length,
 *   the fatigue reminder's fire time).
 * - `sessionDuration` - how long it *actually* took, used after it, for
 *   load factor and History. Falls back to the estimate so a session
 *   logged by hand (never run live) still reports something sensible.
 */

/**
 * What one exercise is assumed to take when it carries no duration and no
 * set/rep/rest structure to derive one from. Matches `ics.ts`'s historical
 * per-exercise default, so calendar exports and fatigue reminders don't
 * shift for existing data that has nothing better to offer.
 */
export const DEFAULT_EXERCISE_MINUTES = 30;

/**
 * What a session with no exercises at all is assumed to take - also
 * `ics.ts`'s historical default (a placeholder calendar entry still needs
 * a length), and asserted by `fatigueReminder.test.ts`.
 */
export const DEFAULT_SESSION_MINUTES = 60;

/**
 * Which rest is which.
 *
 * `timeOff` is documented as rest *between reps* and `timeBetweenSets` as
 * rest between sets, but an exercise type only offers the fields it lists
 * in `parameters` - and `weighted-pullups` offers `timeOff` without
 * `restTime`, so a 180-second rest between *sets* gets recorded in
 * `timeOff` because there is nowhere else to put it.
 *
 * Taken literally that turned 4x6 pull-ups into a 60-minute exercise (five
 * three-minute rests inside every set). The rule that sorts it out: a rest
 * between reps only means anything if a rep has a duration. With no
 * `timeOn`, whatever rest is recorded is separating sets.
 */
function restSeconds(values: ExerciseValues): { betweenReps: number; betweenSets: number } {
  const timeOn = nonNegative(values.timeOn) ?? 0;
  const timeOff = nonNegative(values.timeOff) ?? 0;
  const explicitSetRest = nonNegative(values.timeBetweenSets) ?? 0;

  // An explicit set rest settles it: `timeOff` is not doing double duty,
  // so it means what it says even if the reps carry no duration.
  if (explicitSetRest > 0) {
    return { betweenReps: timeOff, betweenSets: explicitSetRest };
  }
  // Reps have a duration, so a rest between them is meaningful.
  if (timeOn > 0) {
    return { betweenReps: timeOff, betweenSets: 0 };
  }
  // Nothing distinguishes the two and the reps have no duration - the one
  // rest that was recorded is separating sets.
  return { betweenReps: 0, betweenSets: timeOff };
}

/**
 * Derives an exercise's length in minutes.
 *
 * An explicit `duration` always wins - it is the user's own answer and
 * nothing here should second-guess it. Failing that, the work is
 * reconstructed from the set/rep structure, all in seconds:
 *
 *     per set  = reps * timeOn + (reps - 1) * restBetweenReps
 *     total    = sum(per set) + (sets - 1) * restBetweenSets
 *
 * The trailing rest is dropped at both levels on purpose: the session isn't
 * still running during the rest that follows its last set, and counting it
 * would inflate every hangboard/campus estimate by a full inter-set rest.
 *
 * Returns `undefined` rather than a default when there is nothing to go on,
 * so callers can tell "no information" from "30 minutes" - the session-level
 * estimate needs that distinction to decide what to fall back to.
 */
export function estimateExerciseDuration(values: ExerciseValues): number | undefined {
  const explicit = positive(values.duration);
  if (explicit !== undefined) return explicit;

  const timeOn = nonNegative(values.timeOn) ?? 0;
  const { betweenReps, betweenSets } = restSeconds(values);
  const perSet = repsPerSet(values);

  const workSeconds = perSet.reduce(
    (total, reps) => total + reps * timeOn + Math.max(0, reps - 1) * betweenReps,
    0,
  );
  const totalSeconds = workSeconds + Math.max(0, perSet.length - 1) * betweenSets;
  if (totalSeconds <= 0) return undefined;

  // Round up: a 30-second exercise is a minute of session time, not zero.
  return Math.max(1, Math.ceil(totalSeconds / 60));
}

/** `estimateExerciseDuration` against a slot, reading plan or log per `slotValues`. */
export function estimateSlotDuration(slot: ExerciseSlot): number | undefined {
  return estimateExerciseDuration(slotValues(slot));
}

/**
 * How long the session is expected to take, in minutes.
 *
 * `plannedDuration` wins when set - it is the scheduled wall-clock length,
 * and it can legitimately exceed the sum of the exercises (warm-up,
 * travel, faffing). Otherwise the exercises are summed, each falling back
 * to `DEFAULT_EXERCISE_MINUTES` only when it offers nothing at all.
 */
export function estimateSessionDuration(workout: Pick<Workout, "plannedDuration" | "exercises">): number {
  const planned = positive(workout.plannedDuration);
  if (planned !== undefined) return planned;

  const exercises = workout.exercises ?? [];
  if (exercises.length === 0) return DEFAULT_SESSION_MINUTES;

  return exercises.reduce(
    (total, slot) => total + (estimateSlotDuration(slot) ?? DEFAULT_EXERCISE_MINUTES),
    0,
  );
}

/**
 * How long the session actually took, in minutes - what load factor and
 * History should report.
 *
 * `actualDuration` is the live session's recorded running time and is
 * authoritative when present. Without it (a session logged by hand, or any
 * session from before live sessions existed) the logged exercises are
 * summed; a session with no logged durations at all falls back to the
 * estimate, which is the best available answer rather than zero.
 */
export function sessionDuration(workout: Workout): number {
  const actual = positive(workout.actualDuration);
  if (actual !== undefined) return actual;

  const logged = (workout.exercises ?? []).reduce((total, slot) => {
    if (slot.skipped) return total;
    return total + (estimateSlotDuration(slot) ?? 0);
  }, 0);

  return logged > 0 ? logged : estimateSessionDuration(workout);
}

/** A finite number strictly greater than zero, or `undefined` - guards against `null`, `NaN`, `""` and negatives alike. */
function positive(value: number | undefined): number | undefined {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Same, but zero is a meaningful answer (a rest of 0 seconds is "no rest", not "unknown"). */
function nonNegative(value: number | undefined): number | undefined {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) && n >= 0 ? n : undefined;
}
