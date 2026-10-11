import { describe, it, expect } from "vitest";
import type { ExerciseSlot, Workout } from "../types";
import { isMissedSession, isSkippedWorkout, missedWorkouts, weekDayStrip, workoutDay } from "./weekStatus";

const slot = (skipped = false): ExerciseSlot => ({ id: "s", typeId: "t", prescribed: { duration: 30 }, ...(skipped ? { skipped: true } : {}) }) as ExerciseSlot;
const w = (overrides: Partial<Workout>): Workout =>
  ({ id: Math.random().toString(), status: "planned", date: null, weekId: "2026-W39", loadFactor: 0, exercises: [slot()], ...overrides }) as Workout;

describe("workoutDay", () => {
  it("prefers dayOfWeek and falls back to the logged date's weekday", () => {
    expect(workoutDay(w({ dayOfWeek: "Friday", date: "2026-09-21" }))).toBe("Friday");
    expect(workoutDay(w({ status: "completed", date: "2026-09-21" }))).toBe("Monday");
    expect(workoutDay(w({}))).toBeUndefined();
  });
});

describe("isSkippedWorkout", () => {
  it("is true only when every slot is skipped", () => {
    expect(isSkippedWorkout(w({ exercises: [slot(true), slot(true)] }))).toBe(true);
    expect(isSkippedWorkout(w({ exercises: [slot(true), slot()] }))).toBe(false);
    expect(isSkippedWorkout(w({ exercises: [] }))).toBe(false);
  });
});

describe("missedWorkouts", () => {
  it("returns planned, unskipped sessions from earlier days only", () => {
    const mon = w({ dayOfWeek: "Monday", notes: "Mon" });
    const tueSkipped = w({ dayOfWeek: "Tuesday", exercises: [slot(true)] });
    const wedDone = w({ dayOfWeek: "Wednesday", status: "completed", date: "2026-09-23" });
    const thu = w({ dayOfWeek: "Thursday", notes: "Thu (today)" });
    expect(missedWorkouts([mon, tueSkipped, wedDone, thu], "Thursday")).toEqual([mon]);
  });
});

describe("weekDayStrip", () => {
  it("classifies every day of the week", () => {
    const strip = weekDayStrip(
      [
        w({ dayOfWeek: "Monday", status: "completed", date: "2026-09-21", notes: "Board" }),
        w({ dayOfWeek: "Tuesday", notes: "Missed one" }),
        w({ dayOfWeek: "Wednesday", exercises: [slot(true)] }),
        w({ dayOfWeek: "Thursday", notes: "Today's" }),
        w({ dayOfWeek: "Saturday", notes: "Later" }),
      ],
      "Thursday",
    );
    expect(strip.map((c) => c.status)).toEqual(["done", "missed", "skipped", "planned", "rest", "planned", "rest"]);
    expect(strip.map((c) => c.isToday)).toEqual([false, false, false, true, false, false, false]);
    expect(strip[0].sessions).toEqual(["Board"]);
  });
});

describe("isMissedSession", () => {
  it("marks planned sessions on earlier days, and in earlier weeks, but not today, later days or later weeks", () => {
    expect(isMissedSession(w({ dayOfWeek: "Monday" }), "2026-W39", "Wednesday")).toBe(true);
    expect(isMissedSession(w({ dayOfWeek: "Wednesday" }), "2026-W39", "Wednesday")).toBe(false);
    expect(isMissedSession(w({ dayOfWeek: "Friday" }), "2026-W39", "Wednesday")).toBe(false);
    expect(isMissedSession(w({ dayOfWeek: "Friday", weekId: "2026-W38" }), "2026-W39", "Monday")).toBe(true);
    expect(isMissedSession(w({ dayOfWeek: "Monday", weekId: "2026-W40" }), "2026-W39", "Wednesday")).toBe(false);
  });
  it("leaves out logged and skipped sessions", () => {
    expect(isMissedSession(w({ dayOfWeek: "Monday", status: "completed" }), "2026-W39", "Wednesday")).toBe(false);
    expect(isMissedSession(w({ dayOfWeek: "Monday", exercises: [slot(true)] }), "2026-W39", "Wednesday")).toBe(false);
  });
});
