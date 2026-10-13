import type { GoalEvent } from "../types";
import { goalEnd } from "../goals/goals";
import { toUtcDayIndex } from "../dateUtils";

export interface GoalBar {
  goal: GoalEvent;
  /** Index into the days shown where the bar starts, and how many days it covers. */
  from: number;
  span: number;
  /** The row: goals that overlap in time sit on different rows. */
  lane: number;
  /** The goal began before the first day shown / goes on after the last one. */
  startsBefore: boolean;
  endsAfter: boolean;
}

/** The trips and competitions among `days` (consecutive day indexes) as bars across them, clipped to what is shown, each on the first row where it fits. */
export function goalBars(goals: GoalEvent[], days: number[]): GoalBar[] {
  if (days.length === 0) return [];
  const [first, last] = [days[0], days[days.length - 1]];
  const bars: GoalBar[] = [];
  const laneEnds: number[] = []; // the last day index (exclusive) each row is taken to
  const visible = goals
    .map((goal) => ({ goal, start: toUtcDayIndex(goal.date), end: toUtcDayIndex(goalEnd(goal)) }))
    .filter((g) => g.end >= first && g.start <= last)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  for (const { goal, start, end } of visible) {
    const from = Math.max(start, first) - first;
    const to = Math.min(end, last) - first;
    let lane = laneEnds.findIndex((until) => until <= from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = to + 1;
    bars.push({ goal, from, span: to - from + 1, lane, startsBefore: start < first, endsAfter: end > last });
  }
  return bars;
}

/** The goals each of `days` falls in, by day index - for views that mark days rather than draw bars. */
export function goalsByDay(goals: GoalEvent[], days: number[]): Map<number, GoalEvent[]> {
  const map = new Map<number, GoalEvent[]>();
  for (const goal of goals) {
    const [start, end] = [toUtcDayIndex(goal.date), toUtcDayIndex(goalEnd(goal))];
    for (const day of days) if (day >= start && day <= end) map.set(day, [...(map.get(day) ?? []), goal]);
  }
  return map;
}
