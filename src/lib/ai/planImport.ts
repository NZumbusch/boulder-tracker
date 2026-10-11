import type { AnalyticsCategory, ExerciseSlot, ExerciseTypeDef, PhaseDef } from "../types";
import { generateId } from "../utils";
import type { AIExercise } from "./schema";

/**
 * How the user resolves one AI-supplied name (an exercise type name or a
 * phase name) that doesn't exactly match an existing catalog entry - either
 * pointing it at an existing entry, or creating a new one. An
 * unresolved name must never be silently invented without
 * the user seeing it happen - this type is what the import UI collects to
 * make that choice explicit before anything commits.
 */
export type NameMapping = { action: "map"; id: string } | { action: "create" };

/**
 * Case-insensitive key used both to dedupe unresolved-name lists and to key
 * `NameMapping` records - callers (SessionAIModal, tests) must key their
 * mapping objects by `normalizeName(name)`, never by the raw display string,
 * so a name that appears with different casing in different parts of the
 * same pasted plan still resolves to one mapping choice.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Case-insensitive exact-name match only - no fuzzy matching, to avoid surprising auto-links. */
export function findExerciseTypeByName(name: string, exerciseTypes: ExerciseTypeDef[]): ExerciseTypeDef | undefined {
  const target = normalizeName(name);
  return exerciseTypes.find((t) => normalizeName(t.name) === target);
}

export function findPhaseByName(name: string, phaseDefs: PhaseDef[]): PhaseDef | undefined {
  const target = normalizeName(name);
  return phaseDefs.find((p) => normalizeName(p.name) === target);
}

export function findCategoryByName(name: string, categories: AnalyticsCategory[]): AnalyticsCategory | undefined {
  const target = normalizeName(name);
  return categories.find((c) => normalizeName(c.name) === target);
}

/**
 * Resolves what to write into a freshly-created `ExerciseTypeDef.category`
 * for an AI import. `ExerciseTypeDef.category`
 * stores the category's **name**, not its id - confirmed by every other
 * writer (`ExerciseTypeEditor.svelte`'s `<option value={cat.name}>`,
 * `Analytics.svelte`'s `typeToCategory` map keyed straight off `t.category`
 * for chart bucketing). Before this change both of this function's call sites
 * wrote `fallbackCategory?.id` instead - a pre-existing bug (a freshly
 * AI-created exercise type displayed a raw id like "cat-1" as its category)
 * that happened to go unnoticed because nothing exercised the "AI invents a
 * new exercise type" path with real category display. Fixed here, in the
 * same edit that gives the AI a way to *choose* the category via
 * `categoryName` - an incidental fix bundled with the new feature, not
 * itself the feature.
 */
export function resolveNewExerciseTypeCategory(
  categoryName: string | undefined,
  categories: AnalyticsCategory[],
): string {
  if (categoryName) {
    const matched = findCategoryByName(categoryName, categories);
    if (matched) return matched.name;
  }
  const fallback = categories.find((c) => !c.archived) ?? categories[0];
  return fallback?.name ?? "";
}

/** Shared with `workoutLogImport.ts` - building an `ExerciseSlot` from a validated AI exercise is identical either way. */
export function buildExerciseSlot(
  exercise: AIExercise,
  typeId: string,
  exerciseTypeById: Map<string, ExerciseTypeDef>,
  bucket: "prescribed" | "logged" = "prescribed",
): ExerciseSlot {
  const type = exerciseTypeById.get(typeId);
  return {
    id: generateId(),
    typeId,
    // Seed the type's own default parameters, same as a freshly-added
    // exercise in ExerciseForm.svelte would get - not just whatever fields
    // happened to be present in `values`, so the exercise renders normally
    // in the edit form afterward.
    activeParameters: type ? [...type.parameters] : undefined,
    [bucket]: exercise.values,
  };
}
