/*
 * Whether the screen is compact (a portrait phone: the menu opens a drawer)
 * or wide (a tablet, a laptop, a phone on its side: a rail stays on the left).
 * Tracked live, so a rotation or a resized window re-lays the app out.
 */

export const WIDE_MIN_WIDTH = 768;
/** A phone on its side: little height, wider than tall. */
const SHORT_MAX_HEIGHT = 500;

export type LayoutMode = "compact" | "wide";

export function layoutFor(width: number, height: number): LayoutMode {
  if (width >= WIDE_MIN_WIDTH) return "wide";
  return height <= SHORT_MAX_HEIGHT && width > height ? "wide" : "compact";
}

class Layout {
  mode = $state<LayoutMode>(typeof window === "undefined" ? "compact" : layoutFor(window.innerWidth, window.innerHeight));

  constructor() {
    if (typeof window === "undefined") return;
    const update = () => (this.mode = layoutFor(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
  }

  get wide() {
    return this.mode === "wide";
  }
}

export const layout = new Layout();
