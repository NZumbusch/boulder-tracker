import type {
  AnalyticsCategory,
  ExerciseSlot,
  ExerciseTypeDef,
  PhaseDef,
  TrainingBlock,
  WeekNote,
  Workout,
  WorkoutTemplate,
} from "../types";
import { workoutPlannedLoad } from "../types";
import { generateId } from "../utils";
import { getWeekIdRange, incrementWeekId } from "../dateUtils";
import { appendAINote } from "../planning/notes";
import type { AIExercise, AIPlanOutput } from "./schema";

/**
 * How the user resolves one AI-supplied name (an exercise type name or a
 * phase name) that doesn't exactly match an existing catalog entry - either
 * pointing it at an existing entry, or creating a new one. PLAN.md is
 * explicit that an unresolved name must never be silently invented without
 * the user seeing it happen - this type is what the import UI collects to
 * make that choice explicit before anything commits.
 */
export type NameMapping = { action: "map"; id: string } | { action: "create" };

/**
 * Case-insensitive key used both to dedupe unresolved-name lists and to key
 * `NameMapping` records - callers (AIImportModal, tests) must key their
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
 * for an AI import (Stage 10, UI_PLAN.md §5.8). `ExerciseTypeDef.category`
 * stores the category's **name**, not its id - confirmed by every other
 * writer (`ExerciseTypeSettings.svelte`'s `<option value={cat.name}>`,
 * `Analytics.svelte`'s `typeToCategory` map keyed straight off `t.category`
 * for chart bucketing). Before this stage both this function's call sites
 * wrote `fallbackCategory?.id` instead - a pre-existing bug (a freshly
 * AI-created exercise type displayed a raw id like "cat-1" as its category)
 * that happened to go unnoticed because nothing exercised the "AI invents a
 * new exercise type" path with real category display. Fixed here, in the
 * same edit that gives the AI a way to *choose* the category via
 * `categoryName` - flagged in `PROGRESS.md` since it's an incidental fix
 * bundled with the new feature, not itself the feature.
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

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}

export interface PlanPreviewWeek {
  weekId: string;
  phaseName: string;
  phaseResolved: boolean;
  workoutCount: number;
  exerciseCount: number;
}

/** One row of the block plan, shown only for a phase-format import. */
export interface PlanPreviewPhase {
  phaseName: string;
  startWeekId: string;
  endWeekId: string;
  weekCount: number;
  /** Distinct sessions the AI wrote for this phase, before expansion. */
  sessionCount: number;
}

export interface PlanPreview {
  /** Which contract the pasted document used. */
  format: "weekly" | "phase";
  weeks: PlanPreviewWeek[];
  /**
   * The declared block plan, for the phase format only. Lets the preview
   * state the expansion ("3 phases -> 18 weeks -> 68 workouts") so the user
   * sees how much a short paste turns into before committing.
   */
  phases: PlanPreviewPhase[];
  /** Deduped (case-insensitive), in first-seen order. */
  unresolvedExerciseTypeNames: string[];
  unresolvedPhaseNames: string[];
  totalWorkouts: number;
  totalExercises: number;
}

/**
 * Pure preview builder: what importing `plan` would do against the
 * *current* catalog, and which names still need the user to map or create.
 * Never mutates anything, never calls storage - the component calls this on
 * every keystroke/paste to render the diff before any commit is possible.
 */
export function buildPlanPreview(
  plan: AIPlanOutput,
  ctx: { exerciseTypes: ExerciseTypeDef[]; phaseDefs: PhaseDef[] },
): PlanPreview {
  const exerciseNames: string[] = [];
  const phaseNames: string[] = [];
  let totalWorkouts = 0;
  let totalExercises = 0;

  const weeks: PlanPreviewWeek[] = plan.weeks.map((week) => {
    phaseNames.push(week.phaseName);
    const phaseResolved = !!findPhaseByName(week.phaseName, ctx.phaseDefs);
    let exerciseCount = 0;
    for (const workout of week.workouts) {
      for (const exercise of workout.exercises) {
        exerciseNames.push(exercise.exerciseTypeName);
        exerciseCount++;
      }
    }
    totalWorkouts += week.workouts.length;
    totalExercises += exerciseCount;
    return {
      weekId: week.weekId,
      phaseName: week.phaseName,
      phaseResolved,
      workoutCount: week.workouts.length,
      exerciseCount,
    };
  });

  const unresolvedExerciseTypeNames = uniqueNames(
    exerciseNames.filter((name) => !findExerciseTypeByName(name, ctx.exerciseTypes)),
  );
  const unresolvedPhaseNames = uniqueNames(
    phaseNames.filter((name) => !findPhaseByName(name, ctx.phaseDefs)),
  );

  const phases: PlanPreviewPhase[] = (plan.phases ?? []).map((phase) => ({
    phaseName: phase.phaseName,
    startWeekId: phase.startWeekId,
    endWeekId: phase.endWeekId,
    weekCount: getWeekIdRange(phase.startWeekId, phase.endWeekId).length,
    sessionCount: phase.sessions.length,
  }));

  return {
    format: plan.format ?? "weekly",
    weeks,
    phases,
    unresolvedExerciseTypeNames,
    unresolvedPhaseNames,
    totalWorkouts,
    totalExercises,
  };
}

export interface PlanCommitResult {
  newExerciseTypes: ExerciseTypeDef[];
  newPhaseDefs: PhaseDef[];
  trainingBlocks: TrainingBlock[];
  workouts: Workout[];
  /**
   * `templates` entries to write, keyed by `PhaseDef.id` - populated only
   * when the caller asks for it (`options.saveAsTemplates`).
   *
   * Without this an AI import is a one-shot dump: assigning the same phase
   * to a week later still regenerates the *old* templates, not the plan just
   * imported. Writing them makes the plan durable, but it overwrites that
   * phase's existing templates, so it stays opt-in per import.
   */
  templates: Record<string, WorkoutTemplate[]>;
  /**
   * Weeks deliberately left with no stored workouts because the sessions
   * they would hold are exactly what their phase's newly-written templates
   * project anyway - see `lib/planning/weekProjection.ts`. Reported so the
   * import summary can say so rather than looking like it dropped them.
   */
  provisionalWeekIds: string[];
  /**
   * The AI's per-week notes, as it wrote them. Not merged here: merging
   * needs the user's current note for each week, so the caller appends
   * them with `appendAINote` and never overwrites what's already there.
   */
  weekNotes: WeekNote[];
}

/**
 * Whether a week's sessions are identical (ignoring ids) to the template set
 * being saved for its phase - in which case storing them would duplicate,
 * row for row, what the week already projects.
 *
 * A phase-format plan satisfies this by construction: `expandPhasePlan`
 * copies one session list across every week of the phase, and the templates
 * are taken from that same list. A weekly-format plan whose weeks genuinely
 * differ does not, and those weeks are still written hard - which is the
 * point of comparing rather than just checking the format.
 */
function weekMatchesTemplates(workouts: Workout[], templates: WorkoutTemplate[]): boolean {
  if (workouts.length !== templates.length) return false;
  return workouts.every((w, i) => {
    const t = templates[i];
    if ((w.notes || "") !== (t.name || "")) return false;
    if (w.dayOfWeek !== t.dayOfWeek) return false;
    if (w.startTime !== t.startTime) return false;
    if (w.plannedDuration !== t.plannedDuration) return false;
    const ts = t.exercises ?? [];
    if (w.exercises.length !== ts.length) return false;
    return w.exercises.every((e, j) => {
      const te = ts[j];
      return e.typeId === te.typeId
        && e.categoryId === te.categoryId
        && JSON.stringify(e.prescribed ?? {}) === JSON.stringify(te.prescribed ?? {})
        && JSON.stringify(e.activeParameters ?? []) === JSON.stringify(te.activeParameters ?? []);
    });
  });
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

/**
 * Pure commit builder: given a validated plan and the user's resolution for
 * every previously-unresolved name, produces exactly what will be written -
 * new catalog entries (if any names were mapped to "create new"), the
 * `TrainingBlock`s covering the plan's weeks (grouped into contiguous
 * same-phase runs, since PLAN.md's `TrainingBlock` is a possibly-multi-week
 * concurrent emphasis, not one row per week), and the new planned
 * `Workout`s. The caller (AIImportModal) is responsible for actually
 * persisting this via the normal `planningStore`/`workoutStore` services -
 * this function never touches storage, so it's fully unit-testable and
 * fully deterministic for a given mapping.
 *
 * Assumes every name referenced by `plan` has an entry in `exerciseTypeMapping`/
 * `phaseMapping` - the caller must not offer to commit until that's true
 * (see `buildPlanPreview`'s unresolved-name lists).
 */
export function buildPlanCommit(
  plan: AIPlanOutput,
  /** Both records keyed by `normalizeName(name)`, not the raw display string. */
  mapping: { exerciseTypes: Record<string, NameMapping>; phases: Record<string, NameMapping> },
  ctx: { exerciseTypes: ExerciseTypeDef[]; phaseDefs: PhaseDef[]; analyticsCategories: AnalyticsCategory[] },
  options: { saveAsTemplates?: boolean } = {},
): PlanCommitResult {
  const newExerciseTypes: ExerciseTypeDef[] = [];
  const newPhaseDefs: PhaseDef[] = [];

  // Resolve every exercise-type name to a concrete id up front, creating a
  // fresh ExerciseTypeDef (with a fresh id) for every "create" mapping.
  // Takes the whole `AIExercise` (not just the name) so a "create" can read
  // its optional `categoryName` - only the first occurrence of a given name
  // within this import is consulted, since resolution is cached by name.
  const exerciseTypeIdByName = new Map<string, string>();
  const resolveExerciseTypeId = (exercise: AIExercise): string => {
    const name = exercise.exerciseTypeName;
    const key = normalizeName(name);
    const cached = exerciseTypeIdByName.get(key);
    if (cached) return cached;
    const existing = findExerciseTypeByName(name, ctx.exerciseTypes);
    if (existing) {
      exerciseTypeIdByName.set(key, existing.id);
      return existing.id;
    }
    const choice = mapping.exerciseTypes[key];
    if (choice?.action === "map") {
      exerciseTypeIdByName.set(key, choice.id);
      return choice.id;
    }
    // "create" (or no mapping recorded, e.g. a duplicate of an
    // already-created name within this same import) - resolve its category
    // from the AI-supplied `categoryName` where possible (see
    // `resolveNewExerciseTypeCategory`'s doc comment), falling back to a
    // generic default so it always resolves.
    const created: ExerciseTypeDef = {
      id: generateId(),
      name,
      category: resolveNewExerciseTypeCategory(exercise.categoryName, ctx.analyticsCategories),
      parameters: [],
    };
    newExerciseTypes.push(created);
    exerciseTypeIdByName.set(key, created.id);
    return created.id;
  };

  const phaseIdByName = new Map<string, string>();
  const resolvePhaseId = (name: string): string => {
    const key = normalizeName(name);
    const cached = phaseIdByName.get(key);
    if (cached) return cached;
    const existing = findPhaseByName(name, ctx.phaseDefs);
    if (existing) {
      phaseIdByName.set(key, existing.id);
      return existing.id;
    }
    const choice = mapping.phases[key];
    if (choice?.action === "map") {
      phaseIdByName.set(key, choice.id);
      return choice.id;
    }
    const created: PhaseDef = { id: generateId(), name };
    newPhaseDefs.push(created);
    phaseIdByName.set(key, created.id);
    return created.id;
  };

  // Resolve every exercise type name referenced anywhere in the plan before
  // building workouts, so `exerciseTypeById` below is complete.
  for (const week of plan.weeks) {
    for (const workout of week.workouts) {
      for (const exercise of workout.exercises) {
        resolveExerciseTypeId(exercise);
      }
    }
  }
  const exerciseTypeById = new Map<string, ExerciseTypeDef>([
    ...ctx.exerciseTypes.map((t): [string, ExerciseTypeDef] => [t.id, t]),
    ...newExerciseTypes.map((t): [string, ExerciseTypeDef] => [t.id, t]),
  ]);

  // Sort weeks chronologically (weekId strings sort correctly, see
  // trainingBlocks.ts) and group contiguous runs of the same resolved
  // phaseId into a single TrainingBlock each.
  const weeksWithPhaseId = [...plan.weeks]
    .map((week) => ({ week, phaseId: resolvePhaseId(week.phaseName) }))
    .sort((a, b) => (a.week.weekId < b.week.weekId ? -1 : a.week.weekId > b.week.weekId ? 1 : 0));

  const trainingBlocks: TrainingBlock[] = [];
  const blockIdByWeekId = new Map<string, string>();
  for (const { week, phaseId } of weeksWithPhaseId) {
    const last = trainingBlocks[trainingBlocks.length - 1];
    const isContiguous = last && last.phaseId === phaseId && incrementWeekId(last.endWeekId) === week.weekId;
    if (isContiguous) {
      last.endWeekId = week.weekId;
      // Two same-phase phases back to back become one block; keep both notes.
      if (week.blockNotes) last.notes = appendAINote(last.notes, week.blockNotes);
    } else {
      const phase = ctx.phaseDefs.find((p) => p.id === phaseId) ?? newPhaseDefs.find((p) => p.id === phaseId);
      trainingBlocks.push({
        id: generateId(),
        name: phase?.name ?? "AI Import",
        phaseId,
        startWeekId: week.weekId,
        endWeekId: week.weekId,
        ...(week.blockNotes ? { notes: appendAINote(undefined, week.blockNotes) } : {}),
      });
    }
    blockIdByWeekId.set(week.weekId, trainingBlocks[trainingBlocks.length - 1].id);
  }

  // Templates are built first, because whether a week's sessions need to be
  // stored at all depends on whether they match them (see
  // `weekMatchesTemplates`). One set per phase, taken from that phase's
  // first week - which for a phase-format import is exactly the session
  // list the AI wrote once.
  const templates: Record<string, WorkoutTemplate[]> = {};
  if (options.saveAsTemplates) {
    for (const { week, phaseId } of weeksWithPhaseId) {
      if (templates[phaseId] || week.workouts.length === 0) continue;
      templates[phaseId] = week.workouts.map((w) => ({
        id: generateId(),
        name: w.name,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        plannedDuration: w.plannedDuration,
        exercises: w.exercises.map((e) => buildExerciseSlot(e, resolveExerciseTypeId(e), exerciseTypeById)),
      }));
    }
  }

  const workouts: Workout[] = [];
  const provisionalWeekIds: string[] = [];
  for (const { week, phaseId } of weeksWithPhaseId) {
    const weekWorkouts: Workout[] = week.workouts.map((w) => {
      const exercises = w.exercises.map((e) =>
        buildExerciseSlot(e, resolveExerciseTypeId(e), exerciseTypeById),
      );
      return {
        id: generateId(),
        status: "planned",
        date: null,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        plannedDuration: w.plannedDuration,
        weekId: week.weekId,
        notes: w.name || "",
        loadFactor: 0,
        plannedLoad: workoutPlannedLoad(exercises),
        exercises,
        blockId: blockIdByWeekId.get(week.weekId),
      } as Workout;
    });

    // Copy-on-write: a week whose sessions are exactly its phase's templates
    // needs no stored rows - it projects them, and stays free to follow a
    // later template edit until something actually happens in it. This is
    // what keeps a year-long AI plan from writing hundreds of sessions
    // nobody has looked at yet.
    const phaseTemplates = templates[phaseId];
    if (phaseTemplates && weekWorkouts.length > 0 && weekMatchesTemplates(weekWorkouts, phaseTemplates)) {
      provisionalWeekIds.push(week.weekId);
      continue;
    }
    workouts.push(...weekWorkouts);
  }

  const weekNotes: WeekNote[] = weeksWithPhaseId
    .filter(({ week }) => week.notes)
    .map(({ week }) => ({ weekId: week.weekId, text: week.notes! }));

  return { newExerciseTypes, newPhaseDefs, trainingBlocks, workouts, templates, provisionalWeekIds, weekNotes };
}
