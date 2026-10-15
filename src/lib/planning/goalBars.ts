import type { GoalEvent } from "../types";
import { goalEnd } from "../goals/goals";
import { toUtcDayIndex } from "../dateUtils";

/** The goals each of `days` falls in, by day index - for views that mark days rather than draw bars. */
export function goalsByDay(goals: GoalEvent[], days: number[]): Map<number, GoalEvent[]> {
  const map = new Map<number, GoalEvent[]>();
  for (const goal of goals) {
    const [start, end] = [toUtcDayIndex(goal.date), toUtcDayIndex(goalEnd(goal))];
    for (const day of days) if (day >= start && day <= end) map.set(day, [...(map.get(day) ?? []), goal]);
  }
  return map;
}
