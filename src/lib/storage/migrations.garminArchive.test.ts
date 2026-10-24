import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./index";
import { DATA_EXPORT_VERSION } from "../constants";
import { defaultLabel, tableToMap } from "../sync/merge";

describe("3.38 -> 3.39: garminArchive", () => {
  it("is the current version", () => {
    expect(DATA_EXPORT_VERSION).toBe("3.39");
  });

  it("adds an empty table, and leaves one that is there", () => {
    const old: any = { exportVersion: "3.38", workouts: [], externalActivities: [] };
    runDataMigrations(old);
    expect(old.exportVersion).toBe("3.39");
    expect(old.garminArchive).toEqual([]);
    const kept: any = { exportVersion: "3.38", workouts: [], garminArchive: [{ id: "sleep:2026-10-01", kind: "sleep", key: "2026-10-01", data: {} }] };
    runDataMigrations(kept);
    expect(kept.garminArchive).toHaveLength(1);
  });

  it("is keyed by record id for sync, so the same row on two devices is one record", () => {
    const row = { id: "sleep:2026-10-01", kind: "sleep", key: "2026-10-01", data: { deepSleepSeconds: 3600 } };
    const map = tableToMap("garminArchive", [row, { ...row, data: { deepSleepSeconds: 3700 } }]);
    expect([...map.keys()]).toEqual(["sleep:2026-10-01"]);
    expect(defaultLabel("garminArchive", row)).toContain("Garmin data");
  });
});
