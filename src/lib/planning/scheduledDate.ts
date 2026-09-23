import type { DayOfWeek, Workout } from "../types";
import { getWeekDates } from "../dateUtils";

const DAY_INDEX: Record<DayOfWeek, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6,
};

/**
 * The date to record when a planned session is logged without running it
 * live ("Log as planned"). A missed one - its planned day and time are
 * already past - is dated then, so logging Monday's session on Wednesday
 * doesn't move it to Wednesday. Anything else (no day, or a day still
 * ahead) is dated now. A planned session's own `date` is ignored: the "+"
 * screen stamps it with when it was *created*, not when it's for.
 */
export function loggedDateFor(workout: Workout, now: Date = new Date()): string {
  const week = workout.dayOfWeek ? getWeekDates(workout.weekId) : null;
  if (!week || !workout.dayOfWeek) return now.toISOString();
  const day = new Date(week.start.getTime() + DAY_INDEX[workout.dayOfWeek] * 86_400_000);
  const [h, m] = (workout.startTime ?? "12:00").split(":").map(Number);
  const scheduled = new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h || 0, m || 0);
  return scheduled <= now ? scheduled.toISOString() : now.toISOString();
}
