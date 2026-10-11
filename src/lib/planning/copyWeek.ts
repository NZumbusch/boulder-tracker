import type { Workout } from "../types";
import { generateId } from "../utils";
import { workoutPlannedLoad } from "../analytics/load";

/**
 * A week's sessions as a fresh plan for another week - the planner's "copy
 * last week" and "repeat this week". Each becomes a new planned session on
 * the same day and time with the same name, note and exercises. It's the
 * plan that's copied, not what happened: an exercise's target is kept (or
 * what was logged, for an extra that had none), and everything about the
 * doing - logged values, skips, ratings, load, the date - is left behind.
 */
export function copySessionsToWeek(sessions: Workout[], targetWeekId: string, blockId: string | undefined): Workout[] {
  return sessions.map((s) => {
    const exercises = s.exercises.map((slot) => {
      const { logged, skipped: _skipped, prescribed, ...rest } = slot;
      const target = prescribed ?? logged;
      return { ...rest, id: generateId(), ...(target ? { prescribed: { ...target } } : {}) };
    });
    const copy: Workout = {
      id: generateId(),
      status: "planned",
      date: null,
      weekId: targetWeekId,
      loadFactor: 0,
      exercises,
      plannedLoad: workoutPlannedLoad(exercises, s.groups),
    };
    if (s.groups?.length) copy.groups = s.groups.map((g) => ({ ...g }));
    if (s.dayOfWeek) copy.dayOfWeek = s.dayOfWeek;
    if (s.startTime) copy.startTime = s.startTime;
    if (s.notes) copy.notes = s.notes;
    if (s.description) copy.description = s.description;
    if (s.plannedDuration) copy.plannedDuration = s.plannedDuration;
    if (blockId) copy.blockId = blockId;
    return copy;
  });
}
