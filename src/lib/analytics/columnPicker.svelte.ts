/**
 * Which column of a chart is being read - the shared interaction of the
 * Analytics column charts (Fatigue, Training Mix, Outdoor Ascents).
 *
 * Instead of a tooltip per bar or dot (which a finger covers, and which
 * never fits beside an edge column), the whole plot is one target: hover
 * moves the selection on a mouse, a tap picks a column on touch, and the
 * chart prints the selected column in a readout line. Tapping outside the
 * plot, or the same column again, clears it. A swipe across the plot is
 * not a tap (see `TapTracker`). Wire all four handlers: down, move, leave
 * and tap (on pointerup).
 */
import { isTapPointer } from "./chartTips.svelte";

/** A finger moving less than this between down and up is a tap; more is a swipe or scroll. */
export const TAP_SLOP_PX = 10;

export function isTapMovement(down: { x: number; y: number } | null, up: { x: number; y: number }): boolean {
  return !!down && Math.abs(up.x - down.x) < TAP_SLOP_PX && Math.abs(up.y - down.y) < TAP_SLOP_PX;
}

/**
 * Tells a tap from the end of a swipe. The Analytics panels let a sideways
 * swipe through to the page (it pages the window), so a `pointerup` on a
 * chart can be the end of a swipe - which must not also select a column.
 */
export class TapTracker {
  #down: { x: number; y: number } | null = null;
  down = (event: PointerEvent) => {
    this.#down = { x: event.clientX, y: event.clientY };
  };
  /** Whether this `pointerup` ends a tap (and resets for the next gesture). */
  isTap(event: PointerEvent): boolean {
    const tap = isTapMovement(this.#down, { x: event.clientX, y: event.clientY });
    this.#down = null;
    return tap;
  }
}

/** The column under `clientX` in a plot spanning `rect`, or null outside it. */
export function columnAt(clientX: number, rect: { left: number; width: number }, count: number): number | null {
  if (count <= 0 || rect.width <= 0) return null;
  const i = Math.floor(((clientX - rect.left) / rect.width) * count);
  return i < 0 || i >= count ? null : i;
}

/**
 * Where an arrow-key press moves the selected column: Left/Right step one
 * (starting from the newest column when nothing is selected yet), Home and
 * End jump to the ends, Escape clears. `undefined` for any other key, so a
 * handler knows to leave it alone.
 */
export function stepColumn(current: number | null, count: number, key: string): number | null | undefined {
  if (count <= 0) return key === "Escape" ? null : undefined;
  switch (key) {
    case "ArrowLeft":
      return current === null ? count - 1 : Math.max(0, current - 1);
    case "ArrowRight":
      return current === null ? count - 1 : Math.min(count - 1, current + 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "Escape":
      return null;
    default:
      return undefined;
  }
}

export class ColumnPicker {
  selected = $state<number | null>(null);
  el: HTMLElement | null = null;
  #count: () => number;
  #taps = new TapTracker();

  constructor(count: () => number) {
    this.#count = count;
  }

  /** The keyboard route: put on the focusable plot (`tabindex="0"`) as `onkeydown`. Arrow keys walk the columns. */
  key = (event: KeyboardEvent) => {
    const next = stepColumn(this.selected, this.#count(), event.key);
    if (next === undefined) return;
    event.preventDefault();
    this.selected = next;
  };

  #at(event: PointerEvent): number | null {
    return this.el ? columnAt(event.clientX, this.el.getBoundingClientRect(), this.#count()) : null;
  }

  move = (event: PointerEvent) => {
    if (!isTapPointer(event)) this.selected = this.#at(event);
  };

  leave = (event: PointerEvent) => {
    if (!isTapPointer(event)) this.selected = null;
  };

  down = (event: PointerEvent) => this.#taps.down(event);

  tap = (event: PointerEvent) => {
    if (!isTapPointer(event) || !this.#taps.isTap(event)) return;
    const i = this.#at(event);
    this.selected = i === this.selected ? null : i;
  };

  /** Clears on a pointerdown outside the plot. Returns its teardown, for `$effect`. */
  listen(): () => void {
    if (typeof document === "undefined") return () => {};
    const onDown = (event: PointerEvent) => {
      if (this.el && !this.el.contains(event.target as Node)) this.selected = null;
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }
}
