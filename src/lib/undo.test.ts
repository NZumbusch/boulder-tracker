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
  showConfirm: vi.fn(async () => { throw new Error("deletes should not ask for confirmation"); }),
}));

import { trainingState } from "./state.svelte";
import { toast } from "./toast.svelte";
import { DATA_EXPORT_VERSION } from "./constants";
import { setDbState } from "./storage/persistence";

beforeEach(async () => {
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, {
    database_version: DATA_EXPORT_VERSION,
    workouts: [{ id: "w1", status: "completed", date: "2026-09-01T10:00:00.000Z", weekId: "2026-W36", loadFactor: 300, notes: "Board", exercises: [] }],
    benchmarks: [{ id: "b1", typeId: "t", type: "Max Hang", value: 20, unit: "kg", date: "2026-09-01", weekId: "2026-W36" }],
    outdoorAscents: [{ id: "a1", date: "2026-09-02", grade: "7A", name: "Rainbow Rocket" }],
    painLogs: [{ id: "p1", date: "2026-09-02", weekId: "2026-W36", bodyPart: "Finger", severity: 3 }],
  });
  setDbState(null); // re-read the seeded store, not the one cached on import
  await trainingState.refresh();
  expect(trainingState.workouts.map((w) => w.id)).toEqual(["w1"]);
});

describe("deleting shows an undo instead of asking first", () => {
  it("a session: gone at once, back after Undo", async () => {
    await trainingState.deleteWorkout("w1");
    expect(trainingState.workouts.map((w) => w.id)).toEqual([]);
    expect(toast.current?.text).toMatch(/deleted/i);
    await toast.current!.action!.run();
    expect(trainingState.workouts.map((w) => w.id)).toEqual(["w1"]);
    expect(toast.current).toBeNull();
  });

  it("a benchmark, a send and a pain log likewise", async () => {
    await trainingState.deleteBenchmark("b1");
    expect(trainingState.benchmarks).toEqual([]);
    await toast.current!.action!.run();
    expect(trainingState.benchmarks.map((b) => b.id)).toEqual(["b1"]);

    await trainingState.deleteOutdoorAscent("a1");
    expect(trainingState.outdoorAscents).toEqual([]);
    await toast.current!.action!.run();
    expect(trainingState.outdoorAscents.map((a) => a.id)).toEqual(["a1"]);

    await trainingState.deletePainLog("p1");
    expect(trainingState.painLogs).toEqual([]);
    await toast.current!.action!.run();
    expect(trainingState.painLogs.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("undoing an AI plan change from its toast", () => {
  it("puts the blocks back", async () => {
    const blocksBefore = trainingState.trainingBlocks.map((b) => b.id);
    await trainingState.applyPlanWrites({
      trainingBlocks: [{ id: "ai", name: "AI", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W41" }],
      weeks: [],
      weekNotes: [],
    });
    expect(trainingState.trainingBlocks.map((b) => b.id)).toEqual(["ai"]);
    expect(toast.current?.text).toMatch(/AI changes applied/);
    await toast.current!.action!.run();
    expect(trainingState.trainingBlocks.map((b) => b.id)).toEqual(blocksBefore);
    expect(await trainingState.getPlanUndo()).toBeNull();
  });
});

describe("copying a week", () => {
  it("adds the sessions as a plan in the target weeks, and Undo removes them", async () => {
    await trainingState.copyWeek("2026-W36", ["2026-W37", "2026-W38"]);
    for (const weekId of ["2026-W37", "2026-W38"]) {
      const week = trainingState.getWorkoutsForWeek(weekId);
      expect(week.map((w) => [w.notes, w.status])).toEqual([["Board", "planned"]]);
    }
    expect(toast.current?.text).toMatch(/1 session copied to 2026-W37 – 2026-W38/);
    await toast.current!.action!.run();
    expect(trainingState.getWorkoutsForWeek("2026-W37")).toEqual([]);
    expect(trainingState.workouts.map((w) => w.id)).toEqual(["w1"]);
  });
});

describe("toast", () => {
  it("shows one at a time and dismisses itself", async () => {
    vi.useFakeTimers();
    toast.show("first");
    toast.show("second", { durationMs: 1000 });
    expect(toast.current?.text).toBe("second");
    vi.advanceTimersByTime(1001);
    expect(toast.current).toBeNull();
    vi.useRealTimers();
  });
});
