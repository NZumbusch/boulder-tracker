import type { ExerciseValues, ParameterBlock } from "../types";

/**
 * Numbers an exercise can hold without its type tracking them - the AI coach
 * plans "+12.5 kg" on a hang whose type has no weight, an older plan carried a
 * board angle. They are real numbers of the plan, so a screen that shows or
 * edits an exercise must offer them even though `activeParameters` lacks them
 * (otherwise a value is displayed but can't be changed).
 */
const LOADS: ParameterBlock[] = ["weight", "bodyweightPercent", "maxWeightPercent", "boardAngle", "holdSize"];

function hasNumber(values: ExerciseValues | undefined, key: ParameterBlock): boolean {
  if (!values) return false;
  const v = (values as Record<string, unknown>)[key];
  if (typeof v === "number" && Number.isFinite(v) && v !== 0) return true;
  return key === "weight" && !!values.setDetails?.some((d) => typeof d?.weight === "number" && d.weight !== 0);
}

/** What the exercise tracks, plus any of its load numbers that the given values carry. */
export function paramsWithValues(tracked: readonly ParameterBlock[], ...valueSets: (ExerciseValues | undefined)[]): ParameterBlock[] {
  const out = [...tracked];
  for (const key of LOADS) {
    if (!out.includes(key) && valueSets.some((v) => hasNumber(v, key))) out.push(key);
  }
  return out;
}
