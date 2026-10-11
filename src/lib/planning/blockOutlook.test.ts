import { describe, it, expect } from "vitest";
import type { ExerciseSlot, TrainingBlock, Workout } from "../types";
import { blockLoadTrend, daysUntilWeek, nextBlock, taperHint } from "./blockOutlook";

const block = (id: string, start: string, end: string): TrainingBlock => ({ id, name: id, phaseId: "p", startWeekId: start, endWeekId: end });

describe("nextBlock", () => {
  it("finds the first block starting after the current week", () => {
    const blocks = [block("later", "2026-W45", "2026-W48"), block("now", "2026-W38", "2026-W41"), block("next", "2026-W42", "2026-W44")];
    expect(nextBlock(blocks, "2026-W39")?.id).toBe("next");
    expect(nextBlock(blocks, "2026-W48")).toBeUndefined();
  });
});

describe("daysUntilWeek", () => {
  it("counts days to the week's Monday, never negative", () => {
    // 2026-W40 starts Monday 2026-09-28.
    expect(daysUntilWeek("2026-W40", "2026-09-22")).toBe(6);
    expect(daysUntilWeek("2026-W39", "2026-09-22")).toBe(0);
  });
});

describe("taperHint", () => {
  it("speaks up inside the window when the phase isn't a taper", () => {
    expect(taperHint(10, "Strength")).toBe("Taper window - the current phase is Strength, not a taper or peak phase.");
    expect(taperHint(3, undefined)).toContain("no phase covers this week");
  });

  it("stays quiet outside the window or during a taper-like phase", () => {
    expect(taperHint(20, "Strength")).toBeUndefined();
    expect(taperHint(undefined, "Strength")).toBeUndefined();
    expect(taperHint(5, "Taper")).toBeUndefined();
    expect(taperHint(5, "Peak Performance")).toBeUndefined();
  });
});

describe("blockLoadTrend", () => {
  const slot = { id: "s", typeId: "t", prescribed: { duration: 60, plannedLoad: 5 } } as ExerciseSlot;
  const w = (weekId: string, status: "planned" | "completed") =>
    ({ id: weekId + status, status, date: status === "completed" ? "2026-09-21" : null, weekId, loadFactor: 0, exercises: [slot] }) as Workout;

  it("counts every session's plan, but only logged sessions as actual", () => {
    const byWeek: Record<string, Workout[]> = {
      "2026-W38": [w("2026-W38", "completed"), w("2026-W38", "completed")],
      "2026-W39": [w("2026-W39", "completed"), w("2026-W39", "planned")],
      "2026-W40": [w("2026-W40", "planned")],
    };
    const bars = blockLoadTrend(["2026-W38", "2026-W39", "2026-W40"], (id) => byWeek[id] ?? []);
    const one = bars[2].planned;
    expect(one).toBeGreaterThan(0);
    expect(bars.map((b) => b.planned)).toEqual([2 * one, 2 * one, one]);
    expect(bars.map((b) => b.actual)).toEqual([2 * one, one, 0]);
  });
});
