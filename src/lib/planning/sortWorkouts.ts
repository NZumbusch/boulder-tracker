import type { DayOfWeek, Workout } from "../types";

/**
 * Mon-first day ordering, matching the `DayOfWeek` union's own ISO-week
 * sense (weeks start on Monday - see `dateUtils.ts`).
 */
export const DAY_ORDER: Record<DayOfWeek, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

/** Sorts after every assigned day, so unscheduled sessions land at the end. */
const UNASSIGNED_DAY_ORDER = 99;
/** Same idea for time-of-day: a session with no `startTime` sorts after one that has it, within the same day. */
const UNASSIGNED_TIME = "99:99";

/**
 * The one ordering for a week's sessions: day of week, then planned start
 * time, then id as a stable tiebreaker. Sessions with no day (or no time)
 * sort last within their group rather than first, so an unscheduled draft
 * never jumps above the sessions actually pinned to a day.
 *
 * Extracted so the "+" screen's planned-session list and the Training Plan
 * week view can't drift apart - the former previously rendered whatever
 * order storage happened to return, which is insertion order, not schedule
 * order.
 */
export function compareWorkoutsBySchedule(a: Workout, b: Workout): number {
  const dayA = a.dayOfWeek ? DAY_ORDER[a.dayOfWeek] : UNASSIGNED_DAY_ORDER;
  const dayB = b.dayOfWeek ? DAY_ORDER[b.dayOfWeek] : UNASSIGNED_DAY_ORDER;
  if (dayA !== dayB) return dayA - dayB;

  const timeA = a.startTime || UNASSIGNED_TIME;
  const timeB = b.startTime || UNASSIGNED_TIME;
  if (timeA !== timeB) return timeA.localeCompare(timeB);

  return a.id.localeCompare(b.id);
}

/** Non-mutating `compareWorkoutsBySchedule` sort - callers hold `$state` arrays that must not be reordered in place. */
export function sortWorkoutsBySchedule(workouts: Workout[]): Workout[] {
  return [...workouts].sort(compareWorkoutsBySchedule);
}
