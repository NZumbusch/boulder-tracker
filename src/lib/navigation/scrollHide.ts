/**
 * When a floating button gets out of the way of what is being read: it hides while the screen is scrolled down
 * through content and comes back on scrolling up, at the top and at the end (where the page keeps room for it).
 * Pure: the scroll positions in, the new state out.
 */
export interface ScrollHideState {
  /** The position the current direction was last decided at. */
  anchor: number;
  hidden: boolean;
}

/** Movement (px) before a change of direction counts, so a jittery finger does not flicker the button. */
export const SCROLL_HIDE_THRESHOLD = 14;
/** Within this of the top the button is always there. */
export const SCROLL_HIDE_TOP_ZONE = 48;
/** Within this of the end it is shown again: nothing is left to read under it. */
export const SCROLL_HIDE_END_ZONE = 24;

export function nextScrollHide(
  state: ScrollHideState,
  top: number,
  { atEnd = false }: { atEnd?: boolean } = {},
): ScrollHideState {
  if (top <= SCROLL_HIDE_TOP_ZONE || atEnd) return { anchor: top, hidden: false };
  const delta = top - state.anchor;
  if (delta > SCROLL_HIDE_THRESHOLD) return { anchor: top, hidden: true };
  if (delta < -SCROLL_HIDE_THRESHOLD) return { anchor: top, hidden: false };
  // Same direction as before: follow along so the next reversal is measured from where it turned.
  if (delta > 0 && state.hidden) return { anchor: top, hidden: true };
  if (delta < 0 && !state.hidden) return { anchor: top, hidden: false };
  return state;
}

export const initialScrollHide: ScrollHideState = { anchor: 0, hidden: false };
