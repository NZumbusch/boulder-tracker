import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./migrations";
import { DATA_EXPORT_VERSION } from "../constants";

// Plan Bs are their own table of rules applied at read time
// (lib/planning/planB.ts), never written into weeks - so adding the table
// is all a migration needs to do.
describe("3.29 -> 3.30: add planAlternatives", () => {
  it("adds an empty planAlternatives table", () => {
    const data: any = { exportVersion: "3.29", workouts: [], exerciseTypes: [] };
    runDataMigrations(data);
    expect(data.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(data.planAlternatives).toEqual([]);
  });

  it("keeps Plan Bs that are already there", () => {
    const existing = [{ id: "a1", startWeekId: "2026-W43", startDay: "Saturday", days: 1, changes: [] }];
    const data: any = { exportVersion: "3.29", workouts: [], exerciseTypes: [], planAlternatives: existing };
    runDataMigrations(data);
    expect(data.planAlternatives).toEqual(existing);
  });
});
