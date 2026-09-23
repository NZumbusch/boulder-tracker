import { describe, it, expect } from "vitest";
import { calculateLoadFactor, calculatePlannedLoad, slotPlannedLoad, slotActualLoad, workoutPlannedLoad } from "./load";
import type { ExerciseSlot } from "../types";

describe("calculatePlannedLoad", () => {
  it("does not return NaN when called the way every real call site calls it (a single exercise-like object)", () => {
    // Regression test: calculatePlannedLoad used to take two positional
    // number args (duration, plannedIntensity), but every real call site in
    // storage.ts and state.svelte.ts already called it with a single
    // exercise object. That mismatch was invisible at runtime (JS doesn't
    // enforce arity) and produced NaN, since `Number(exerciseObject)` is NaN.
    const result = calculatePlannedLoad({ duration: 30, plannedLoad: 7 });
    expect(result).not.toBeNaN();
    expect(Number.isFinite(result)).toBe(true);
  });

  it("computes the documented formula: round(duration * intensity^1.2)", () => {
    expect(calculatePlannedLoad({ duration: 30, plannedLoad: 7 })).toBe(
      Math.round(30 * Math.pow(7, 1.2)),
    );
  });

  it("defaults duration to 60 and intensity to 5 when omitted", () => {
    expect(calculatePlannedLoad({})).toBe(Math.round(60 * Math.pow(5, 1.2)));
  });

  it("treats a duration of 0 as an explicit value, not a missing one", () => {
    expect(calculatePlannedLoad({ duration: 0, plannedLoad: 5 })).toBe(0);
  });
});

describe("calculateLoadFactor", () => {
  it("computes the documented formula: round(duration * weightedFatigue^1.2)", () => {
    const duration = 45;
    const fingers = 8;
    const core = 4;
    const systemic = 6;
    const weighted = fingers * 0.45 + systemic * 0.45 + core * 0.1;
    const expected = Math.round(duration * Math.pow(weighted, 1.2));
    expect(calculateLoadFactor(duration, fingers, core, systemic)).toBe(expected);
  });

  it("defaults duration to 60 when undefined", () => {
    const fingers = 5;
    const core = 5;
    const systemic = 5;
    const weighted = fingers * 0.45 + systemic * 0.45 + core * 0.1;
    const expected = Math.round(60 * Math.pow(weighted, 1.2));
    expect(calculateLoadFactor(undefined, fingers, core, systemic)).toBe(expected);
  });

  it("does not return NaN for a full range of fatigue inputs", () => {
    for (let v = 1; v <= 10; v++) {
      const result = calculateLoadFactor(60, v, v, v);
      expect(result).not.toBeNaN();
    }
  });
});

describe("slotPlannedLoad / workoutPlannedLoad", () => {
  const planned: ExerciseSlot = { id: "a", typeId: "t", prescribed: { duration: 30, plannedLoad: 7 } };
  const unplanned: ExerciseSlot = { id: "b", typeId: "t", logged: { duration: 30, plannedLoad: 7 } };

  it("scores a planned slot from its prescribed values", () => {
    expect(slotPlannedLoad(planned)).toBe(calculatePlannedLoad({ duration: 30, plannedLoad: 7 }));
  });

  it("scores a slot with no prescribed block as zero planned load", () => {
    // Regression test: the old `calculatePlannedLoad(e.prescribed ?? {})`
    // fell through to that function's 60-minute/intensity-5 defaults, so an
    // exercise that was never planned contributed ~414 phantom planned load.
    expect(slotPlannedLoad(unplanned)).toBe(0);
    expect(slotPlannedLoad({ id: "c", typeId: "t" })).toBe(0);
  });

  it("reports no planned load at all for a wholly spontaneous session", () => {
    expect(workoutPlannedLoad([unplanned, { id: "c", typeId: "t", logged: { duration: 45 } }])).toBe(0);
  });

  it("counts only the planned slots when a session mixes planned and added exercises", () => {
    expect(workoutPlannedLoad([planned, unplanned])).toBe(slotPlannedLoad(planned));
  });

  it("treats an empty or missing exercise list as zero", () => {
    expect(workoutPlannedLoad([])).toBe(0);
    expect(workoutPlannedLoad(undefined as unknown as ExerciseSlot[])).toBe(0);
  });
});

describe("slotActualLoad", () => {
  it("prefers the logged values over the prescribed ones", () => {
    const slot: ExerciseSlot = {
      id: "a",
      typeId: "t",
      prescribed: { duration: 30, plannedLoad: 5 },
      logged: { duration: 45, plannedLoad: 8 },
    };
    expect(slotActualLoad(slot)).toBe(calculatePlannedLoad({ duration: 45, plannedLoad: 8 }));
  });

  it("falls back to the plan for a slot that was reached but never logged", () => {
    const slot: ExerciseSlot = { id: "a", typeId: "t", prescribed: { duration: 30, plannedLoad: 5 } };
    expect(slotActualLoad(slot)).toBe(calculatePlannedLoad({ duration: 30, plannedLoad: 5 }));
  });

  it("scores a skipped slot as zero however well it was planned", () => {
    const slot: ExerciseSlot = { id: "a", typeId: "t", prescribed: { duration: 90, plannedLoad: 9 }, skipped: true };
    expect(slotActualLoad(slot)).toBe(0);
  });

  it("scores a slot with neither plan nor log as zero", () => {
    expect(slotActualLoad({ id: "a", typeId: "t" })).toBe(0);
  });
});
