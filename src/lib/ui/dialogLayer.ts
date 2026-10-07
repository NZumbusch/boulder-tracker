import { backDepth } from "../navigation/backStack.svelte";

/**
 * Makes the app's full-screen overlays behave as dialogs for keyboards and
 * screen readers, in one place rather than in each of the sheets: the top
 * overlay gets `role="dialog"` and `aria-modal`, everything behind it is made
 * `inert` (so Tab no longer walks through the page underneath), focus moves
 * into it when it opens, and Escape closes it the way Back does.
 *
 * An overlay is a visible `fixed inset-0` element with a `z-[100+]` class.
 * The guided tour is left alone: it points at things in the page.
 */
const OVERLAY = '.fixed.inset-0[class*="z-["]';
const MARK = "data-dialog-inert";

function zOf(el: Element): number {
  const m = el.getAttribute("class")?.match(/\bz-\[(\d+)\]/);
  return m ? Number(m[1]) : 0;
}

function overlays(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(OVERLAY)]
    .filter((el) => zOf(el) >= 100 && el.getClientRects().length > 0 && !el.getAttribute("aria-label")?.startsWith("Tour"))
    .sort((a, b) => zOf(a) - zOf(b));
}

let lastTop: HTMLElement | null = null;

function update() {
  document.querySelectorAll(`[${MARK}]`).forEach((el) => {
    el.removeAttribute("inert");
    el.removeAttribute(MARK);
  });
  const top = overlays().pop() ?? null;
  if (!top) {
    lastTop = null;
    return;
  }
  if (!top.getAttribute("role")) top.setAttribute("role", "dialog");
  top.setAttribute("aria-modal", "true");
  // Everything that is not the overlay or one of its ancestors.
  for (let node: HTMLElement = top; node.parentElement; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
      sibling.setAttribute("inert", "");
      sibling.setAttribute(MARK, "");
    }
  }
  if (top !== lastTop) {
    lastTop = top;
    if (!top.contains(document.activeElement)) {
      if (!top.hasAttribute("tabindex")) top.setAttribute("tabindex", "-1");
      top.focus({ preventScroll: true });
    }
  }
}

/** Starts watching; returns the stop function. */
export function installDialogLayer(): () => void {
  if (typeof document === "undefined") return () => {};
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    // A timer, not a frame: frames stop in a background tab, and the layer should still be right when it returns.
    setTimeout(() => {
      queued = false;
      update();
    }, 16);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  const onKey = (e: KeyboardEvent) => {
    // Back's own entry is the history one: stepping back closes the top thing.
    if (e.key === "Escape" && !e.defaultPrevented && backDepth() > 0 && overlays().length > 0) window.history.back();
  };
  document.addEventListener("keydown", onKey);
  schedule();
  return () => {
    observer.disconnect();
    document.removeEventListener("keydown", onKey);
  };
}
