import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("localforage", () => ({
  default: { config: vi.fn(), setItem: vi.fn(async () => {}), getItem: vi.fn(async () => null) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState } from "./persistence";
import { parsePlanImport } from "../ai/planImportEntry";
import { planWithSelection, allItemIds, type PlannerState } from "../ai/changePlanner";
import { effectiveWorkoutsForWeek } from "../planning/weekProjection";

beforeEach(() =>
  setDbState({
    exerciseTypes: [{ id: "hb", name: "Hangboard", category: "Fingers", parameters: ["sets"] }],
    analyticsCategories: [{ id: "c", name: "Fingers", color: "x" }],
    phaseDefs: [{ id: "cap", name: "Capacity", order: 1 }],
    templates: { cap: [{ id: "t", name: "Board", dayOfWeek: "Monday", exercises: [{ id: "s", typeId: "hb", prescribed: { sets: 5 } }] }] },
    trainingBlocks: [{ id: "b", name: "Capacity", phaseId: "cap", startWeekId: "2026-W40", endWeekId: "2026-W45" }],
    workouts: [],
    weekOverrides: [],
    weekNotes: [],
  }),
);

async function plannerState(): Promise<PlannerState> {
  return {
    exerciseTypes: await storage.getExerciseTypes(),
    analyticsCategories: await storage.getAnalyticsCategories(),
    phaseDefs: await storage.getPhaseDefs(),
    templates: await storage.getTemplates(),
    trainingBlocks: await storage.getTrainingBlocks(),
    workouts: await storage.getWorkouts(),
    weekOverrides: await storage.getWeekOverrides(),
    weekNotes: await storage.getWeekNotes(),
    currentWeekId: "2026-W39",
  };
}

describe("an AI change set, pasted and applied", () => {
  it("lands in storage exactly as the preview described", async () => {
    const reply = JSON.stringify({
      summary: "Two power weeks, a lighter first one.",
      exerciseTypes: [{ action: "add", name: "Campus Ladders", categoryName: "Fingers" }],
      phases: [{ action: "add", name: "Power", sessions: [{ name: "Limit", dayOfWeek: "Tuesday", notes: "Full rest", exercises: [{ exerciseTypeName: "Campus Ladders", values: { sets: 4 } }] }] }],
      weeks: [
        { from: "2026-W42", to: "2026-W43", phase: "Power", blockNotes: "Peak" },
        { week: "2026-W42", sessionChanges: [{ action: "edit", match: { name: "Limit" }, exerciseChanges: [{ action: "edit", match: { exerciseTypeName: "Campus Ladders" }, values: { sets: 2 } }] }], notes: "Ease in" },
      ],
    });
    const state = await plannerState();
    const parsed = parsePlanImport(reply, state);
    expect(parsed.result.valid).toBe(true);
    const plan = planWithSelection(parsed.result.data!, state, allItemIds(parsed.result.data!));
    expect(plan.selected.size).toBe(4);

    await storage.applyPlanWrites(plan.writes);

    const after = await plannerState();
    const ctx = { workouts: after.workouts, trainingBlocks: after.trainingBlocks, templates: after.templates, weekOverrides: after.weekOverrides };
    // W41 still follows Capacity; W43 follows the new Power phase; W42 is its own lighter week.
    expect(effectiveWorkoutsForWeek(ctx, "2026-W41").map((w) => w.notes)).toEqual(["Board"]);
    const w43 = effectiveWorkoutsForWeek(ctx, "2026-W43");
    expect(w43.map((w) => [w.notes, w.description, w.exercises[0].prescribed?.sets])).toEqual([["Limit", "Full rest", 4]]);
    const w42 = effectiveWorkoutsForWeek(ctx, "2026-W42");
    expect(w42.map((w) => w.exercises[0].prescribed?.sets)).toEqual([2]);
    expect(after.weekOverrides).toEqual([{ weekId: "2026-W42", customized: true }]);
    expect(after.weekNotes).toEqual([{ weekId: "2026-W42", text: "AI: Ease in" }]);
    expect(after.trainingBlocks.map((b) => `${b.name}:${b.startWeekId}-${b.endWeekId}`).sort()).toEqual([
      "Capacity:2026-W40-2026-W41",
      "Capacity:2026-W44-2026-W45",
      "Power:2026-W42-2026-W43",
    ]);
    expect(after.exerciseTypes.find((t) => t.name === "Campus Ladders")?.parameters).toEqual(["sets"]);
  });
});
