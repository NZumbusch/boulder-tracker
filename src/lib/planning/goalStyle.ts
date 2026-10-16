/*
 * How a trip and a competition look on every calendar view (time grid, list, month): one colour (a bright gold, as bright as the sessions) and one icon
 * each, so the same event is never two colours and the icon tells trip from competition. Classes are written out in full for Tailwind to find them.
 */
import type { GoalKind } from "../types";

export const GOAL_STYLE: Record<GoalKind, { fill: string; icon: string; label: string }> = {
  trip: { fill: "bg-amber-400", icon: "ic:baseline-terrain", label: "Trip" },
  competition: { fill: "bg-amber-400", icon: "ic:baseline-emoji-events", label: "Competition" },
};

/** The style of a day with goals on it: a competition wins over a trip. */
export function dayGoalStyle(kinds: readonly GoalKind[]) {
  return GOAL_STYLE[kinds.includes("competition") ? "competition" : "trip"];
}
