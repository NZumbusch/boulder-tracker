import { describe, it, expect } from "vitest";
import { normalizeBlock, normalizeBlocks, blockFirstWeekId, blockLastWeekId, blockWeekIds, blockTouchesWeek, getBlocksForWeek, phaseOnDay, phasesInWeek, winningPhaseOfWeek, weekRuns, describeRuns, getDominantBlockForWeek } from "./trainingBlocks";
import { getWeekIdRange, weekMondayIso, weekSundayIso } from "../dateUtils";
import type { TrainingBlock } from "../types";

const b = (id: string, over: Partial<TrainingBlock> = {}): TrainingBlock => ({ id, name: id, phaseId: "phase-x", startDate: "2026-10-05", endDate: "2026-10-11", ...over });

describe("normalizeBlock", () => {
  const legacy = (over: Record<string, unknown> = {}) => ({ id: "a", name: "a", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W42", ...over }) as any;

  it("turns a block of whole weeks into days: Monday of the first, Sunday of the last", () => {
    expect(normalizeBlock(legacy())).toEqual({ id: "a", name: "a", phaseId: "p", startDate: "2026-09-28", endDate: "2026-10-18" });
  });
  it("keeps the dates it has and drops the week ids", () => {
    const out = normalizeBlock(legacy({ startDate: "2026-10-07", endDate: "2026-10-15" }))!;
    expect(out).toMatchObject({ startDate: "2026-10-07", endDate: "2026-10-15" });
    expect(out).not.toHaveProperty("startWeekId");
    expect(out).not.toHaveProperty("endWeekId");
  });
  it("keeps everything else on the block", () => {
    expect(normalizeBlock(legacy({ priority: 2, notes: "keep", color: "bg-red-500" }))).toMatchObject({ priority: 2, notes: "keep", color: "bg-red-500" });
  });
  it("gives nothing for a block with no usable days or weeks, which covered nothing", () => {
    expect(normalizeBlock(legacy({ startWeekId: "", endWeekId: "" }))).toBeUndefined();
    expect(normalizeBlocks([legacy(), legacy({ id: "x", startWeekId: undefined, endWeekId: undefined })]).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("the weeks a block touches", () => {
  const mid = b("mid", { startDate: "2026-10-07", endDate: "2026-10-22" }); // Wednesday of W41 to Thursday of W43
  it("counts a partial week at either end", () => {
    expect(blockFirstWeekId(mid)).toBe("2026-W41");
    expect(blockLastWeekId(mid)).toBe("2026-W43");
    expect(blockWeekIds(mid)).toEqual(["2026-W41", "2026-W42", "2026-W43"]);
  });
  it("touches a week by a single day", () => {
    expect(blockTouchesWeek(mid, "2026-W40")).toBe(false);
    expect(blockTouchesWeek(mid, "2026-W41")).toBe(true);
    expect(blockTouchesWeek(mid, "2026-W43")).toBe(true);
    expect(blockTouchesWeek(mid, "2026-W44")).toBe(false);
    expect(getBlocksForWeek([mid], "2026-W43")).toEqual([mid]);
  });
  it("works over New Year and week 53", () => {
    const across = b("x", { startDate: "2026-12-28", endDate: "2027-01-04" });
    expect(blockWeekIds(across)).toEqual(["2026-W53", "2027-W01"]);
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

describe("weekRuns", () => {
  it("is one run for a week with one phase", () => {
    expect(weekRuns([b("a")], "2026-W41").map((r) => [r.block?.id, r.from, r.to])).toEqual([["a", 0, 6]]);
  });
  it("cuts a split week where the phase changes - two, or three", () => {
    const blocks = [b("a", { endDate: "2026-10-07" }), b("b", { startDate: "2026-10-08", endDate: "2026-10-09" }), b("c", { startDate: "2026-10-10", endDate: "2026-10-31" })];
    expect(weekRuns(blocks, "2026-W41").map((r) => [r.block?.id, r.from, r.to])).toEqual([["a", 0, 2], ["b", 3, 4], ["c", 5, 6]]);
  });
  it("keeps days no block has as runs of their own, so the runs always cover the week", () => {
    const blocks = [b("a", { startDate: "2026-10-06", endDate: "2026-10-08" })];
    const runs = weekRuns(blocks, "2026-W41");
    expect(runs.map((r) => [r.block?.id, r.from, r.to])).toEqual([[undefined, 0, 0], ["a", 1, 3], [undefined, 4, 6]]);
  });
  it("is one run of no phase for a week nothing covers", () => {
    expect(weekRuns([], "2026-W41")).toEqual([{ block: undefined, from: 0, to: 6 }]);
  });
  it("shows a phase that comes back after another as a second run", () => {
    const blocks = [b("a"), b("x", { startDate: "2026-10-07", endDate: "2026-10-08", priority: 1 })];
    expect(weekRuns(blocks, "2026-W41").map((r) => [r.block?.id, r.from, r.to])).toEqual([["a", 0, 1], ["x", 2, 3], ["a", 4, 6]]);
  });
});

describe("describeRuns", () => {
  it("names a split week by its parts", () => {
    expect(describeRuns([{ name: "Power", from: 0, to: 2 }, { name: "Deload", from: 3, to: 6 }])).toBe("Power Mon–Wed, Deload Thu–Sun");
    expect(describeRuns([{ name: "Power", from: 0, to: 4 }, { name: "Taper", from: 5, to: 5 }, { name: "Event", from: 6, to: 6 }])).toBe("Power Mon–Fri, Taper Sat, Event Sun");
  });
  it("is just the name for a whole week, and leaves out days with no phase", () => {
    expect(describeRuns([{ name: "Power", from: 0, to: 6 }])).toBe("Power");
    expect(describeRuns([{ from: 0, to: 1 }, { name: "Power", from: 2, to: 6 }])).toBe("Power Wed–Sun");
  });
  it("is empty when nothing has a name", () => {
    expect(describeRuns([{ from: 0, to: 6 }])).toBe("");
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
 * The rule weeks always had: of the blocks covering a week, higher priority
 * wins, then the one later in the list. Whole-week blocks must still give
 * every week that answer.
 */
describe("whole-week blocks give the answers they gave before", () => {
  function rng(seed: number) {
    return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  }
  const weeks = getWeekIdRange("2026-W44", "2027-W06"); // over New Year and week 53

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("random plan %i: the winning block and its days agree with the week-by-week rule", (seed) => {
    const next = rng(seed);
    const spans = Array.from({ length: 2 + Math.floor(next() * 6) }, (_, i) => {
      const from = Math.floor(next() * weeks.length);
      const to = Math.min(weeks.length - 1, from + Math.floor(next() * 6));
      return { id: `b${i}`, from: weeks[from], to: weeks[to], priority: next() < 0.3 ? Math.floor(next() * 3) : undefined };
    });
    const blocks = spans.map((x) => b(x.id, { startDate: weekMondayIso(x.from), endDate: weekSundayIso(x.to), priority: x.priority }));
    const oldRule = (weekId: string) => spans.filter((x) => x.from <= weekId && weekId <= x.to).reduce<(typeof spans)[number] | undefined>((best, x) => (!best || (x.priority ?? 0) >= (best.priority ?? 0) ? x : best), undefined);
    for (const week of weeks) {
      expect(winningPhaseOfWeek(blocks, week)?.id).toBe(oldRule(week)?.id);
      expect(getDominantBlockForWeek(blocks, week)?.id).toBe(oldRule(week)?.id);
      expect(getBlocksForWeek(blocks, week).map((x) => x.id)).toEqual(spans.filter((x) => x.from <= week && week <= x.to).map((x) => x.id));
      const phases = phasesInWeek(blocks, week);
      if (phases.length) expect(phases.reduce((n, p) => n + p.days.length, 0)).toBe(7);
    }
  });
});
