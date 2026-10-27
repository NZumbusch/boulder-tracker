import { describe, expect, it } from "vitest";
import type { ExternalActivity, Workout } from "../types";
import { DEFAULT_IMPORT_OPTIONS, findOverlaps, kindInText, kindOfType, planImport, sharedShare } from "./overlap";

const local = (h: number, m = 0) => new Date(2026, 9, 5, h, m).toISOString();

const act = (id: string, source: ExternalActivity["source"], startH: number, startM: number, minutes: number, type = "Run", name = id): ExternalActivity => ({
  id, source, sourceId: id, date: "2026-10-05", start: local(startH, startM), name, type, durationSec: minutes * 60,
});

const wo = (id: string, o: Partial<Workout>): Workout => ({
  id, status: "completed", date: "2026-10-05", dayOfWeek: "Monday", weekId: "2026-W41", loadFactor: 0, exercises: [], ...o,
} as Workout);

const label = (w: Workout) => w.notes ?? w.id;

describe("kinds", () => {
  it("reads the kind from text and from a type", () => {
    expect(kindInText("Easy run, 5 km")).toBe("run");
    expect(kindInText("Bike to the gym")).toBe("ride");
    expect(kindInText("Board session")).toBeUndefined();
    expect(kindOfType("Trail Run")).toBe("run");
    expect(kindOfType("VirtualRide")).toBe("ride");
    expect(kindOfType("Weight Training")).toBeUndefined();
  });
});

describe("sharedShare", () => {
  it("is the common part of the shorter span", () => {
    expect(sharedShare({ start: 0, end: 100 }, { start: 50, end: 300 })).toBe(0.5);
    expect(sharedShare({ start: 0, end: 100 }, { start: 100, end: 200 })).toBe(0);
    expect(sharedShare({ start: 0, end: 1000 }, { start: 100, end: 200 })).toBe(1);
  });
});

describe("findOverlaps", () => {
  const run = act("a", "strava", 7, 0, 30);

  it("finds the same activity from another source", () => {
    const o = findOverlaps(run, { workouts: [], activities: [act("g", "garmin", 7, 1, 30, "Run", "Garmin run")], label });
    expect(o).toEqual([{ kind: "activity", how: "time", id: "g", label: "Garmin run" }]);
  });

  it("ignores a neighbour that only touches, and itself", () => {
    expect(findOverlaps(run, { workouts: [], activities: [run, act("n", "garmin", 7, 30, 30)], label })).toEqual([]);
  });

  it("finds a logged and a planned session at the same time", () => {
    const o = findOverlaps(run, {
      workouts: [
        wo("l", { notes: "Easy run", startTime: "07:05", actualDuration: 25 }),
        wo("p", { status: "planned", notes: "Tempo", startTime: "06:45", plannedDuration: 45 }),
        wo("far", { notes: "Evening", startTime: "18:00", actualDuration: 60 }),
      ],
      activities: [], label,
    });
    expect(o.map((x) => [x.kind, x.how, x.id])).toEqual([["logged", "time", "l"], ["planned", "time", "p"]]);
  });

  it("matches a session with no time only by day and kind", () => {
    const ctx = (w: Workout) => findOverlaps(run, { workouts: [w], activities: [], label });
    expect(ctx(wo("r", { notes: "Easy run" }))[0]).toMatchObject({ kind: "logged", how: "day" });
    expect(ctx(wo("c", { notes: "Board session" }))).toEqual([]);
    expect(ctx(wo("o", { notes: "Easy run", date: "2026-10-06", dayOfWeek: "Tuesday" }))).toEqual([]);
    expect(findOverlaps(act("w", "strava", 7, 0, 30, "Weight Training"), { workouts: [wo("r", { notes: "Easy run" })], activities: [], label })).toEqual([]);
  });

  it("puts a planned session on its week and day, not on its creation date, and ignores a skipped one", () => {
    const planned = wo("p", { status: "planned", date: "2026-09-01", dayOfWeek: "Monday", notes: "Easy run" });
    expect(findOverlaps(run, { workouts: [planned], activities: [], label })[0]).toMatchObject({ kind: "planned", how: "day" });
    expect(findOverlaps(run, { workouts: [{ ...planned, dayOfWeek: "Tuesday" }], activities: [], label })).toEqual([]);
    const skipped = { ...planned, exercises: [{ skipped: true }] } as unknown as Workout;
    expect(findOverlaps(run, { workouts: [skipped], activities: [], label })).toEqual([]);
  });

  it("uses the planned length for a planned session and the actual for a done one", () => {
    const late = act("x", "strava", 8, 0, 20);
    expect(findOverlaps(late, { workouts: [wo("p", { status: "planned", startTime: "07:00", plannedDuration: 30, actualDuration: 120 })], activities: [], label })).toEqual([]);
    expect(findOverlaps(late, { workouts: [wo("d", { startTime: "07:00", plannedDuration: 30, actualDuration: 120 })], activities: [], label })).toHaveLength(1);
  });
});

describe("planImport: detail for a copy from another source", () => {
  const withStats = (a: ExternalActivity): ExternalActivity => ({ ...a, stats: { v: 2, splitsSec: [300, 305] } });
  const strava = act("strava-1", "strava", 7, 0, 30);
  const garmin = withStats(act("garmin-1", "garmin", 7, 1, 30));
  const plan = (existing: ExternalActivity[], incoming: ExternalActivity[], skipDuplicates = true) =>
    planImport(existing, incoming, () => [], label, { skipDuplicates, skipLogged: true });

  it("hands a skipped Garmin copy's detail to the stored Strava one, under the stored id", () => {
    const p = plan([strava], [garmin]);
    expect(p.add).toEqual([]);
    expect(p.refresh.map((a) => [a.id, a.stats?.splitsSec])).toEqual([["strava-1", [300, 305]]]);
  });
  it("does nothing when the stored one already has the detail, or the incoming has none", () => {
    expect(plan([withStats(strava)], [garmin]).refresh).toEqual([]);
    expect(plan([garmin], [strava]).refresh).toEqual([]);
  });
  it("leaves the stored one alone when the copy is added anyway", () => {
    const p = plan([strava], [garmin], false);
    expect(p.add.map((a) => a.id)).toEqual(["garmin-1"]);
    expect(p.refresh).toEqual([]);
  });
  it("does not enrich from a copy found only within the same import", () => {
    expect(plan([], [strava, garmin]).refresh).toEqual([]);
  });
});

describe("planImport", () => {
  const stored = [act("g", "garmin", 7, 0, 30)];
  const incoming = [
    act("s1", "strava", 7, 2, 30), // same as the Garmin run
    act("s2", "strava", 12, 0, 40), // overlaps a logged session
    act("s3", "strava", 15, 0, 40), // overlaps a planned session
    act("s4", "strava", 19, 0, 40), // nothing
    act("g", "garmin", 7, 0, 30), // already stored
  ];
  const workouts = [
    wo("l", { notes: "Lunch run", startTime: "12:10", actualDuration: 30 }),
    wo("p", { status: "planned", notes: "Ride", startTime: "15:00", plannedDuration: 60 }),
  ];
  const run = (opts = DEFAULT_IMPORT_OPTIONS) => planImport(stored, incoming, () => workouts, label, opts);

  it("sorts every activity into what it is", () => {
    const p = run();
    expect(p.already.map((a) => a.id)).toEqual(["g"]);
    expect(p.duplicates.map((d) => [d.activity.id, d.with.id])).toEqual([["s1", "g"]]);
    expect(p.logged.map((d) => d.activity.id)).toEqual(["s2"]);
    expect(p.planned.map((d) => [d.activity.id, d.with.label])).toEqual([["s3", "Ride"]]);
  });

  it("skips duplicates and logged by default, keeps planned", () => {
    expect(run().add.map((a) => a.id)).toEqual(["s3", "s4"]);
  });

  it("adds them when the options say so, but never one already stored", () => {
    expect(run({ skipDuplicates: false, skipLogged: false }).add.map((a) => a.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(run({ skipDuplicates: true, skipLogged: false }).add.map((a) => a.id)).toEqual(["s2", "s3", "s4"]);
  });

  it("keeps an activity that only matches a logged session by day", () => {
    const p = planImport([], [act("d", "strava", 9, 0, 30)], () => [wo("l", { notes: "Climbing with a warm-up run" })], label);
    expect(p.logged[0].with.how).toBe("day");
    expect(p.add.map((a) => a.id)).toEqual(["d"]);
  });

  it("also finds the same activity twice within one import from two sources", () => {
    const p = planImport([], [act("s1", "strava", 7, 0, 30), act("g1", "garmin", 7, 1, 30), act("g2", "garmin", 9, 0, 30)], () => [], label);
    expect(p.add.map((a) => a.id)).toEqual(["s1", "g2"]);
    expect(p.duplicates.map((d) => [d.activity.id, d.with.id])).toEqual([["g1", "s1"]]);
  });

  it("does not call two activities of the same source duplicates", () => {
    const p = planImport([act("s0", "strava", 7, 0, 30)], [act("s1", "strava", 7, 2, 30)], () => [], label);
    expect(p.duplicates).toEqual([]);
    expect(p.add).toHaveLength(1);
  });
});

describe("refreshing what is already stored", () => {
  const base = (id: string, stats?: ExternalActivity["stats"]): ExternalActivity => ({ id, source: "garmin", sourceId: id, date: "2026-10-05", start: "2026-10-05T06:30:00.000Z", name: "Run", type: "Run", durationSec: 1800, ...(stats ? { stats } : {}) });

  it("lists a stored activity that has no stats while this import has them, and leaves ones that have them", () => {
    const p = planImport([base("a"), base("b", { splitsSec: [300] })], [base("a", { splitsSec: [310] }), base("b", { splitsSec: [310] }), base("c", { splitsSec: [310] })], () => [], (w) => w.notes ?? "");
    expect(p.refresh.map((a) => a.id)).toEqual(["a"]);
    expect(p.already.map((a) => a.id)).toEqual(["a", "b"]);
    expect(p.add.map((a) => a.id)).toEqual(["c"]);
  });

  it("has nothing to refresh when the import carries no stats", () => {
    expect(planImport([base("a")], [base("a")], () => [], () => "").refresh).toEqual([]);
  });
});
