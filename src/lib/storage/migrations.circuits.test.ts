import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./migrations";
import { DATA_EXPORT_VERSION } from "../constants";

describe("3.31 -> 3.32: add circuits", () => {
  it("adds an empty library and keeps one that's there", () => {
    const empty: any = { exportVersion: "3.31", workouts: [], exerciseTypes: [] };
    runDataMigrations(empty);
    expect(empty.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(empty.circuits).toEqual([]);

    const kept: any = { exportVersion: "3.31", workouts: [], exerciseTypes: [], circuits: [{ id: "c", name: "Core", rounds: 3, exercises: [] }] };
    runDataMigrations(kept);
    expect(kept.circuits).toHaveLength(1);
  });

  it("leaves grouped workouts untouched (groups are optional fields, no migration)", () => {
    const w = { id: "w", status: "planned", date: null, weekId: "2026-W40", loadFactor: 0, exercises: [{ id: "a", typeId: "t", groupId: "g" }], groups: [{ id: "g", rounds: 3 }] };
    const data: any = { exportVersion: "3.31", workouts: [structuredClone(w)], exerciseTypes: [] };
    runDataMigrations(data);
    expect(data.workouts[0]).toEqual(w);
  });
});
