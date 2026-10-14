import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./index";
import { DATA_EXPORT_VERSION } from "../constants";
import { tableToMap, defaultLabel } from "../sync/merge";

describe("3.36 -> 3.37: places", () => {
  it("adds an empty places table, and leaves one that is there", () => {
    const old: any = { exportVersion: "3.36", workouts: [] };
    runDataMigrations(old);
    expect(old.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(old.places).toEqual([]);
    const kept: any = { exportVersion: "3.36", workouts: [], places: [{ name: "Brione", kind: "crag" }] };
    runDataMigrations(kept);
    expect(kept.places).toEqual([{ name: "Brione", kind: "crag" }]);
  });

  it("syncs by name, and is labelled as a place", () => {
    const map = tableToMap("places", [{ name: "Brione", kind: "crag" }, { name: "Gym", kind: "gym" }]);
    expect([...map.keys()]).toEqual(["Brione", "Gym"]);
    expect(defaultLabel("places", { name: "Brione" })).toBe("Place · Brione");
  });
});
