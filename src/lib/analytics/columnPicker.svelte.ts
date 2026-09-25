/**
 * Which column of a chart is being read - the shared interaction of the
 * Analytics column charts (Fatigue, Training Mix, Outdoor Ascents).
 *
 * Instead of a tooltip per bar or dot (which a finger covers, and which
 * never fits beside an edge column), the whole plot is one target: hover
 * moves the selection on a mouse, a tap picks a column on touch, and the
 * chart prints the selected column in a readout line. Tapping outside the
 * plot, or the same column again, clears it.
 */
import { isTapPointer } from "./chartTips.svelte";

/** The column under `clientX` in a plot spanning `rect`, or null outside it. */
export function columnAt(clientX: number, rect: { left: number; width: number }, count: number): number | null {
  if (count <= 0 || rect.width <= 0) return null;
  const i = Math.floor(((clientX - rect.left) / rect.width) * count);
  return i < 0 || i >= count ? null : i;
}

export class ColumnPicker {
  selected = $state<number | null>(null);
  el: HTMLElement | null = null;
  #count: () => number;

  constructor(count: () => number) {
    this.#count = count;
  }

  #at(event: PointerEvent): number | null {
    return this.el ? columnAt(event.clientX, this.el.getBoundingClientRect(), this.#count()) : null;
  }

  move = (event: PointerEvent) => {
    if (!isTapPointer(event)) this.selected = this.#at(event);
  };

  leave = (event: PointerEvent) => {
    if (!isTapPointer(event)) this.selected = null;
  };

  tap = (event: PointerEvent) => {
    if (!isTapPointer(event)) return;
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
