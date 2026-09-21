/**
 * How many weeks the Analytics charts show, and how their x-axis is
 * labelled, for a given container width.
 *
 * The charts used to draw a fixed 12 weeks at any width. On a phone that
 * left each week roughly 16px of a ~280px chart - narrower than the "W34"
 * label under it, so the axis collided with itself and every bar was a
 * sliver. The week count is now derived from the measured width instead,
 * and the label row is thinned to whatever actually fits.
 *
 * Pure arithmetic, no DOM - the component measures, this decides.
 */

export type ChartDensity = "auto" | "compact" | "comfortable";

/**
 * Target horizontal space per week, in CSS px. "auto" is sized so a "W34"
 * label fits under every bar with breathing room; "compact" trades that for
 * more history on screen (the axis thins itself instead), "comfortable"
 * spends it on fewer, wider bars.
 */
export const WEEK_SLOT_PX: Record<ChartDensity, number> = {
  compact: 18,
  auto: 28,
  comfortable: 44,
};

/** Roughly the width of a "W34" axis label at the app's caption size. */
const LABEL_WIDTH_PX = 24;

/** Below this, a chart stops being readable; above it, the window is more history than the eye can compare. */
export const MIN_WEEKS = 4;
export const MAX_WEEKS = 26;

/** The fallback until the container has been measured (first paint, or a non-DOM environment). */
export const DEFAULT_WEEKS = 10;

/**
 * How many weeks fit in `containerWidth` at `density`. An unmeasured
 * container (0/undefined width, as on the very first render) falls back to
 * `DEFAULT_WEEKS` rather than collapsing to the minimum and then visibly
 * re-laying out.
 */
export function weeksToShow(containerWidth: number | undefined, density: ChartDensity): number {
  if (!containerWidth || containerWidth <= 0) return DEFAULT_WEEKS;
  const fitted = Math.round(containerWidth / WEEK_SLOT_PX[density]);
  return Math.min(Math.max(fitted, MIN_WEEKS), MAX_WEEKS);
}

/**
 * The visible window as week offsets from today, for a page `viewOffset`
 * (0 = the window containing this week, -1 = one full window earlier).
 *
 * Keeps a couple of weeks of the plan ahead of today in view - the charts
 * show planned load as well as actual, so an axis ending at this week would
 * hide the target path the user is about to train into. Narrow windows give
 * up that lookahead before they give up history.
 */
export function weekWindowOffsets(weeks: number, viewOffset: number): { startOffset: number; endOffset: number } {
  const span = Math.max(weeks, 1);
  const ahead = Math.min(2, Math.max(0, span - MIN_WEEKS));
  const endOffset = ahead + viewOffset * span;
  return { startOffset: endOffset - (span - 1), endOffset };
}

/**
 * Show every nth x-axis label, where n is the smallest step that keeps
 * labels from colliding. 1 means "label every week".
 */
export function labelStep(weeks: number, containerWidth: number | undefined): number {
  if (weeks <= 0) return 1;
  if (!containerWidth || containerWidth <= 0) return 1;
  const perWeek = containerWidth / weeks;
  if (perWeek >= LABEL_WIDTH_PX) return 1;
  return Math.max(1, Math.ceil(LABEL_WIDTH_PX / perWeek));
}

/**
 * Whether the label at `index` is drawn, given `step`. Counted back from
 * the last week so the most recent week - the one the user is reading - is
 * always labelled, rather than whichever week happens to sit at index 0.
 */
export function showsLabel(index: number, total: number, step: number): boolean {
  if (step <= 1) return true;
  return (total - 1 - index) % step === 0;
}

/**
 * Step for a date axis, where labels are far wider than a "W34" week label
 * ("Sep 12") and there is no useful thinning rule based on width alone.
 * Caps the axis at `maxLabels` evenly spaced labels - combined with
 * `showsLabel`, that always keeps the most recent point labelled.
 */
export function sparseLabelStep(count: number, maxLabels = 4): number {
  if (count <= maxLabels || maxLabels <= 0) return 1;
  return Math.ceil(count / maxLabels);
}
