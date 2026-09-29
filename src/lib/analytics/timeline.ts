/**
 * What the Analytics phase band draws: the dominant training block for
 * each stretch of the window, and the goals (competitions, trips) that
 * fall inside it.
 */
import type { GoalEvent, PainIssue, PainLog, PhaseDef, TrainingBlock } from "../types";
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

export interface PainPoint {
  id: string;
  day: number;
  severity: number;
  notes?: string;
}

export interface PainRow {
  /** Body part as first written; rows group case- and space-insensitively. */
  bodyPart: string;
  points: PainPoint[];
}

/** Pain logs in [firstDay, lastDay], one row per body part, the most-logged part first. */
export function painRows(painLogs: PainLog[], firstDay: number, lastDay: number): PainRow[] {
  const rows = new Map<string, PainRow>();
  for (const log of painLogs) {
    const day = toUtcDayIndex(log.date);
    if (day < firstDay || day > lastDay) continue;
    const key = log.bodyPart.trim().toLowerCase().replace(/\s+/g, " ");
    const row = rows.get(key) ?? { bodyPart: log.bodyPart.trim(), points: [] };
    row.points.push({ id: log.id, day, severity: log.severity, notes: log.notes });
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, points: r.points.sort((a, b) => a.day - b.day) }))
    .sort((a, b) => b.points.length - a.points.length || a.bodyPart.localeCompare(b.bodyPart));
}

export interface PainIssueRow {
  issueId: string;
  bodyPart: string;
  /** The stretch of the window the issue covers. */
  fromDay: number;
  toDay: number;
  /** Still open - its bar runs to today. */
  open: boolean;
  /** The end was estimated by the 3.33 migration. */
  estimated: boolean;
  points: PainPoint[];
}

/**
 * One row per pain issue overlapping [firstDay, lastDay]: a bar from its
 * start to its end (an open one runs to `todayDay`), clipped to the
 * window, with its check-ins as points. Open issues first, then newest.
 */
export function painIssueRows(issues: PainIssue[], logs: PainLog[], firstDay: number, lastDay: number, todayDay: number): PainIssueRow[] {
  const rows: PainIssueRow[] = [];
  for (const issue of issues) {
    const start = toUtcDayIndex(issue.startDate);
    const end = issue.endDate ? toUtcDayIndex(issue.endDate) : Math.max(start, todayDay);
    if (start > lastDay || end < firstDay) continue;
    const points = logs
      .filter((l) => l.issueId === issue.id)
      .map((l) => ({ id: l.id, day: toUtcDayIndex(l.date), severity: l.severity, notes: l.notes }))
      .filter((p) => p.day >= firstDay && p.day <= lastDay)
      .sort((a, b) => a.day - b.day);
    rows.push({ issueId: issue.id, bodyPart: issue.bodyPart, fromDay: Math.max(start, firstDay), toDay: Math.min(end, lastDay), open: !issue.endDate, estimated: !!issue.endEstimated, points });
  }
  return rows.sort((a, b) => Number(b.open) - Number(a.open) || b.fromDay - a.fromDay);
}
