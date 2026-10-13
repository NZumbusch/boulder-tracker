import { describe, it, expect } from "vitest";
import { runDataMigrations, assertMigrationInvariants } from "./index";
import { DATA_EXPORT_VERSION } from "../constants";
import { effectiveWorkoutsForWeek, weekDismissalId } from "../planning/weekProjection";

// 3.35 -> 3.36: sessions are saved one by one and a deleted one is remembered.
// Before, a week with anything stored was "saved" whole and never followed its
// phase again, and `customized` marked a week emptied or planned on purpose.
// Both become one whole-week dismissal, so every saved week shows exactly what
// it stores, as it did.

const tpl = (id: string, day: string) => ({ id, name: id, dayOfWeek: day, exercises: [] });

describe("3.35 -> 3.36: dismissed sessions", () => {
  const data = (): any => ({
    exportVersion: "3.35",
    workouts: [
      { id: "a", status: "planned", date: null, weekId: "2026-W41", loadFactor: 0, exercises: [] },
      { id: "b", status: "planned", date: null, weekId: "2026-W41", loadFactor: 0, exercises: [] },
      { id: "c", status: "completed", date: "2026-10-13T10:00:00.000Z", weekId: "2026-W42", loadFactor: 3, exercises: [] },
    ],
    exerciseTypes: [],
    phaseDefs: [{ id: "p", name: "P", color: "bg-zinc-500", order: 1 }],
    templates: { p: [tpl("t1", "Monday"), tpl("t2", "Thursday")] },
    trainingBlocks: [{ id: "blk", name: "P", phaseId: "p", startDate: "2026-10-05", endDate: "2026-11-01" }],
    weekOverrides: [{ weekId: "2026-W40", customized: true }, { weekId: "2026-W44", customized: false }],
  });

  it("is the current data version", () => {
    expect(DATA_EXPORT_VERSION).toBe("3.36");
  });

  it("dismisses the whole of every week that has anything stored, or was marked customized", () => {
    const d = data();
    runDataMigrations(d);
    expect(d.exportVersion).toBe("3.36");
    expect(d.dismissedSessions.map((x: any) => x.id).sort()).toEqual(["prov:2026-W40:*", "prov:2026-W41:*", "prov:2026-W42:*"]);
    expect(d.dismissedSessions.every((x: any) => x.id === weekDismissalId(x.weekId))).toBe(true);
  });

  it("leaves a week with nothing saved following its phase", () => {
    const d = data();
    runDataMigrations(d);
    const ctx = { workouts: d.workouts, trainingBlocks: d.trainingBlocks, templates: d.templates, dismissed: d.dismissedSessions };
    expect(effectiveWorkoutsForWeek(ctx, "2026-W43").map((w) => w.id)).toEqual(["prov:2026-W43:t1", "prov:2026-W43:t2"]);
    expect(effectiveWorkoutsForWeek(ctx, "2026-W44").map((w) => w.id)).toEqual(["prov:2026-W44:t1", "prov:2026-W44:t2"]); // customized: false is not a mark
  });

  it("keeps a saved week showing exactly what it stores, whatever the templates say", () => {
    const d = data();
    runDataMigrations(d);
    const ctx = { workouts: d.workouts, trainingBlocks: d.trainingBlocks, templates: d.templates, dismissed: d.dismissedSessions };
    expect(effectiveWorkoutsForWeek(ctx, "2026-W41").map((w) => w.id)).toEqual(["a", "b"]);
    expect(effectiveWorkoutsForWeek(ctx, "2026-W42").map((w) => w.id)).toEqual(["c"]);
    expect(effectiveWorkoutsForWeek(ctx, "2026-W40")).toEqual([]); // customized and empty: stays empty
  });

  it("drops the weekOverrides table and touches no session", () => {
    const d = data();
    const before = structuredClone(d);
    runDataMigrations(d);
    expect(d.weekOverrides).toBeUndefined();
    expect(d.workouts).toEqual(before.workouts);
    expect(() => assertMigrationInvariants(before, d)).not.toThrow();
  });

  it("adds to dismissals that are already there without doubling them", () => {
    const d = data();
    d.dismissedSessions = [{ id: "prov:2026-W41:*", weekId: "2026-W41" }, { id: "prov:2026-W50:t1", weekId: "2026-W50" }];
    runDataMigrations(d);
    const ids = d.dismissedSessions.map((x: any) => x.id);
    expect(ids.filter((id: string) => id === "prov:2026-W41:*")).toHaveLength(1);
    expect(ids).toContain("prov:2026-W50:t1");
  });

  it("copes with data that has no workouts, overrides or dismissals at all", () => {
    const d: any = { exportVersion: "3.35", workouts: [] };
    runDataMigrations(d);
    expect(d.dismissedSessions).toEqual([]);
  });

  it("runs from an older version: a customized week from the 3.22 period table ends up dismissed", () => {
    const old: any = {
      exportVersion: "3.22",
      workouts: [],
      exerciseTypes: [],
      periodization: [{ weekId: "2026-W05", phaseId: "phase-deload", customized: true }],
      templates: {},
      phaseDefs: [{ id: "phase-deload", name: "Deload", color: "bg-zinc-500", order: 7 }],
    };
    runDataMigrations(old);
    expect(old.dismissedSessions).toEqual([{ id: "prov:2026-W05:*", weekId: "2026-W05" }]);
  });
});
