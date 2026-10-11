import { describe, it, expect } from "vitest";
import type { ExerciseSlot, Workout } from "../types";
import { buildDemoData } from "../tour/demoData";
import { buildInsights, DEFAULT_INSIGHT_CONFIG, ratingScale, type InsightInputs } from "./insights";
import { DEFAULT_FATIGUE_MODEL } from "./readiness";
import { getWeekId } from "../dateUtils";

const asOf = new Date(2026, 9, 11, 12); // Sunday, 2026-10-11

const slot = (typeId: string, logged: ExerciseSlot["logged"], id = Math.random().toString()): ExerciseSlot =>
  ({ id, typeId, prescribed: {}, logged }) as ExerciseSlot;
const session = (day: number, exercises: ExerciseSlot[], over: Partial<Workout> = {}): Workout =>
  ({ id: `w-${day}-${Math.random()}`, status: "completed", date: new Date(2026, 9, day, 12).toISOString(), weekId: getWeekId(new Date(2026, 9, day, 12)), loadFactor: 500, exercises, ...over }) as Workout;

function inputs(workouts: Workout[], over: Partial<InsightInputs> = {}): InsightInputs {
  return {
    asOf,
    workouts,
    workoutsForWeek: (weekId) => workouts.filter((w) => w.weekId === weekId),
    exerciseTypes: [],
    analyticsCategories: [],
    benchmarks: [],
    benchmarkTypes: [],
    valueDefs: [],
    weightUnit: "kg",
    dailyMetrics: [],
    ascents: [],
    config: { ...DEFAULT_INSIGHT_CONFIG, fatigueModel: DEFAULT_FATIGUE_MODEL },
    ...over,
  };
}

describe("buildInsights on the example data", () => {
  it("produces findings in every group, most serious first", () => {
    const d = buildDemoData(asOf);
    const list = buildInsights(inputs(d.workouts, {
      exerciseTypes: d.exerciseTypes,
      analyticsCategories: d.analyticsCategories,
      benchmarks: d.benchmarks,
      benchmarkTypes: d.benchmarkTypes,
      valueDefs: d.valueDefs ?? [],
      dailyMetrics: d.dailyMetrics,
      ascents: d.outdoorAscents,
    }));
    expect(list.length).toBeGreaterThan(3);
    const order = { risk: 0, caution: 1, info: 2, good: 3 };
    expect(list.map((i) => order[i.tone])).toEqual([...list.map((i) => order[i.tone])].sort((a, b) => a - b));
    expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
  });
});

describe("load ratio", () => {
  it("says so when there isn't enough history", () => {
    const list = buildInsights(inputs([session(9, [])]));
    const acwr = list.find((i) => i.id === "acwr")!;
    expect(acwr.tone).toBe("info");
    expect(acwr.title).toMatch(/isn't counted/);
  });

  it("calls a heavy week against an even baseline high risk", () => {
    const ws = [
      session(11, [], { loadFactor: 3000 }), session(9, [], { loadFactor: 2000 }),
      session(1, [], { loadFactor: 800 }), session(2, [], { loadFactor: 800 }),
      ...[12, 15, 16, 22, 23, 24].map((d) => session(d - 14 * 0, [], { loadFactor: 800, date: new Date(2026, 8, d, 12).toISOString(), weekId: getWeekId(new Date(2026, 8, d, 12)) })),
    ];
    const acwr = buildInsights(inputs(ws)).find((i) => i.id === "acwr")!;
    expect(acwr.tone === "risk" || acwr.tone === "caution").toBe(true);
    expect(acwr.link).toEqual({ kind: "acwr" });
  });
});

describe("ratingScale", () => {
  it("is 1 with nothing to compare, and clamped otherwise", () => {
    expect(ratingScale([])).toBe(1);
  });
});

describe("records", () => {
  it("reports a new best weight once it beats every earlier session", () => {
    const ws = [3, 5, 8, 10].map((d, i) => session(d, [slot("pull", { weight: 20 + i * 2.5 })]));
    const list = buildInsights(inputs(ws, { exerciseTypes: [{ id: "pull", name: "Weighted Pull-up" } as never] }));
    const rec = list.find((i) => i.id === "record-pull")!;
    expect(rec.title).toBe("New best: Weighted Pull-up 27.5 kg");
    expect(rec.detail).toMatch(/Up from 25 kg/);
  });

  it("says nothing when the latest isn't the best", () => {
    const ws = [3, 5, 8, 10].map((d, i) => session(d, [slot("pull", { weight: i === 3 ? 20 : 25 })]));
    expect(buildInsights(inputs(ws)).some((i) => i.id.startsWith("record-"))).toBe(false);
  });
});

describe("plan insights", () => {
  it("flags a category trained regularly but not for weeks", () => {
    const hang = (d: number) => session(d, [slot("hang", { duration: 10 })]);
    const ws = [hang(1), hang(2), hang(3), session(10, [slot("boulder", { duration: 60 })])];
    const types = { exerciseTypes: [{ id: "hang", name: "Hang", category: "fingers" }, { id: "boulder", name: "Boulder", category: "bouldering" }] as never[], analyticsCategories: [{ id: "fingers", name: "Fingers" }, { id: "bouldering", name: "Bouldering" }] as never[] };
    // 'hang' was last done Oct 3 -> 8 days: not stale yet at 14 days
    expect(buildInsights(inputs(ws, { ...types, config: { ...DEFAULT_INSIGHT_CONFIG, fatigueModel: DEFAULT_FATIGUE_MODEL, staleDays: 5 } })).some((i) => i.id.startsWith("stale-"))).toBe(true);
    expect(buildInsights(inputs(ws, types)).some((i) => i.id.startsWith("stale-"))).toBe(false);
  });

  it("reports four-week adherence, leaving out skipped sessions", () => {
    const prev = (d: number, status: "completed" | "planned", skipped = false) =>
      ({ id: `p${d}${status}`, status, date: status === "completed" ? new Date(2026, 9, d, 12).toISOString() : null, weekId: getWeekId(new Date(2026, 9, d, 12)), loadFactor: 0, exercises: [{ id: "x", typeId: "t", prescribed: {}, ...(skipped ? { skipped: true } : {}) }] }) as unknown as Workout;
    const ws = [prev(1, "completed"), prev(2, "completed"), prev(3, "planned"), prev(4, "planned", true)];
    const a = buildInsights(inputs(ws)).find((i) => i.id === "adherence");
    // Oct 1-4 is the week before this one (W40); 2 done, 1 missed, 1 skipped
    expect(a?.title).toBe("You did 67% of the planned sessions over the last 4 weeks");
  });
});
