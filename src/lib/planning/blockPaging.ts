import type { TrainingBlock } from "../types";

/**
 * Windowing/paging for the training block list. Kept out of the components
 * so "which blocks does the collapsed list show" and "which page is today
 * on" are testable without a DOM - the block list is otherwise the one
 * place in the plan UI where getting the window wrong silently hides work
 * the user planned.
 *
 * Every comparison here is plain string comparison on "YYYY-Wnn" week ids,
 * which sorts chronologically (see `trainingBlocks.ts` for why).
 */

export type BlockTimeframe = "past" | "current" | "upcoming";

/** Chronological order: start week, then end week, then name, so the order is stable for blocks that start together. */
export function sortBlocks(blocks: TrainingBlock[]): TrainingBlock[] {
  return [...blocks].sort(
    (a, b) =>
      a.startWeekId.localeCompare(b.startWeekId) ||
      a.endWeekId.localeCompare(b.endWeekId) ||
      a.name.localeCompare(b.name),
  );
}

/** Where a block sits relative to the current week - drives the list's Past/Now/Next markers. */
export function classifyBlock(block: TrainingBlock, currentWeekId: string): BlockTimeframe {
  if (block.endWeekId < currentWeekId) return "past";
  if (block.startWeekId > currentWeekId) return "upcoming";
  return "current";
}

/**
 * The index in `sorted` that "today" belongs at: the first block that has
 * not finished yet. When every block is in the past, that's the last block
 * (the user's most recent work is the useful anchor, not an empty window
 * past the end). Returns 0 for an empty list.
 */
export function currentBlockIndex(sorted: TrainingBlock[], currentWeekId: string): number {
  if (sorted.length === 0) return 0;
  const index = sorted.findIndex((b) => b.endWeekId >= currentWeekId);
  return index === -1 ? sorted.length - 1 : index;
}

/**
 * The collapsed list's window: the current block and the ones after it, up
 * to `limit`. If that runs out before `limit` is reached (a plan that is
 * mostly behind you), the window is backfilled with the blocks just before
 * it rather than rendering a short list - so the panel is always as full as
 * the data allows, and always includes "now".
 */
export function upcomingWindow(
  sorted: TrainingBlock[],
  currentWeekId: string,
  limit: number,
): TrainingBlock[] {
  if (limit <= 0 || sorted.length === 0) return [];
  if (sorted.length <= limit) return sorted;

  const anchor = currentBlockIndex(sorted, currentWeekId);
  const start = Math.min(anchor, sorted.length - limit);
  return sorted.slice(start, start + limit);
}

/** How many pages `total` items fill at `pageSize` - always at least 1, so an empty browser still has a page 1 of 1. */
export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The zero-based page holding `index`. */
export function pageForIndex(index: number, pageSize: number): number {
  if (pageSize <= 0) return 0;
  return Math.floor(Math.max(index, 0) / pageSize);
}

/**
 * The page the browser opens on: the one containing the current block, so
 * paging starts centred on today rather than at the oldest block in the
 * plan's history.
 */
export function initialPage(sorted: TrainingBlock[], currentWeekId: string, pageSize: number): number {
  return pageForIndex(currentBlockIndex(sorted, currentWeekId), pageSize);
}

/** Clamps a page number into range - guards against a page going stale when a block is deleted. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(page, 0), pageCount(total, pageSize) - 1);
}

/** The slice of `sorted` shown on `page`. */
export function pageSlice<T>(sorted: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return sorted.slice(start, start + pageSize);
}
