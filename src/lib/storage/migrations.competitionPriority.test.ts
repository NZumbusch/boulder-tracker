import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./index";
import { DATA_EXPORT_VERSION } from "../constants";

// Competition events used to carry an A/B/C `priority`. Only the next event
// matters for how the app is used now, so 3.26->3.27 drops the field from
// stored data and backups rather than leaving an unused value behind.
describe("3.26 -> 3.27: drop CompetitionEvent.priority", () => {
  it("removes priority from every event and keeps everything else", () => {
    const data: any = {
      exportVersion: "3.26",
      workouts: [],
      exerciseTypes: [],
      competitionEvents: [
        { id: "e1", name: "Nationals", date: "2026-11-01", priority: "A" },
        { id: "e2", name: "League", date: "2026-10-01", priority: "C" },
      ],
    };
    runDataMigrations(data);
    expect(data.exportVersion).toBe(DATA_EXPORT_VERSION);
    // (Later moved into `goals` as competitions by 3.28->3.29.)
    expect(data.goals).toEqual([
      { id: "e1", name: "Nationals", date: "2026-11-01", kind: "competition" },
      { id: "e2", name: "League", date: "2026-10-01", kind: "competition" },
    ]);
  });

  it("tolerates missing or empty competitionEvents", () => {
    const missing: any = { exportVersion: "3.26", workouts: [], exerciseTypes: [] };
    runDataMigrations(missing);
    expect(missing.goals).toEqual([]);

    const empty: any = { exportVersion: "3.26", workouts: [], exerciseTypes: [], competitionEvents: [] };
    runDataMigrations(empty);
    expect(empty.goals).toEqual([]);
  });
});
