import { describe, expect, it } from "vitest";
import { buildDemoData } from "./demoData";
import { getWeekId } from "../dateUtils";
import { assertMigrationInvariants } from "../storage/migrations";

const TODAY = new Date("2026-09-24T10:00:00Z"); // a Thursday

describe("tour demo data", () => {
  const data = buildDemoData(TODAY);

  it("is the same every time for the same day", () => {
    expect(buildDemoData(TODAY)).toEqual(data);
  });

  it("has completed sessions behind today and none after it", () => {
    const completed = data.workouts.filter((w) => w.status === "completed");
    expect(completed.length).toBeGreaterThan(10);
    for (const w of completed) {
      expect(w.date! < "2026-09-24").toBe(true);
      expect(w.loadFactor).toBeGreaterThan(0);
      expect(w.exercises.every((s) => s.logged)).toBe(true);
    }
  });

  it("keeps this week's remaining sessions planned, and one past session missed", () => {
    const thisWeek = data.workouts.filter((w) => w.weekId === getWeekId(TODAY));
    expect(thisWeek.length).toBeGreaterThan(0);
    const pastPlanned = data.workouts.filter((w) => w.status === "planned" && w.weekId < getWeekId(TODAY));
    expect(pastPlanned).toHaveLength(1);
  });

  it("covers the current week with a block and has a trip ahead", () => {
    const week = getWeekId(TODAY);
    expect(data.trainingBlocks.some((b) => b.startWeekId <= week && b.endWeekId >= week)).toBe(true);
    expect(data.goals[0].date > "2026-09-24").toBe(true);
  });

  it("only uses ids from the default catalog", () => {
    const types = new Set(data.exerciseTypes.map((t) => t.id));
    const phases = new Set(data.phaseDefs.map((p) => p.id));
    const metrics = new Set(data.metricDefs.map((m) => m.id));
    const benchmarks = new Set(data.benchmarkTypes.map((b) => b.id));
    data.workouts.forEach((w) => w.exercises.forEach((s) => expect(types.has(s.typeId)).toBe(true)));
    data.trainingBlocks.forEach((b) => expect(phases.has(b.phaseId)).toBe(true));
    data.dailyMetrics.forEach((m) => expect(metrics.has(m.metricId)).toBe(true));
    data.benchmarks.forEach((b) => expect(benchmarks.has(b.typeId)).toBe(true));
  });

  it("passes the same invariants real data must", () => {
    expect(() => assertMigrationInvariants(structuredClone(data), structuredClone(data))).not.toThrow();
  });
});
