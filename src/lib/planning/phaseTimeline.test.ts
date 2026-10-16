import { describe, expect, it } from "vitest";
import type { TrainingBlock } from "../types";
import { openGaps, assignLanes, cycleBlocks, placeCycle, snapToWeek, canSplitAt, cycleSpan, dragDays, gapsBetween, gapsInPlan, overlaps, repeatCycle, repeatEnd, setBlockDays, shiftBlock, splitBlock } from "./phaseTimeline";

const blk = (id: string, startDate: string, endDate: string, priority = 0): TrainingBlock => ({ id, name: id, phaseId: "p-" + id, startDate, endDate, priority });
let n = 0;
const newId = () => `n${++n}`;
const days = (bs: TrainingBlock[]) => bs.map((b) => `${b.id}:${b.startDate}..${b.endDate}`).sort();

describe("setBlockDays", () => {
  it("trims the neighbour it grows over", () => {
    const out = setBlockDays([blk("a", "2026-01-05", "2026-01-11"), blk("b", "2026-01-12", "2026-01-18")], "a", "2026-01-05", "2026-01-14", newId);
    expect(days(out)).toEqual(["a:2026-01-05..2026-01-14", "b:2026-01-15..2026-01-18"]);
  });
  it("swaps dates that are the wrong way round", () => {
    expect(days(setBlockDays([blk("a", "2026-01-05", "2026-01-11")], "a", "2026-01-20", "2026-01-10", newId))).toEqual(["a:2026-01-10..2026-01-20"]);
  });
  it("leaves a different-priority block alone", () => {
    const out = setBlockDays([blk("a", "2026-01-05", "2026-01-11"), blk("b", "2026-01-12", "2026-01-18", 1)], "a", "2026-01-05", "2026-01-14", newId);
    expect(days(out)).toEqual(["a:2026-01-05..2026-01-14", "b:2026-01-12..2026-01-18"]);
  });
  it("ignores an unknown id", () => {
    const bs = [blk("a", "2026-01-05", "2026-01-11")];
    expect(setBlockDays(bs, "x", "2026-01-01", "2026-01-02", newId)).toBe(bs);
  });
});

describe("shiftBlock", () => {
  const bs = [blk("a", "2026-01-05", "2026-01-11"), blk("b", "2026-01-12", "2026-01-18"), blk("c", "2026-02-02", "2026-02-08")];
  it("moves one block over its neighbour", () => {
    expect(days(shiftBlock(bs, "b", 7, false, newId))).toEqual(["a:2026-01-05..2026-01-11", "b:2026-01-19..2026-01-25", "c:2026-02-02..2026-02-08"]);
  });
  it("moves a block and everything after it, keeping the gap", () => {
    expect(days(shiftBlock(bs, "b", 7, true, newId))).toEqual(["a:2026-01-05..2026-01-11", "b:2026-01-19..2026-01-25", "c:2026-02-09..2026-02-15"]);
  });
  it("can move earlier, across a month end", () => {
    expect(days(shiftBlock(bs, "c", -3, true, newId))).toEqual(["a:2026-01-05..2026-01-11", "b:2026-01-12..2026-01-18", "c:2026-01-30..2026-02-05"]);
  });
});

describe("splitBlock", () => {
  const bs = [blk("a", "2026-01-05", "2026-01-18")];
  it("cuts in two, the second keeping phase and priority", () => {
    const out = splitBlock([{ ...bs[0], priority: 2, notes: "x" }], "a", "2026-01-12", () => "z");
    expect(days(out)).toEqual(["a:2026-01-05..2026-01-11", "z:2026-01-12..2026-01-18"]);
    expect(out[1]).toMatchObject({ phaseId: "p-a", priority: 2, notes: "x", name: "a" });
  });
  it("refuses the first day and days outside", () => {
    expect(canSplitAt(bs[0], "2026-01-05")).toBe(false);
    expect(canSplitAt(bs[0], "2026-01-19")).toBe(false);
    expect(canSplitAt(bs[0], "2026-01-18")).toBe(true);
    expect(splitBlock(bs, "a", "2026-01-05", newId)).toBe(bs);
  });
});

describe("repeatCycle", () => {
  const cycle = [blk("load", "2026-01-05", "2026-01-25"), blk("deload", "2026-01-26", "2026-02-01")];
  it("copies a 4-week cycle forward", () => {
    const out = repeatCycle(cycle, ["load", "deload"], 2, newId);
    expect(out).toHaveLength(6);
    const sorted = [...out].sort((a, b) => a.startDate.localeCompare(b.startDate));
    expect(sorted.map((b) => `${b.phaseId}:${b.startDate}..${b.endDate}`)).toEqual([
      "p-load:2026-01-05..2026-01-25", "p-deload:2026-01-26..2026-02-01",
      "p-load:2026-02-02..2026-02-22", "p-deload:2026-02-23..2026-03-01",
      "p-load:2026-03-02..2026-03-22", "p-deload:2026-03-23..2026-03-29",
    ]);
    expect(new Set(out.map((b) => b.id)).size).toBe(6);
  });
  it("trims what the copies land on", () => {
    const out = repeatCycle([...cycle, blk("old", "2026-02-16", "2026-03-08")], ["load", "deload"], 1, newId);
    expect(out.some((b) => b.id === "old")).toBe(true);
    expect(out.find((b) => b.id === "old")!.startDate).toBe("2026-03-02");
  });
  it("does nothing for zero copies and reports where it ends", () => {
    expect(repeatCycle(cycle, ["load"], 0, newId)).toBe(cycle);
    expect(repeatEnd(cycle, ["load", "deload"], 3)).toBe("2026-04-26");
    expect(cycleSpan(cycle)).toEqual({ start: "2026-01-05", end: "2026-02-01", days: 28 });
  });
});

describe("gaps and overlaps", () => {
  const bs = [blk("a", "2026-01-05", "2026-01-11"), blk("b", "2026-01-15", "2026-01-18"), blk("c", "2026-01-17", "2026-01-25", 1)];
  it("finds the days between blocks", () => {
    expect(gapsBetween(bs, "2026-01-01", "2026-01-31")).toEqual([
      { from: "2026-01-01", to: "2026-01-04", days: 4 }, { from: "2026-01-12", to: "2026-01-14", days: 3 }, { from: "2026-01-26", to: "2026-01-31", days: 6 },
    ]);
    expect(gapsInPlan(bs)).toEqual([{ from: "2026-01-12", to: "2026-01-14", days: 3 }]);
    expect(gapsInPlan([])).toEqual([]);
  });
  it("finds concurrent blocks and their shared days", () => {
    const o = overlaps(bs);
    expect(o).toHaveLength(1);
    expect([o[0].a.id, o[0].b.id, o[0].from, o[0].to]).toEqual(["b", "c", "2026-01-17", "2026-01-18"]);
  });
  it("puts overlapping bars in separate lanes and reuses a free one", () => {
    const lanes = assignLanes(bs);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(0);
    expect(lanes.get("c")).toBe(1);
  });
});

describe("dragDays", () => {
  it("rounds to whole days", () => {
    expect(dragDays(25, 10)).toBe(3);
    expect(dragDays(-14, 10)).toBe(-1);
    expect(dragDays(4, 10)).toBe(0);
  });
});

describe("snapToWeek", () => {
  it("pulls a first day to its Monday and a last day to its Sunday", () => {
    expect(snapToWeek("2026-01-08", "start")).toBe("2026-01-05");
    expect(snapToWeek("2026-01-08", "end")).toBe("2026-01-11");
    expect(snapToWeek("2026-01-05", "start")).toBe("2026-01-05");
    expect(snapToWeek("2026-01-11", "end")).toBe("2026-01-11");
  });
});

describe("cycleBlocks", () => {
  const spec = { start: "2026-01-05", phase: { id: "pw", name: "Power" }, loadWeeks: 3, rest: { id: "dl", name: "Deload", weeks: 1 }, cycles: 2 };
  it("lays load and deload back to back", () => {
    const out = cycleBlocks(spec, newId);
    expect(out.map((b) => `${b.phaseId}:${b.startDate}..${b.endDate}`)).toEqual([
      "pw:2026-01-05..2026-01-25", "dl:2026-01-26..2026-02-01", "pw:2026-02-02..2026-02-22", "dl:2026-02-23..2026-03-01",
    ]);
    expect(new Set(out.map((b) => b.id)).size).toBe(4);
  });
  it("works without a deload and with none", () => {
    expect(cycleBlocks({ ...spec, rest: undefined, cycles: 2 }, newId).map((b) => b.startDate)).toEqual(["2026-01-05", "2026-01-26"]);
    expect(cycleBlocks({ ...spec, cycles: 0 }, newId)).toEqual([]);
  });
  it("trims what it lands on when placed", () => {
    const out = placeCycle([blk("old", "2026-01-01", "2026-02-10")], spec, newId);
    expect(days(out.filter((b) => b.id === "old"))).toEqual(["old:2026-01-01..2026-01-04"]);
    expect(out).toHaveLength(5);
  });
});

describe("openGaps", () => {
  const bs = [blk("a", "2026-01-05", "2026-01-11"), blk("b", "2026-01-15", "2026-01-18"), blk("c", "2026-01-24", "2026-01-25")];
  it("flags every hole when all of it is still ahead", () => {
    expect(openGaps(bs, "2026-01-01").map((g) => `${g.from}..${g.to}`)).toEqual(["2026-01-12..2026-01-14", "2026-01-19..2026-01-23"]);
  });
  it("never flags days before today, and cuts a gap that straddles it", () => {
    expect(openGaps(bs, "2026-01-13").map((g) => `${g.from}..${g.to}`)).toEqual(["2026-01-13..2026-01-14", "2026-01-19..2026-01-23"]);
    expect(openGaps(bs, "2026-01-20").map((g) => `${g.from}..${g.to}`)).toEqual(["2026-01-20..2026-01-23"]);
    expect(openGaps(bs, "2026-02-01")).toEqual([]);
  });
  it("leaves out days you ignored, keeping the rest of the gap", () => {
    expect(openGaps(bs, "2026-01-01", [{ from: "2026-01-12", to: "2026-01-14" }, { from: "2026-01-19", to: "2026-01-20" }]).map((g) => `${g.from}..${g.to}`)).toEqual(["2026-01-21..2026-01-23"]);
  });
  it("has nothing without blocks", () => { expect(openGaps([], "2026-01-01")).toEqual([]); });
});
