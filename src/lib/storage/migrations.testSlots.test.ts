import { describe, it, expect } from "vitest";
import { runDataMigrations, assertMigrationInvariants } from "./migrations";

/** A database from before sessions were saved one by one that holds a benchmark test slot in a session. */
const withTestSlot = (): any => ({
  exportVersion: "3.34",
  exerciseTypes: [{ id: "max-hangs", name: "Max Hangs", parameters: ["sets"], category: "Fingers" }],
  workouts: [{
    id: "w1", status: "completed", date: "2026-10-01T10:00:00.000Z", weekId: "2026-W40", loadFactor: 0,
    exercises: [
      { id: "e1", typeId: "max-hangs", prescribed: { sets: 3 } },
      { id: "e2", typeId: "test", test: { typeId: "max-hang", name: "Max Hang" }, prescribed: { duration: 15 } },
    ],
  }],
  benchmarkTypes: [], benchmarks: [], trainingBlocks: [], phaseDefs: [],
});

describe("migration invariants and benchmark test slots", () => {
  it("accepts a test slot, whose typeId is the fixed 'test' and not a library exercise", () => {
    const data = withTestSlot();
    const before = structuredClone(data);
    runDataMigrations(data);
    expect(() => assertMigrationInvariants(before, data)).not.toThrow();
  });

  it("still rejects an ordinary exercise whose type does not exist", () => {
    const data = withTestSlot();
    const before = structuredClone(data);
    runDataMigrations(data);
    data.workouts[0].exercises.push({ id: "e3", typeId: "gone" });
    expect(() => assertMigrationInvariants(before, data)).toThrow(/unresolvable typeId "gone"/);
  });
});
