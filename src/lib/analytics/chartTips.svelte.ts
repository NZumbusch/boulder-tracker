/**
 * Which chart tooltip is open, for touch devices.
 *
 * The charts reveal their tooltips on hover, which simply does not exist
 * on a phone - so every ACWR dot, bar segment and ascent was unreadable
 * there. Hover still does the work on a pointer device (see `.chart-tip`
 * in `app.css`); this adds the tap path beside it.
 *
 * One open tooltip at a time, per chart: two overlapping popups on a
 * 360px-wide screen is worse than none.
 */
export class ChartTips {
  openId = $state<string | null>(null);

  isOpen(id: string): boolean {
    return this.openId === id;
  }

  /** Tapping the open point closes it; tapping another moves to it. */
  toggle(id: string) {
    this.openId = this.openId === id ? null : id;
  }

  /**
   * Opens without toggling - for hover, where re-entering the same point
   * must not close it.
   *
   * Most charts leave hover to CSS, but a tooltip that has to be rendered
   * outside its trigger (to escape an `overflow-hidden` ancestor) can't be
   * reached by `:hover` on that trigger, so those charts drive hover
   * through here instead.
   */
  open(id: string) {
    this.openId = id;
  }

  close() {
    this.openId = null;
  }

  /** Closes only if this exact point is the open one, so leaving one point can't dismiss another. */
  closeIf(id: string) {
    if (this.openId === id) this.openId = null;
  }

  /**
   * Closes on a tap anywhere that isn't a chart point. Returns its own
   * teardown, so it is used straight from an `$effect`.
   *
   * Listens on `pointerdown` in the capture phase: a tooltip must go away
   * as soon as you touch elsewhere, including on a scroll that starts
   * outside it, rather than waiting for a click that may never come.
   */
  listen(): () => void {
    if (typeof document === "undefined") return () => {};

    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-tip-trigger]")) return;
      this.openId = null;
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }
}
