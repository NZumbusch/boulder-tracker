import { describe, it, expect } from "vitest";
import { phaseMarks, stripRuns, type PhaseMark } from "./phaseStrip";
import { toUtcDayIndex } from "../dateUtils";
import type { PhaseDef, TrainingBlock } from "../types";

const day = (iso: string) => toUtcDayIndex(iso);
const range = (from: string, to: string) => Array.from({ length: day(to) - day(from) + 1 }, (_, i) => day(from) + i);

const phases: PhaseDef[] = [
  { id: "pow", name: "Power", color: "bg-amber-500", order: 1 },
  { id: "del", name: "Deload", color: "bg-zinc-500", order: 2 },
] as PhaseDef[];
const blocks: TrainingBlock[] = [
  { id: "a", name: "Power block", phaseId: "pow", startDate: "2026-10-05", endDate: "2026-10-07" },
  { id: "b", name: "Deload", phaseId: "del", startDate: "2026-10-08", endDate: "2026-10-18" },
];

describe("phaseMarks", () => {
  it("gives each day the phase of the block on it - its name and colour", () => {
    const marks = phaseMarks(blocks, phases, range("2026-10-05", "2026-10-09"));
    expect(marks.get(day("2026-10-07"))).toMatchObject({ name: "Power", color: "bg-amber-500" });
    expect(marks.get(day("2026-10-08"))).toMatchObject({ name: "Deload", color: "bg-zinc-500" });
  });
  it("leaves days no block has out", () => {
    const marks = phaseMarks(blocks, phases, range("2026-10-03", "2026-10-06"));
    expect(marks.has(day("2026-10-03"))).toBe(false);
    expect(marks.has(day("2026-10-05"))).toBe(true);
  });
  it("uses the block's own colour when it has one, and survives a phase that is gone", () => {
    const own = phaseMarks([{ ...blocks[0], color: "bg-red-500" }, { ...blocks[1], phaseId: "gone" }], phases, range("2026-10-05", "2026-10-09"));
    expect(own.get(day("2026-10-05"))?.color).toBe("bg-red-500");
    expect(own.get(day("2026-10-09"))).toMatchObject({ name: "Deload" }); // falls back to the block's name
  });
});

describe("stripRuns", () => {
  const mark = (name: string): PhaseMark => ({ key: name, name, color: "c" });
  it("cuts the days into runs of one phase, with how many days each has", () => {
    const days = range("2026-10-05", "2026-10-11");
    const marks = phaseMarks(blocks, phases, days);
    expect(stripRuns(days, marks).map((r) => [r.mark?.name, r.count])).toEqual([["Power", 3], ["Deload", 4]]);
  });
  it("keeps days with no phase as runs of their own, so the runs add up to the days shown", () => {
    const days = range("2026-10-03", "2026-10-09");
    const runs = stripRuns(days, phaseMarks(blocks, phases, days));
    expect(runs.map((r) => [r.mark?.name, r.count])).toEqual([[undefined, 2], ["Power", 3], ["Deload", 2]]);
    expect(runs.reduce((n, r) => n + r.count, 0)).toBe(days.length);
  });
  it("two blocks of the same phase back to back are one run", () => {
    const marks = new Map([[1, mark("A")], [2, mark("A")], [3, mark("B")]]);
    expect(stripRuns([1, 2, 3], marks).map((r) => r.count)).toEqual([2, 1]);
  });
  it("says where each run starts", () => {
    const days = range("2026-10-05", "2026-10-11");
    expect(stripRuns(days, phaseMarks(blocks, phases, days)).map((r) => r.from)).toEqual([day("2026-10-05"), day("2026-10-08")]);
  });
  it("is one run for a single day", () => {
    expect(stripRuns([5], new Map([[5, mark("A")]]))).toEqual([{ mark: mark("A"), from: 5, count: 1 }]);
  });
});
