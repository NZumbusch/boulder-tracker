/**
 * What the Analytics phase band draws: the dominant training block for
 * each stretch of the window, and the goals (competitions, trips) that
 * fall inside it.
 */
import type { GoalEvent, PhaseDef, TrainingBlock } from "../types";
import { getDominantBlockForWeek } from "../planning/trainingBlocks";
import { toUtcDayIndex } from "../dateUtils";
import { weekStartDay } from "./range";

/** Plan's colour for a block with neither its own colour nor its phase's. */
export const FALLBACK_BLOCK_COLOR = "bg-status-neutral";

export interface TimelineSegment {
  id: string;
  name: string;
  colorClass: string;
  startDay: number;
  endDay: number;
}

export interface TimelineGoal {
  id: string;
  name: string;
  kind: GoalEvent["kind"];
  startDay: number;
  endDay: number;
}

/** Consecutive weeks with the same dominant block merged into one segment; weeks with no block leave a gap. */
export function blockSegments(blocks: TrainingBlock[], phaseDefs: PhaseDef[], weekIds: string[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  for (const weekId of weekIds) {
    const block = getDominantBlockForWeek(blocks, weekId);
    const start = weekStartDay(weekId);
    if (!block || start === undefined) continue;
    const last = segments[segments.length - 1];
    if (last && last.id === block.id && last.endDay + 1 === start) {
      last.endDay = start + 6;
      continue;
    }
    segments.push({
      id: block.id,
      name: block.name,
      colorClass: block.color || phaseDefs.find((p) => p.id === block.phaseId)?.color || FALLBACK_BLOCK_COLOR,
      startDay: start,
      endDay: start + 6,
    });
  }
  return segments;
}

/** Goals overlapping [firstDay, lastDay]. */
export function goalsInWindow(goals: GoalEvent[], firstDay: number, lastDay: number): TimelineGoal[] {
  return goals
    .map((g) => ({ id: g.id, name: g.name, kind: g.kind, startDay: toUtcDayIndex(g.date), endDay: toUtcDayIndex(g.endDate ?? g.date) }))
    .filter((g) => g.endDay >= firstDay && g.startDay <= lastDay);
}
