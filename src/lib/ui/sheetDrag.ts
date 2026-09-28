/**
 * Svelte action for a bottom sheet's panel: drag it down to close, like a
 * native Android sheet. Adds the grab handle at the top.
 *
 * A downward drag only takes over when whatever the finger is on is
 * already scrolled to its top - so a long sheet still scrolls, and pulling
 * down from its top closes it. Past 110 px (or a quick flick) it slides
 * away and `onClose` runs; short of that it springs back. Phone layout
 * only: from the `sm` breakpoint up the sheet is a centred dialog.
 */
const CLOSE_PX = 110;
const FLICK_PX_PER_MS = 0.6;
const LOCK_PX = 8;

function scrolledToTop(from: EventTarget | null, panel: HTMLElement): boolean {
  let el = from instanceof Element ? from : null;
  while (el && el !== panel.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return false;
    if (el === panel) break;
    el = el.parentElement;
  }
  return true;
}

export function sheetDrag(node: HTMLElement, onClose: () => void) {
  let close = onClose;
  const wide = () => typeof window !== "undefined" && window.matchMedia?.("(min-width: 640px)").matches;

  if (getComputedStyle(node).position === "static") node.style.position = "relative";
  const handle = document.createElement("div");
  handle.setAttribute("aria-hidden", "true");
  handle.className = "sm:hidden absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-border-strong z-30 pointer-events-none";
  node.prepend(handle);

  let start: { x: number; y: number; t: number; target: EventTarget | null } | null = null;
  let dragging = false;
  let decided = false;
  let dy = 0;

  const set = (y: number, animate: boolean) => {
    node.style.transition = animate ? "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
    node.style.transform = y > 0 ? `translateY(${y}px)` : "";
  };

  const onStart = (e: TouchEvent) => {
    if (wide() || e.touches.length !== 1) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), target: e.target };
    dragging = false;
    decided = false;
    dy = 0;
  };

  const onMove = (e: TouchEvent) => {
    if (!start) return;
    const mx = e.touches[0].clientX - start.x;
    const my = e.touches[0].clientY - start.y;
    if (!decided) {
      if (Math.abs(mx) < LOCK_PX && Math.abs(my) < LOCK_PX) return;
      decided = true;
      // A slider or a sideways swipe inside the sheet isn't a close.
      const onControl = start.target instanceof Element && start.target.closest("[role='slider'], input, textarea, select, [data-no-sheet-drag]");
      dragging = my > 0 && my > Math.abs(mx) && !onControl && scrolledToTop(start.target, node);
    }
    if (!dragging) return;
    e.preventDefault(); // no scroll or pull-to-refresh underneath
    dy = Math.max(0, my);
    set(dy, false);
  };

  const onEnd = () => {
    if (!start) return;
    const elapsed = Math.max(1, Date.now() - start.t);
    start = null;
    if (!dragging) return;
    dragging = false;
    if (dy > CLOSE_PX || dy / elapsed > FLICK_PX_PER_MS) {
      set(node.offsetHeight, true);
      setTimeout(() => {
        close();
        // Still here (it asked "discard changes?" and was kept): bring it back.
        setTimeout(() => { if (node.isConnected) set(0, true); }, 250);
      }, 180);
    } else {
      set(0, true);
    }
  };

  node.addEventListener("touchstart", onStart, { passive: true });
  node.addEventListener("touchmove", onMove, { passive: false });
  node.addEventListener("touchend", onEnd, { passive: true });
  node.addEventListener("touchcancel", onEnd, { passive: true });

  return {
    update(next: () => void) {
      close = next;
    },
    destroy() {
      handle.remove();
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    },
  };
}
