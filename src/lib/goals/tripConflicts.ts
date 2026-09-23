import type { GoalEvent, Workout } from "../types";
import { getWeekDates } from "../dateUtils";
import { isoDayIndex, isSkippedWorkout } from "../planning/weekStatus";
import { coversDate, goalEnd } from "./goals";

/** The calendar day ("YYYY-MM-DD") a planned workout falls on, from its week and weekday. */
export function plannedDate(workout: Workout): string | undefined {
  if (!workout.dayOfWeek) return undefined;
  const dates = getWeekDates(workout.weekId);
  if (!dates) return undefined;
  const day = new Date(dates.start.getTime() + isoDayIndex(workout.dayOfWeek) * 86400000);
  return day.toISOString().slice(0, 10);
}

/**
 * Planned (not skipped) sessions on a trip's remaining days - usually gym
 * sessions left over from before the trip was booked. Days before
 * `todayIso` don't count; there's nothing left to change about them.
 */
export function sessionsDuringTrip(trip: GoalEvent, workouts: Workout[], todayIso: string): Workout[] {
  if (trip.kind !== "trip" || goalEnd(trip) < todayIso) return [];
  return workouts.filter((w) => {
    if (w.status !== "planned" || isSkippedWorkout(w)) return false;
    const date = plannedDate(w);
    return !!date && date >= todayIso && coversDate(trip, date);
  });
}
