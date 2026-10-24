import { describe, expect, it } from "vitest";
import type { ExternalActivity, Workout } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { activityWorkout, importedOnCalendar } from "./calendarActivities";

const DAY = "2026-10-20"; // a Tuesday, week 2026-W43
const at = (h: number, m = 0) => new Date(2026, 9, 20, h, m).toISOString();

const act = (id: string, over: Partial<ExternalActivity> = {}): ExternalActivity => ({
  id, source: "garmin", sourceId: id, date: DAY, start: at(18), name: `Activity ${id}`, type: "Run", durationSec: 3600, ...over,
});
const session = (id: string, over: Partial<Workout> = {}): Workout =>
  ({ id, status: "planned", date: null, weekId: "2026-W43", dayOfWeek: "Tuesday", notes: `Session ${id}`, loadFactor: 0, exercises: [], ...over }) as Workout;

const day = toUtcDayIndex(DAY);
const run = (activities: ExternalActivity[], workouts: Workout[]) =>
  importedOnCalendar({ activities, from: day - 3, to: day + 3, workoutsOnDays: () => workouts, label: (w) => w.notes ?? "Session", text: (w) => w.notes ?? "" });

describe("an activity as a calendar session", () => {
  it("is a done session on its day and start time, as long as it took, named like the activity", () => {
    const w = activityWorkout(act("a", { start: at(7, 5), durationSec: 2700, name: "Morning run" }));
    expect(w).toMatchObject({ id: "ext:a", status: "completed", date: DAY, weekId: "2026-W43", notes: "Morning run", startTime: "07:05", actualDuration: 45 });
    expect(w.exercises).toEqual([]);
    const { sessions } = run([act("a", { start: at(7, 5), durationSec: 2700 })], []);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ day, startMin: 7 * 60 + 5, minutes: 45, done: true });
    expect(sessions[0].activity?.id).toBe("a");
  });

  it("only draws the days asked for", () => {
    expect(run([act("a"), act("b", { date: "2026-11-20", start: new Date(2026, 10, 20, 9).toISOString() })], []).sessions.map((s) => s.activity!.id)).toEqual(["a"]);
  });
});

describe("taking the place of a planned session", () => {
  it("replaces the plan it overlaps in time", () => {
    const plan = session("p", { startTime: "18:15", plannedDuration: 60 });
    expect(run([act("a")], [plan]).replaced).toEqual(new Set(["p"]));
  });

  it("replaces a plan of the same kind on the same day when the plan has no time", () => {
    const plan = session("p", { notes: "Easy run" });
    const other = session("q", { notes: "Board session" });
    expect(run([act("a")], [plan, other]).replaced).toEqual(new Set(["p"]));
  });

  it("leaves plans that are elsewhere in the day, or another kind", () => {
    const later = session("p", { startTime: "07:00", plannedDuration: 45 });
    const otherKind = session("q", { notes: "Hangboard" });
    expect(run([act("a")], [later, otherKind]).replaced.size).toBe(0);
  });

  it("does not take the place of a session that is done, or one skipped on purpose", () => {
    const done = session("d", { status: "completed", date: DAY, startTime: "18:00", actualDuration: 60 });
    const skipped = session("s", { startTime: "18:00", plannedDuration: 60, exercises: [{ id: "x", typeId: "t", skipped: true }] as never });
    expect(run([act("a")], [skipped]).replaced.size).toBe(0);
    expect(run([act("a")], [done]).replaced.size).toBe(0);
  });
});

describe("not drawn twice", () => {
  it("leaves out an activity that is the same time as a session you logged", () => {
    const logged = session("l", { status: "completed", date: DAY, startTime: "18:10", actualDuration: 50 });
    expect(run([act("a")], [logged]).sessions).toEqual([]);
  });

  it("draws the fuller copy of an activity both Strava and Garmin hold", () => {
    const garmin = act("g", { source: "garmin", stats: { v: 2, splitsSec: [300] } });
    const strava = act("s", { source: "strava", id: "s" });
    const { sessions } = run([strava, garmin], []);
    expect(sessions.map((s) => s.activity!.id)).toEqual(["g"]);
  });

  it("draws the first one when both copies know the same", () => {
    const { sessions } = run([act("b"), act("a")], []);
    expect(sessions.map((s) => s.activity!.id)).toEqual(["a"]);
  });

  it("keeps two activities at different times", () => {
    expect(run([act("a"), act("b", { start: at(8), durationSec: 1800 })], []).sessions).toHaveLength(2);
  });
});
