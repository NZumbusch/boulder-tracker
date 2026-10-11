import { describe, it, expect } from "vitest";
import type { ExerciseSlot, Workout } from "../types";
import { buildSessionReview, workAmount } from "./sessionReview";

const types = [{ id: "hang", name: "Max Hangs", category: "Fingers", parameters: [] }, { id: "core", name: "Core", category: "Core", parameters: [] }] as never[];
const cats = [{ id: "f", name: "Fingers", color: "x" }, { id: "c", name: "Core", color: "y" }] as never[];
const slot = (id: string, typeId: string, prescribed: ExerciseSlot["prescribed"], logged?: ExerciseSlot["logged"], over: Partial<ExerciseSlot> = {}): ExerciseSlot => ({ id, typeId, prescribed, ...(logged ? { logged } : {}), ...over }) as ExerciseSlot;
const w = (over: Partial<Workout>): Workout => ({ id: "w", status: "completed", date: "2026-10-09T12:00:00Z", weekId: "2026-W41", notes: "Hang day", loadFactor: 1500, exercises: [], ...over }) as Workout;

describe("workAmount", () => {
  it("is weight x reps x sets, reps x sets, hold time or minutes", () => {
    expect(workAmount({ sets: 4, reps: 6, weight: 20 })).toBe(480);
    expect(workAmount({ sets: 3, reps: 10 })).toBe(30);
    expect(workAmount({ sets: 5, timeOn: 7, reps: 1 })).toBe(35);
    expect(workAmount({ duration: 45 })).toBe(45);
    expect(workAmount(undefined)).toBe(0);
  });
});

describe("buildSessionReview", () => {
  const review = (exercises: ExerciseSlot[], others: Workout[] = [], over: Partial<Workout> = {}) =>
    buildSessionReview({ workout: w({ exercises, ...over }), workouts: others, exerciseTypes: types, analyticsCategories: cats });

  it("reads each exercise against its plan", () => {
    const r = review([
      slot("a", "hang", { sets: 4, reps: 6, weight: 20 }, { sets: 4, reps: 6, weight: 20 }),
      slot("b", "hang", { sets: 4, reps: 6, weight: 20 }, { sets: 3, reps: 5, weight: 20 }),
      slot("c", "core", { sets: 3, reps: 10 }, { sets: 3, reps: 14 }),
      slot("d", "core", { sets: 3, reps: 10 }, undefined, { skipped: true }),
      slot("e", "core", undefined, { sets: 2, reps: 10 }),
    ]);
    expect(r.exercises.map((e) => e.outcome)).toEqual(["asPlanned", "less", "more", "skipped", "extra"]);
    expect(r.exercises[1].ratio).toBeCloseTo(300 / 480, 5);
  });

  it("splits the load by category, biggest first, and adds up to 1", () => {
    const r = review([
      slot("a", "hang", { duration: 20 }, { duration: 20 }),
      slot("c", "core", { duration: 20 }, { duration: 40 }),
    ]);
    expect(r.categories[0].name).toBe("Core");
    expect(r.categories.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 5);
  });

  it("compares with the last sessions of the same name", () => {
    const others = [
      w({ id: "x1", date: "2026-10-02T12:00:00Z", loadFactor: 1000 }),
      w({ id: "x2", date: "2026-09-25T12:00:00Z", loadFactor: 1200 }),
      w({ id: "y", date: "2026-09-20T12:00:00Z", notes: "Other", loadFactor: 9999 }),
      w({ id: "later", date: "2026-10-12T12:00:00Z", loadFactor: 9999 }),
    ];
    const r = review([], others);
    expect(r.similar).toMatchObject({ count: 2, avgLoad: 1100 });
    expect(r.similar!.loadChange).toBeCloseTo((1500 / 1100 - 1) * 100, 5);
  });

  it("has no comparison for a session with no name or no earlier one", () => {
    expect(review([], [], { notes: "" }).similar).toBeUndefined();
    expect(review([]).similar).toBeUndefined();
  });
});
