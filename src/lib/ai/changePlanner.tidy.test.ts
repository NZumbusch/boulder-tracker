import { describe, it, expect } from "vitest";
import { validateChangeSet } from "./changeSet";
import { planChanges, planWithSelection, allItemIds, type PlannerState } from "./changePlanner";

const state = (): PlannerState => ({
  exerciseTypes: [], analyticsCategories: [{ id: "c1", name: "Fingers", color: "x" }], phaseDefs: [], templates: {}, trainingBlocks: [], workouts: [], dismissedSessions: [], weekNotes: [],
  currentWeekId: "2026-W40", today: "2026-10-01",
  valueDefs: [
    { id: "edge", name: "Edge", kind: "number", unit: "m" },
    { id: "wt", name: "Added weight", kind: "number", measure: "weight" },
    { id: "style", name: "Style", kind: "choice", options: ["a"] },
    { id: "old", name: "Old", kind: "number" },
  ],
  benchmarkTypes: [{ id: "mh", name: "Max hang", unit: "kg" }, { id: "pu", name: "Pull-up", unit: "kg" }],
  goals: [
    { id: "g1", kind: "competition", name: "Spring comp", date: "2026-03-01" },
    { id: "g2", kind: "trip", name: "Font", date: "2026-11-02", endDate: "2026-11-09" },
  ],
  painIssues: [
    { id: "p1", bodyPart: "Finger", startDate: "2026-05-01" },
    { id: "p2", bodyPart: "Finger", startDate: "2026-09-01" },
    { id: "p3", bodyPart: "Elbow", startDate: "2026-06-01", endDate: "2026-07-01" },
  ],
});
const run = (doc: unknown, selected?: Set<string>) => {
  const v = validateChangeSet(doc);
  if (!v.valid) throw new Error(JSON.stringify(v.issues));
  return planChanges(v.data!, state(), selected);
};

describe("tidying custom fields, tests, goals and pain issues", () => {
  it("edits and archives value types, refusing what the app owns", () => {
    const r = run({ valueTypes: [{ action: "edit", name: "Edge", rename: "Edge depth", unit: "mm" }, { action: "edit", name: "Added weight", unit: "lb" }, { action: "edit", name: "Style", unit: "x" }, { action: "archive", name: "Old" }, { action: "edit", name: "Nope", rename: "x" }] });
    expect(r.items.map((i) => i.errors.length > 0)).toEqual([false, true, true, false, true]);
    expect(r.writes.valueDefs?.find((v) => v.id === "edge")).toMatchObject({ name: "Edge depth", unit: "mm" });
    expect(r.writes.valueDefs?.find((v) => v.id === "old")?.archived).toBe(true);
    expect(r.writes.valueDefs?.find((v) => v.id === "wt")?.unit).toBeUndefined();
  });
  it("renames tests, keeping ids, and refuses a taken name", () => {
    const r = run({ benchmarkTypes: [{ action: "edit", name: "Max hang", rename: "Max hang 20 mm", group: "Fingers", protocol: "3 attempts" }, { action: "edit", name: "Pull-up", rename: "Max hang 20 mm" }, { action: "archive", name: "Pull-up" }] });
    expect(r.items[1].errors[0]).toMatch(/taken/);
    expect(r.writes.benchmarkTypes?.find((b) => b.id === "mh")).toMatchObject({ name: "Max hang 20 mm", group: "Fingers", protocol: "3 attempts" });
    expect(r.writes.benchmarkTypes?.find((b) => b.id === "pu")?.archived).toBe(true);
  });
  it("removes only goals that are over", () => {
    const r = run({ goals: [{ action: "remove", name: "Spring comp" }, { action: "remove", name: "Font" }, { action: "edit", name: "Font", rename: "Fontainebleau", notes: "Bring pads" }] });
    expect(r.items[1].errors[0]).toMatch(/hasn't happened/);
    expect(r.writes.goals?.map((g) => g.name)).toEqual(["Fontainebleau"]);
    expect(r.writes.goals?.[0].notes).toBe("Bring pads");
  });
  it("needs a start date when a pain issue's name recurs, and resolves only open ones, not in the future", () => {
    const r = run({ painIssues: [{ action: "edit", name: "Finger", notes: "x" }, { action: "resolve", name: "Finger", startDate: "2026-05-01", endDate: "2026-08-01" }, { action: "resolve", name: "Elbow", endDate: "2026-08-01" }, { action: "resolve", name: "Finger", startDate: "2026-09-01", endDate: "2027-01-01" }, { action: "edit", name: "Finger", startDate: "2026-09-01", watchCategories: ["fingers", "Ghost"] }] });
    expect(r.items.map((i) => i.errors.length > 0)).toEqual([true, false, true, true, true]);
    expect(r.writes.painIssues?.find((p) => p.id === "p1")?.endDate).toBe("2026-08-01");
    expect(r.writes.painIssues?.find((p) => p.id === "p2")?.endDate).toBeUndefined();
  });
  it("accepts watched categories case-insensitively and is undoable by item", () => {
    const doc = { painIssues: [{ action: "edit", name: "Finger", startDate: "2026-09-01", watchCategories: ["fingers"], rename: "Left ring finger" }] };
    const v = validateChangeSet(doc);
    expect(v.valid).toBe(true);
    const all = allItemIds(v.data!);
    expect([...all]).toEqual(["pain-0"]);
    expect(planWithSelection(v.data!, state(), all).writes.painIssues?.find((p) => p.id === "p2")).toMatchObject({ bodyPart: "Left ring finger", watchCategories: ["Fingers"] });
    expect(planWithSelection(v.data!, state(), new Set()).writes.painIssues).toBeUndefined();
  });
  it("rejects malformed entries", () => {
    expect(validateChangeSet({ goals: [{ action: "edit", name: "x" }] }).valid).toBe(false);
    expect(validateChangeSet({ painIssues: [{ action: "resolve", name: "x", endDate: "soon" }] }).valid).toBe(false);
    expect(validateChangeSet({ valueTypes: [{ action: "delete", name: "x" }] }).valid).toBe(false);
  });
});
