import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("./utils", async (orig) => ({ ...(await orig<typeof import("./utils")>()), showConfirm: vi.fn(async () => true) }));

import { trainingState } from "./state.svelte";
import { DATA_EXPORT_VERSION } from "./constants";
import { setDbState } from "./storage/persistence";
import { buildPastSession } from "./session/pastSession";

beforeEach(async () => {
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, {
    database_version: DATA_EXPORT_VERSION,
    workouts: [],
    phaseDefs: [],
    exerciseTypes: [{ id: "t1", name: "Bouldering", category: "Climbing", parameters: ["duration"] }],
    templates: {},
    trainingBlocks: [],
  });
  setDbState(null);
  await trainingState.refresh();
});

describe("a logged past session", () => {
  it("is stored once and read back through the week, History and the week of its date", async () => {
    const w = buildPastSession({ id: "past1", day: "2026-09-07", time: "18:00", notes: "Board" }, new Date(2026, 9, 16))!;
    w.exercises = [{ id: "s1", typeId: "t1", logged: { duration: 60 } }];
    const saved = await trainingState.saveWorkout(w);
    expect(saved?.id).toBe("past1");

    expect(trainingState.workouts.filter((x) => x.id === "past1")).toHaveLength(1);
    expect(trainingState.getWorkoutsForWeek("2026-W37").map((x) => x.id)).toEqual(["past1"]);
    expect(trainingState.getWorkoutsForWeek("2026-W37")[0].status).toBe("completed");
    // Not in the neighbouring weeks.
    expect(trainingState.getWorkoutsForWeek("2026-W36")).toEqual([]);
    expect(trainingState.getWorkoutsForWeek("2026-W38")).toEqual([]);
  });

  it("is not offered as something still to start", async () => {
    const w = buildPastSession({ id: "past2", day: "2026-09-08" }, new Date(2026, 9, 16))!;
    w.exercises = [{ id: "s1", typeId: "t1", logged: { duration: 30 } }];
    await trainingState.saveWorkout(w);
    expect(trainingState.getStartableWorkoutsForWeek("2026-W37")).toEqual([]);
  });
});
