import { describe, it, expect } from "vitest";
import { toRepsArray, repsPerSet, repsTotal, repsRepresentative, setsFromReps } from "./reps";
import type { ExerciseValues } from "../types";

/** Per-set reps, as real exports carry them. */
const perSet = (reps: unknown, rest: Partial<ExerciseValues> = {}) =>
  ({ ...rest, reps } as unknown as ExerciseValues);

describe("toRepsArray", () => {
  it("accepts a per-set array", () => {
    expect(toRepsArray([10, 7, 8, 8])).toEqual([10, 7, 8, 8]);
  });

  it("rejects anything that isn't an array", () => {
    expect(toRepsArray(6)).toBeNull();
    expect(toRepsArray(undefined)).toBeNull();
    expect(toRepsArray("6,6,5")).toBeNull();
  });

  it("drops junk entries, keeping the usable ones", () => {
    expect(toRepsArray([5, null, "x", 0, -2, 3])).toEqual([5, 3]);
  });

  it("returns null when nothing usable survives", () => {
    expect(toRepsArray([])).toBeNull();
    expect(toRepsArray([null, "x"])).toBeNull();
  });
});

describe("repsPerSet", () => {
  it("spreads a single number across the sets", () => {
    expect(repsPerSet({ sets: 3, reps: 5 })).toEqual([5, 5, 5]);
  });

  it("takes a per-set array as-is", () => {
    expect(repsPerSet(perSet([6, 6, 5, 5, 4]))).toEqual([6, 6, 5, 5, 4]);
  });

  it("lets the array override a stale set count", () => {
    // Real data: `sets` was the plan (4), the array is what happened (5).
    expect(repsPerSet(perSet([6, 6, 5, 5, 4], { sets: 4 }))).toHaveLength(5);
  });

  it("assumes one rep per set when only sets are known, for the duration maths", () => {
    expect(repsPerSet({ sets: 4 })).toEqual([1, 1, 1, 1]);
  });

  it("always returns at least one set", () => {
    expect(repsPerSet({})).toEqual([1]);
    expect(repsPerSet({ sets: 0 })).toEqual([1]);
  });
});

describe("repsTotal", () => {
  it("sums a per-set array", () => {
    expect(repsTotal(perSet([10, 7, 8, 8]))).toBe(33);
  });

  it("multiplies a uniform count by the sets", () => {
    expect(repsTotal({ sets: 4, reps: 6 })).toBe(24);
  });

  it("treats a rep count with no sets as one set", () => {
    expect(repsTotal({ reps: 6 })).toBe(6);
  });

  it("reports nothing rather than inventing reps that were never recorded", () => {
    // Regression: this used to route through `repsPerSet`, which fills in
    // one rep per set for the duration maths - turning "sets: 5, reps not
    // tracked" into a confident "5 reps" in the AI prompt.
    expect(repsTotal({ sets: 5 })).toBeUndefined();
    expect(repsTotal({})).toBeUndefined();
  });
});

describe("repsRepresentative", () => {
  it("passes a single number through", () => {
    expect(repsRepresentative(6)).toBe(6);
  });

  it("averages a per-set array rather than taking the first set", () => {
    // [10, 7, 8, 8] averages 8.25 -> 8. The first set (10) would flatter a
    // descending series.
    expect(repsRepresentative([10, 7, 8, 8])).toBe(8);
  });

  it("rounds the average", () => {
    expect(repsRepresentative([6, 6, 5, 5, 4])).toBe(5);
  });

  it("is undefined when there is nothing to represent", () => {
    expect(repsRepresentative(undefined)).toBeUndefined();
    expect(repsRepresentative(0)).toBeUndefined();
    expect(repsRepresentative([])).toBeUndefined();
  });
});

describe("setsFromReps", () => {
  it("counts the sets a per-set array implies", () => {
    expect(setsFromReps([6, 6, 5, 5, 4])).toBe(5);
  });

  it("implies nothing from a single number", () => {
    expect(setsFromReps(6)).toBeUndefined();
    expect(setsFromReps(undefined)).toBeUndefined();
  });
});
