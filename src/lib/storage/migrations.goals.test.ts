import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./index";
import { DATA_EXPORT_VERSION } from "../constants";

// Competitions and outdoor trips are one list of goals now: 3.28->3.29
// moves every existing event over as a competition.
describe("3.28 -> 3.29: competitionEvents become goals", () => {
  it("moves each event across as kind 'competition' and drops the old key", () => {
    const data: any = {
      exportVersion: "3.28",
      workouts: [],
      exerciseTypes: [],
      competitionEvents: [{ id: "e1", name: "League", date: "2026-11-02" }],
    };
    runDataMigrations(data);
    expect(data.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(data.goals).toEqual([{ id: "e1", name: "League", date: "2026-11-02", kind: "competition" }]);
    expect("competitionEvents" in data).toBe(false);
  });

  it("handles missing events and keeps goals that already exist", () => {
    const none: any = { exportVersion: "3.28", workouts: [], exerciseTypes: [] };
    runDataMigrations(none);
    expect(none.goals).toEqual([]);

    const trip = { id: "t1", name: "Font", date: "2026-10-05", endDate: "2026-10-12", kind: "trip" };
    const both: any = { exportVersion: "3.28", workouts: [], exerciseTypes: [], goals: [trip], competitionEvents: [{ id: "e1", name: "League", date: "2026-11-02" }] };
    runDataMigrations(both);
    expect(both.goals.map((g: any) => g.id)).toEqual(["t1", "e1"]);
  });
});
