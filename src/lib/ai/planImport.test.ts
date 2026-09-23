import { describe, it, expect } from "vitest";
import type { AnalyticsCategory, ExerciseTypeDef, PhaseDef } from "../types";
import {
  findExerciseTypeByName,
  findPhaseByName,
  findCategoryByName,
  normalizeName,
  resolveNewExerciseTypeCategory,
} from "./planImport";

const exerciseTypes: ExerciseTypeDef[] = [
  { id: "et-hangboard", name: "Hangboard", category: "cat-fingers", parameters: ["duration", "sets", "reps"] },
  { id: "et-boulder", name: "Free Bouldering", category: "cat-power", parameters: ["duration", "climbingStyle"] },
];

const phaseDefs: PhaseDef[] = [
  { id: "phase-capacity", name: "Capacity" },
  { id: "phase-deload", name: "Deload" },
];

const analyticsCategories: AnalyticsCategory[] = [
  { id: "cat-fingers", name: "Fingers", color: "red" },
  { id: "cat-power", name: "Power", color: "purple" },
];


describe("findExerciseTypeByName / findPhaseByName", () => {
  it("matches case-insensitively", () => {
    expect(findExerciseTypeByName("hangboard", exerciseTypes)?.id).toBe("et-hangboard");
    expect(findExerciseTypeByName("  Hangboard  ", exerciseTypes)?.id).toBe("et-hangboard");
    expect(findPhaseByName("CAPACITY", phaseDefs)?.id).toBe("phase-capacity");
  });

  it("returns undefined for no match, does not fuzzy-match", () => {
    expect(findExerciseTypeByName("Hangboarding", exerciseTypes)).toBeUndefined();
    expect(findPhaseByName("Capacit", phaseDefs)).toBeUndefined();
  });
});

describe("findCategoryByName / resolveNewExerciseTypeCategory", () => {
  it("matches case-insensitively", () => {
    expect(findCategoryByName("fingers", analyticsCategories)?.id).toBe("cat-fingers");
    expect(findCategoryByName("  Power  ", analyticsCategories)?.id).toBe("cat-power");
  });

  it("resolves a matching categoryName to the category's NAME, not its id", () => {
    expect(resolveNewExerciseTypeCategory("Power", analyticsCategories)).toBe("Power");
  });

  it("falls back to the first non-archived category's name when categoryName doesn't match anything", () => {
    expect(resolveNewExerciseTypeCategory("Not A Real Category", analyticsCategories)).toBe("Fingers");
  });

  it("falls back to the first non-archived category's name when categoryName is omitted", () => {
    expect(resolveNewExerciseTypeCategory(undefined, analyticsCategories)).toBe("Fingers");
  });

  it("skips archived categories when falling back", () => {
    const withArchived: AnalyticsCategory[] = [
      { id: "cat-old", name: "Old", color: "gray", archived: true },
      { id: "cat-power", name: "Power", color: "purple" },
    ];
    expect(resolveNewExerciseTypeCategory(undefined, withArchived)).toBe("Power");
  });
});
