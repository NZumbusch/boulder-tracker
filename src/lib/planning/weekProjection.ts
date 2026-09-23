import type { TrainingBlock, WeekOverride, Workout, WorkoutTemplate } from "../types";
import { getDominantBlockForWeek } from "./trainingBlocks";
import { generateWorkoutsFromTemplate, type TemplateIdFactory } from "./generateWorkoutsFromTemplate";
import { getWeekIdRange } from "../dateUtils";

/**
 * Copy-on-write weeks.
 *
 * Assigning a phase to a week used to hard-write one `Workout` row per
 * template into storage immediately, which meant a year-long plan wrote
 * hundreds of sessions nobody had looked at yet - and re-assigning a phase
 * had to delete and re-create them all.
 *
 * A week now stores only its `TrainingBlock` (the phase label) until
 * something makes the sessions real. Until then its sessions are
 * *projected* from the phase's templates at read time: visible and
 * plannable, but not yet stored. The first write of any kind to the week
 * materialises the whole week first (see `state.svelte.ts`'s
 * `materializeWeekIfProvisional`) - that is the "copy" in copy-on-write,
 * and it is a whole-week copy because editing one session must not make the
 * week's other projected sessions disappear.
 *
 * A week is materialised when:
 *  - anything in it is saved, edited, duplicated or deleted,
 *  - it falls into the past (checked on app load - history must record what
 *    was actually planned at the time, not what today's templates say),
 *  - or the user commits it explicitly from the Plan screen.
 *
 * Everything here is pure: the caller supplies the data and persists the
 * result.
 */

export interface WeekProjectionContext {
  workouts: Workout[];
  trainingBlocks: TrainingBlock[];
  templates: Record<string, WorkoutTemplate[]>;
  weekOverrides: WeekOverride[];
}

/**
 * Marks ids minted for projected sessions. Deterministic rather than random
 * so the same provisional week projects to the same ids on every render.
 * They are kept as-is when the week materialises: `weekId` + the template's
 * own id is already unique, and preserving them means a session the user
 * opened while provisional is still the same session afterwards.
 */
export const PROVISIONAL_ID_PREFIX = "prov";

export function provisionalWorkoutId(weekId: string, templateId: string, index: number): string {
  return `${PROVISIONAL_ID_PREFIX}:${weekId}:${templateId}:${index}`;
}

export function provisionalSlotId(weekId: string, templateId: string, slotId: string, index: number): string {
  return `${PROVISIONAL_ID_PREFIX}:${weekId}:${templateId}:${index}:${slotId}`;
}

export function isProvisionalId(id: string): boolean {
  return id.startsWith(`${PROVISIONAL_ID_PREFIX}:`);
}

function projectionIds(weekId: string): TemplateIdFactory {
  return {
    workoutId: (template, index) => provisionalWorkoutId(weekId, template.id, index),
    slotId: (template, slot, index) => provisionalSlotId(weekId, template.id, slot.id, index),
  };
}

/** Whether the week has any stored (materialised) workout at all. */
export function hasStoredWorkouts(ctx: WeekProjectionContext, weekId: string): boolean {
  return ctx.workouts.some((w) => w.weekId === weekId);
}

/** Whether the user has hand-edited this week - the existing "never regenerate over me" flag. */
export function isWeekCustomized(ctx: WeekProjectionContext, weekId: string): boolean {
  return !!ctx.weekOverrides.find((o) => o.weekId === weekId)?.customized;
}

/** The templates a week's sessions would be projected from, via its dominant block's phase. */
export function templatesForWeek(ctx: WeekProjectionContext, weekId: string): WorkoutTemplate[] {
  const block = getDominantBlockForWeek(ctx.trainingBlocks, weekId);
  if (!block) return [];
  return ctx.templates[block.phaseId] ?? [];
}

/**
 * A week is provisional when a phase covers it, that phase has templates,
 * nothing is stored for it yet, and the user has not hand-edited it.
 *
 * The "nothing stored" and "not customized" conditions are what make this
 * safe for existing data: a week that already has hard-saved workouts (every
 * week written before this change) is simply never provisional, so no
 * migration is needed. `customized` additionally covers the case of a user
 * deliberately deleting every session in a week - that stays empty rather
 * than springing back from the templates.
 */
export function isWeekProvisional(ctx: WeekProjectionContext, weekId: string): boolean {
  if (hasStoredWorkouts(ctx, weekId)) return false;
  if (isWeekCustomized(ctx, weekId)) return false;
  return templatesForWeek(ctx, weekId).length > 0;
}

/**
 * The sessions a provisional week shows: generated from its phase's
 * templates, tagged `provisional` so the UI can mark them and so no write
 * path mistakes one for a stored row. Returns `[]` for a week that isn't
 * provisional.
 */
export function projectWeekWorkouts(ctx: WeekProjectionContext, weekId: string): Workout[] {
  if (!isWeekProvisional(ctx, weekId)) return [];
  const block = getDominantBlockForWeek(ctx.trainingBlocks, weekId);
  return generateWorkoutsFromTemplate(weekId, templatesForWeek(ctx, weekId), projectionIds(weekId)).map(
    (w) => ({ ...w, blockId: block?.id, provisional: true as const }),
  );
}

/**
 * What the app should show for a week: its stored workouts, or - if it is
 * still provisional - its projected ones. Never both, since a week stops
 * being provisional the moment it has any stored workout.
 */
export function effectiveWorkoutsForWeek(ctx: WeekProjectionContext, weekId: string): Workout[] {
  const stored = ctx.workouts.filter((w) => w.weekId === weekId);
  return stored.length > 0 ? stored : projectWeekWorkouts(ctx, weekId);
}

/** Strips the transient projection flag - what actually gets persisted. */
export function toStoredWorkout(workout: Workout): Workout {
  const { provisional: _provisional, ...stored } = workout;
  return stored as Workout;
}

/** Every week id any training block covers, deduplicated and in chronological order. */
export function coveredWeekIds(blocks: TrainingBlock[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    for (const id of getWeekIdRange(block.startWeekId, block.endWeekId)) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * Provisional weeks that have already finished, oldest first - the weeks an
 * app load must materialise so history records what was planned at the
 * time rather than re-deriving it from whatever the templates say later.
 * The current week is deliberately excluded: it is still in progress, so
 * it stays provisional until something actually happens in it.
 */
export function provisionalPastWeeks(ctx: WeekProjectionContext, currentWeekId: string): string[] {
  return coveredWeekIds(ctx.trainingBlocks)
    .filter((weekId) => weekId < currentWeekId)
    .filter((weekId) => isWeekProvisional(ctx, weekId));
}
