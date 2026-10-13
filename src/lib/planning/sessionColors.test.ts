import { describe, it, expect } from "vitest";
import { sessionColor, exerciseSegments } from "./sessionColors";
import type { AnalyticsCategory, ExerciseSlot, ExerciseTypeDef, Workout } from "../types";

const categories: AnalyticsCategory[] = [
  { id: "c-f", name: "Fingers", color: "bg-rose-500" },
  { id: "c-p", name: "Power", color: "bg-amber-500" },
];
const types = [
  { id: "hb", name: "Hangboard", category: "Fingers", parameters: ["duration"] },
  { id: "lb", name: "Limit Bouldering", category: "Power", parameters: ["duration"] },
  { id: "x", name: "Mystery", category: "Nowhere", parameters: [] },
] as unknown as ExerciseTypeDef[];
const slot = (id: string, typeId: string, minutes?: number, over: Partial<ExerciseSlot> = {}): ExerciseSlot =>
  ({ id, typeId, activeParameters: [], prescribed: minutes === undefined ? {} : { duration: minutes }, ...over }) as ExerciseSlot;
const session = (exercises: ExerciseSlot[], over: Partial<Workout> = {}): Workout =>
  ({ id: "w", status: "planned", date: null, weekId: "2026-W41", dayOfWeek: "Monday", exercises, loadFactor: 0, ...over }) as Workout;

describe("exerciseSegments", () => {
  it("one segment per exercise, as long as it takes, in the colour of its category", () => {
    const segs = exerciseSegments(session([slot("a", "hb", 20), slot("b", "lb", 40)]), types, categories);
    expect(segs.map((s) => [s.name, s.minutes, s.color])).toEqual([["Hangboard", 20, "bg-rose-500"], ["Limit Bouldering", 40, "bg-amber-500"]]);
  });
  it("leaves out skipped exercises and gives one with no length a share, not nothing", () => {
    const segs = exerciseSegments(session([slot("a", "hb", 20), slot("b", "lb", 30, { skipped: true }), slot("c", "lb")]), types, categories);
    expect(segs.map((s) => s.slotId)).toEqual(["a", "c"]);
    expect(segs[1].minutes).toBeGreaterThan(0);
  });
  it("an exercise whose category isn't a known one has no colour (the block falls back to its own)", () => {
    expect(exerciseSegments(session([slot("a", "x", 10)]), types, categories)[0].color).toBeUndefined();
  });
  it("a slot may name its own category (by id or by name)", () => {
    const segs = exerciseSegments(session([slot("a", "hb", 10, { categoryId: "c-p" } as Partial<ExerciseSlot>), slot("b", "hb", 10, { categoryId: "Power" } as Partial<ExerciseSlot>)]), types, categories);
    expect(segs.map((s) => s.color)).toEqual(["bg-amber-500", "bg-amber-500"]);
  });
  it("a finished session's segments use what was logged", () => {
    const done = session([slot("a", "hb", 20, { logged: { duration: 35 } } as Partial<ExerciseSlot>)], { status: "completed" });
    expect(exerciseSegments(done, types, categories)[0].minutes).toBe(35);
  });
  it("is empty for a session with no exercises", () => {
    expect(exerciseSegments(session([]), types, categories)).toEqual([]);
  });
});

describe("sessionColor", () => {
  it("is the colour of the category that takes most of the session", () => {
    expect(sessionColor(session([slot("a", "hb", 20), slot("b", "lb", 40)]), types, categories)).toBe("bg-amber-500");
    expect(sessionColor(session([slot("a", "hb", 50), slot("b", "lb", 40)]), types, categories)).toBe("bg-rose-500");
  });
  it("adds up exercises of the same category", () => {
    expect(sessionColor(session([slot("a", "hb", 20), slot("b", "hb", 20), slot("c", "lb", 30)]), types, categories)).toBe("bg-rose-500");
  });
  it("is undefined when nothing has a known category", () => {
    expect(sessionColor(session([slot("a", "x", 10)]), types, categories)).toBeUndefined();
    expect(sessionColor(session([]), types, categories)).toBeUndefined();
  });
});
