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
  const names = workout.exercises.map((slot) => slotTypeName(slot, exerciseTypes));
  return {
    startTime: workout.startTime || undefined,
    minutes: Math.round(estimateSessionDuration(workout)),
    estimated: !workout.plannedDuration,
    exerciseNames: names.slice(0, SUMMARY_EXERCISE_NAMES),
    moreExercises: Math.max(0, names.length - SUMMARY_EXERCISE_NAMES),
    plannedLoad: Math.round(workoutPlannedLoad(workout.exercises)),
  };
}
