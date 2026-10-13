import { describe, it, expect } from "vitest";
import { ZOOM_MIN, ZOOM_MAX, clampZoom, pinchZoom, wheelZoom, scrollAfterZoom, showsExercises, EXERCISES_FROM_PX } from "./calendarZoom";

describe("zoom", () => {
  it("stays between the least and the most", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(NaN)).toBe(1);
  });
  it("follows the fingers: twice as far apart is twice as tall", () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(1.5, 200, 100)).toBe(0.75);
    expect(pinchZoom(1, 100, 100000)).toBe(ZOOM_MAX);
  });
  it("ignores a pinch from nothing", () => {
    expect(pinchZoom(1.3, 0, 120)).toBe(1.3);
  });
  it("ctrl + wheel zooms smoothly: scrolling up zooms in", () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100)).toBeLessThan(1);
    expect(wheelZoom(1, 0)).toBe(1);
  });
});

describe("keeping the time under the fingers in place", () => {
  it("scrolls so the minute that was under the focus is still under it", () => {
    // Focus 100 px below the grid's top, an hour is 50 px: that's minute 120. At 100 px an hour it sits at 200 px, so scroll 100 px further.
    expect(scrollAfterZoom({ scrollTop: 400, focusY: 100, hourPxBefore: 50, hourPxAfter: 100 })).toBe(500);
    expect(scrollAfterZoom({ scrollTop: 400, focusY: 100, hourPxBefore: 100, hourPxAfter: 50 })).toBe(350);
  });
  it("never scrolls above the top", () => {
    expect(scrollAfterZoom({ scrollTop: 10, focusY: 100, hourPxBefore: 100, hourPxAfter: 20 })).toBe(0);
  });
});

describe("when a session shows its exercises as blocks", () => {
  it("once it is tall enough, and has more than one exercise", () => {
    expect(showsExercises(EXERCISES_FROM_PX, 3)).toBe(true);
    expect(showsExercises(EXERCISES_FROM_PX - 1, 3)).toBe(false);
    expect(showsExercises(500, 1)).toBe(false);
    expect(showsExercises(500, 0)).toBe(false);
  });
});
