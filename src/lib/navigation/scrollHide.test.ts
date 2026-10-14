import { describe, expect, it } from "vitest";
import { initialScrollHide, nextScrollHide, type ScrollHideState } from "./scrollHide";

const run = (positions: number[], opts?: { atEnd?: boolean }, from: ScrollHideState = initialScrollHide) =>
  positions.reduce((s, p) => nextScrollHide(s, p, opts), from);

describe("nextScrollHide", () => {
  it("stays visible near the top", () => {
    expect(run([10, 30, 48]).hidden).toBe(false);
  });
  it("hides when scrolled down through content", () => {
    expect(run([100, 140, 200]).hidden).toBe(true);
  });
  it("comes back on scrolling up", () => {
    expect(run([100, 200, 300, 280, 250]).hidden).toBe(false);
  });
  it("ignores a little jitter", () => {
    const hidden = run([100, 200, 300]);
    expect(run([296, 300, 297], undefined, hidden).hidden).toBe(true);
  });
  it("measures a reversal from where it turned, not from where the scroll began", () => {
    // down to 1000 (hidden), a small drift back of 10 px does not bring it back, 20 px does
    const hidden = run([100, 400, 1000]);
    expect(nextScrollHide(hidden, 990).hidden).toBe(true);
    expect(nextScrollHide(hidden, 980).hidden).toBe(false);
  });
  it("is shown again at the end, and at the top", () => {
    const hidden = run([100, 400, 1000]);
    expect(nextScrollHide(hidden, 1100, { atEnd: true }).hidden).toBe(false);
    expect(nextScrollHide(hidden, 0).hidden).toBe(false);
  });
});
