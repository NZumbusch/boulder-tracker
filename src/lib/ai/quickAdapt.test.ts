import { describe, it, expect } from "vitest";
import { QUICK_ADAPTS, spanWeeks, withGoal, toggleGoal, loadLastRequest, saveLastRequest } from "./quickAdapt";

describe("quick adapt", () => {
  it("covers the weeks each span says, across a year end", () => {
    expect(spanWeeks("thisWeek", "2026-W52")).toEqual({ start: "2026-W52", end: "2026-W52" });
    expect(spanWeeks("thisAndNext", "2026-W53")).toEqual({ start: "2026-W53", end: "2027-W01" });
    expect(spanWeeks("nextWeek", "2026-W41")).toEqual({ start: "2026-W42", end: "2026-W42" });
    expect(spanWeeks("nextTwo", "2026-W41")).toEqual({ start: "2026-W42", end: "2026-W43" });
  });

  it("keeps what was typed and adds the chip's text after it", () => {
    expect(withGoal("", "Lighten it")).toBe("Lighten it");
    expect(withGoal("  ", "Lighten it")).toBe("Lighten it");
    expect(withGoal("Trip on Friday", "Lighten it")).toBe("Trip on Friday\nLighten it");
    expect(withGoal("Lighten it", "Lighten it")).toBe("Lighten it");
  });

  it("has unique ids", () => {
    expect(new Set(QUICK_ADAPTS.map((q) => q.id)).size).toBe(QUICK_ADAPTS.length);
  });

  it("remembers the last request", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadLastRequest(store)).toBeUndefined();
    saveLastRequest({ goal: "  ", start: "a", end: "b" }, store);
    expect(loadLastRequest(store)).toBeUndefined();
    saveLastRequest({ goal: "Plan next week", start: "2026-W42", end: "2026-W42" }, store);
    expect(loadLastRequest(store)?.goal).toBe("Plan next week");
  });
});

describe("toggleGoal", () => {
  const all = ["A text", "B text"];
  it("selects, swaps to another chip, keeps typed text and deselects", () => {
    expect(toggleGoal("", "A text", all)).toBe("A text");
    expect(toggleGoal("A text", "B text", all)).toBe("B text");
    expect(toggleGoal("Trip Friday\nA text", "B text", all)).toBe("Trip Friday\nB text");
    expect(toggleGoal("Trip Friday\nB text", "B text", all)).toBe("Trip Friday");
  });
});
