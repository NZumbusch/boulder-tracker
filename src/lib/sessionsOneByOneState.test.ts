import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny in-memory localforage, so trainingState reads back what it wrote.
const { db } = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (k: string) => (k in db ? structuredClone(db[k]) : null)),
    setItem: vi.fn(async (k: string, v: unknown) => { db[k] = structuredClone(v); }),
    removeItem: vi.fn(async (k: string) => { delete db[k]; }),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("./utils", async (orig) => ({
  ...(await orig<typeof import("./utils")>()),
  showConfirm: vi.fn(async () => true),
}));

import { trainingState } from "./state.svelte";
import { DATA_EXPORT_VERSION } from "./constants";
import { setDbState } from "./storage/persistence";
import { storage } from "./storage";
import { weekMondayIso, weekSundayIso } from "./dateUtils";
import type { Workout } from "./types";

// Far ahead, so the app load doesn't save these as past sessions.
const W1 = "2030-W10";
const W2 = "2030-W11";

const seed = (extra: Record<string, unknown> = {}) => {
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, {
    database_version: DATA_EXPORT_VERSION,
    workouts: [],
    phaseDefs: [{ id: "strength", name: "Strength" }],
    exerciseTypes: [{ id: "t1", name: "Bouldering", category: "Climbing", parameters: ["duration"] }],
    templates: {
      strength: [
        { id: "tpl-board", name: "Board", dayOfWeek: "Saturday", exercises: [{ id: "s1", typeId: "t1", prescribed: { duration: 90 } }] },
        { id: "tpl-hangs", name: "Max hangs", dayOfWeek: "Monday", exercises: [{ id: "s2", typeId: "t1", prescribed: { duration: 30 } }] },
        { id: "tpl-float", name: "Core", exercises: [{ id: "s3", typeId: "t1", prescribed: { duration: 20 } }] },
      ],
    },
    trainingBlocks: [{ id: "blk", name: "Strength", phaseId: "strength", startDate: weekMondayIso(W1), endDate: weekSundayIso(W2) }],
    ...extra,
  });
  setDbState(null);
};

beforeEach(async () => {
  seed();
  await trainingState.refresh();
});

const named = (ws: Workout[], name: string) => ws.find((w) => w.notes === name)!;
const names = (ws: Workout[]) => ws.map((w) => w.notes).sort();
const stored = () => trainingState.workouts.filter((w) => w.weekId === W1);

describe("a phase's sessions, saved one by one", () => {
  it("a week shows its phase's sessions without storing any", () => {
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Board", "Core", "Max hangs"]);
    expect(trainingState.workouts).toEqual([]);
    expect(trainingState.canResetWeekToDefaults(W1)).toBe(false);
  });

  it("changing one session saves only that one; the others keep following the phase", async () => {
    const hangs = named(trainingState.getWorkoutsForWeek(W1), "Max hangs");
    await trainingState.saveWorkout({ ...hangs, dayOfWeek: "Tuesday" });
    expect(stored().map((w) => [w.notes, w.dayOfWeek])).toEqual([["Max hangs", "Tuesday"]]);
    const week = trainingState.getWorkoutsForWeek(W1);
    expect(names(week)).toEqual(["Board", "Core", "Max hangs"]); // still three, not four
    expect(named(week, "Max hangs").provisional).toBeUndefined();
    expect(named(week, "Board").provisional).toBe(true);
    expect(trainingState.canResetWeekToDefaults(W1)).toBe(true);
  });

  it("a saved session keeps its change when the phase's template changes; the unsaved ones follow it", async () => {
    const hangs = named(trainingState.getWorkoutsForWeek(W1), "Max hangs");
    await trainingState.saveWorkout({ ...hangs, notes: "My hangs" });
    await storage.saveTemplates({
      strength: [
        { id: "tpl-board", name: "Board v2", dayOfWeek: "Saturday", exercises: [] },
        { id: "tpl-hangs", name: "Hangs v2", dayOfWeek: "Monday", exercises: [] },
        { id: "tpl-float", name: "Core", exercises: [] },
      ],
    });
    await trainingState.refresh();
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Board v2", "Core", "My hangs"]);
  });

  it("deleting a session that is only projected removes it and keeps it removed; Undo brings it back", async () => {
    const board = named(trainingState.getWorkoutsForWeek(W1), "Board");
    await trainingState.deleteWorkout(board.id);
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Core", "Max hangs"]);
    expect(trainingState.dismissedSessions).toEqual([{ id: board.id, weekId: W1 }]);
    await trainingState.refresh(); // a reload does not bring it back
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Core", "Max hangs"]);
    // Undo saves the session again, which also takes back the dismissal.
    await trainingState.saveWorkout(board);
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Board", "Core", "Max hangs"]);
    expect(trainingState.dismissedSessions).toEqual([]);
  });

  it("deleting a saved session that came from a template keeps it deleted too", async () => {
    const hangs = named(trainingState.getWorkoutsForWeek(W1), "Max hangs");
    await trainingState.saveWorkout({ ...hangs, dayOfWeek: "Tuesday" });
    await trainingState.deleteWorkout(hangs.id);
    expect(stored()).toEqual([]);
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Board", "Core"]);
  });

  it("adding a session of your own leaves the phase's sessions alone", async () => {
    await trainingState.saveWorkout({ id: "mine", status: "planned", date: null, weekId: W1, dayOfWeek: "Friday", notes: "Run", loadFactor: 0, exercises: [] } as Workout);
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Board", "Core", "Max hangs", "Run"]);
    expect(stored().map((w) => w.notes)).toEqual(["Run"]);
  });

  it("duplicating a projected session adds a copy and leaves the original following the phase", async () => {
    const board = named(trainingState.getWorkoutsForWeek(W1), "Board");
    await trainingState.duplicateWorkout(board);
    expect(trainingState.getWorkoutsForWeek(W1).filter((w) => w.notes === "Board")).toHaveLength(2);
    expect(stored()).toHaveLength(1);
  });

  it("resetting the week drops what was saved and deleted", async () => {
    const hangs = named(trainingState.getWorkoutsForWeek(W1), "Max hangs");
    await trainingState.saveWorkout({ ...hangs, dayOfWeek: "Tuesday" });
    await trainingState.deleteWorkout(named(trainingState.getWorkoutsForWeek(W1), "Board").id);
    await trainingState.resetWeekToPhaseDefaults(W1);
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Board", "Core", "Max hangs"]);
    expect(trainingState.canResetWeekToDefaults(W1)).toBe(false);
  });

  it("clearing the week empties it for good, even under the longer block", async () => {
    await trainingState.clearWeek(W1);
    await trainingState.refresh();
    expect(trainingState.getWorkoutsForWeek(W1)).toEqual([]);
    expect(names(trainingState.getWorkoutsForWeek(W2))).toEqual(["Board", "Core", "Max hangs"]);
  });
});

describe("history is saved when the day has passed", () => {
  it("an app load saves the past days' sessions as planned, and only those", async () => {
    // A week that ended long ago: every session of it is saved on load.
    seed({ trainingBlocks: [{ id: "old", name: "Old", phaseId: "strength", startDate: "2020-03-02", endDate: "2020-03-08" }] });
    await trainingState.refresh();
    const old = trainingState.workouts.filter((w) => w.weekId === "2020-W10");
    expect(old.map((w) => w.notes).sort()).toEqual(["Board", "Core", "Max hangs"]);
    expect(old.every((w) => w.status === "planned")).toBe(true);
    // ...and so changing the template later does not change that week.
    await storage.saveTemplates({ strength: [{ id: "tpl-board", name: "Changed", dayOfWeek: "Saturday", exercises: [] }] });
    await trainingState.refresh();
    expect(names(trainingState.getWorkoutsForWeek("2020-W10"))).toEqual(["Board", "Core", "Max hangs"]);
  });
});
