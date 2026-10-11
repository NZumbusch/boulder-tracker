import { describe, it, expect } from "vitest";
import type { ExerciseSlot, Workout, WorkoutTemplate, ValueDef, BenchmarkTypeDef } from "../types";
import { validateChangeSet } from "./changeSet";
import { planChanges, type PlannerState } from "./changePlanner";
import { buildTestSummaries } from "./context";
import { buildPlanContext } from "./planContext";
import { AI_CHANGESET_INSTRUCTIONS } from "./changeSetPrompt";
import { makeTestSlot } from "../benchmarks/testSlot";

let n = 0;
const ids = () => `id${++n}`;

const valueDefs: ValueDef[] = [
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" },
  { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length" },
  { id: "grip", name: "Grip", kind: "choice", options: ["Half crimp", "Open hand"] },
];
const hang: BenchmarkTypeDef = {
  id: "hang", name: "Max Hang", unit: "kg", protocol: "Warm up well. Three attempts, full rest.",
  fields: [{ valueId: "weight", role: "result", label: "Added weight" }, { valueId: "edge", role: "condition" }, { valueId: "grip", role: "condition" }],
};
const pull: BenchmarkTypeDef = { id: "pull", name: "Max Pull-ups", unit: "reps" };

function state(extra: Partial<PlannerState> = {}): PlannerState {
  const capacity: WorkoutTemplate[] = [{ id: "t-board", name: "Board", dayOfWeek: "Monday", exercises: [{ id: "s1", typeId: "hb", activeParameters: [], prescribed: { sets: 5 } } as ExerciseSlot] }];
  return {
    exerciseTypes: [{ id: "hb", name: "Hangboard", category: "Fingers", parameters: ["sets"] }],
    analyticsCategories: [{ id: "c1", name: "Fingers", color: "x" }],
    phaseDefs: [{ id: "p-cap", name: "Capacity", order: 1 }],
    templates: { "p-cap": capacity },
    trainingBlocks: [{ id: "b-cap", name: "Capacity", phaseId: "p-cap", startWeekId: "2026-W38", endWeekId: "2026-W43" }],
    workouts: [],
    weekOverrides: [],
    weekNotes: [],
    currentWeekId: "2026-W41",
    benchmarkTypes: [hang, pull],
    valueDefs,
    ...extra,
  };
}

function plan(doc: unknown, s: PlannerState = state()) {
  const v = validateChangeSet(doc);
  if (!v.valid) throw new Error(JSON.stringify(v.issues));
  return planChanges(v.data!, s, undefined, ids);
}

const addTest = (item: Record<string, unknown>) => ({
  weeks: [{ week: "2026-W42", sessionChanges: [{ action: "edit", match: { dayOfWeek: "Monday" }, exerciseChanges: [{ action: "add", exercise: item }] }] }],
});

describe("test items in a change set", () => {
  it("validates { test, conditions } and names the slot 'Test: ...'", () => {
    const v = validateChangeSet(addTest({ test: "Max Hang", conditions: { "Edge depth": 20 }, values: { notes: "fresh" } }));
    expect(v.valid).toBe(true);
    const ex = (v.data!.weeks[0].sessionChanges![0] as any).exerciseChanges[0].exercise;
    expect(ex).toMatchObject({ exerciseTypeName: "Test: Max Hang", test: "Max Hang", conditions: { "Edge depth": 20 } });
  });

  it("rejects an empty test name and non-object conditions", () => {
    expect(validateChangeSet(addTest({ test: "" })).valid).toBe(false);
    expect(validateChangeSet(addTest({ test: "Max Hang", conditions: [1] })).valid).toBe(false);
  });

  it("schedules a test slot with its conditions mapped to the test's fields", () => {
    const r = plan(addTest({ test: "max hang", conditions: { "edge depth": "20", Grip: "open hand" }, values: { notes: "after the rest day" } }));
    const slot = r.writes.weeks.find((w) => w.weekId === "2026-W42")!.planned!.flatMap((w) => w.exercises).find((e) => e.test)!;
    expect(slot.test).toEqual({ typeId: "hang", name: "Max Hang", conditions: { edge: 20, grip: "Open hand" } });
    expect(slot.prescribed?.notes).toBe("after the rest day");
    expect(r.items.every((i) => i.errors.length === 0)).toBe(true);
  });

  it("reports an unknown test and ignores unknown conditions", () => {
    const bad = plan(addTest({ test: "Max Squats" }));
    expect(bad.items.some((i) => i.errors.some((e) => e.includes('No test called "Max Squats"') && e.includes("Max Hang")))).toBe(true);
    const warn = plan(addTest({ test: "Max Hang", conditions: { Temperature: 20, Grip: "Pinch" } }));
    const warnings = warn.items.flatMap((i) => i.warnings).join(" ");
    expect(warnings).toContain('no condition "Temperature"');
    expect(warnings).toContain("isn't one of Grip's options");
  });

  it("finds a planned test by 'Test: name' to move or remove it", () => {
    const testSlot = makeTestSlot({ id: "ts", type: hang, conditions: { edge: 20 } });
    const w: Workout = { id: "w44", status: "planned", date: null, weekId: "2026-W42", dayOfWeek: "Monday", notes: "Board", loadFactor: 0, exercises: [testSlot] } as Workout;
    const r = plan(
      { weeks: [{ week: "2026-W42", sessionChanges: [{ action: "edit", match: { dayOfWeek: "Monday" }, exerciseChanges: [{ action: "remove", match: { exerciseTypeName: "Test: Max Hang" } }] }] }] },
      state({ workouts: [w], weekOverrides: [{ weekId: "2026-W42", customized: true }] }),
    );
    const exercises = r.writes.weeks.find((x) => x.weekId === "2026-W42")!.planned!.flatMap((x) => x.exercises);
    expect(exercises.some((e) => e.test)).toBe(false);
    expect(r.items.flatMap((i) => i.details).join("\n")).toContain("− Test: Max Hang");
  });
});

describe("what the AI is told about tests", () => {
  const asOf = new Date(2026, 9, 11, 12);
  const result = (date: string, value: number) => ({ id: `b${value}`, typeId: "hang", type: "Max Hang", value, unit: "kg", date, weekId: "2026-W30", values: { weight: value, edge: 20, grip: "Half crimp" } });
  const source = (workouts: Workout[] = []) => ({
    exerciseTypes: [], analyticsCategories: [], phaseDefs: [], workouts, benchmarks: [result("2026-08-01T10:00:00Z", 50), result("2026-09-01T10:00:00Z", 52)],
    trainingBlocks: [], goals: [], dailyMetrics: [], painLogs: [], outdoorAscents: [], weekNotes: [], valueDefs, benchmarkTypes: [hang, pull],
  });

  it("lists each test with what it records, its last result, how long ago and whether it is due", () => {
    const tests = buildTestSummaries(source(), asOf);
    const h = tests.find((t) => t.name === "Max Hang")!;
    expect(h.result).toBe("Added weight (kg)");
    expect(h.conditions?.map((c) => c.name)).toEqual(["Edge depth", "Grip"]);
    expect(h.conditions?.[1].options).toEqual(["Half crimp", "Open hand"]);
    expect(h.last?.value).toBe("52 kg");
    expect(h.weeksSince).toBe(5);
    expect(h.due).toBe(false);
    const p = tests.find((t) => t.name === "Max Pull-ups")!;
    expect(p.due).toBe(true);
    expect(p.weeksSince).toBeUndefined();
    expect(p.last).toBeUndefined();
  });

  it("says where a test is already planned", () => {
    const w: Workout = { id: "w", status: "planned", date: null, weekId: "2026-W42", dayOfWeek: "Monday", notes: "Board", loadFactor: 0, exercises: [makeTestSlot({ id: "ts", type: hang })] } as Workout;
    const h = buildTestSummaries(source([w]), asOf).find((t) => t.name === "Max Hang")!;
    expect(h.plannedIn).toEqual([{ week: "2026-W42", session: "Board", day: "Monday" }]);
  });

  it("shows a planned test to the AI the way it would write one", () => {
    const w: Workout = { id: "w", status: "planned", date: null, weekId: "2026-W42", dayOfWeek: "Monday", notes: "Board", loadFactor: 0, exercises: [makeTestSlot({ id: "ts", type: hang, conditions: { edge: 20, grip: "Half crimp" } })] } as Workout;
    const text = buildPlanContext({ ...state(), workouts: [w], weekOverrides: [{ weekId: "2026-W42", customized: true }], targetWeekIds: ["2026-W42"] });
    expect(text).toContain('"test":"Max Hang"');
    expect(text).toContain('"Edge depth":20');
    expect(text).toContain('"Grip":"Half crimp"');
  });

  it("documents TEST and the test plan in the rules", () => {
    expect(AI_CHANGESET_INSTRUCTIONS).toContain('{ "test": "Max Hang"');
    expect(AI_CHANGESET_INSTRUCTIONS).toContain("Write the test plan down");
  });
});
