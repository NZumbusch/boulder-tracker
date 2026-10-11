import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("localforage", () => ({
  default: { config: vi.fn(), setItem: vi.fn(async () => {}), getItem: vi.fn(async () => null) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState } from "./persistence";
import type { Workout } from "../types";

const w = (id: string, weekId: string, status: Workout["status"] = "planned"): Workout =>
  ({ id, status, date: status === "completed" ? "2026-09-22" : null, weekId, loadFactor: 0, exercises: [] }) as Workout;

beforeEach(() =>
  setDbState({
    workouts: [w("a", "2026-W40"), w("done", "2026-W40", "completed"), w("b", "2026-W41"), w("c", "2026-W42")],
    trainingBlocks: [{ id: "old", name: "Old", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W42" }],
    weekOverrides: [{ weekId: "2026-W41", customized: true }],
    weekNotes: [{ weekId: "2026-W40", text: "Mine" }],
    exerciseTypes: [],
    phaseDefs: [],
    templates: {},
  }),
);

describe("storage.applyPlanWrites", () => {
  it("swaps each touched week's planned sessions, keeps completed ones and untouched weeks", async () => {
    await storage.applyPlanWrites({
      weeks: [
        { weekId: "2026-W40", planned: [{ ...w("new", "2026-W40"), provisional: true }], customized: true },
        { weekId: "2026-W41", planned: null, customized: false },
      ],
      weekNotes: [{ weekId: "2026-W40", text: "Mine\n\nAI: Hi" }],
    });
    const workouts = await storage.getWorkouts();
    expect(workouts.map((x) => x.id).sort()).toEqual(["c", "done", "new"]);
    expect(workouts.find((x) => x.id === "new")).not.toHaveProperty("provisional");
    expect(await storage.getWeekOverrides()).toEqual([{ weekId: "2026-W40", customized: true }]);
    expect(await storage.getWeekNotes()).toEqual([{ weekId: "2026-W40", text: "Mine\n\nAI: Hi" }]);
  });

  it("replaces catalog lists only when the plan changed them", async () => {
    await storage.applyPlanWrites({
      trainingBlocks: [{ id: "n", name: "New", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W40" }],
      weeks: [],
      weekNotes: [],
    });
    expect((await storage.getTrainingBlocks()).map((b) => b.id)).toEqual(["n"]);
    expect(await storage.getWorkouts()).toHaveLength(4);
  });
});
