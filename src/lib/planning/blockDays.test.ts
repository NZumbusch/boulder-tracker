import { describe, it, expect } from "vitest";
import { blockStartDate, blockEndDate, withBlockDates, phaseOnDay, phasesInWeek, winningPhaseOfWeek, getDominantBlockForWeek } from "./trainingBlocks";
import { getWeekIdRange } from "../dateUtils";
import type { TrainingBlock } from "../types";

const b = (id: string, over: Partial<TrainingBlock> = {}): TrainingBlock => ({ id, name: id, phaseId: "phase-x", startWeekId: "2026-W41", endWeekId: "2026-W41", ...over });

describe("a block's days", () => {
  it("come from the weeks when the block has no dates yet: Monday of the first, Sunday of the last", () => {
    const block = b("a", { startWeekId: "2026-W40", endWeekId: "2026-W42" });
    expect(blockStartDate(block)).toBe("2026-09-28");
    expect(blockEndDate(block)).toBe("2026-10-18");
  });

  it("are the stored dates when there are some", () => {
    const block = b("a", { startDate: "2026-10-07", endDate: "2026-10-15" });
    expect(blockStartDate(block)).toBe("2026-10-07");
    expect(blockEndDate(block)).toBe("2026-10-15");
  });

  it("withBlockDates writes the dates of the weeks, over whatever was there (the weeks still decide for now)", () => {
    const out = withBlockDates(b("a", { startWeekId: "2026-W41", endWeekId: "2026-W42", startDate: "2020-01-01", endDate: "2020-01-02" }));
    expect(out).toMatchObject({ startDate: "2026-10-05", endDate: "2026-10-18" });
  });

  it("withBlockDates leaves a block with unusable week ids alone instead of inventing dates", () => {
    const odd = b("a", { startWeekId: "", endWeekId: "" });
    expect(withBlockDates(odd)).toEqual(odd);
  });
});

describe("phaseOnDay", () => {
  const blocks = [
    b("early", { startDate: "2026-10-05", endDate: "2026-10-07" }),
    b("late", { startDate: "2026-10-08", endDate: "2026-10-18" }),
  ];
  it("finds the block on a day, both ends included", () => {
    expect(phaseOnDay(blocks, "2026-10-05")?.id).toBe("early");
    expect(phaseOnDay(blocks, "2026-10-07")?.id).toBe("early");
    expect(phaseOnDay(blocks, "2026-10-08")?.id).toBe("late");
    expect(phaseOnDay(blocks, "2026-10-18")?.id).toBe("late");
    expect(phaseOnDay(blocks, "2026-10-19")).toBeUndefined();
    expect(phaseOnDay(blocks, "2026-10-04")).toBeUndefined();
  });
  it("lets priority decide where blocks overlap, then the one created later", () => {
    const overlap = [b("one", { startDate: "2026-10-05", endDate: "2026-10-11" }), b("two", { startDate: "2026-10-07", endDate: "2026-10-09" }), b("top", { startDate: "2026-10-08", endDate: "2026-10-08", priority: 3 })];
    expect(phaseOnDay(overlap, "2026-10-06")?.id).toBe("one");
    expect(phaseOnDay(overlap, "2026-10-07")?.id).toBe("two");
    expect(phaseOnDay(overlap, "2026-10-08")?.id).toBe("top");
    expect(phaseOnDay(overlap, "2026-10-10")?.id).toBe("one");
  });
});

describe("phasesInWeek", () => {
  it("lists each phase with its days, in the order they start - a week can hold two or three", () => {
    const blocks = [
      b("a", { startDate: "2026-10-01", endDate: "2026-10-06" }),
      b("b", { startDate: "2026-10-07", endDate: "2026-10-08" }),
      b("c", { startDate: "2026-10-09", endDate: "2026-11-01" }),
    ];
    const week = phasesInWeek(blocks, "2026-W41");
    expect(week.map((p) => p.block.id)).toEqual(["a", "b", "c"]);
    expect(week.map((p) => p.days)).toEqual([["2026-10-05", "2026-10-06"], ["2026-10-07", "2026-10-08"], ["2026-10-09", "2026-10-10", "2026-10-11"]]);
  });
  it("is empty for a week no block touches", () => {
    expect(phasesInWeek([b("a", { startDate: "2026-10-12", endDate: "2026-10-18" })], "2026-W41")).toEqual([]);
  });
  it("counts only the days a block wins, so an overlapped stretch is shown once", () => {
    const blocks = [b("a", { startDate: "2026-10-05", endDate: "2026-10-11" }), b("hi", { startDate: "2026-10-08", endDate: "2026-10-09", priority: 1 })];
    const week = phasesInWeek(blocks, "2026-W41");
    expect(week.map((p) => [p.block.id, p.days.length])).toEqual([["a", 5], ["hi", 2]]);
  });
});

describe("winningPhaseOfWeek", () => {
  it("is the phase with most days in the week", () => {
    const blocks = [b("a", { startDate: "2026-10-05", endDate: "2026-10-07" }), b("b", { startDate: "2026-10-08", endDate: "2026-10-11" })];
    expect(winningPhaseOfWeek(blocks, "2026-W41")?.id).toBe("b");
  });
  it("lets priority beat days", () => {
    const blocks = [b("long", { startDate: "2026-10-05", endDate: "2026-10-10" }), b("comp", { startDate: "2026-10-11", endDate: "2026-10-11", priority: 2 })];
    expect(winningPhaseOfWeek(blocks, "2026-W41")?.id).toBe("comp");
  });
  it("gives a tie to the block created later", () => {
    const first = [b("a", { startDate: "2026-10-05", endDate: "2026-10-07" }), b("c", { startDate: "2026-10-09", endDate: "2026-10-11" })];
    expect(winningPhaseOfWeek(first, "2026-W41")?.id).toBe("c");
    expect(winningPhaseOfWeek([...first].reverse(), "2026-W41")?.id).toBe("a");
  });
  it("is undefined when nothing covers the week", () => {
    expect(winningPhaseOfWeek([], "2026-W41")).toBeUndefined();
  });
});

/**
 * Stage 1 changes how a block is stored, not what the app shows: for blocks
 * that are whole weeks, the new answer for every week has to be the old one.
 */
describe("whole-week blocks give the answers they gave before", () => {
  function rng(seed: number) {
    return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  }
  const weeks = getWeekIdRange("2026-W44", "2027-W06"); // over New Year and week 53

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("random plan %i: dominant block, covering blocks and week answers agree", (seed) => {
    const next = rng(seed);
    const blocks = Array.from({ length: 2 + Math.floor(next() * 6) }, (_, i) => {
      const from = Math.floor(next() * weeks.length);
      const to = Math.min(weeks.length - 1, from + Math.floor(next() * 6));
      return withBlockDates(b(`b${i}`, { startWeekId: weeks[from], endWeekId: weeks[to], priority: next() < 0.3 ? Math.floor(next() * 3) : undefined }));
    });
    for (const week of weeks) {
      expect(winningPhaseOfWeek(blocks, week)?.id).toBe(getDominantBlockForWeek(blocks, week)?.id);
      const phases = phasesInWeek(blocks, week);
      expect(phases.length).toBeLessThanOrEqual(1 + blocks.length);
      if (phases.length) expect(phases.reduce((n, p) => n + p.days.length, 0)).toBe(7);
    }
  });
});
