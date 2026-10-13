import type { DismissedSession, TrainingBlock, Workout, WorkoutTemplate } from "../types";
import { normaliseGroups } from "../exercise/groups";
import { phasesInWeek, winningPhaseOfWeek, blockWeekIds } from "./trainingBlocks";
import { generateWorkoutsFromTemplate, type TemplateIdFactory } from "./generateWorkoutsFromTemplate";
import { weekDayIsos, weekIdOfIso } from "../dateUtils";
import { WEEK_DAYS } from "../constants";

/**
 * Sessions that come from a phase, saved one by one.
 *
 * A phase's templates say what a week of it looks like. The sessions they
 * imply are *projected* at read time - visible and plannable, but not
 * stored - and become real, one at a time, only when something happens to
 * that session: it is logged, changed, moved or deleted. Everything else in
 * the week keeps following the phase, so editing Monday never freezes
 * Thursday's session (which may belong to the next phase).
 *
 * A session's identity is `prov:{weekId}:{templateId}`. The same id marks
 *  - a stored session as "this one, saved from its template" (so it is not
 *    projected a second time), and
 *  - a dismissal as "this one, deleted" (so it does not come back).
 * A dismissal with the id `prov:{weekId}:*` covers the whole week: nothing in
 * it is projected (a week that was cleared, planned by hand or by the AI,
 * or - from the migration - every week that was saved before sessions were
 * saved one by one).
 *
 * Everything here is pure: the caller supplies the data and persists the
 * result.
 */

export interface WeekProjectionContext {
  workouts: Workout[];
  trainingBlocks: TrainingBlock[];
  templates: Record<string, WorkoutTemplate[]>;
  dismissed: DismissedSession[];
}

/** Marks ids minted for projected sessions. Deterministic, so the same week projects to the same ids on every render. */
export const PROVISIONAL_ID_PREFIX = "prov";

export function provisionalWorkoutId(weekId: string, templateId: string): string {
  return `${PROVISIONAL_ID_PREFIX}:${weekId}:${templateId}`;
}

/** Slot ids stay unique per week, template and position, so a session opened while projected is the same one once saved. */
export function provisionalSlotId(weekId: string, templateId: string, slotId: string, index: number): string {
  return `${PROVISIONAL_ID_PREFIX}:${weekId}:${templateId}:${index}:${slotId}`;
}

export function isProvisionalId(id: string): boolean {
  return id.startsWith(`${PROVISIONAL_ID_PREFIX}:`);
}

/** The week a projected id belongs to (`prov:{weekId}:...`) - which is not the week a moved session now sits in. */
export function provisionalIdWeek(id: string): string | undefined {
  return isProvisionalId(id) ? id.split(":")[1] : undefined;
}

/** The dismissal that stops a whole week from projecting anything. */
export function weekDismissalId(weekId: string): string {
  return `${PROVISIONAL_ID_PREFIX}:${weekId}:*`;
}

function projectionIds(weekId: string): TemplateIdFactory {
  return {
    workoutId: (template) => provisionalWorkoutId(weekId, template.id),
    slotId: (template, slot, index) => provisionalSlotId(weekId, template.id, slot.id, index),
  };
}

/** Whether the week has been cut loose from its phase: cleared, planned by hand or by the AI. */
export function isWeekDismissed(ctx: WeekProjectionContext, weekId: string): boolean {
  const id = weekDismissalId(weekId);
  return ctx.dismissed.some((d) => d.id === id);
}

/**
 * The templates a week's sessions come from, each with the phase (block)
 * that owns it. A template with a day belongs to the phase that has that
 * day; one with no day comes once a week from the week's winning phase.
 * A template id appearing twice (two blocks of one phase in a week) counts once.
 */
export function templatesForWeek(ctx: WeekProjectionContext, weekId: string): { template: WorkoutTemplate; block: TrainingBlock }[] {
  const days = weekDayIsos(weekId);
  const winner = winningPhaseOfWeek(ctx.trainingBlocks, weekId);
  const seen = new Set<string>();
  const out: { template: WorkoutTemplate; block: TrainingBlock }[] = [];
  for (const phase of phasesInWeek(ctx.trainingBlocks, weekId)) {
    for (const template of ctx.templates[phase.block.phaseId] ?? []) {
      const day = template.dayOfWeek ? days[WEEK_DAYS.indexOf(template.dayOfWeek)] : undefined;
      const mine = day ? phase.days.includes(day) : phase.block === winner;
      if (!mine || seen.has(template.id)) continue;
      seen.add(template.id);
      out.push({ template, block: phase.block });
    }
  }
  return out;
}

/**
 * The sessions a week still gets from its phases: one per template that is
 * not already stored (saved, logged, moved) and not dismissed, tagged
 * `provisional` so the UI can mark them and no write path mistakes one for
 * a stored row.
 */
export function projectWeekWorkouts(ctx: WeekProjectionContext, weekId: string): Workout[] {
  if (isWeekDismissed(ctx, weekId)) return [];
  // Any stored session with the template's id stands in for it - also one moved into another week.
  const taken = new Set([...ctx.workouts.map((w) => w.id), ...ctx.dismissed.map((d) => d.id)]);
  const wanted = templatesForWeek(ctx, weekId).filter(({ template }) => !taken.has(provisionalWorkoutId(weekId, template.id)));
  const ids = projectionIds(weekId);
  return wanted.flatMap(({ template, block }) =>
    generateWorkoutsFromTemplate(weekId, [template], ids).map((w) => ({ ...w, blockId: block.id, provisional: true as const })),
  );
}

/**
 * What the app shows for a week: its stored sessions (planned and
 * completed) plus the ones its phases still project.
 */
export function effectiveWorkoutsForWeek(ctx: WeekProjectionContext, weekId: string): Workout[] {
  return [...ctx.workouts.filter((w) => w.weekId === weekId), ...projectWeekWorkouts(ctx, weekId)];
}

/**
 * Whether a week differs from what its phases give it - something saved,
 * deleted or cleared - which is when "reset to the phase" has something to do.
 */
export function weekDiffersFromPhase(ctx: WeekProjectionContext, weekId: string): boolean {
  const prefix = `${PROVISIONAL_ID_PREFIX}:${weekId}:`;
  return ctx.dismissed.some((d) => d.id.startsWith(prefix)) || ctx.workouts.some((w) => w.weekId === weekId && w.status === "planned");
}

/**
 * Strips the transient flags (projection, Plan B side) and tidies the
 * grouping (`normaliseGroups`) - what actually gets persisted.
 */
export function toStoredWorkout(workout: Workout): Workout {
  const { provisional: _provisional, planB: _planB, ...stored } = workout;
  const tidy = normaliseGroups(stored as Workout);
  if (tidy.groups === undefined && "groups" in tidy) delete tidy.groups;
  return tidy;
}

/** Every week id any training block covers, deduplicated and in chronological order. */
export function coveredWeekIds(blocks: TrainingBlock[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    for (const id of blockWeekIds(block)) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * Projected sessions whose day has already passed: the ones an app load
 * saves, so history records what was planned at the time rather than
 * re-deriving it from whatever the templates say later. A finished week's
 * sessions all count (a floating one too); in the current week only those
 * on an earlier day. `todayIso` is the app's "today" (see the day-start hour).
 */
export function projectedSessionsInThePast(ctx: WeekProjectionContext, todayIso: string): Workout[] {
  const currentWeek = weekIdOfIso(todayIso);
  const todayIndex = (new Date(`${todayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return coveredWeekIds(ctx.trainingBlocks)
    .filter((weekId) => weekId <= currentWeek)
    .flatMap((weekId) => projectWeekWorkouts(ctx, weekId))
    .filter((w) => w.weekId < currentWeek || (w.dayOfWeek !== undefined && WEEK_DAYS.indexOf(w.dayOfWeek) < todayIndex));
}
