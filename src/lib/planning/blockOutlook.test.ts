import { describe, it, expect } from "vitest";
import type { ExerciseSlot, TrainingBlock, Workout } from "../types";
import { blockLoadTrend, daysUntilDate, nextBlock, taperHint } from "./blockOutlook";
import { weekMondayIso, weekSundayIso } from "../dateUtils";

const block = (id: string, start: string, end: string): TrainingBlock => ({ id, name: id, phaseId: "p", startDate: weekMondayIso(start), endDate: weekSundayIso(end) });

describe("nextBlock", () => {
  it("finds the first block starting after today", () => {
    const blocks = [block("later", "2026-W45", "2026-W48"), block("now", "2026-W38", "2026-W41"), block("next", "2026-W42", "2026-W44")];
    expect(nextBlock(blocks, "2026-09-24")?.id).toBe("next"); // a Thursday in W39
    expect(nextBlock(blocks, "2026-11-30")).toBeUndefined();
  });
  it("counts a block that starts later this week, and not one that starts today", () => {
    const midWeek: TrainingBlock = { id: "mid", name: "mid", phaseId: "p", startDate: "2026-09-26", endDate: "2026-10-04" };
    expect(nextBlock([midWeek], "2026-09-24")?.id).toBe("mid");
    expect(nextBlock([midWeek], "2026-09-26")).toBeUndefined();
  });
});

describe("daysUntilDate", () => {
  it("counts the days, never negative", () => {
    expect(daysUntilDate("2026-09-28", "2026-09-22")).toBe(6);
    expect(daysUntilDate("2026-09-21", "2026-09-22")).toBe(0);
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
