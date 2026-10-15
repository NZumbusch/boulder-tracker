import type { DayOfWeek, Workout } from '../types';
import { getWeekId, localIsoDate } from '../dateUtils';

const DAY_NAMES: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface NextSession {
  workout: Workout;
  /** 1 = tomorrow. */
  daysAhead: number;
  /** "YYYY-MM-DD" of that day. */
  date: string;
}

/**
 * The next planned session after today, looking `horizon` days ahead. `plannedForWeek` is the planned sessions of a
 * week (`trainingState.getPlannedWorkoutsForWeek`), in schedule order. Home's Today card uses it to say "Rest day"
 * and what comes next instead of an empty line.
 */
export function nextPlannedSession(
  asOf: Date,
  plannedForWeek: (weekId: string) => Workout[],
  horizon = 7,
): NextSession | undefined {
  for (let i = 1; i <= horizon; i++) {
    const local = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + i, 12);
    const day = DAY_NAMES[local.getDay()];
    const workout = plannedForWeek(getWeekId(local)).find((w) => w.dayOfWeek === day);
    if (workout) return { workout, daysAhead: i, date: localIsoDate(local) };
  }
  return undefined;
}
