import type { GoalEvent } from "../types";
import { toUtcDayIndex } from "../dateUtils";

/** A goal's last day - its `endDate`, or its only day. */
export function goalEnd(goal: GoalEvent): string {
  return goal.endDate && goal.endDate >= goal.date ? goal.endDate : goal.date;
}

/** Number of days a goal spans (1 for a competition or a day trip). */
export function goalLength(goal: GoalEvent): number {
  return toUtcDayIndex(goalEnd(goal)) - toUtcDayIndex(goal.date) + 1;
}

/** True while `todayIso` falls within the goal's dates. */
export function isOngoing(goal: GoalEvent, todayIso: string): boolean {
  return goal.date <= todayIso && todayIso <= goalEnd(goal);
}

/** Whether `dateIso` ("YYYY-MM-DD", or a full ISO timestamp) is one of the goal's days. */
export function coversDate(goal: GoalEvent, dateIso: string): boolean {
  const day = dateIso.slice(0, 10);
  return goal.date <= day && day <= goalEnd(goal);
}

/** Goals not yet over, ongoing first, then by start date. */
export function upcomingGoals(goals: GoalEvent[], todayIso: string): GoalEvent[] {
  return goals
    .filter((g) => goalEnd(g) >= todayIso)
    .sort((a, b) => {
      const ao = isOngoing(a, todayIso) ? 0 : 1;
      const bo = isOngoing(b, todayIso) ? 0 : 1;
      return ao - bo || a.date.localeCompare(b.date);
    });
}

/** Finished goals, most recent first. */
export function pastGoals(goals: GoalEvent[], todayIso: string): GoalEvent[] {
  return goals.filter((g) => goalEnd(g) < todayIso).sort((a, b) => goalEnd(b).localeCompare(goalEnd(a)));
}

/** Whole days from `todayIso` to the goal's start (0 on the day, negative once started). */
export function daysUntilGoal(goal: GoalEvent, todayIso: string): number {
  return toUtcDayIndex(goal.date) - toUtcDayIndex(todayIso);
}

/** "Oct 5", or "Oct 5 – 12" / "Dec 27 – Jan 3" for a multi-day goal. */
export function formatGoalDates(goal: GoalEvent): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const start = new Date(`${goal.date}T00:00:00Z`);
  const end = goalEnd(goal);
  if (end === goal.date) return start.toLocaleDateString(undefined, opts);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameMonth = start.getUTCMonth() === endDate.getUTCMonth() && start.getUTCFullYear() === endDate.getUTCFullYear();
  return `${start.toLocaleDateString(undefined, opts)} – ${sameMonth ? endDate.getUTCDate() : endDate.toLocaleDateString(undefined, opts)}`;
}
