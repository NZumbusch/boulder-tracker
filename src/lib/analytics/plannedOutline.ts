/**
 * Planned load as outlines behind the Rolling Load bars. Planned load is an estimate from the plan's exercises, a
 * different scale from the rated load the bars show (`HANDOVER.md`: never divide one by the other), so the outlines are
 * drawn on a scale of their own - each series fills the plot to its own tallest week - and the chart prints no ratio
 * or comparison. This file only turns the numbers into outline heights.
 */
import type { Workout } from '../types';
import { workoutPlannedLoad } from './load';

/** One column's planned load: the prescription of every counted session, planned or done. */
export function columnPlannedLoad(workouts: readonly Workout[]): number {
  let total = 0;
  for (const w of workouts) total += workoutPlannedLoad(w.exercises, w.groups);
  return Math.round(total);
}

/**
 * Heights (0-100, percent of the plot) for the outlines: the tallest planned week reaches `top` (the same share of
 * the plot the tallest bar leaves room for, so the two series look alike in extent but are never compared); weeks
 * with nothing planned get no outline (null).
 */
export function outlineHeights(planned: readonly number[], top = 87): (number | null)[] {
  const max = Math.max(0, ...planned);
  if (max <= 0) return planned.map(() => null);
  return planned.map((p) => (p > 0 ? Math.max((p / max) * top, 3) : null));
}
