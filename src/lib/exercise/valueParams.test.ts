import { describe, expect, it } from "vitest";
import { paramsWithValues } from "./valueParams";

describe("paramsWithValues", () => {
  it("adds a planned weight that the type does not track", () => {
    expect(paramsWithValues(["sets", "reps", "timeOn"], { sets: 6, weight: 12.5 })).toEqual(["sets", "reps", "timeOn", "weight"]);
  });
  it("finds a weight that only differs per set", () => {
    expect(paramsWithValues(["sets"], { setDetails: [{ weight: 10 }, { weight: 12 }] })).toContain("weight");
  });
  it("leaves the list alone when nothing extra is there, or it is already tracked", () => {
    expect(paramsWithValues(["sets", "weight"], { weight: 5 })).toEqual(["sets", "weight"]);
    expect(paramsWithValues(["sets"], { sets: 3, weight: 0 }, undefined)).toEqual(["sets"]);
  });
  it("reads any of the given value sets (what was planned, what was logged)", () => {
    expect(paramsWithValues([], { sets: 1 }, { boardAngle: 40 })).toEqual(["boardAngle"]);
  });
});
