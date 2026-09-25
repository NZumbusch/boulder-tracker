import { describe, it, expect } from "vitest";
import { columnAt } from "./columnPicker.svelte";

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
