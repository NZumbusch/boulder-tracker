import { describe, it, expect } from "vitest";
import type { Workout, ExerciseSlot } from "../types";
import { weekStrain, bucketStrain, fingerCategoryIds, fingerLoad, relativeStrength, heatmap } from "./proMetrics";
import { toUtcDayIndex } from "../dateUtils";

const MON = toUtcDayIndex("2026-09-14");

describe("weekStrain", () => {
  it("is Foster's mean/SD monotony and load x monotony strain", () => {
    const byDay = new Map([[MON, 300], [MON + 2, 300], [MON + 4, 300]]);
    const s = weekStrain(byDay, MON);
    expect(s.load).toBe(900);
    // mean 128.6, population SD 148.5
    expect(s.monotony).toBeCloseTo(0.866, 2);
    expect(s.strain).toBeCloseTo(779.4, 0);
  });

  it("rates a week of the same load every day as highly monotonous", () => {
    const varied = new Map(Array.from({ length: 7 }, (_, i) => [MON + i, i === 6 ? 150 : 200] as [number, number]));
    expect(weekStrain(varied, MON).monotony!).toBeGreaterThan(2);
  });

  it("has nothing to say about an empty week", () => {
    expect(weekStrain(new Map(), MON)).toEqual({ load: 0 });
  });

  it("averages the weeks of a month column", () => {
    const byDay = new Map([[MON, 300], [MON + 2, 300], [MON + 7, 600], [MON + 9, 600]]);
    const s = bucketStrain(byDay, ["2026-W38", "2026-W39"]);
    expect(s.load).toBe(900);
    expect(s.monotony).toBeDefined();
  });
});

describe("finger load", () => {
  const categories = [
    { id: "fing", name: "Fingers", color: "" },
    { id: "pb", name: "Power Bouldering", color: "" },
    { id: "core", name: "Core", color: "" },
  ];
  const types = [
    { id: "hang", name: "Max Hangs", category: "Fingers", parameters: [] },
    { id: "plank", name: "Plank", category: "Core", parameters: [] },
  ];
  const slot = (typeId: string, duration: number, extra: Partial<ExerciseSlot> = {}): ExerciseSlot =>
    ({ id: typeId + duration, typeId, logged: { duration, intensity: 10 }, ...extra }) as unknown as ExerciseSlot;
  const w = (exercises: ExerciseSlot[], extra: Partial<Workout> = {}): Workout =>
    ({ id: "w" + Math.random(), status: "completed", date: "2026-09-15", weekId: "2026-W38", loadFactor: 0, exercises, ...extra });

  it("guesses finger categories by name until the athlete chooses", () => {
    expect([...fingerCategoryIds(categories, null)].sort()).toEqual(["fing", "pb"]);
    expect([...fingerCategoryIds(categories, ["core"])]).toEqual(["core"]);
  });

  it("sums completed finger-category load, honouring a slot's own category", () => {
    const fingerIds = new Set(["fing"]);
    const workouts = [
      w([slot("hang", 10), slot("plank", 10), slot("plank", 10, { categoryId: "fing" })]),
      w([slot("hang", 10)], { status: "planned" }),
      w([slot("hang", 10)], { weekId: "2026-W30" }),
    ];
    const one = fingerLoad([w([slot("hang", 10)])], ["2026-W38"], { types, categories, fingerIds }).finger;
    expect(one).toBeGreaterThan(0);
    const all = fingerLoad(workouts, ["2026-W38"], { types, categories, fingerIds });
    expect(all.finger).toBeCloseTo(one * 2);
    expect(all.total).toBeCloseTo(one * 3);
  });
});

describe("relativeStrength", () => {
  const bw = (date: string, value: number) => ({ id: date, metricId: "bodyweight", date, value });
  const result = (date: string, value: number) => ({ id: date, typeId: "t", type: "Max hang", value, unit: "kg", date, weekId: "" });

  it("adds bodyweight to added-weight results and uses the nearest reading", () => {
    const pts = relativeStrength([result("2026-09-10", 20)], [bw("2026-09-01", 80), bw("2026-09-09", 70)], true);
    expect(pts[0].bodyweight).toBe(70);
    expect(pts[0].ratio).toBeCloseTo(90 / 70);
  });

  it("uses the value as the total when it already includes bodyweight", () => {
    expect(relativeStrength([result("2026-09-10", 84)], [bw("2026-09-10", 70)], false)[0].ratio).toBeCloseTo(1.2);
  });

  it("skips results with no bodyweight reading close enough", () => {
    expect(relativeStrength([result("2026-09-10", 20)], [bw("2026-06-01", 70)], true)).toEqual([]);
  });
});

describe("heatmap", () => {
  it("ends with the week containing endDay, Monday first, levelled by quartile", () => {
    const end = toUtcDayIndex("2026-09-17"); // Thursday
    const byDay = new Map([[MON, 100], [MON + 1, 200], [MON + 2, 300], [MON + 3, 400]]);
    const grid = heatmap(byDay, end, 2);
    expect(grid).toHaveLength(2);
    expect(grid[1][0].day).toBe(MON);
    expect(grid[1].map((d) => d.level)).toEqual([1, 2, 3, 4, 0, 0, 0]);
  });
});
