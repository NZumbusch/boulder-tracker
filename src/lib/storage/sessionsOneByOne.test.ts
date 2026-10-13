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
import type { DismissedSession, ExerciseSlot, TrainingBlock, Workout, WorkoutTemplate } from "../types";
import { weekMondayIso, weekSundayIso } from "../dateUtils";
import { weekDismissalId, provisionalWorkoutId } from "../planning/weekProjection";

const PHASE_ID = "phase-capacity";
const WEEK = "2026-W25";
const BOARD = provisionalWorkoutId(WEEK, "tpl1");
const ENDURANCE = provisionalWorkoutId(WEEK, "tpl2");

function slot(id: string): ExerciseSlot {
  return { id, typeId: "t1", activeParameters: [], prescribed: { duration: 30 } };
}

const TEMPLATES: Record<string, WorkoutTemplate[]> = {
  [PHASE_ID]: [
    { id: "tpl1", name: "Board", dayOfWeek: "Monday", exercises: [slot("s1")] },
    { id: "tpl2", name: "Endurance", dayOfWeek: "Thursday", exercises: [slot("s2")] },
  ],
};

function seed(overrides: { workouts?: Workout[]; trainingBlocks?: TrainingBlock[]; dismissedSessions?: DismissedSession[] } = {}) {
  setDbState({
    workouts: [],
    trainingBlocks: [],
    dismissedSessions: [],
    benchmarks: [],
    templates: TEMPLATES,
    phaseDefs: [{ id: PHASE_ID, name: "Capacity" }],
    ...overrides,
  });
}

function stored(weekId: string, id: string, status: Workout["status"] = "planned"): Workout {
  return { id, status, date: null, weekId, loadFactor: 0, exercises: [] };
}

const dismissal = (id: string, weekId = WEEK): DismissedSession => ({ id, weekId });

beforeEach(() => seed());

describe("saving a session", () => {
  it("stores just that session - nothing else in the week is written", async () => {
    await storage.saveWorkout(stored(WEEK, BOARD));
    expect((await storage.getWorkouts()).map((w) => w.id)).toEqual([BOARD]);
    expect(await storage.getDismissedSessions()).toEqual([]);
  });

  it("no longer marks the week as hand-edited", async () => {
    await storage.saveWorkout(stored(WEEK, "mine"));
    expect(await storage.getDismissedSessions()).toEqual([]);
  });

  it("takes back a dismissal of the same session (undoing a delete)", async () => {
    seed({ dismissedSessions: [dismissal(BOARD), dismissal(ENDURANCE)] });
    await storage.saveWorkout(stored(WEEK, BOARD));
    expect(await storage.getDismissedSessions()).toEqual([dismissal(ENDURANCE)]);
  });
});

describe("deleting a session", () => {
  it("a session of your own is just removed", async () => {
    seed({ workouts: [stored(WEEK, "mine")] });
    await storage.deleteWorkout("mine");
    expect(await storage.getWorkouts()).toEqual([]);
    expect(await storage.getDismissedSessions()).toEqual([]);
  });

  it("one that came from a template is removed and remembered, so the template doesn't bring it back", async () => {
    seed({ workouts: [stored(WEEK, BOARD)] });
    await storage.deleteWorkout(BOARD);
    expect(await storage.getWorkouts()).toEqual([]);
    expect(await storage.getDismissedSessions()).toEqual([dismissal(BOARD)]);
  });

  it("dismissSession remembers a projected session that was never stored, once", async () => {
    await storage.dismissSession(ENDURANCE, WEEK);
    await storage.dismissSession(ENDURANCE, WEEK);
    expect(await storage.getDismissedSessions()).toEqual([dismissal(ENDURANCE)]);
    expect(await storage.getWorkouts()).toEqual([]);
  });
});

describe("saveProjectedSessions", () => {
  it("stores the given projected sessions as real rows, without the provisional flag", async () => {
    const n = await storage.saveProjectedSessions([{ ...stored(WEEK, BOARD), provisional: true }, stored(WEEK, ENDURANCE)]);
    expect(n).toBe(2);
    const rows = await storage.getWorkouts();
    expect(rows.map((w) => w.id)).toEqual([BOARD, ENDURANCE]);
    expect("provisional" in rows[0]).toBe(false);
  });

  it("skips what is already stored, so a repeat can never duplicate", async () => {
    seed({ workouts: [stored(WEEK, BOARD)] });
    expect(await storage.saveProjectedSessions([stored(WEEK, BOARD), stored(WEEK, ENDURANCE)])).toBe(1);
    expect((await storage.getWorkouts()).map((w) => w.id)).toEqual([BOARD, ENDURANCE]);
  });

  it("does nothing for an empty list", async () => {
    expect(await storage.saveProjectedSessions([])).toBe(0);
  });
});

describe("resetWeekToPhaseDefaults", () => {
  it("drops the week's saved planned sessions and its dismissals so it follows the phase again", async () => {
    seed({
      workouts: [stored(WEEK, BOARD), stored(WEEK, "mine")],
      dismissedSessions: [dismissal(ENDURANCE), dismissal(weekDismissalId(WEEK))],
    });
    await storage.resetWeekToPhaseDefaults(WEEK);
    expect(await storage.getWorkouts()).toEqual([]);
    expect(await storage.getDismissedSessions()).toEqual([]);
  });

  it("keeps completed sessions", async () => {
    seed({ workouts: [stored(WEEK, "done", "completed"), stored(WEEK, "stale")] });
    await storage.resetWeekToPhaseDefaults(WEEK);
    expect((await storage.getWorkouts()).map((w) => w.id)).toEqual(["done"]);
  });

  it("leaves other weeks alone, dismissals included", async () => {
    seed({ workouts: [stored(WEEK, "mine"), stored("2026-W30", "other")], dismissedSessions: [dismissal(weekDismissalId("2026-W30"), "2026-W30")] });
    await storage.resetWeekToPhaseDefaults(WEEK);
    expect((await storage.getWorkouts()).map((w) => w.id)).toEqual(["other"]);
    expect(await storage.getDismissedSessions()).toHaveLength(1);
  });

  it("is a safe no-op on a week that has nothing saved", async () => {
    await storage.resetWeekToPhaseDefaults(WEEK);
    expect(await storage.getWorkouts()).toEqual([]);
  });
});

describe("clearWeekData", () => {
  it("empties the week for good when a longer block still covers it, so it doesn't spring back", async () => {
    seed({ trainingBlocks: [{ id: "b1", name: "Base", phaseId: PHASE_ID, startDate: "2026-05-11", endDate: "2026-07-26" }] });
    await storage.clearWeekData(WEEK);
    expect(await storage.getDismissedSessions()).toEqual([dismissal(weekDismissalId(WEEK))]);
    expect(await storage.getTrainingBlocks()).toHaveLength(1);
  });

  it("just forgets the week's dismissals when nothing covers it any more", async () => {
    seed({
      trainingBlocks: [{ id: "b1", name: "Base", phaseId: PHASE_ID, startDate: weekMondayIso(WEEK), endDate: weekSundayIso(WEEK) }],
      dismissedSessions: [dismissal(ENDURANCE)],
    });
    await storage.clearWeekData(WEEK);
    expect(await storage.getDismissedSessions()).toEqual([]);
    expect(await storage.getTrainingBlocks()).toEqual([]);
  });

  it("removes the week's workouts either way", async () => {
    seed({ workouts: [stored(WEEK, "w1"), stored("2026-W30", "keep")] });
    await storage.clearWeekData(WEEK);
    expect((await storage.getWorkouts()).map((w) => w.id)).toEqual(["keep"]);
  });
});
