import type { GoalEvent, Workout } from "../types";
import { decrementWeekId, getWeekId, toUtcDayIndex } from "../dateUtils";
import { workoutPlannedLoad } from "../analytics/load";
import { isSkippedWorkout } from "../planning/weekStatus";

/**
 * A taper towards a goal date: the weekly load that eases off before it, as
 * a share of what the last weeks carried - the volume comes down, the
 * intensity stays. Set against what the plan has for those weeks and what
 * was done, so a plan that piles load on right before an event shows up.
 * Pure.
 */

/** Share of the base weekly load by weeks before the goal's week (0 = the week it is in). */
export const TAPER_SHARES: Record<number, number> = { 3: 1, 2: 0.85, 1: 0.65, 0: 0.4 };
/** The taper is shown from this many weeks out. */
export const TAPER_WEEKS = 3;
/** A planned week this far above its target is called out. */
export const TAPER_OVERSHOOT = 1.2;

export interface TaperWeek {
  weekId: string;
  /** Weeks before the goal's week; 0 is the week of the goal. */
  weeksOut: number;
  /** Target load: the base load times the taper's share. */
  target: number;
  /** What the plan holds for the week (planned sessions, rated like the sessions logged), when it is still ahead. */
  planned?: number;
  /** Load done so far this week. */
  done?: number;
  /** Planned or done is well above the target. */
  over: boolean;
}

export interface TaperPlan {
  goalId: string;
  goalName: string;
  daysToGo: number;
  baseLoad: number;
  weeks: TaperWeek[];
}

/** The average load of the last `weeks` full weeks that carried training - what "a normal week" has been. */
export function baseLoad(workouts: readonly Workout[], asOf: Date, weeks = 4): number {
  const loads: number[] = [];
  let id = decrementWeekId(getWeekId(asOf));
  for (let k = 0; k < weeks; k++, id = decrementWeekId(id)) {
    const load = workouts.filter((w) => w.status === "completed" && w.weekId === id).reduce((s, w) => s + (w.loadFactor || 0), 0);
    if (load > 0) loads.push(load);
  }
  return loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
}

/** What a week's still-planned sessions come to, on the scale of the sessions logged (`scale` is rated load per planned-estimate point). */
export function plannedWeekLoad(sessions: readonly Workout[], scale: number): number {
  return sessions.filter((w) => w.status === "planned" && !isSkippedWorkout(w)).reduce((s, w) => s + workoutPlannedLoad(w.exercises, w.groups), 0) * scale;
}

export function taperPlan(opts: {
  goal: GoalEvent;
  asOf: Date;
  base: number;
  workoutsForWeek: (weekId: string) => Workout[];
  /** Rated load per planned-estimate point (see `ratingScale`). */
  scale: number;
}): TaperPlan | undefined {
  const { goal, asOf, base } = opts;
  if (base <= 0) return undefined;
  const today = toUtcDayIndex(asOf.toISOString());
  const goalDay = toUtcDayIndex(goal.date);
  if (goalDay < today) return undefined;
  const goalWeek = getWeekId(new Date(`${goal.date}T12:00:00`));
  const current = getWeekId(asOf);
  const weeks: TaperWeek[] = [];
  let id = goalWeek;
  for (let weeksOut = 0; weeksOut <= TAPER_WEEKS; weeksOut++, id = decrementWeekId(id)) {
    if (id < current) break;
    const sessions = opts.workoutsForWeek(id);
    const target = base * TAPER_SHARES[weeksOut];
    const planned = plannedWeekLoad(sessions, opts.scale);
    const done = sessions.filter((w) => w.status === "completed").reduce((s, w) => s + (w.loadFactor || 0), 0);
    // Load that is done plus load still planned is what the week will have added up to.
    const total = done + planned;
    weeks.unshift({ weekId: id, weeksOut, target, ...(planned > 0 ? { planned } : {}), ...(done > 0 ? { done } : {}), over: total > target * TAPER_OVERSHOOT });
  }
  if (weeks.length === 0) return undefined;
  return { goalId: goal.id, goalName: goal.name, daysToGo: goalDay - today, baseLoad: base, weeks };
}
