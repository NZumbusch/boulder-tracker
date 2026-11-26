import { describe, it, expect } from "vitest";
import { describeDiff, diffTable, guardWorkouts, isEmptyDiff, snapshotTable } from "./dataDiff";

describe("diffTable / describeDiff", () => {
  const before = snapshotTable("workouts", [
    { id: "a", status: "planned", x: 1 },
    { id: "b", status: "completed", x: 1 },
    { id: "c", status: "planned", x: 1 },
  ]);

  it("finds added, changed, removed records and status changes", () => {
    const after = snapshotTable("workouts", [
      { id: "a", status: "completed", x: 2 },
      { id: "b", status: "completed", x: 1 },
      { id: "d", status: "planned", x: 1 },
    ]);
    const d = diffTable(before, after);
    expect(d).toEqual({ added: ["d"], changed: ["a"], removed: ["c"], statusChanges: [{ key: "a", from: "planned", to: "completed" }] });
    expect(describeDiff("workouts", d, 3)).toBe("workouts: +1 ~1 -1 (now 3); added d; removed c; status a planned→completed");
  });

  it("only counts the records of big tables", () => {
    const d = diffTable(snapshotTable("dailyMetrics", []), snapshotTable("dailyMetrics", [{ id: "m1" }, { id: "m2" }]));
    expect(describeDiff("dailyMetrics", d, 2)).toBe("dailyMetrics: +2 ~0 -0 (now 2)");
  });

  it("sees no change in an identical table", () => {
    expect(isEmptyDiff(diffTable(before, snapshotTable("workouts", [{ id: "c", status: "planned", x: 1 }, { id: "b", status: "completed", x: 1 }, { id: "a", status: "planned", x: 1 }])))).toBe(true);
  });
});

describe("guardWorkouts", () => {
  const done = { id: "mon", status: "completed", loadFactor: 759 };
  const stale = { id: "mon", status: "planned", loadFactor: 0 };
  const other = { id: "tue", status: "planned", loadFactor: 0 };
  const logged = new Map([[done.id, done]]);

  it("puts a logged session back when a save would turn it into a planned one", () => {
    const r = guardWorkouts(logged, [other, stale]);
    expect(r.workouts).toEqual([other, done]);
    expect(r.blocked).toEqual([{ id: "mon", kept: done, attempted: stale }]);
  });

  it("drops a planned copy that sits beside the logged session", () => {
    const r = guardWorkouts(logged, [done, other, stale]);
    expect(r.workouts).toEqual([done, other]);
    expect(r.blocked).toHaveLength(1);
  });

  it("keeps one logged session when two planned copies come back", () => {
    const r = guardWorkouts(logged, [stale, { ...stale }]);
    expect(r.workouts).toEqual([done]);
    expect(r.blocked).toHaveLength(2);
  });

  it("lets edits of a logged session, new sessions and deletions through", () => {
    const edited = { ...done, loadFactor: 800 };
    expect(guardWorkouts(logged, [edited, other])).toEqual({ workouts: [edited, other], blocked: [] });
    expect(guardWorkouts(logged, [other])).toEqual({ workouts: [other], blocked: [] });
  });

  it("lets everything through when told to (restoring a backup)", () => {
    expect(guardWorkouts(logged, [stale], true)).toEqual({ workouts: [stale], blocked: [] });
  });
});
