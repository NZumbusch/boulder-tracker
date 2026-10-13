/*
 * Moving a session in the calendar by dragging it. The press has to be held
 * a moment before it becomes a drag - a finger that starts moving at once is
 * scrolling or swiping, and must stay that. The maths of where a drop lands
 * lives here so it can be tested without a screen.
 */

/** How long a press is held (and how little it may move) before it becomes a drag. */
export const DRAG_HOLD_MS = 350;
export const DRAG_SLOP_PX = 8;

/** `min` (minutes after midnight) to the nearest `step`. */
export function snapMinutes(min: number, step = 15): number {
  return Math.round(min / step) * step;
}

export interface DropColumn {
  left: number;
  right: number;
  /** Top of the hour grid. */
  top: number;
}

/**
 * Where a block dropped with the pointer at (`pointerX`, `pointerY`) lands:
 * the column under the pointer and the start time of the block, which keeps
 * the point it was grabbed at (`grabOffsetY` down from its top), snapped to
 * the quarter hour and held inside the day. Null when the pointer is
 * outside every column (the drop cancels).
 */
export function dropTarget(o: {
  pointerX: number;
  pointerY: number;
  grabOffsetY: number;
  columns: DropColumn[];
  hourPx: number;
  firstHour: number;
  durationMin: number;
}): { column: number; startMin: number } | null {
  const column = o.columns.findIndex((c) => o.pointerX >= c.left && o.pointerX < c.right);
  if (column === -1) return null;
  const raw = o.firstHour * 60 + ((o.pointerY - o.grabOffsetY - o.columns[column].top) / o.hourPx) * 60;
  const latest = Math.max(0, 24 * 60 - o.durationMin);
  return { column, startMin: Math.min(latest, Math.max(0, snapMinutes(raw))) };
}
