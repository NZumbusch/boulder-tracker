import { describe, it, expect } from "vitest";
import { buildDemoData } from "../tour/demoData";
import { buildSinceLastPlan } from "./sinceLastPlan";
import { DEFAULT_INSIGHT_CONFIG, type InsightInputs } from "../analytics/insights";
import { DEFAULT_FATIGUE_MODEL } from "../analytics/readiness";
import { getWeekId } from "../dateUtils";

const asOf = new Date(2026, 9, 11, 12);

function inputs(): InsightInputs {
  const d = buildDemoData(asOf);
  return {
    asOf,
    workouts: d.workouts,
    workoutsForWeek: (id) => d.workouts.filter((w) => w.weekId === id),
    exerciseTypes: d.exerciseTypes,
    analyticsCategories: d.analyticsCategories,
    benchmarks: d.benchmarks,
    benchmarkTypes: d.benchmarkTypes,
    valueDefs: d.valueDefs ?? [],
    weightUnit: "kg",
    dailyMetrics: d.dailyMetrics,
    ascents: d.outdoorAscents,
    config: { ...DEFAULT_INSIGHT_CONFIG, fatigueModel: DEFAULT_FATIGUE_MODEL },
  };
}

describe("buildSinceLastPlan", () => {
  it("says how the recent weeks went and what the app found", () => {
    const text = buildSinceLastPlan({ inputs: inputs(), changeLog: [] });
    expect(text).toMatch(/^Since the plan was last changed/);
    expect(text).toContain(`W${getWeekId(asOf).split("-W")[1]} (this week, running)`);
    expect(text).toContain("How the recent weeks went against their plans:");
    expect(text).toContain("What the app has worked out from my data");
  });

  it("includes what the app last changed and why", () => {
    const text = buildSinceLastPlan({
      inputs: inputs(),
      changeLog: [{ id: "a", at: new Date(2026, 9, 6).toISOString(), goal: "Lighten the week", weeks: ["2026-W41"], lines: ["Friday: Easy Volume replaces Board Session"] }],
    });
    expect(text).toContain('I asked: "Lighten the week"');
    expect(text).toContain("Friday: Easy Volume replaces Board Session");
  });

  it("leaves out findings built on data the athlete doesn't share", () => {
    const i = inputs();
    const withAll = buildSinceLastPlan({ inputs: i, changeLog: [] });
    const hidden = buildSinceLastPlan({ inputs: i, changeLog: [], share: { readinessMetrics: false, outdoorAscents: false } });
    expect(hidden).not.toMatch(/HRV is|Sleep score is low|outdoor send/);
    expect(withAll.length).toBeGreaterThanOrEqual(hidden.length);
  });

  it("is empty with nothing logged or planned", () => {
    const i = inputs();
    expect(buildSinceLastPlan({ inputs: { ...i, workouts: [], workoutsForWeek: () => [], benchmarks: [], ascents: [], dailyMetrics: [] }, changeLog: [] })).toMatch(/^$|worked out/);
  });
});
