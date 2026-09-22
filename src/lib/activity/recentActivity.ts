import type { OutdoorAscent, Workout } from "../types";

export type ActivityItem =
  | { kind: "workout"; date: string; workout: Workout }
  | { kind: "ascent"; date: string; ascent: OutdoorAscent };

/**
 * The newest `limit` things that happened - completed sessions, and outdoor
 * ascents when `includeAscents` - newest first. Items without a date sort last.
 */
export function recentActivity(
  completed: Workout[],
  ascents: OutdoorAscent[],
  limit: number,
  includeAscents: boolean,
): ActivityItem[] {
  const items: ActivityItem[] = completed.map((workout) => ({ kind: "workout", date: workout.date || "", workout }));
  if (includeAscents) {
    for (const ascent of ascents) items.push({ kind: "ascent", date: ascent.date || "", ascent });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
