import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./migrations";
import { DATA_EXPORT_VERSION } from "../constants";

describe("3.30 -> 3.31: add athleteProfile and coachNotes", () => {
  it("adds both, empty, and keeps what's there", () => {
    const data: any = { exportVersion: "3.30", workouts: [], exerciseTypes: [], coachNotes: [{ id: "k3x9", text: "x", source: "me", addedOn: "2026-09-27" }] };
    runDataMigrations(data);
    expect(data.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(data.athleteProfile).toEqual([]);
    expect(data.coachNotes).toHaveLength(1);
  });
});
