import { describe, it, expect } from "vitest";
import type { ExerciseSlot, ExerciseTypeDef, Workout } from "../types";
import { summarizeSession } from "./sessionSummary";

const types: ExerciseTypeDef[] = [
  { id: "hb", name: "Hangboard", category: "c", parameters: [] },
  { id: "lb", name: "Limit Bouldering", category: "c", parameters: [] },
  { id: "cs", name: "Core", category: "c", parameters: [] },
  { id: "an", name: "Antagonists", category: "c", parameters: [] },
];
const slot = (typeId: string, duration?: number): ExerciseSlot =>
  ({ id: typeId, typeId, prescribed: { duration, plannedLoad: 5 } }) as ExerciseSlot;
const workout = (overrides: Partial<Workout>): Workout =>
  ({ id: "w", status: "planned", date: null, weekId: "2026-W39", loadFactor: 0, exercises: [], ...overrides }) as Workout;

describe("summarizeSession", () => {
  it("uses the planned length and start time when set", () => {
    const s = summarizeSession(workout({ startTime: "18:00", plannedDuration: 90, exercises: [slot("hb", 30)] }), types);
    expect(s.startTime).toBe("18:00");
    expect(s.minutes).toBe(90);
    expect(s.estimated).toBe(false);
  });

  it("marks the length as estimated when it comes from the exercises", () => {
    const s = summarizeSession(workout({ exercises: [slot("hb", 30), slot("lb", 45)] }), types);
    expect(s.minutes).toBe(75);
    expect(s.estimated).toBe(true);
    expect(s.startTime).toBeUndefined();
  });

  it("names the first three exercises and counts the rest", () => {
    const s = summarizeSession(workout({ exercises: ["hb", "lb", "cs", "an"].map((id) => slot(id, 10)) }), types);
    expect(s.exerciseNames).toEqual(["Hangboard", "Limit Bouldering", "Core"]);
    expect(s.moreExercises).toBe(1);
  });

  it("reports the planned load from the prescribed slots", () => {
    const s = summarizeSession(workout({ exercises: [slot("hb", 30)] }), types);
    expect(s.plannedLoad).toBeGreaterThan(0);
  });
});
