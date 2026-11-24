import { describe, it, expect } from "vitest";
import { appendEntry, describeArgs, describeDiff, diffTable, formatEntry, guardWorkouts, isEmptyDiff, snapshotTable, type DataLogEntry } from "./dataLog";

const at = (s: number) => new Date(Date.UTC(2026, 10, 23, 18, 0, s)).toISOString();

describe("appendEntry", () => {
  it("folds a repeat within a few seconds into one entry with a count", () => {
    const log: DataLogEntry[] = [];
    appendEntry(log, { at: at(0), kind: "call", msg: "getWorkouts()" });
    appendEntry(log, { at: at(2), kind: "call", msg: "getWorkouts()" });
    appendEntry(log, { at: at(4), kind: "call", msg: "getWorkouts()" });
    expect(log).toHaveLength(1);
    expect(log[0].n).toBe(3);
    expect(log[0].at).toBe(at(4));
  });

  it("keeps entries apart when they differ in time, operation or carry data", () => {
    const log: DataLogEntry[] = [];
    appendEntry(log, { at: at(0), kind: "call", msg: "getWorkouts()" });
    appendEntry(log, { at: at(30), kind: "call", msg: "getWorkouts()" });
    appendEntry(log, { at: at(31), kind: "call", msg: "getWorkouts()", ops: ["sync"] });
    appendEntry(log, { at: at(32), kind: "guard", msg: "x", data: { a: 1 } });
    appendEntry(log, { at: at(33), kind: "guard", msg: "x", data: { a: 1 } });
    expect(log).toHaveLength(5);
  });

  it("drops the oldest beyond the cap", () => {
    const log: DataLogEntry[] = [];
    for (let i = 0; i < 5; i++) appendEntry(log, { at: at(i * 10), kind: "call", msg: `m${i}` }, 3);
    expect(log.map((e) => e.msg)).toEqual(["m2", "m3", "m4"]);
  });
});

describe("formatEntry", () => {
  it("writes the time, kind, count, operations and data", () => {
    const line = formatEntry({ at: at(0), kind: "write", msg: "workouts: +1", n: 2, ops: ["finish session", "saveWorkout"], data: { id: "w1" } });
    expect(line).toBe(`${at(0)} WRITE ×2 [finish session > saveWorkout] workouts: +1\n    {"id":"w1"}`);
  });
});

describe("describeArgs", () => {
  it("names a session by id, status, week, day and exercise count - never its content", () => {
    const w = { id: "w1", status: "completed", weekId: "2026-W48", dayOfWeek: "Monday", date: "2026-11-23T20:00:00Z", exercises: [{}, {}], notes: "secret" };
    expect(describeArgs([w])).toBe("{id=w1 completed 2026-W48 Mon 2026-11-23 2 ex}");
  });

  it("gives lists as lengths, short strings quoted, long ones cut", () => {
    expect(describeArgs([[1, 2, 3], "2026-W48", "x".repeat(80), 3, true, undefined])).toMatch(/^\[3\], "2026-W48", "x{57}…", 3, true, undefined$/);
  });
});

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
