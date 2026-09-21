import { describe, it, expect, vi, beforeEach } from "vitest";

// localforage/Capacitor are browser/native adapters; the storage *domain*
// logic under test here is platform-agnostic, so both are stubbed and
// `_dbState` is driven directly.
vi.mock("localforage", () => ({
  default: { config: vi.fn(), setItem: vi.fn(async () => {}), getItem: vi.fn(async () => null) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState } from "./persistence";
import type { ExerciseSlot, TrainingBlock, WeekOverride, Workout, WorkoutTemplate } from "../types";

const PHASE_ID = "phase-capacity";
const WEEK = "2026-W25";

function slot(id: string): ExerciseSlot {
  return { id, typeId: "t1", activeParameters: [], prescribed: { duration: 30 } };
}

const TEMPLATES: Record<string, WorkoutTemplate[]> = {
  [PHASE_ID]: [
    { id: "tpl1", name: "Board", dayOfWeek: "Monday", exercises: [slot("s1")] },
    { id: "tpl2", name: "Endurance", dayOfWeek: "Thursday", exercises: [slot("s2")] },
  ],
};

function seed(overrides: {
  workouts?: Workout[];
  trainingBlocks?: TrainingBlock[];
  weekOverrides?: WeekOverride[];
  templates?: Record<string, WorkoutTemplate[]>;
} = {}) {
  setDbState({
    workouts: [],
    trainingBlocks: [],
    weekOverrides: [],
    competitionEvents: [],
    benchmarks: [],
    templates: TEMPLATES,
    phaseDefs: [{ id: PHASE_ID, name: "Capacity" }],
    ...overrides,
  });
}

function storedWorkout(weekId: string, id: string, status: Workout["status"] = "planned"): Workout {
  return { id, status, date: null, weekId, loadFactor: 0, exercises: [] };
}

beforeEach(() => seed());

describe("assignPhaseToWeek - copy-on-write", () => {
  it("writes the block but no workouts for an empty week", async () => {
    await storage.assignPhaseToWeek(WEEK, PHASE_ID);

    expect(await storage.getTrainingBlocks()).toHaveLength(1);
    // The week's sessions are projected at read time now, not stored.
    expect(await storage.getWorkouts()).toEqual([]);
  });

  it("does not mark the week customized, so it stays provisional", async () => {
    await storage.assignPhaseToWeek(WEEK, PHASE_ID);
    expect(await storage.getWeekOverrides()).toEqual([]);
  });

  it("clears a stale customized flag on an empty week so it can follow the phase again", async () => {
    // The state "Clear Week" leaves behind when a multi-week block still
    // covers the week - assigning a phase must undo it.
    seed({ weekOverrides: [{ weekId: WEEK, customized: true }] });
    await storage.assignPhaseToWeek(WEEK, PHASE_ID);
    expect(await storage.getWeekOverrides()).toEqual([]);
  });

  it("regenerates a week that has stored sessions but was never hand-edited", async () => {
    seed({ workouts: [storedWorkout(WEEK, "old")] });
    await storage.assignPhaseToWeek(WEEK, PHASE_ID);

    const workouts = await storage.getWorkouts();
    expect(workouts.map((w) => w.id)).not.toContain("old");
    expect(workouts).toHaveLength(2);
    expect(workouts.map((w) => w.notes).sort()).toEqual(["Board", "Endurance"]);
  });

  it("leaves a hand-edited week completely alone", async () => {
    seed({
      workouts: [storedWorkout(WEEK, "mine")],
      weekOverrides: [{ weekId: WEEK, customized: true }],
    });
    await storage.assignPhaseToWeek(WEEK, PHASE_ID);

    const workouts = await storage.getWorkouts();
    expect(workouts.map((w) => w.id)).toEqual(["mine"]);
  });

  it("never touches completed sessions when regenerating", async () => {
    seed({ workouts: [storedWorkout(WEEK, "done", "completed")] });
    await storage.assignPhaseToWeek(WEEK, PHASE_ID);

    const workouts = await storage.getWorkouts();
    expect(workouts.map((w) => w.id)).toContain("done");
  });

  it("leaves other weeks' workouts untouched", async () => {
    seed({ workouts: [storedWorkout("2026-W30", "other")] });
    await storage.assignPhaseToWeek(WEEK, PHASE_ID);

    const workouts = await storage.getWorkouts();
    expect(workouts.map((w) => w.id)).toContain("other");
  });
});

describe("materializeWeek", () => {
  const projected: Workout[] = [storedWorkout(WEEK, "p1"), storedWorkout(WEEK, "p2")];

  it("writes the projected sessions as real rows", async () => {
    await storage.materializeWeek(WEEK, projected);
    expect((await storage.getWorkouts()).map((w) => w.id)).toEqual(["p1", "p2"]);
  });

  it("does not mark the week customized - materialising is not a hand edit", async () => {
    await storage.materializeWeek(WEEK, projected);
    expect(await storage.getWeekOverrides()).toEqual([]);
  });

  it("is a no-op once the week has anything stored, so it can never duplicate a week", async () => {
    seed({ workouts: [storedWorkout(WEEK, "already")] });
    await storage.materializeWeek(WEEK, projected);
    expect((await storage.getWorkouts()).map((w) => w.id)).toEqual(["already"]);
  });

  it("ignores an empty projection", async () => {
    await storage.materializeWeek(WEEK, []);
    expect(await storage.getWorkouts()).toEqual([]);
  });
});

describe("clearWeekData", () => {
  it("marks the week customized when a multi-week block still covers it", async () => {
    // Otherwise the week would immediately re-project from that block's
    // phase and clearing would appear to do nothing.
    seed({
      trainingBlocks: [
        { id: "b1", name: "Base", phaseId: PHASE_ID, startWeekId: "2026-W20", endWeekId: "2026-W30" },
      ],
    });
    await storage.clearWeekData(WEEK);

    expect(await storage.getWeekOverrides()).toEqual([{ weekId: WEEK, customized: true }]);
    expect(await storage.getTrainingBlocks()).toHaveLength(1);
  });

  it("just drops the override when nothing covers the week any more", async () => {
    seed({
      trainingBlocks: [
        { id: "b1", name: "Base", phaseId: PHASE_ID, startWeekId: WEEK, endWeekId: WEEK },
      ],
      weekOverrides: [{ weekId: WEEK, customized: true }],
    });
    await storage.clearWeekData(WEEK);

    expect(await storage.getWeekOverrides()).toEqual([]);
    expect(await storage.getTrainingBlocks()).toEqual([]);
  });

  it("removes the week's workouts either way", async () => {
    seed({ workouts: [storedWorkout(WEEK, "w1"), storedWorkout("2026-W30", "keep")] });
    await storage.clearWeekData(WEEK);

    expect((await storage.getWorkouts()).map((w) => w.id)).toEqual(["keep"]);
  });
});
