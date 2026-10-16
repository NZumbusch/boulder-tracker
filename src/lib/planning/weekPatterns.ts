/**
 * Patterns that tell phases apart without colour (Plan -> Weeks, behind the setting `plan.weekPatterns`): each phase
 * gets one of a few fine overlays by its place in the phase list, on its week cells and in the legend. The first
 * phase stays plain, so the quietest look is the common one. Pure; the CSS is plain strings the cell applies as
 * `background-image` (ink is the text colour at low strength, so it reads on light and dark cells alike).
 */

const INK = "color-mix(in srgb, var(--color-content) 42%, transparent)";

export interface WeekPattern {
  name: string;
  image: string;
  size?: string;
}

export const WEEK_PATTERNS: readonly WeekPattern[] = [
  { name: "plain", image: "none" },
  { name: "diagonal lines", image: `repeating-linear-gradient(45deg, ${INK} 0 1.5px, transparent 1.5px 5px)` },
  { name: "dots", image: `radial-gradient(${INK} 1.1px, transparent 1.5px)`, size: "5px 5px" },
  { name: "horizontal lines", image: `repeating-linear-gradient(0deg, ${INK} 0 1.5px, transparent 1.5px 5px)` },
  { name: "cross-hatch", image: `repeating-linear-gradient(45deg, ${INK} 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, ${INK} 0 1px, transparent 1px 5px)` },
  { name: "vertical lines", image: `repeating-linear-gradient(90deg, ${INK} 0 1.5px, transparent 1.5px 5px)` },
  { name: "back diagonal lines", image: `repeating-linear-gradient(-45deg, ${INK} 0 1.5px, transparent 1.5px 5px)` },
  { name: "large dots", image: `radial-gradient(${INK} 1.8px, transparent 2.3px)`, size: "8px 8px" },
];

/** The pattern of the phase at `index` in the phase list; the list wraps when there are more phases than patterns. */
export function patternAt(index: number): WeekPattern {
  const n = WEEK_PATTERNS.length;
  return WEEK_PATTERNS[((index % n) + n) % n];
}

/** The pattern of a phase id given the ordered ids; an unknown or missing phase gets none. */
export function patternForPhase(phaseId: string | undefined, orderedPhaseIds: readonly string[]): WeekPattern {
  const i = phaseId === undefined ? -1 : orderedPhaseIds.indexOf(phaseId);
  return i < 0 ? WEEK_PATTERNS[0] : patternAt(i);
}

/** The inline style that draws a pattern (empty for "plain"). */
export function patternStyle(p: WeekPattern): string {
  return p.image === "none" ? "" : `background-image: ${p.image};${p.size ? ` background-size: ${p.size};` : ""}`;
}

/**
 * Whether a week passes the legend's filter. No phase chosen = every week; otherwise the week must hold a day of a
 * chosen phase (a split week counts for each of its phases).
 */
export function weekMatchesPhaseFilter(weekPhaseIds: readonly (string | undefined)[], chosen: ReadonlySet<string>): boolean {
  if (chosen.size === 0) return true;
  return weekPhaseIds.some((id) => id !== undefined && chosen.has(id));
}
