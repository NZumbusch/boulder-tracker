import { describe, it, expect, vi, beforeEach } from "vitest";

const { kv } = vi.hoisted(() => ({ kv: {} as Record<string, unknown> }));
vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    setItem: vi.fn(async (k: string, v: unknown) => { kv[k] = structuredClone(v); }),
    getItem: vi.fn(async (k: string) => (k in kv ? structuredClone(kv[k]) : null)),
    removeItem: vi.fn(async (k: string) => { delete kv[k]; }),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState } from "./persistence";
import type { Workout } from "../types";

const w = (id: string, weekId: string, status: Workout["status"] = "planned"): Workout =>
  ({ id, status, date: status === "completed" ? "2026-09-22" : null, weekId, loadFactor: 0, exercises: [] }) as Workout;

const plan = {
  trainingBlocks: [{ id: "ai", name: "AI block", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W41" }],
  weeks: [{ weekId: "2026-W40", planned: [w("ai1", "2026-W40")], customized: true }],
  weekNotes: [{ weekId: "2026-W40", text: "AI: go" }],
};

beforeEach(() => {
  for (const k of Object.keys(kv)) delete kv[k];
  setDbState({
    workouts: [w("a", "2026-W40"), w("done", "2026-W39", "completed")],
    trainingBlocks: [{ id: "old", name: "Old", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W42" }],
    weekOverrides: [],
    weekNotes: [],
    planAlternatives: [],
    exerciseTypes: [],
    phaseDefs: [],
    templates: {},
  });
});

describe("undoing the last AI plan change", () => {
  it("puts the plan back exactly as it was, and is then gone", async () => {
    expect(await storage.getPlanUndo()).toBeNull();
    await storage.applyPlanWrites(plan);
    expect(await storage.getPlanUndo()).toMatchObject({ changedSince: false });

    await storage.undoPlanChange();
    expect((await storage.getWorkouts()).map((x) => x.id).sort()).toEqual(["a", "done"]);
    expect((await storage.getTrainingBlocks()).map((b) => b.id)).toEqual(["old"]);
    expect(await storage.getWeekNotes()).toEqual([]);
    expect(await storage.getWeekOverrides()).toEqual([]);
    expect(await storage.getPlanUndo()).toBeNull();
  });

  it("keeps sessions logged since, and says the plan changed since", async () => {
    await storage.applyPlanWrites(plan);
    await storage.saveWorkout({ ...w("ai1", "2026-W40", "completed") }); // did the AI's session
    expect(await storage.getPlanUndo()).toMatchObject({ changedSince: false }); // logging isn't editing the plan
    await storage.saveWorkout(w("mine", "2026-W41")); // but planning one of my own is
    expect(await storage.getPlanUndo()).toMatchObject({ changedSince: true });

    await storage.undoPlanChange();
    const ids = (await storage.getWorkouts()).map((x) => `${x.id}:${x.status}`).sort();
    // The logged session stays; the plan (including my later edit) goes back.
    expect(ids).toEqual(["a:planned", "ai1:completed", "done:completed"]);
  });

  it("leaves a table alone that the undo record predates (made by an older version)", async () => {
    await storage.applyPlanWrites(plan);
    const key = Object.keys(kv).find((k) => (kv[k] as { before?: unknown })?.before)!;
    delete (kv[key] as { before: Record<string, unknown> }).before.coachNotes;
    await storage.saveCoachNotes([{ id: "n1", text: "Mine", source: "me", addedOn: "2026-09-28" }]);

    await storage.undoPlanChange();
    expect((await storage.getCoachNotes()).map((n) => n.id)).toEqual(["n1"]);
  });

  it("is cleared by a backup import, which replaces everything", async () => {
    await storage.applyPlanWrites(plan);
    await storage.clearPlanUndo();
    expect(await storage.getPlanUndo()).toBeNull();
  });
});

describe("Plan Bs from an AI change", () => {
  it("are written with it and taken back by its undo", async () => {
    const alt = { id: "pb", startWeekId: "2026-W40", startDay: "Saturday" as const, days: 1, changes: [{ id: "c", offset: 0, replaces: { name: "Board" } }] };
    await storage.applyPlanWrites({ weeks: [], weekNotes: [], planAlternatives: [alt] });
    expect(await storage.getPlanAlternatives()).toEqual([alt]);
    await storage.undoPlanChange();
    expect(await storage.getPlanAlternatives()).toEqual([]);
  });
});
