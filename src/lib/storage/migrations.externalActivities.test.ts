import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./index";
import { DATA_EXPORT_VERSION } from "../constants";
import { defaultLabel } from "../sync/merge";

describe("3.37 -> 3.38: externalActivities", () => {
  it("is the current version", () => {
    expect(DATA_EXPORT_VERSION).toBe("3.38");
  });

  it("adds an empty table, and leaves one that is there", () => {
    const old: any = { exportVersion: "3.37", workouts: [] };
    runDataMigrations(old);
    expect(old.exportVersion).toBe("3.38");
    expect(old.externalActivities).toEqual([]);
    const kept: any = { exportVersion: "3.37", workouts: [], externalActivities: [{ id: "strava-1" }] };
    runDataMigrations(kept);
    expect(kept.externalActivities).toEqual([{ id: "strava-1" }]);
  });

  it("is labelled as an activity in sync conflicts", () => {
    expect(defaultLabel("externalActivities", { name: "Morning run", date: "2024-10-05" })).toContain("Activity");
  });
});
