import type { ExerciseValues, Workout } from "../types";

export interface LastTime {
  /** The session's day (YYYY-MM-DD). */
  date: string;
  workoutId: string;
  values: ExerciseValues;
}

/**
 * What was logged the last time an exercise type was done: the most recent
 * completed session with a *logged* slot of `typeId` (skipped and
 * never-reached slots don't count - they say nothing about what you did).
 * `excludeWorkoutId` leaves out the session being done right now. When one
 * session has the type twice, its last logged slot wins; two sessions on
 * the same day go by list order.
 */
export function findLastLogged(typeId: string, workouts: Workout[], excludeWorkoutId?: string | null): LastTime | null {
  let best: LastTime | null = null;
  for (const w of workouts) {
    if (w.status !== "completed" || !w.date || w.id === excludeWorkoutId) continue;
    const day = w.date.slice(0, 10);
    if (best && day < best.date) continue;
    const slots = (w.exercises ?? []).filter((s) => s.typeId === typeId && s.logged && !s.skipped);
    if (slots.length === 0) continue;
    best = { date: day, workoutId: w.id, values: slots[slots.length - 1].logged! };
  }
  return best;
}
