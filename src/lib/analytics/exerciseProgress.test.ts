import { describe, it, expect } from "vitest";
import type { ExerciseSlot, Workout } from "../types";
import { exerciseHistory, metricsOf, recordsOf, summariseExercises, valueOf } from "./exerciseProgress";

const asOf = new Date(2026, 9, 11, 12);
const slot = (typeId: string, logged: ExerciseSlot["logged"], over: Partial<ExerciseSlot> = {}): ExerciseSlot => ({ id: Math.random().toString(), typeId, logged, ...over }) as ExerciseSlot;
const day = (m: number, d: number) => new Date(2026, m, d, 12);
const session = (date: Date, exercises: ExerciseSlot[]): Workout => ({ id: `w${date.getTime()}`, status: "completed", date: date.toISOString(), weekId: "2026-W30", loadFactor: 500, exercises }) as Workout;

describe("exerciseHistory", () => {
  it("takes the heaviest set of a session, and the reps done at it", () => {
    const h = exerciseHistory([session(day(8, 1), [slot("pull", { sets: 3, reps: [6, 5, 4], setDetails: [{ weight: 20 }, { weight: 25 }, { weight: 30 }] })])], "pull", asOf);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ weight: 30, repsAtWeight: 4, reps: 6, sets: 3 });
    // 6x20 + 5x25 + 4x30
    expect(h[0].volume).toBe(120 + 125 + 120);
  });

  it("follows holds and reps when there is no weight, oldest first, skipping sessions after today and skipped slots", () => {
    const h = exerciseHistory([
      session(day(9, 5), [slot("lever", { timeOn: 10 })]),
      session(day(8, 20), [slot("lever", { timeOn: 8 })]),
      session(day(9, 30), [slot("lever", { timeOn: 99 })]),
      session(day(9, 1), [slot("lever", { timeOn: 5 }, { skipped: true })]),
    ], "lever", asOf);
    expect(h.map((s) => s.timeOn)).toEqual([8, 10]);
  });

  it("leaves benchmark test slots out", () => {
    expect(exerciseHistory([session(day(8, 1), [slot("test", { duration: 10 }, { test: { typeId: "hang", name: "Max Hang" } })])], "test", asOf)).toEqual([]);
  });
});

describe("metrics and records", () => {
  const history = exerciseHistory([
    session(day(7, 1), [slot("pull", { sets: 3, reps: 5, weight: 20 })]),
    session(day(8, 1), [slot("pull", { sets: 3, reps: 6, weight: 25 })]),
    session(day(9, 1), [slot("pull", { sets: 3, reps: 5, weight: 22.5 })]),
  ], "pull", asOf);

  it("offers the metrics the data has", () => {
    expect(metricsOf(history)).toEqual(["weight", "reps", "volume"]);
    expect(valueOf(history[1], "weight")).toBe(25);
  });
  it("finds the records and when", () => {
    const r = recordsOf(history);
    expect(r.heaviest).toMatchObject({ weight: 25, reps: 6 });
    expect(r.heaviest!.date).toBe(day(8, 1).toISOString());
    expect(r.mostReps?.reps).toBe(6);
  });
});

describe("summariseExercises", () => {
  const types = [{ id: "pull", name: "Weighted Pull-ups", category: "Strength", parameters: [] }, { id: "rare", name: "Rare", category: "x", parameters: [] }] as never[];
  const ws = [
    session(day(6, 1), [slot("pull", { weight: 20, reps: 5 })]),
    session(day(7, 10), [slot("pull", { weight: 22.5, reps: 5 })]),
    session(day(8, 20), [slot("pull", { weight: 25, reps: 5 })]),
    session(day(9, 5), [slot("pull", { weight: 27.5, reps: 5 }), slot("rare", { reps: 3 })]),
  ];
  it("lists exercises with enough sessions, with change against eight weeks earlier", () => {
    const s = summariseExercises(ws, types, asOf);
    expect(s.map((x) => x.name)).toEqual(["Weighted Pull-ups"]);
    expect(s[0]).toMatchObject({ metric: "weight", latest: 27.5, sessions: 4 });
    // eight weeks before Oct 5 is Aug 10: the best of the sessions up to then is 22.5
    expect(s[0].change).toBeCloseTo((27.5 / 22.5 - 1) * 100, 5);
  });
  it("has no change without older sessions", () => {
    expect(summariseExercises(ws.slice(2).concat(session(day(9, 8), [slot("pull", { weight: 28 })])), types, asOf, 3)[0].change).toBeUndefined();
  });
});
