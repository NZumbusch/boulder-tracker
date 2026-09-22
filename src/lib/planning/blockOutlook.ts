import type { TrainingBlock, Workout } from "../types";
import { workoutPlannedLoad } from "../types";
import { calculateWeeklyAdherence } from "../analytics/loadAnalytics";
import { getWeekDates, toUtcDayIndex } from "../dateUtils";
import { sortBlocks } from "./blockPaging";

/** The first block starting after `currentWeekId` - what the plan moves into next. */
export function nextBlock(blocks: TrainingBlock[], currentWeekId: string): TrainingBlock | undefined {
  return sortBlocks(blocks).find((b) => b.startWeekId > currentWeekId);
}

/** Whole days from `todayIso` to the Monday that starts `weekId` (0 if it has already started). */
export function daysUntilWeek(weekId: string, todayIso: string): number | undefined {
  const dates = getWeekDates(weekId);
  if (!dates) return undefined;
  return Math.max(0, toUtcDayIndex(dates.start.toISOString()) - toUtcDayIndex(todayIso));
}

/** How close to an event the taper hint starts appearing. */
export const TAPER_WINDOW_DAYS = 14;

/** Phase names that already mean "easing into an event" - the hint stays quiet during these. */
const TAPER_LIKE = /taper|peak|performance|deload|rest/i;

/**
 * A nudge when an event is within `TAPER_WINDOW_DAYS` but the current
 * phase isn't a taper-like one - or undefined when there's nothing to say.
 * Worded as an observation, not an instruction, like readiness advice.
 */
export function taperHint(daysUntilEvent: number | undefined, currentPhaseName: string | undefined): string | undefined {
  if (daysUntilEvent === undefined || daysUntilEvent < 0 || daysUntilEvent > TAPER_WINDOW_DAYS) return undefined;
  if (currentPhaseName && TAPER_LIKE.test(currentPhaseName)) return undefined;
  const phase = currentPhaseName ? `the current phase is ${currentPhaseName}` : "no phase covers this week";
  return `Taper window - ${phase}, not a taper or peak phase.`;
}

export interface WeekLoadBar {
  weekId: string;
  /** Planned load of every session in the week, done or not. */
  planned: number;
  /** Load actually logged (0 for a week still to come). */
  actual: number;
}

/**
 * Planned vs logged load for each of a block's weeks, for the Training
 * Block card's trend bars. `workoutsForWeek` should return the week's
 * effective sessions (projected ones included), so a week that still
 * follows its phase shows its plan too.
 */
export function blockLoadTrend(weekIds: string[], workoutsForWeek: (weekId: string) => Workout[]): WeekLoadBar[] {
  return weekIds.map((weekId) => {
    const workouts = workoutsForWeek(weekId);
    return {
      weekId,
      planned: Math.round(workouts.reduce((sum, w) => sum + workoutPlannedLoad(w.exercises), 0)),
      actual: Math.round(calculateWeeklyAdherence(workouts, weekId).actualLoad),
    };
  });
}
