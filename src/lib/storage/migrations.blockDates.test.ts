import { describe, it, expect } from "vitest";
import { runDataMigrations, assertMigrationInvariants } from "./index";
import { DATA_EXPORT_VERSION } from "../constants";
import { getDominantBlockForWeek } from "../planning/trainingBlocks";

// 3.34 -> 3.35: a phase becomes a range of days. A block of whole weeks
// becomes the Monday of its first week to the Sunday of its last; the week
// ids go.

describe("3.34 -> 3.35: blocks get dates", () => {
  const data = (): any => ({
    exportVersion: "3.34",
    workouts: [],
    exerciseTypes: [],
    phaseDefs: [{ id: "phase-x", name: "X", color: "bg-zinc-500", order: 1 }],
    trainingBlocks: [
      { id: "a", name: "A", phaseId: "phase-x", startWeekId: "2026-W41", endWeekId: "2026-W41" },
      { id: "b", name: "B", phaseId: "phase-x", startWeekId: "2026-W52", endWeekId: "2027-W02", priority: 2, notes: "keep" },
      { id: "c", name: "C", phaseId: "phase-x", startWeekId: "2026-W53", endWeekId: "2026-W53" },
    ],
  });

  it("is the current data version", () => {
    expect(DATA_EXPORT_VERSION).toBe("3.35");
  });

  it("writes Monday of the first week and Sunday of the last, across New Year and week 53", () => {
    const d = data();
    runDataMigrations(d);
    expect(d.exportVersion).toBe("3.35");
    expect(d.trainingBlocks.map((b: any) => [b.id, b.startDate, b.endDate])).toEqual([
      ["a", "2026-10-05", "2026-10-11"],
      ["b", "2026-12-21", "2027-01-17"],
      ["c", "2026-12-28", "2027-01-03"],
    ]);
  });

  it("keeps everything else on the block and drops the week ids", () => {
    const d = data();
    runDataMigrations(d);
    expect(d.trainingBlocks[1]).toMatchObject({ id: "b", name: "B", phaseId: "phase-x", priority: 2, notes: "keep" });
    expect(d.trainingBlocks[1]).not.toHaveProperty("startWeekId");
    expect(d.trainingBlocks[1]).not.toHaveProperty("endWeekId");
  });

  it("leaves every week with the same dominant block", () => {
    const before = data();
    const after = data();
    runDataMigrations(after);
    // The answer the weeks gave before: of the covering blocks the highest priority, the later one winning a tie.
    const oldAnswer = (w: string) => before.trainingBlocks.filter((b: any) => b.startWeekId <= w && w <= b.endWeekId).reduce((best: any, b: any) => (!best || (b.priority ?? 0) >= (best.priority ?? 0) ? b : best), undefined)?.id;
    for (const w of ["2026-W40", "2026-W41", "2026-W42", "2026-W52", "2026-W53", "2027-W01", "2027-W02", "2027-W03"]) {
      expect(getDominantBlockForWeek(after.trainingBlocks, w)?.id).toBe(oldAnswer(w));
    }
  });

  it("passes the migration invariants", () => {
    const before = data();
    const after = data();
    runDataMigrations(after);
    expect(() => assertMigrationInvariants(before, after)).not.toThrow();
  });

  it("copes with no blocks, and drops a block whose weeks are unusable (it covered nothing)", () => {
    const none: any = { exportVersion: "3.34", workouts: [] };
    runDataMigrations(none);
    expect(none.exportVersion).toBe("3.35");
    const odd: any = { exportVersion: "3.34", workouts: [], trainingBlocks: [{ id: "x", name: "X", phaseId: "p", startWeekId: "", endWeekId: "" }] };
    runDataMigrations(odd);
    expect(odd.trainingBlocks).toEqual([]);
  });

  it("runs from older versions too: a 3.22 period lands as a one-week block with dates", () => {
    const old: any = {
      exportVersion: "3.22",
      workouts: [],
      exerciseTypes: [],
      periodization: [{ weekId: "2026-W05", phaseId: "phase-deload" }],
      templates: {},
      phaseDefs: [{ id: "phase-deload", name: "Deload", color: "bg-zinc-500", order: 7 }],
    };
    runDataMigrations(old);
    expect(old.trainingBlocks[0]).toMatchObject({ startDate: "2026-01-26", endDate: "2026-02-01" });
  });
});
