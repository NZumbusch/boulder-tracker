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
import { toast } from "./toast.svelte";
import { DATA_EXPORT_VERSION } from "./constants";
import { setDbState } from "./storage/persistence";
import { isPlanBSessionId } from "./planning/planB";
import type { Workout } from "./types";

// Far enough ahead that no app load materialises these weeks as "past".
const W1 = "2030-W10";
const W2 = "2030-W11";

beforeEach(async () => {
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, {
    database_version: DATA_EXPORT_VERSION,
    workouts: [],
    phaseDefs: [{ id: "strength", name: "Strength" }],
    exerciseTypes: [{ id: "t1", name: "Bouldering", category: "Climbing", parameters: ["duration"] }],
    templates: {
      strength: [
        { id: "tpl-board", name: "Board", dayOfWeek: "Saturday", exercises: [{ id: "s1", typeId: "t1", prescribed: { duration: 90, plannedLoad: 6 } }] },
        { id: "tpl-hangs", name: "Max hangs", dayOfWeek: "Monday", exercises: [{ id: "s2", typeId: "t1", prescribed: { duration: 30 } }] },
      ],
    },
    trainingBlocks: [{ id: "blk", name: "Strength", phaseId: "strength", startWeekId: W1, endWeekId: W2 }],
  });
  setDbState(null);
  trainingState.planBEditing = null;
  await trainingState.refresh();
});

const named = (ws: Workout[], name: string) => ws.find((w) => w.notes === name)!;
const names = (ws: Workout[]) => ws.map((w) => w.notes).sort();

async function makeOutdoorPlanB() {
  trainingState.editPlanBAt(W1, "Saturday");
  const board = named(trainingState.getWorkoutsForWeek(W1), "Board");
  const saved = await trainingState.saveWorkout({ ...board, notes: "Outdoor" });
  return saved!;
}

describe("Plan B mode", () => {
  it("an edit becomes Plan B's own version - the week stays provisional and Plan A still counts", async () => {
    const saved = await makeOutdoorPlanB();
    expect(isPlanBSessionId(saved.id)).toBe(true);
    expect(saved.notes).toBe("Outdoor");
    expect(trainingState.planAlternatives).toHaveLength(1);
    expect(trainingState.isWeekProvisional(W1)).toBe(true);
    expect(trainingState.workouts).toEqual([]);

    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Board", "Max hangs"]);
    const view = trainingState.getWeekPlanView(W1);
    expect(names(view.shown)).toEqual(["Board", "Max hangs", "Outdoor"]);
    expect(named(view.shown, "Outdoor").planB).toMatchObject({ side: "B", active: false });
  });

  it("making Plan B the likely one moves the numbers over", async () => {
    await makeOutdoorPlanB();
    const alt = trainingState.planAlternatives[0];
    await trainingState.setPlanBOccurrence(alt.id, alt.startWeekId, { likely: "B" });
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Max hangs", "Outdoor"]);
  });

  it("editing a day in the next week stretches the Plan B across the week boundary", async () => {
    await makeOutdoorPlanB();
    const hangs = named(trainingState.getWorkoutsForWeek(W2), "Max hangs");
    await trainingState.deleteWorkout(hangs.id);
    const alt = trainingState.planAlternatives[0];
    expect(alt).toMatchObject({ startWeekId: W1, startDay: "Saturday", days: 3 });
    expect(trainingState.isWeekProvisional(W2)).toBe(true);
    // Plan A still has it; Plan B doesn't.
    expect(names(trainingState.getWorkoutsForWeek(W2))).toEqual(["Board", "Max hangs"]);
    await trainingState.setPlanBOccurrence(alt.id, alt.startWeekId, { likely: "B" });
    expect(names(trainingState.getWorkoutsForWeek(W2))).toEqual(["Board"]);
  });

  it("finishing without any change leaves no empty Plan B behind", async () => {
    trainingState.editPlanBAt(W1, "Saturday");
    await trainingState.finishPlanBEditing();
    expect(trainingState.planAlternatives).toEqual([]);
    expect(trainingState.planBEditing).toBeNull();
  });

  it("undoing a normal delete puts the session back in the week, not into Plan B", async () => {
    trainingState.planBEditing = null;
    const board = named(trainingState.getWorkoutsForWeek(W1), "Board");
    await trainingState.deleteWorkout(board.id);
    trainingState.editPlanBAt(W1, "Saturday");
    await toast.current!.action!.run();
    expect(trainingState.planAlternatives).toEqual([]);
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Board", "Max hangs"]);
  });
});

describe("outside Plan B mode", () => {
  it("editing a Plan B session still edits Plan B", async () => {
    const outdoor = await makeOutdoorPlanB();
    await trainingState.finishPlanBEditing();
    const again = await trainingState.saveWorkout({ ...outdoor, notes: "Outdoor, Frankenjura" });
    expect(again!.id).toBe(outdoor.id);
    expect(trainingState.planAlternatives[0].changes).toHaveLength(1);
    expect(trainingState.workouts).toEqual([]);
  });

  it("logging a Plan B session stores it and decides Plan B", async () => {
    const outdoor = await makeOutdoorPlanB();
    await trainingState.finishPlanBEditing();
    await trainingState.saveWorkout({ ...outdoor, status: "completed", date: "2030-03-09T10:00:00.000Z", loadFactor: 400 });
    expect(trainingState.workouts.find((w) => w.id === outdoor.id)?.status).toBe("completed");
    const view = trainingState.getWeekPlanView(W1);
    expect(view.occurrences[0].decided).toBe("B");
    expect(names(trainingState.getWorkoutsForWeek(W1))).toEqual(["Max hangs", "Outdoor"]);
    // Board is still there, as Plan A's session that wasn't chosen.
    expect(named(view.shown, "Board").planB).toMatchObject({ side: "A", active: false, decided: true });
  });

  it("deleting a Plan B session turns the swap into a drop, with Undo", async () => {
    const outdoor = await makeOutdoorPlanB();
    await trainingState.finishPlanBEditing();
    await trainingState.deleteWorkout(outdoor.id);
    expect(trainingState.planAlternatives[0].changes[0].session).toBeUndefined();
    await toast.current!.action!.run();
    expect(trainingState.planAlternatives[0].changes[0].session?.name).toBe("Outdoor");
  });

  it("deleting the whole Plan B keeps Plan A", async () => {
    await makeOutdoorPlanB();
    await trainingState.deletePlanB(trainingState.planAlternatives[0].id);
    expect(trainingState.planAlternatives).toEqual([]);
    expect(trainingState.planBEditing).toBeNull();
    expect(names(trainingState.getWeekPlanView(W1).shown)).toEqual(["Board", "Max hangs"]);
  });
});
