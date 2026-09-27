/**
 * The pull-to-refresh gesture's maths (Home's pull-down sync): how far the
 * indicator follows a finger, and when letting go refreshes. The finger
 * moves further than the indicator - a rubber band - so a pull feels
 * deliberate and can't be triggered by a scroll that overshoots.
 */
export const PULL_THRESHOLD = 64;
export const PULL_MAX = 96;

/** Indicator offset (px) for a finger `dy` px below where it started. */
export function pullOffset(dy: number): number {
  if (dy <= 0) return 0;
  return Math.min(PULL_MAX, dy * 0.5);
}

/** Letting go at this offset refreshes. */
export function pullTriggers(offset: number): boolean {
  return offset >= PULL_THRESHOLD;
}
