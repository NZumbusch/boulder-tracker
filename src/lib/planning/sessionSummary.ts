import type { ExerciseTypeDef, Workout } from "../types";
import { workoutPlannedLoad } from "../analytics/load";
import { slotTypeName } from "../exerciseSlot";
import { estimateSessionDuration } from "./sessionDuration";

/** How many exercise names a one-line session summary lists before "+N more". */
export const SUMMARY_EXERCISE_NAMES = 3;

export interface SessionSummary {
  startTime?: string;
  /** Planned length, or the exercises' estimate when none was planned (`estimated`). */
  minutes: number;
  estimated: boolean;
  exerciseNames: string[];
  moreExercises: number;
  plannedLoad: number;
}

/** The one-glance facts about a planned session - what Home's Today rows show under the session name. */
export function summarizeSession(workout: Workout, exerciseTypes: ExerciseTypeDef[]): SessionSummary {
  // The same exercise twice reads "Easy Climbing ×2", not "Easy Climbing, Easy Climbing".
  const counts = new Map<string, number>();
  for (const slot of workout.exercises) {
    const name = slotTypeName(slot, exerciseTypes);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
  return {
    startTime: workout.startTime || undefined,
    minutes: Math.round(estimateSessionDuration(workout)),
    estimated: !workout.plannedDuration,
    exerciseNames: names.slice(0, SUMMARY_EXERCISE_NAMES),
    moreExercises: Math.max(0, names.length - SUMMARY_EXERCISE_NAMES),
    plannedLoad: Math.round(workoutPlannedLoad(workout.exercises, workout.groups)),
  };
}
