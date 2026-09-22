import type { DayOfWeek, Workout } from "../types";

/** ISO week order - Monday first, matching how week ids are counted. */
export const WEEK_DAYS: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** 0 (Monday) - 6 (Sunday). */
export function isoDayIndex(day: DayOfWeek): number {
  return WEEK_DAYS.indexOf(day);
}

/** The day a workout belongs to: its `dayOfWeek`, or - for a logged one without it - the weekday of its date. */
export function workoutDay(workout: Workout): DayOfWeek | undefined {
  if (workout.dayOfWeek) return workout.dayOfWeek;
  if (!workout.date) return undefined;
  const d = new Date(workout.date);
  return WEEK_DAYS[(d.getUTCDay() + 6) % 7];
}

/** A planned session the user explicitly skipped: every slot marked `skipped`. It stays planned (and in the plan's load), but it isn't "missed". */
export function isSkippedWorkout(workout: Workout): boolean {
  return workout.exercises.length > 0 && workout.exercises.every((slot) => slot.skipped);
}

/** Planned sessions on days before `today` in the same week that were neither logged nor skipped. */
export function missedWorkouts(weekWorkouts: Workout[], today: DayOfWeek): Workout[] {
  const todayIndex = isoDayIndex(today);
  return weekWorkouts.filter((w) => {
    if (w.status !== "planned" || isSkippedWorkout(w)) return false;
    const day = workoutDay(w);
    return day !== undefined && isoDayIndex(day) < todayIndex;
  });
}

export type DayStatus = "done" | "missed" | "skipped" | "planned" | "rest";

export interface WeekDayCell {
  day: DayOfWeek;
  status: DayStatus;
  isToday: boolean;
  /** Session names on that day - completed first, then planned. */
  sessions: string[];
}

/**
 * One cell per day of the week for Home's day strip. A day with any logged
 * session is "done"; otherwise a day with planned sessions is "missed"
 * (in the past, not skipped), "skipped" (every session skipped), or
 * "planned" (today or later); a day with nothing is "rest".
 */
export function weekDayStrip(weekWorkouts: Workout[], today: DayOfWeek): WeekDayCell[] {
  const todayIndex = isoDayIndex(today);
  return WEEK_DAYS.map((day, index) => {
    const onDay = weekWorkouts.filter((w) => workoutDay(w) === day);
    const done = onDay.filter((w) => w.status === "completed");
    const planned = onDay.filter((w) => w.status === "planned");
    let status: DayStatus = "rest";
    if (done.length > 0) status = "done";
    else if (planned.length > 0) {
      if (planned.every(isSkippedWorkout)) status = "skipped";
      else status = index < todayIndex ? "missed" : "planned";
    }
    return {
      day,
      status,
      isToday: index === todayIndex,
      sessions: [...done, ...planned].map((w) => w.notes || "Session"),
    };
  });
}
