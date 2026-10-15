import { describe, it, expect } from "vitest";
import { columnAt, isTapMovement, stepColumn } from "./columnPicker.svelte";

describe("stepColumn", () => {
  it("starts from the newest column and walks with the arrows, staying inside the plot", () => {
    expect(stepColumn(null, 5, "ArrowLeft")).toBe(4);
    expect(stepColumn(null, 5, "ArrowRight")).toBe(4);
    expect(stepColumn(3, 5, "ArrowLeft")).toBe(2);
    expect(stepColumn(0, 5, "ArrowLeft")).toBe(0);
    expect(stepColumn(4, 5, "ArrowRight")).toBe(4);
  });
  it("jumps to the ends, clears on Escape and ignores other keys", () => {
    expect(stepColumn(2, 5, "Home")).toBe(0);
    expect(stepColumn(2, 5, "End")).toBe(4);
    expect(stepColumn(2, 5, "Escape")).toBeNull();
    expect(stepColumn(2, 5, "a")).toBeUndefined();
    expect(stepColumn(null, 0, "ArrowLeft")).toBeUndefined();
  });
});

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
