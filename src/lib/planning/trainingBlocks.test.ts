import { describe, it, expect } from "vitest";
import { coalesceBlocks, getBlocksForWeek, getDominantBlockForWeek } from "./trainingBlocks";
import type { TrainingBlock } from "../types";

function block(overrides: Partial<TrainingBlock> & Pick<TrainingBlock, "id" | "startWeekId" | "endWeekId">): TrainingBlock {
  return { name: overrides.id, phaseId: "phase-x", ...overrides };
}

describe("getBlocksForWeek", () => {
  it("returns blocks whose range covers the week, inclusive of both ends", () => {
    const blocks = [
      block({ id: "a", startWeekId: "2026-W01", endWeekId: "2026-W04" }),
      block({ id: "b", startWeekId: "2026-W05", endWeekId: "2026-W08" }),
    ];
    expect(getBlocksForWeek(blocks, "2026-W01").map((b) => b.id)).toEqual(["a"]);
    expect(getBlocksForWeek(blocks, "2026-W04").map((b) => b.id)).toEqual(["a"]);
    expect(getBlocksForWeek(blocks, "2026-W05").map((b) => b.id)).toEqual(["b"]);
    expect(getBlocksForWeek(blocks, "2026-W09")).toEqual([]);
  });

  it("handles overlapping blocks and cross-year ranges correctly (string comparison on zero-padded week ids)", () => {
    const blocks = [
      block({ id: "a", startWeekId: "2025-W50", endWeekId: "2026-W03" }),
      block({ id: "b", startWeekId: "2026-W01", endWeekId: "2026-W10" }),
    ];
    expect(getBlocksForWeek(blocks, "2026-W01").map((b) => b.id).sort()).toEqual(["a", "b"]);
    expect(getBlocksForWeek(blocks, "2025-W51").map((b) => b.id)).toEqual(["a"]);
    expect(getBlocksForWeek(blocks, "2026-W05").map((b) => b.id)).toEqual(["b"]);
  });
});

describe("getDominantBlockForWeek", () => {
  it("returns undefined when no block covers the week", () => {
    expect(getDominantBlockForWeek([], "2026-W01")).toBeUndefined();
  });

  it("returns the single covering block when there's no overlap", () => {
    const blocks = [block({ id: "a", startWeekId: "2026-W01", endWeekId: "2026-W04" })];
    expect(getDominantBlockForWeek(blocks, "2026-W02")?.id).toBe("a");
  });

  it("picks the higher-priority block when two overlap", () => {
    const blocks = [
      block({ id: "low", startWeekId: "2026-W01", endWeekId: "2026-W04", priority: 1 }),
      block({ id: "high", startWeekId: "2026-W02", endWeekId: "2026-W03", priority: 5 }),
    ];
    expect(getDominantBlockForWeek(blocks, "2026-W02")?.id).toBe("high");
  });

  it("treats missing priority as 0", () => {
    const blocks = [
      block({ id: "no-priority", startWeekId: "2026-W01", endWeekId: "2026-W04" }),
      block({ id: "negative", startWeekId: "2026-W01", endWeekId: "2026-W04", priority: -1 }),
    ];
    expect(getDominantBlockForWeek(blocks, "2026-W01")?.id).toBe("no-priority");
  });

  it("breaks ties by preferring the later block in the array (last-created wins)", () => {
    const blocks = [
      block({ id: "first", startWeekId: "2026-W01", endWeekId: "2026-W04", priority: 2 }),
      block({ id: "second", startWeekId: "2026-W01", endWeekId: "2026-W04", priority: 2 }),
    ];
    expect(getDominantBlockForWeek(blocks, "2026-W01")?.id).toBe("second");
  });
});

describe("coalesceBlocks", () => {
  const cap = (id: string, a: string, b: string, extra: Partial<TrainingBlock> = {}) => block({ id, name: "Capacity", phaseId: "cap", startWeekId: a, endWeekId: b, ...extra });

  it("joins consecutive blocks of the same phase into one, the earliest keeping its id", () => {
    const r = coalesceBlocks([cap("a", "2026-W28", "2026-W28"), cap("b", "2026-W29", "2026-W29"), cap("c", "2026-W39", "2026-W39"), cap("d", "2026-W40", "2026-W40"), cap("e", "2026-W41", "2026-W42")]);
    expect(r.blocks.map((b) => `${b.id}:${b.startWeekId}-${b.endWeekId}`)).toEqual(["a:2026-W28-2026-W29", "c:2026-W39-2026-W42"]);
    expect(r.remap).toEqual({ b: "a", d: "c", e: "c" });
  });

  it("joins across a year end, and overlapping ranges", () => {
    const r = coalesceBlocks([cap("a", "2026-W51", "2026-W53"), cap("b", "2027-W01", "2027-W02"), cap("c", "2027-W02", "2027-W04")]);
    expect(r.blocks.map((b) => `${b.startWeekId}-${b.endWeekId}`)).toEqual(["2026-W51-2027-W04"]);
  });

  it("leaves blocks of another phase, name, colour or with a gap alone", () => {
    const blocks = [cap("a", "2026-W28", "2026-W29"), block({ id: "s", name: "Strength", phaseId: "str", startWeekId: "2026-W30", endWeekId: "2026-W31" }), cap("b", "2026-W32", "2026-W33"), cap("c", "2026-W35", "2026-W36"), cap("d", "2026-W37", "2026-W37", { color: "bg-red-500" })];
    const r = coalesceBlocks(blocks);
    expect(r.blocks).toBe(blocks);
    expect(r.remap).toEqual({});
  });

  it("keeps different notes together and leaves the order of the rest as it was", () => {
    const r = coalesceBlocks([cap("x", "2026-W40", "2026-W40", { notes: "Hangs twice" }), block({ id: "z", name: "Strength", phaseId: "str", startWeekId: "2026-W44", endWeekId: "2026-W45" }), cap("y", "2026-W41", "2026-W42", { notes: "Add volume" }), cap("w", "2026-W43", "2026-W43", { notes: "Add volume" })]);
    expect(r.blocks.map((b) => b.id)).toEqual(["x", "z"]);
    expect(r.blocks[0]).toMatchObject({ startWeekId: "2026-W40", endWeekId: "2026-W43", notes: "Hangs twice\nAdd volume" });
  });
});
