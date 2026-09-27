import type { ExerciseValues } from "../types";

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
export function restSeconds(values: ExerciseValues): { betweenReps: number; betweenSets: number } {
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

/** A finite number >= 0, or `undefined` - a rest of 0 seconds is "no rest", not "unknown". */
function nonNegative(value: number | undefined): number | undefined {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) && n >= 0 ? n : undefined;
}
