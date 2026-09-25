import { describe, it, expect } from "vitest";
import { columnAt, isTapMovement } from "./columnPicker.svelte";

describe("columnAt", () => {
  const rect = { left: 100, width: 200 };
  it("maps x to its column", () => {
    expect(columnAt(100, rect, 4)).toBe(0);
    expect(columnAt(199, rect, 4)).toBe(1);
    expect(columnAt(299, rect, 4)).toBe(3);
  });
  it("is null outside the plot or with nothing to pick", () => {
    expect(columnAt(99, rect, 4)).toBeNull();
    expect(columnAt(300, rect, 4)).toBeNull();
    expect(columnAt(150, rect, 0)).toBeNull();
  });
});

describe("isTapMovement", () => {
  it("accepts a still finger and rejects a swipe or a missing down", () => {
    expect(isTapMovement({ x: 10, y: 10 }, { x: 14, y: 12 })).toBe(true);
    expect(isTapMovement({ x: 10, y: 10 }, { x: 90, y: 12 })).toBe(false);
    expect(isTapMovement(null, { x: 10, y: 10 })).toBe(false);
  });
});
