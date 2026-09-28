/**
 * Svelte action: holding a finger on `node` for half a second calls
 * `onLongPress` (with a haptic tick), and the tap that would follow is
 * swallowed so the row doesn't also open. Moving more than a few pixels
 * first (a scroll, a swipe) cancels it. A right-click does the same on
 * desktop. `null` switches it off (e.g. while arranging).
 */
import { haptic } from "../native/haptics";

const HOLD_MS = 480;

/**
 * The tap that ends a long-press lands wherever the finger lifts - by then
 * usually on the sheet the long-press just opened (its first button). So
 * the next click anywhere is swallowed, briefly.
 */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  const done = () => {
    document.removeEventListener("click", stop, true);
    clearTimeout(timeout);
  };
  document.addEventListener("click", stop, true);
  const timeout = setTimeout(done, 700);
}
const MOVE_PX = 10;

export function longPress(node: HTMLElement, onLongPress: (() => void) | null) {
  let handler = onLongPress;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  let fired = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    start = null;
  };

  const onStart = (e: TouchEvent) => {
    if (!handler || e.touches.length !== 1) return;
    fired = false;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    timer = setTimeout(() => {
      fired = true;
      timer = undefined;
      haptic("select");
      swallowNextClick();
      handler?.();
    }, HOLD_MS);
  };
  const onMove = (e: TouchEvent) => {
    if (!start) return;
    if (Math.abs(e.touches[0].clientX - start.x) > MOVE_PX || Math.abs(e.touches[0].clientY - start.y) > MOVE_PX) cancel();
  };
  const onContextMenu = (e: MouseEvent) => {
    if (!handler) return;
    e.preventDefault();
    // A touch long-press also raises contextmenu on Android - already handled.
    if (fired) return;
    handler();
  };

  node.addEventListener("touchstart", onStart, { passive: true });
  node.addEventListener("touchmove", onMove, { passive: true });
  node.addEventListener("touchend", cancel, { passive: true });
  node.addEventListener("touchcancel", cancel, { passive: true });
  node.addEventListener("contextmenu", onContextMenu);
  // No text-selection callout under a held finger.
  node.style.setProperty("-webkit-touch-callout", "none");

  return {
    update(next: (() => void) | null) {
      handler = next;
      if (!next) cancel();
    },
    destroy() {
      cancel();
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", cancel);
      node.removeEventListener("touchcancel", cancel);
      node.removeEventListener("contextmenu", onContextMenu);
    },
  };
}
