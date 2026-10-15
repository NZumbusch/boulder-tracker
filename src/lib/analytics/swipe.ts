/**
 * Horizontal swipe paging for the Analytics window.
 *
 * A phone scrolls Analytics vertically, so a swipe only pages when it is
 * clearly sideways: long enough to be deliberate, and much more horizontal
 * than vertical. Anything else is left to the browser as a scroll.
 *
 * Swiping right drags the charts right, revealing what was to their left -
 * earlier weeks - the same as a photo gallery or a calendar app.
 */

export type SwipeDirection = "prev" | "next";

/** Minimum horizontal travel, in CSS px, before a gesture counts as a swipe. */
export const SWIPE_MIN_DISTANCE_PX = 44;
/** How many times larger the horizontal travel must be than the vertical. */
export const SWIPE_AXIS_RATIO = 1.25;

/**
 * Something else is using the finger (a session being dragged to another day): a swipe that ends before `until`
 * (`Date.now()` ms) is not a swipe. Set it while it lasts and for a moment after, since the touch ends can arrive in
 * either order.
 */
export const swipeGuard = { until: 0 };

/** The page a gesture moving `dx`/`dy` px asks for, or null for "not a swipe". */
export function swipeDirection(dx: number, dy: number): SwipeDirection | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return null;
  return dx > 0 ? "prev" : "next";
}

/**
 * Svelte action: calls `onSwipe` for a one-finger horizontal swipe on
 * `node`. Touch only - a mouse drag on desktop is text selection, and the
 * header arrows are right there.
 *
 * A gesture starting inside `[data-no-swipe]` (anything that scrolls
 * sideways itself) is ignored - nothing else: blocks, bars and buttons are
 * swiped from like anywhere else (they fill most of a busy calendar, so a
 * swipe that had to start on empty ground worked one time in ten).
 */
export function swipePaging(node: HTMLElement, onSwipe: (direction: SwipeDirection) => void) {
  let handler = onSwipe;
  let start: { x: number; y: number } | null = null;

  const onStart = (event: TouchEvent) => {
    const target = event.target as Element | null;
    if (event.touches.length !== 1 || target?.closest?.("[data-no-swipe]")) {
      start = null;
      return;
    }
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  // A sideways swipe isn't a scroll (touch-action lets it through), so the
  // browser still fires a click where the finger lifted - which would open
  // whatever it lifted over (a week sheet on the Load chart). The click
  // after a swipe is swallowed.
  let suppressUntil = 0;
  const onClick = (event: MouseEvent) => {
    if (Date.now() < suppressUntil) {
      event.preventDefault();
      event.stopPropagation();
      suppressUntil = 0;
    }
  };
  const onEnd = (event: TouchEvent) => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const direction = touch && Date.now() >= swipeGuard.until ? swipeDirection(touch.clientX - start.x, touch.clientY - start.y) : null;
    start = null;
    if (direction) {
      suppressUntil = Date.now() + 500;
      handler(direction);
    }
  };
  const onCancel = () => {
    start = null;
  };

  node.addEventListener("touchstart", onStart, { passive: true });
  node.addEventListener("touchend", onEnd, { passive: true });
  node.addEventListener("touchcancel", onCancel, { passive: true });
  node.addEventListener("click", onClick, true);

  return {
    update(next: (direction: SwipeDirection) => void) {
      handler = next;
    },
    destroy() {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onCancel);
      node.removeEventListener("click", onClick, true);
    },
  };
}
