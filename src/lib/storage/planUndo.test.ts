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
  trainingBlocks: [{ id: "ai", name: "AI block", phaseId: "p", startDate: "2026-09-28", endDate: "2026-10-11" }],
  weeks: [{ weekId: "2026-W40", planned: [w("ai1", "2026-W40")], customized: true }],
  weekNotes: [{ weekId: "2026-W40", text: "AI: go" }],
};

beforeEach(() => {
  for (const k of Object.keys(kv)) delete kv[k];
  setDbState({
    workouts: [w("a", "2026-W40"), w("done", "2026-W39", "completed")],
    trainingBlocks: [{ id: "old", name: "Old", phaseId: "p", startDate: "2026-09-28", endDate: "2026-10-18" }],
    dismissedSessions: [],
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
    expect(await storage.getDismissedSessions()).toEqual([]);
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
    // The record is kept in a list (a record from before the history existed was a lone object).
    const lastOf = (v: unknown) => (Array.isArray(v) ? v.at(-1) : v) as { before?: Record<string, unknown> } | undefined;
    const key = Object.keys(kv).find((k) => lastOf(kv[k])?.before)!;
    delete lastOf(kv[key])!.before!.coachNotes;
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

describe("the plan history", () => {
  const weekPlan = (weekId: string, name: string) => ({
    weeks: [{ weekId, planned: [{ id: `${weekId}-${name}`, status: "planned" as const, date: null, weekId, dayOfWeek: "Monday" as const, notes: name, loadFactor: 0, exercises: [] }], customized: true }],
    weekNotes: [],
  });

  it("keeps several changes, newest first, with what each was", async () => {
    await storage.applyPlanWrites(weekPlan("2026-W42", "One"), "ai", { goal: "First", lines: ["+ One"] });
    await storage.applyPlanWrites(weekPlan("2026-W43", "Two"), "ai", { goal: "Second", lines: ["+ Two"] });
    const history = await storage.getPlanHistory();
    expect(history.map((h) => h.goal)).toEqual(["Second", "First"]);
    expect(history[0].lines).toEqual(["+ Two"]);
  });

  it("rolls back to before an older change, taking the later ones with it", async () => {
    const base = (await storage.getWorkouts()).map((w) => w.id).sort();
    await storage.applyPlanWrites(weekPlan("2026-W42", "One"), "ai", { goal: "First", lines: [] });
    await storage.applyPlanWrites(weekPlan("2026-W43", "Two"), "ai", { goal: "Second", lines: [] });
    const first = (await storage.getPlanHistory()).find((h) => h.goal === "First")!;
    await storage.undoPlanChangesTo(first.index);
    expect((await storage.getWorkouts()).map((w) => w.id).sort()).toEqual(base);
    expect(await storage.getPlanHistory()).toEqual([]);
  });

  it("rolls back only the latest one when asked to undo", async () => {
    await storage.applyPlanWrites(weekPlan("2026-W42", "One"), "ai", { goal: "First", lines: [] });
    await storage.applyPlanWrites(weekPlan("2026-W43", "Two"), "ai", { goal: "Second", lines: [] });
    await storage.undoPlanChange();
    const notes = (await storage.getWorkouts()).map((w) => w.notes);
    expect(notes).toContain("One");
    expect(notes).not.toContain("Two");
    expect((await storage.getPlanHistory()).map((h) => h.goal)).toEqual(["First"]);
  });

  it("holds the last six", async () => {
    for (let i = 0; i < 8; i++) await storage.applyPlanWrites(weekPlan(`2026-W${40 + i}`, `S${i}`), "ai", { goal: `Change ${i}`, lines: [] });
    const history = await storage.getPlanHistory();
    expect(history).toHaveLength(6);
    expect(history[0].goal).toBe("Change 7");
  });

  it("keeps sessions logged since", async () => {
    await storage.applyPlanWrites(weekPlan("2026-W42", "One"), "ai", { goal: "First", lines: [] });
    await storage.saveWorkout({ id: "done", status: "completed", date: "2026-10-12", weekId: "2026-W42", loadFactor: 100, exercises: [] } as never);
    await storage.undoPlanChangesTo((await storage.getPlanHistory())[0].index);
    const ids = (await storage.getWorkouts()).map((w) => w.id);
    expect(ids).toContain("done");
    expect(ids).not.toContain("2026-W42-One");
  });

  it("a record written before blocks were days (whole weeks) restores as days", async () => {
    await storage.applyPlanWrites(plan);
    const { readPlanUndo, writePlanUndo } = await import("./persistence");
    const [record] = (await readPlanUndo<any>()) as any[];
    const old = { id: "old", name: "Old", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W41" };
    await writePlanUndo([{ ...record, before: { ...record.before, trainingBlocks: [old] }, after: { ...record.after, trainingBlocks: [old] } }]);
    expect(await storage.getPlanUndo()).toBeTruthy();
    await storage.undoPlanChange();
    expect(await storage.getTrainingBlocks()).toEqual([{ id: "old", name: "Old", phaseId: "p", startDate: "2026-09-28", endDate: "2026-10-11" }]);
  });
});

describe("places in a plan change", () => {
  const withPlaces = () => {
    setDbState({
      workouts: [{ ...w("a", "2026-W40"), location: "Gym A" } as Workout, { ...w("done", "2026-W39", "completed"), location: "Gym A" } as Workout, { ...w("other", "2026-W41"), location: "Elsewhere" } as Workout],
      trainingBlocks: [], dismissedSessions: [], weekNotes: [], planAlternatives: [], exerciseTypes: [], phaseDefs: [],
      templates: { p: [{ id: "t", name: "T", dayOfWeek: "Monday", exercises: [], location: "gym a" }] },
      places: [{ name: "Gym A", kind: "gym" }, { name: "Brione", kind: "crag" }],
    });
  };
  const rename = { weeks: [], weekNotes: [], places: [{ name: "Boulderwelt", kind: "gym" as const }, { name: "Brione", kind: "crag" as const }], placeRenames: [{ from: "Gym A", to: "Boulderwelt" }] };

  it("saves the list, and a rename follows through every session and template that names the place", async () => {
    withPlaces();
    await storage.applyPlanWrites(rename);
    expect((await storage.getPlaces()).map((p) => p.name)).toEqual(["Boulderwelt", "Brione"]);
    const locations = Object.fromEntries((await storage.getWorkouts()).map((x) => [x.id, x.location]));
    expect(locations).toEqual({ a: "Boulderwelt", done: "Boulderwelt", other: "Elsewhere" });
    expect((await storage.getTemplates()).p[0].location).toBe("Boulderwelt");
  });

  it("an undo puts the places back, and the logged session's place name with them", async () => {
    withPlaces();
    await storage.applyPlanWrites(rename);
    await storage.undoPlanChange();
    expect((await storage.getPlaces()).map((p) => p.name)).toEqual(["Gym A", "Brione"]);
    const locations = Object.fromEntries((await storage.getWorkouts()).map((x) => [x.id, x.location]));
    expect(locations).toEqual({ a: "Gym A", done: "Gym A", other: "Elsewhere" });
    expect((await storage.getTemplates()).p[0].location).toBe("gym a");
  });

  it("leaves the places alone when the change doesn't touch them", async () => {
    withPlaces();
    await storage.applyPlanWrites({ weeks: [], weekNotes: [{ weekId: "2026-W40", text: "x" }] });
    expect((await storage.getPlaces()).map((p) => p.name)).toEqual(["Gym A", "Brione"]);
  });

  it("renames one place directly, refusing a taken or empty name", async () => {
    withPlaces();
    expect(await storage.renamePlace("Gym A", "Brione")).toBe(false);
    expect(await storage.renamePlace("Gym A", "  ")).toBe(false);
    expect(await storage.renamePlace("Gym A", " Halle ")).toBe(true);
    expect((await storage.getPlaces()).map((p) => p.name)).toEqual(["Halle", "Brione"]);
    expect((await storage.getWorkouts()).find((x) => x.id === "a")?.location).toBe("Halle");
  });
});
