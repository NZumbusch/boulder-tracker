import { describe, it, expect } from "vitest";
import { swipeDirection, SWIPE_MIN_DISTANCE_PX } from "./swipe";

describe("swipeDirection", () => {
  it("swiping right goes to earlier weeks, left to later ones", () => {
    expect(swipeDirection(120, 5)).toBe("prev");
    expect(swipeDirection(-120, 5)).toBe("next");
  });

  it("ignores short gestures - a tap or a wobble is not a swipe", () => {
    expect(swipeDirection(SWIPE_MIN_DISTANCE_PX - 1, 0)).toBeNull();
    expect(swipeDirection(-10, 2)).toBeNull();
  });

  it("leaves diagonal and vertical gestures to the page scroll", () => {
    expect(swipeDirection(80, 70)).toBeNull();
    expect(swipeDirection(5, 300)).toBeNull();
  });

  it("accepts a slightly diagonal but clearly sideways swipe", () => {
    expect(swipeDirection(-150, 60)).toBe("next");
  });

  it("returns null for non-finite input", () => {
    expect(swipeDirection(NaN, 0)).toBeNull();
  });
});
