import type { ExerciseValues } from "../types";

/**
 * What one rep of a timed set is called when it isn't a "Hang": a stretch
 * done "per side" is two reps, one on each Side - the dial reads "Side 1/2"
 * and then "Switch" instead of "Hang 1/2" and "Rest". The words are a short
 * fixed list so the AI and the editor agree on them; none set = the old
 * wording.
 */
export const REP_LABELS = ["Side", "Arm", "Leg", "Hold", "Rep", "Round"] as const;
export type RepLabel = (typeof REP_LABELS)[number];

/** Labels whose rest between reps is a change over, not a rest. */
const SWITCHING: readonly string[] = ["Side", "Arm", "Leg"];

export function isRepLabel(v: unknown): v is RepLabel {
  return typeof v === "string" && (REP_LABELS as readonly string[]).includes(v);
}

/** The word for one rep's work, if the exercise names it. */
export function repLabelOf(values: Pick<ExerciseValues, "repLabel"> | undefined): RepLabel | undefined {
  return isRepLabel(values?.repLabel) ? values!.repLabel : undefined;
}

/** The word for the rest between reps: "Switch" for sides, arms and legs, else "Rest". */
export function repRestWord(workLabel: string): string {
  return SWITCHING.includes(workLabel) ? "Switch" : "Rest";
}

/**
 * What one rep of a timed set is called when the exercise doesn't say: a hang
 * on a hold or a bar is a "Hang", anything else timed (chin tucks, a plank
 * hold) is a "Hold". Judged from what the exercise tracks and its name.
 */
export function defaultRepLabel(name: string | undefined, tracked: readonly string[]): "Hang" | "Hold" {
  const hang = tracked.includes("holdSize") || tracked.includes("holdType") || /hang/i.test(name ?? "");
  return hang ? "Hang" : "Hold";
}
