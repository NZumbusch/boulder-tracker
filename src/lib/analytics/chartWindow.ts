/**
 * Axis arithmetic for the Analytics charts: the week window's position,
 * and how far the x- and y-axis labels have to be thinned to fit.
 *
 * (How many columns a chart shows is the range preset's job now - see
 * `range.ts`. Width no longer decides it; it only decides the labels.)
 *
 * Pure arithmetic, no DOM - the component measures, this decides.
 */

/** Roughly the width of a "W34" axis label at the app's caption size. */
const LABEL_WIDTH_PX = 24;

/** Below this, a chart stops being readable. */
export const MIN_WEEKS = 4;

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

/**
 * Picks values to label a *vertical* axis with, spaced by where they will
 * actually be drawn rather than by their position in the list.
 *
 * The counterpart to `sparseLabelStep`, which thins an x-axis by taking
 * every nth entry. That rule breaks on a y-axis whose scale is uneven.
 * Font grade ranks are the case that exposed it: `[520, 600, 610, 620,
 * 700, 705, 710]` has gaps of 80, 10, 10, 80, 5, 5, so taking every other
 * entry picked 7A and 7B - six pixels apart on a 144px chart, printed on
 * top of each other.
 *
 * So candidates are walked in draw order and kept only when they clear the
 * last kept label by `minGapPercent`. The highest value is always
 * labelled: it is the one a reader looks for first (the hardest grade
 * climbed), so if it collides with the label below it, it replaces it
 * rather than being dropped.
 *
 * `values` must be sorted ascending. `positionOf` returns a percentage.
 */
export function pickAxisTicks(
  values: number[],
  positionOf: (value: number) => number,
  { maxTicks = 4, minGapPercent = 12 }: { maxTicks?: number; minGapPercent?: number } = {},
): number[] {
  if (values.length === 0 || maxTicks <= 0) return [];
  if (values.length === 1) return [values[0]];

  const kept: number[] = [];
  for (const value of values) {
    if (kept.length === 0) {
      kept.push(value);
      continue;
    }
    if (positionOf(value) - positionOf(kept[kept.length - 1]) >= minGapPercent) {
      kept.push(value);
    }
  }

  // The top value drops out whenever it sits just above whatever was kept
  // before it. Promote it over that neighbour instead of losing it.
  const top = values[values.length - 1];
  if (kept[kept.length - 1] !== top) {
    if (positionOf(top) - positionOf(kept[kept.length - 1]) >= minGapPercent) kept.push(top);
    else kept[kept.length - 1] = top;
  }

  if (kept.length <= maxTicks) return kept;

  // Still too many: thin the middle, keeping both ends.
  const step = (kept.length - 1) / (maxTicks - 1);
  const thinned = Array.from({ length: maxTicks }, (_, i) => kept[Math.round(i * step)]);
  return [...new Set(thinned)];
}
