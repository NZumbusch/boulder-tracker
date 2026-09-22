import type { Workout, WorkoutTemplate, ExerciseSlot } from "../types";
import { workoutPlannedLoad } from "../types";
import { generateId } from "../utils";

/**
 * How ids are minted for the generated workouts and their exercise slots.
 * Defaults to fresh random ids; `weekProjection.ts` passes deterministic
 * ones so a *provisional* (not-yet-materialised) week keeps stable identity
 * across re-renders - Svelte's keyed `{#each}`, drag-and-drop and
 * "open this session" all need an id that doesn't change every render.
 */
export interface TemplateIdFactory {
  workoutId: (template: WorkoutTemplate, index: number) => string;
  slotId: (template: WorkoutTemplate, slot: ExerciseSlot, index: number) => string;
}

const RANDOM_IDS: TemplateIdFactory = {
  workoutId: () => generateId(),
  slotId: () => generateId(),
};

/**
 * Builds the set of planned workouts a phase's templates imply for a week.
 * Pure and synchronous - storage only persists the result, it doesn't decide
 * what a phase assignment implies (see PLAN.md Phase 2).
 *
 * Regenerates every exercise slot's id (not just reusing the template's):
 * assigning the same phase to multiple weeks would otherwise give every
 * generated workout's exercises the same ids as the template (and as each
 * other) - the same id-collision bug class the plan calls out for
 * duplicateWorkout, hit here too since this is another place exercises are
 * copied rather than created fresh.
 */
export function generateWorkoutsFromTemplate(
  weekId: string,
  templates: WorkoutTemplate[],
  ids: TemplateIdFactory = RANDOM_IDS,
): Workout[] {
  return templates.map((t, index) => ({
    id: ids.workoutId(t, index),
    status: "planned",
    date: null,
    dayOfWeek: t.dayOfWeek,
    startTime: t.startTime,
    plannedDuration: t.plannedDuration,
    weekId,
    notes: t.name || "",
    loadFactor: 0,
    plannedLoad: workoutPlannedLoad(t.exercises ?? []),
    exercises: (t.exercises || []).map((e, slotIndex) => ({ ...e, id: ids.slotId(t, e, slotIndex) })),
  })) as Workout[];
}
