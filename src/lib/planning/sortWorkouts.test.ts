import { describe, it, expect } from "vitest";
import { sortWorkoutsBySchedule } from "./sortWorkouts";
import type { DayOfWeek, Workout } from "../types";

function workout(id: string, dayOfWeek?: DayOfWeek, startTime?: string): Workout {
  return {
    id,
    status: "planned",
    date: null,
    weekId: "2026-W25",
    loadFactor: 0,
    exercises: [],
    dayOfWeek,
    startTime,
  };
}

describe("sortWorkoutsBySchedule", () => {
  it("orders by day of week, Monday first", () => {
    const sorted = sortWorkoutsBySchedule([
      workout("c", "Sunday"),
      workout("a", "Monday"),
      workout("b", "Thursday"),
    ]);
    expect(sorted.map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("orders by start time within the same day", () => {
    const sorted = sortWorkoutsBySchedule([
      workout("evening", "Tuesday", "18:30"),
      workout("morning", "Tuesday", "07:00"),
      workout("midday", "Tuesday", "12:00"),
    ]);
    expect(sorted.map((w) => w.id)).toEqual(["morning", "midday", "evening"]);
  });

  it("sorts a session with no start time after same-day sessions that have one", () => {
    const sorted = sortWorkoutsBySchedule([
      workout("untimed", "Tuesday"),
      workout("late", "Tuesday", "21:00"),
    ]);
    expect(sorted.map((w) => w.id)).toEqual(["late", "untimed"]);
  });

  it("sorts sessions with no day last, never first", () => {
    const sorted = sortWorkoutsBySchedule([
      workout("unassigned"),
      workout("sunday", "Sunday"),
      workout("monday", "Monday"),
    ]);
    expect(sorted.map((w) => w.id)).toEqual(["monday", "sunday", "unassigned"]);
  });

  it("falls back to id so the order is stable for otherwise-identical sessions", () => {
    const sorted = sortWorkoutsBySchedule([
      workout("b", "Monday", "09:00"),
      workout("a", "Monday", "09:00"),
    ]);
    expect(sorted.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [workout("b", "Friday"), workout("a", "Monday")];
    sortWorkoutsBySchedule(input);
    expect(input.map((w) => w.id)).toEqual(["b", "a"]);
  });
});
