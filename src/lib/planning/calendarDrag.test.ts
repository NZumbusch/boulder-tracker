import { describe, it, expect } from "vitest";
import { snapMinutes, dropTarget, DRAG_HOLD_MS, DRAG_SLOP_PX } from "./calendarDrag";

const columns = [0, 1, 2].map((i) => ({ left: 100 + i * 50, right: 150 + i * 50, top: 200 }));
const base = { columns, hourPx: 44, firstHour: 6, durationMin: 60, grabOffsetY: 0 };

describe("snapMinutes", () => {
  it("rounds to the nearest quarter hour", () => {
    expect(snapMinutes(0)).toBe(0);
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(18 * 60 + 52)).toBe(18 * 60 + 45);
    expect(snapMinutes(18 * 60 + 53)).toBe(19 * 60);
  });
});

describe("dropTarget", () => {
  it("finds the column under the pointer and the time at its height", () => {
    // 44 px an hour from 06:00: 88 px below the top is 08:00.
    expect(dropTarget({ ...base, pointerX: 160, pointerY: 288 })).toEqual({ column: 1, startMin: 8 * 60 });
    expect(dropTarget({ ...base, pointerX: 101, pointerY: 200 })).toEqual({ column: 0, startMin: 6 * 60 });
    expect(dropTarget({ ...base, pointerX: 249, pointerY: 200 })).toEqual({ column: 2, startMin: 6 * 60 });
  });
  it("takes the block's top, not the finger's: where it was grabbed is kept", () => {
    // Grabbed 22 px (half an hour) down the block, finger now 88 px + 22 below the top: the block starts at 08:00.
    expect(dropTarget({ ...base, pointerX: 160, pointerY: 310, grabOffsetY: 22 })).toEqual({ column: 1, startMin: 8 * 60 });
  });
  it("snaps to the quarter hour", () => {
    expect(dropTarget({ ...base, pointerX: 160, pointerY: 200 + 44 * 2.3 })?.startMin).toBe(8 * 60 + 15); // 08:18 -> 08:15
  });
  it("is nothing outside the columns - a drop there cancels", () => {
    expect(dropTarget({ ...base, pointerX: 99, pointerY: 288 })).toBeNull();
    expect(dropTarget({ ...base, pointerX: 250, pointerY: 288 })).toBeNull();
  });
  it("keeps the whole block inside the day", () => {
    expect(dropTarget({ ...base, pointerX: 160, pointerY: 200 - 500 })?.startMin).toBe(0);
    expect(dropTarget({ ...base, pointerX: 160, pointerY: 200 + 2000 })?.startMin).toBe(24 * 60 - 60);
    expect(dropTarget({ ...base, durationMin: 600, pointerX: 160, pointerY: 200 + 2000 })?.startMin).toBe(24 * 60 - 600);
  });
});

describe("the hold", () => {
  it("is a deliberate press, so a scroll or swipe never starts a drag", () => {
    expect(DRAG_HOLD_MS).toBeGreaterThanOrEqual(300);
    expect(DRAG_SLOP_PX).toBeGreaterThanOrEqual(6);
  });
});
