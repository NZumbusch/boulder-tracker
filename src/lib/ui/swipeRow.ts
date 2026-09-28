/**
 * Svelte action: a row you can swipe sideways to act on it, like a mail
 * app. The row follows the finger; past the threshold it slides out and
 * the action runs, short of it the row springs back. Vertical movement is
 * left to the page (`touch-action: pan-y` is set on the row), and the
 * click that follows a swipe is swallowed so it doesn't also open the row.
 *
 * The host puts what's revealed underneath (colour, label) behind the
 * row and reads `data-swipe` ("right" / "left" / absent) on the row to
 * show the matching one. Touch only - desktop keeps the buttons.
 */
export interface SwipeRowOptions {
  onRight?: (() => void) | null;
  onLeft?: (() => void) | null;
  enabled?: boolean;
}

/** Past this share of the row's width (or 110 px), letting go acts. */
const THRESHOLD_SHARE = 0.35;
const THRESHOLD_MAX_PX = 110;
/** Movement before deciding whether this is a sideways swipe or a scroll. */
const LOCK_PX = 8;

export function swipeRow(node: HTMLElement, options: SwipeRowOptions) {
  let opts = options;
  let start: { x: number; y: number } | null = null;
  let dx = 0;
  let locked: "x" | "y" | null = null;
  let suppressClickUntil = 0;

  node.style.touchAction = "pan-y";

  const set = (x: number, animate: boolean) => {
    node.style.transition = animate ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
    node.style.transform = x === 0 ? "" : `translateX(${x}px)`;
    const side = x > 0 && opts.onRight ? "right" : x < 0 && opts.onLeft ? "left" : null;
    if (side) node.dataset.swipe = side;
    else delete node.dataset.swipe;
  };

  const onStart = (e: TouchEvent) => {
    if (opts.enabled === false || e.touches.length !== 1) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    dx = 0;
    locked = null;
  };

  const onMove = (e: TouchEvent) => {
    if (!start) return;
    const mx = e.touches[0].clientX - start.x;
    const my = e.touches[0].clientY - start.y;
    if (!locked) {
      if (Math.abs(mx) < LOCK_PX && Math.abs(my) < LOCK_PX) return;
      locked = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
    }
    if (locked !== "x") return;
    // Only towards a side that does something; a little give the other way.
    dx = (mx > 0 && !opts.onRight) || (mx < 0 && !opts.onLeft) ? mx * 0.15 : mx;
    set(dx, false);
  };

  const onEnd = () => {
    if (!start) return;
    start = null;
    if (locked !== "x") return;
    suppressClickUntil = Date.now() + 400;
    const threshold = Math.min(node.offsetWidth * THRESHOLD_SHARE, THRESHOLD_MAX_PX);
    const action = dx > threshold ? opts.onRight : dx < -threshold ? opts.onLeft : null;
    if (!action) {
      set(0, true);
      return;
    }
    set(Math.sign(dx) * node.offsetWidth, true);
    setTimeout(() => {
      action();
      // The row is usually re-rendered by then; if not, bring it back.
      set(0, false);
    }, 170);
  };

  const onClick = (e: MouseEvent) => {
    if (Date.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  node.addEventListener("touchstart", onStart, { passive: true });
  node.addEventListener("touchmove", onMove, { passive: true });
  node.addEventListener("touchend", onEnd, { passive: true });
  const onCancel = () => {
    start = null;
    set(0, true);
  };
  node.addEventListener("touchcancel", onCancel, { passive: true });
  node.addEventListener("click", onClick, true);

  return {
    update(next: SwipeRowOptions) {
      opts = next;
      if (opts.enabled === false) set(0, false);
    },
    destroy() {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onCancel);
      node.removeEventListener("click", onClick, true);
    },
  };
}
