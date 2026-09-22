import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./storage";
import { DATA_EXPORT_VERSION } from "./constants";

// Week notes are their own table - like weekOverrides, keyed by weekId -
// so writing one never materialises a week or depends on which block
// covers it, and a week reset or re-plan leaves it alone.
describe("3.27 -> 3.28: add weekNotes", () => {
  it("adds an empty weekNotes table", () => {
    const data: any = { exportVersion: "3.27", workouts: [], exerciseTypes: [] };
    runDataMigrations(data);
    expect(data.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(data.weekNotes).toEqual([]);
  });

  it("keeps weekNotes that are already there", () => {
    const existing = [{ weekId: "2026-W39", text: "Trip" }];
    const data: any = { exportVersion: "3.27", workouts: [], exerciseTypes: [], weekNotes: existing };
    runDataMigrations(data);
    expect(data.weekNotes).toEqual(existing);
  });
});
