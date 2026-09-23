import { describe, it, expect } from "vitest";
import type { OutdoorAscent } from "../types";
import { gradeHistogram } from "./gradeHistogram";

const s = (grade: string, style?: string): OutdoorAscent => ({ id: Math.random().toString(), date: "2026-09-01", grade, ...(style ? { style } : {}) });

describe("gradeHistogram", () => {
  it("covers every step from easiest to hardest with one step of padding, empty steps included", () => {
    const h = gradeHistogram([s("6B"), s("6b"), s("7A", "Flash"), s("6C+")]);
    expect(h.bars.map((b) => b.grade)).toEqual(["6A+", "6B", "6B+", "6C", "6C+", "7A", "7A+"]);
    expect(h.bars.find((b) => b.grade === "6B")?.count).toBe(2);
    expect(h.bars.find((b) => b.grade === "6C")?.count).toBe(0);
    expect(h.bars.find((b) => b.grade === "7A")).toEqual({ grade: "7A", count: 1, flashed: 1 });
  });

  it("uses unlettered steps below 6 unless the sends are lettered", () => {
    expect(gradeHistogram([s("5+"), s("6A")]).bars.map((b) => b.grade)).toEqual(["5", "5+", "6A", "6A+"]);
    // 8a.nu writes lettered grades below 6 ("5C").
    expect(gradeHistogram([s("5C"), s("6A")]).bars.map((b) => b.grade)).toEqual(["5B+", "5C", "5C+", "6A", "6A+"]);
  });

  it("counts grades it can't place without charting them", () => {
    const h = gradeHistogram([s("V5"), s("6A")]);
    expect(h.unplotted).toBe(1);
    expect(h.bars.map((b) => [b.grade, b.count])).toEqual([["5+", 0], ["6A", 1], ["6A+", 0]]);
  });

  it("is empty with nothing to chart", () => {
    expect(gradeHistogram([s("V5")])).toEqual({ bars: [], unplotted: 1 });
  });
});

describe("gradeHistogram in V-scale", () => {
  it("groups Font grades into V bands, padded by one band", () => {
    const h = gradeHistogram([s("6A"), s("6A+", "Flash"), s("7A"), s("V5")], 1, "v");
    expect(h.bars.map((b) => b.grade)).toEqual(["V2", "V3", "V4", "V5", "V6", "V7"]);
    expect(h.bars.find((b) => b.grade === "V3")).toEqual({ grade: "V3", count: 2, flashed: 1 });
    // A send already written as a V grade counts in its band.
    expect(h.bars.find((b) => b.grade === "V5")?.count).toBe(1);
    expect(h.unplotted).toBe(0);
  });
});
