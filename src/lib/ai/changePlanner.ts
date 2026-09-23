/**
 * Turns a validated change set (`changeSet.ts`) into a reviewable list of
 * changes and, for the ticked ones, the exact writes to perform.
 *
 * Pure: it works on copies of the user's data and never touches storage.
 * The preview calls `planChanges` on every tick/untick; the same function's
 * `writes` are what Apply persists, so what you see is what gets written.
 *
 * Order matters and follows the contract: exercise types first (so
 * sessions can use a type added in the same document), then phases (so
 * weeks can follow a phase added or edited here), then weeks - each week
 * entry building on the result of the ones before it.
 *
 * Week semantics (settled with the user):
 *  - phase only       -> the week follows that phase; its planned sessions
 *                        are replaced by the phase's (it stays provisional
 *                        unless it has completed sessions to plan around)
 *  - "sessions"       -> the week's planned sessions become exactly these
 *  - "sessionChanges" -> edits applied to the week's current sessions
 * Completed sessions are never touched. Hand-edited weeks being replaced
 * are flagged, not refused.
 */
import type {
  AnalyticsCategory,
  ExerciseSlot,
  ExerciseTypeDef,
  ExerciseValues,
  PhaseDef,
  TrainingBlock,
  WeekNote,
  WeekOverride,
  Workout,
  WorkoutTemplate,
} from "../types";
import { workoutPlannedLoad } from "../types";
import { generateId } from "../utils";
import { decrementWeekId, incrementWeekId } from "../dateUtils";
import { getDominantBlockForWeek } from "../planning/trainingBlocks";
import { generateWorkoutsFromTemplate } from "../planning/generateWorkoutsFromTemplate";
import { appendAINote, weekNoteText } from "../planning/notes";
import { normalizeName, resolveNewExerciseTypeCategory } from "./planImport";
import { PARAMETER_BLOCKS, type AIChangeSet, type CSExerciseChange, type CSSession, type CSSessionChange, type CSSessionMatch } from "./changeSet";
import type { AIExercise } from "./schema";
import { slotValues } from "../exerciseSlot";

// --- Inputs and outputs -----------------------------------------------------

export interface PlannerState {
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  phaseDefs: PhaseDef[];
  templates: Record<string, WorkoutTemplate[]>;
  trainingBlocks: TrainingBlock[];
  /** Stored workouts (planned and completed). */
  workouts: Workout[];
  weekOverrides: WeekOverride[];
  weekNotes: WeekNote[];
  /** For "this is in the past" warnings. */
  currentWeekId: string;
}

export type ChangeSection = "exercise" | "phase" | "week";

export interface ChangeItem {
  id: string;
  section: ChangeSection;
  /** One-line headline, e.g. "+ Max Hangs 7s" or "W40–W42 → Power". */
  title: string;
  /** Before -> after lines. */
  details: string[];
  warnings: string[];
  /** Why this change can't be applied as things stand (it's then unticked). */
  errors: string[];
  /** Other items this one relies on (a new exercise it uses, a phase it follows). */
  dependsOn: string[];
}

/** What a week ends up as. `planned: null` = follow its phase (no stored plan). */
export interface WeekWrite {
  weekId: string;
  planned: Workout[] | null;
  customized: boolean;
}

export interface PlanWrites {
  exerciseTypes?: ExerciseTypeDef[];
  phaseDefs?: PhaseDef[];
  templates?: Record<string, WorkoutTemplate[]>;
  trainingBlocks?: TrainingBlock[];
  weeks: WeekWrite[];
  weekNotes: WeekNote[];
}

export interface PlanResult {
  items: ChangeItem[];
  writes: PlanWrites;
}

// --- Small helpers ----------------------------------------------------------

const PHASE_COLORS = ["bg-success-hover", "bg-tertiary-hover", "bg-indigo-500", "bg-rose-500", "bg-amber-500", "bg-sky-500", "bg-zinc-500", "bg-warning", "bg-cyan-500", "bg-fuchsia-500", "bg-lime-500", "bg-teal-500", "bg-pink-500"];

const DAY_SHORT: Record<string, string> = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };

function sessionLabel(s: { notes?: string; dayOfWeek?: string }): string {
  return [s.dayOfWeek ? DAY_SHORT[s.dayOfWeek] : undefined, s.notes || "Session"].filter(Boolean).join(" ");
}

function weekRangeLabel(weekIds: string[]): string {
  const short = (w: string) => w.replace(/^\d{4}-/, "");
  return weekIds.length === 1 ? short(weekIds[0]) : `${short(weekIds[0])}–${short(weekIds[weekIds.length - 1])}`;
}

function show(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** "sets 5 → 6, weight 10 → —" for the fields that differ. */
function valueDiff(before: ExerciseValues, after: ExerciseValues): string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])] as (keyof ExerciseValues)[];
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => `${k} ${show(before[k])} → ${show(after[k])}`);
}

// --- The planner ------------------------------------------------------------

interface Ctx {
  state: PlannerState;
  newId: () => string;
  types: ExerciseTypeDef[];
  /** Normalised name -> the item that introduced or renamed it (for dependencies). */
  typeOrigin: Map<string, string>;
  /** Names added by unticked items (for a clearer error). */
  untickedTypeNames: Set<string>;
  phaseDefs: PhaseDef[];
  templates: Record<string, WorkoutTemplate[]>;
  phaseOrigin: Map<string, string>;
  untickedPhaseNames: Set<string>;
  blocks: TrainingBlock[];
  /** Weeks touched so far, with their resulting plan. */
  weekState: Map<string, { planned: Workout[] | null; customized: boolean }>;
  weekNotes: WeekNote[];
  changed: { types: boolean; phases: boolean; templates: boolean; blocks: boolean };
}

function findType(ctx: Ctx, name: string): ExerciseTypeDef | undefined {
  const key = normalizeName(name);
  const matches = ctx.types.filter((t) => normalizeName(t.name) === key);
  return matches.find((t) => !t.archived) ?? matches[0];
}

function findPhase(ctx: Ctx, name: string): PhaseDef | undefined {
  const key = normalizeName(name);
  const matches = ctx.phaseDefs.filter((p) => normalizeName(p.name) === key);
  return matches.find((p) => !p.archived) ?? matches[0];
}

function typeName(ctx: Ctx, typeId: string): string {
  return ctx.types.find((t) => t.id === typeId)?.name ?? ctx.state.exerciseTypes.find((t) => t.id === typeId)?.name ?? "Unknown";
}

/** Resolves an exercise type name, recording the dependency or the error. */
function resolveType(ctx: Ctx, name: string, item: ChangeItem): ExerciseTypeDef | undefined {
  const type = findType(ctx, name);
  if (!type) {
    item.errors.push(
      ctx.untickedTypeNames.has(normalizeName(name))
        ? `Uses the new exercise "${name}", which is unticked.`
        : `Unknown exercise "${name}" - it isn't in your exercise list and isn't added under "exerciseTypes".`,
    );
    return undefined;
  }
  const origin = ctx.typeOrigin.get(normalizeName(type.name));
  if (origin && !item.dependsOn.includes(origin)) item.dependsOn.push(origin);
  if (type.archived) item.warnings.push(`"${type.name}" is archived in your exercise list.`);
  return type;
}

function buildSlot(ctx: Ctx, exercise: AIExercise, item: ChangeItem): ExerciseSlot | undefined {
  const type = resolveType(ctx, exercise.exerciseTypeName, item);
  if (!type) return undefined;
  return { id: ctx.newId(), typeId: type.id, activeParameters: [...type.parameters], prescribed: { ...exercise.values } };
}

function buildSlots(ctx: Ctx, exercises: AIExercise[], item: ChangeItem): ExerciseSlot[] {
  return exercises.map((e) => buildSlot(ctx, e, item)).filter((s): s is ExerciseSlot => !!s);
}

function templateFromSession(ctx: Ctx, s: CSSession, item: ChangeItem): WorkoutTemplate {
  return {
    id: ctx.newId(),
    name: s.name,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    plannedDuration: s.plannedDuration,
    ...(s.notes ? { description: s.notes } : {}),
    exercises: buildSlots(ctx, s.exercises, item),
  };
}

function workoutFromSession(ctx: Ctx, weekId: string, s: CSSession, item: ChangeItem): Workout {
  const exercises = buildSlots(ctx, s.exercises, item);
  return {
    id: ctx.newId(),
    status: "planned",
    date: null,
    weekId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    plannedDuration: s.plannedDuration,
    notes: s.name,
    ...(s.notes ? { description: s.notes } : {}),
    loadFactor: 0,
    plannedLoad: workoutPlannedLoad(exercises),
    exercises,
  };
}

/**
 * Sessions are edited through one common shape so phase templates and week
 * workouts share the same change logic. `notes` here is the session NAME
 * (as on Workout), `description` its note.
 */
interface EditableSession {
  id: string;
  notes?: string;
  description?: string;
  dayOfWeek?: Workout["dayOfWeek"];
  startTime?: string;
  plannedDuration?: number;
  exercises: ExerciseSlot[];
}

function matchSessions<T extends EditableSession>(sessions: T[], match: CSSessionMatch): T[] {
  return sessions.filter(
    (s) =>
      (!match.name || normalizeName(s.notes ?? "") === normalizeName(match.name)) &&
      (!match.dayOfWeek || s.dayOfWeek === match.dayOfWeek),
  );
}

function describeMatch(match: CSSessionMatch): string {
  return [match.dayOfWeek, match.name && `"${match.name}"`].filter(Boolean).join(" ");
}

function applyExerciseChanges(ctx: Ctx, slots: ExerciseSlot[], changes: CSExerciseChange[], item: ChangeItem, where: string): { slots: ExerciseSlot[]; lines: string[] } {
  let result = slots.map((s) => ({ ...s }));
  const lines: string[] = [];
  const find = (name: string, occurrence?: number): number | undefined => {
    const type = findType(ctx, name);
    const key = normalizeName(name);
    const hits = result
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (type ? s.typeId === type.id : false) || normalizeName(typeName(ctx, s.typeId)) === key);
    if (hits.length === 0) {
      item.errors.push(`${where}: no "${name}" exercise to change.`);
      return undefined;
    }
    if (occurrence !== undefined) {
      if (occurrence > hits.length) {
        item.errors.push(`${where}: "${name}" appears ${hits.length} time(s), so there is no occurrence ${occurrence}.`);
        return undefined;
      }
      return hits[occurrence - 1].i;
    }
    if (hits.length > 1) {
      item.errors.push(`${where}: "${name}" appears ${hits.length} times - say which with "occurrence".`);
      return undefined;
    }
    return hits[0].i;
  };
  for (const change of changes) {
    if (change.action === "add") {
      const slot = buildSlot(ctx, change.exercise, item);
      if (!slot) continue;
      const at = change.position ? Math.min(change.position - 1, result.length) : result.length;
      result.splice(at, 0, slot);
      lines.push(`+ ${typeName(ctx, slot.typeId)}${Object.keys(change.exercise.values).length ? ` (${Object.entries(change.exercise.values).filter(([k]) => k !== "notes").map(([k, v]) => `${k} ${show(v)}`).join(", ")})` : ""}`);
    } else if (change.action === "remove") {
      const i = find(change.match.exerciseTypeName, change.match.occurrence);
      if (i === undefined) continue;
      lines.push(`− ${typeName(ctx, result[i].typeId)}`);
      result.splice(i, 1);
    } else {
      const i = find(change.match.exerciseTypeName, change.match.occurrence);
      if (i === undefined) continue;
      const slot = result[i];
      const before = { ...(slot.prescribed ?? slotValues(slot)) };
      const after: ExerciseValues = { ...before, ...change.values };
      for (const key of change.clear) delete after[key];
      let label = typeName(ctx, slot.typeId);
      let typeId = slot.typeId;
      if (change.exerciseTypeName) {
        const newType = resolveType(ctx, change.exerciseTypeName, item);
        if (newType && newType.id !== slot.typeId) {
          label = `${label} → ${newType.name}`;
          typeId = newType.id;
        }
      }
      const diff = valueDiff(before, after);
      result[i] = {
        ...slot,
        typeId,
        activeParameters: typeId === slot.typeId ? slot.activeParameters : [...new Set([...(slot.activeParameters ?? []), ...(ctx.types.find((t) => t.id === typeId)?.parameters ?? [])])],
        prescribed: after,
      };
      lines.push(`~ ${label}${diff.length ? `: ${diff.join(", ")}` : ""}`);
    }
  }
  return { slots: result, lines };
}

/** Applies session changes to a list of sessions (template or workout shaped). */
function applySessionChanges<T extends EditableSession>(
  ctx: Ctx,
  sessions: T[],
  changes: CSSessionChange[],
  item: ChangeItem,
  where: string,
  make: (s: CSSession) => T,
): { sessions: T[]; lines: string[] } {
  let result = [...sessions];
  const lines: string[] = [];
  for (const change of changes) {
    if (change.action === "add") {
      const added = make(change.session);
      result.push(added);
      lines.push(`+ ${sessionLabel(added)} (${added.exercises.length} exercise${added.exercises.length === 1 ? "" : "s"})`);
      continue;
    }
    const hits = matchSessions(result, change.match);
    if (hits.length !== 1) {
      item.errors.push(
        hits.length === 0
          ? `${where}: no session matches ${describeMatch(change.match)}.`
          : `${where}: ${hits.length} sessions match ${describeMatch(change.match)} - give both "name" and "dayOfWeek".`,
      );
      continue;
    }
    const target = hits[0];
    if (change.action === "remove") {
      result = result.filter((s) => s !== target);
      lines.push(`− ${sessionLabel(target)}`);
      continue;
    }
    const next: T = { ...target };
    const fieldLines: string[] = [];
    const set = change.set;
    if (set.name !== undefined && set.name !== target.notes) { fieldLines.push(`name ${show(target.notes)} → ${set.name}`); next.notes = set.name; }
    if (set.dayOfWeek !== undefined && set.dayOfWeek !== target.dayOfWeek) { fieldLines.push(`day ${show(target.dayOfWeek)} → ${set.dayOfWeek}`); next.dayOfWeek = set.dayOfWeek; }
    if (set.startTime !== undefined && set.startTime !== target.startTime) { fieldLines.push(`start ${show(target.startTime)} → ${set.startTime}`); next.startTime = set.startTime; }
    if (set.plannedDuration !== undefined && set.plannedDuration !== target.plannedDuration) { fieldLines.push(`length ${show(target.plannedDuration)} → ${set.plannedDuration} min`); next.plannedDuration = set.plannedDuration; }
    if (set.notes !== undefined && set.notes !== (target.description ?? "")) {
      fieldLines.push(set.notes ? `note → "${set.notes}"` : "note removed");
      if (set.notes) next.description = set.notes;
      else delete next.description;
    }
    const label = sessionLabel(target);
    if (change.exercises) {
      next.exercises = buildSlots(ctx, change.exercises, item);
      fieldLines.push(`exercises replaced (${target.exercises.length} → ${next.exercises.length})`);
    } else if (change.exerciseChanges) {
      const r = applyExerciseChanges(ctx, target.exercises, change.exerciseChanges, item, `${where} ${label}`);
      next.exercises = r.slots;
      fieldLines.push(...r.lines);
    }
    result = result.map((s) => (s === target ? next : s));
    lines.push(`~ ${label}: ${fieldLines.join("; ") || "no change"}`);
  }
  return { sessions: result, lines };
}

/** Before/after of two session lists, matched by id. */
function sessionListDiff(before: EditableSession[], after: EditableSession[]): string[] {
  const lines: string[] = [];
  for (const s of before) if (!after.some((a) => a.id === s.id)) lines.push(`− ${sessionLabel(s)}`);
  for (const s of after) if (!before.some((b) => b.id === s.id)) lines.push(`+ ${sessionLabel(s)} (${s.exercises.length} exercise${s.exercises.length === 1 ? "" : "s"})`);
  return lines;
}

/** Removes [start, end] from every block, splitting blocks that straddle it. */
export function carveBlocks(blocks: TrainingBlock[], start: string, end: string, newId: () => string): TrainingBlock[] {
  const result: TrainingBlock[] = [];
  for (const b of blocks) {
    if (b.endWeekId < start || b.startWeekId > end) {
      result.push(b);
      continue;
    }
    if (b.startWeekId < start) result.push({ ...b, endWeekId: decrementWeekId(start) });
    if (b.endWeekId > end) result.push({ ...b, id: b.startWeekId < start ? newId() : b.id, startWeekId: incrementWeekId(end) });
  }
  return result;
}

function effectivePhaseName(ctx: Ctx, blocks: TrainingBlock[], weekId: string): string | undefined {
  const block = getDominantBlockForWeek(blocks, weekId);
  return block ? ctx.phaseDefs.find((p) => p.id === block.phaseId)?.name ?? ctx.state.phaseDefs.find((p) => p.id === block.phaseId)?.name : undefined;
}

/** A week's sessions right now in the plan being built: touched earlier, stored, or projected from its phase. */
function currentWeek(ctx: Ctx, weekId: string): { planned: Workout[]; completed: Workout[]; followsPhase: boolean } {
  const completed = ctx.state.workouts.filter((w) => w.weekId === weekId && w.status === "completed");
  const touched = ctx.weekState.get(weekId);
  if (touched) return { planned: touched.planned ?? projected(ctx, weekId), completed, followsPhase: touched.planned === null };
  const stored = ctx.state.workouts.filter((w) => w.weekId === weekId && w.status === "planned");
  const hasStored = stored.length > 0 || completed.length > 0;
  return { planned: hasStored ? stored : projected(ctx, weekId), completed, followsPhase: !hasStored };
}

function projected(ctx: Ctx, weekId: string): Workout[] {
  const block = getDominantBlockForWeek(ctx.blocks, weekId);
  if (!block) return [];
  return generateWorkoutsFromTemplate(weekId, ctx.templates[block.phaseId] ?? [], { workoutId: () => ctx.newId(), slotId: () => ctx.newId() })
    .map((w) => ({ ...w, blockId: block.id }));
}

/**
 * Plans the change set against `state`. `selected` holds the ids of ticked
 * items (all items when omitted). Every item is always returned - unticked
 * ones for display - but only ticked ones affect the result and `writes`.
 */
export function planChanges(set: AIChangeSet, state: PlannerState, selected?: Set<string>, newId: () => string = generateId): PlanResult {
  const isOn = (id: string) => !selected || selected.has(id);
  const ctx: Ctx = {
    state,
    newId,
    types: state.exerciseTypes.map((t) => ({ ...t })),
    typeOrigin: new Map(),
    untickedTypeNames: new Set(),
    phaseDefs: state.phaseDefs.map((p) => ({ ...p })),
    templates: Object.fromEntries(Object.entries(state.templates).map(([k, v]) => [k, [...v]])),
    phaseOrigin: new Map(),
    untickedPhaseNames: new Set(),
    blocks: state.trainingBlocks.map((b) => ({ ...b })),
    weekState: new Map(),
    weekNotes: [...state.weekNotes],
    changed: { types: false, phases: false, templates: false, blocks: false },
  };
  const items: ChangeItem[] = [];
  const noteWrites = new Map<string, string>();

  // --- 1. Exercise types ---
  const newTypeIds: string[] = [];
  set.exerciseTypes.forEach((change, i) => {
    const id = `exercise-${i}`;
    const item: ChangeItem = { id, section: "exercise", title: "", details: [], warnings: [], errors: [], dependsOn: [] };
    items.push(item);
    const on = isOn(id);
    if (change.action === "add") {
      item.title = `+ ${change.name}`;
      const existing = findType(ctx, change.name);
      if (existing && !existing.archived) {
        item.errors.push(`"${existing.name}" is already in your exercise list - use "edit" to change it.`);
        return;
      }
      const category = resolveNewExerciseTypeCategory(change.categoryName, state.analyticsCategories);
      item.details.push(`category ${category}`, `tracks ${show(change.parameters ?? [])}`);
      if (!on) {
        ctx.untickedTypeNames.add(normalizeName(change.name));
        return;
      }
      const def: ExerciseTypeDef = { id: newId(), name: change.name, category, parameters: change.parameters ?? [] };
      ctx.types.push(def);
      newTypeIds.push(def.id);
      ctx.typeOrigin.set(normalizeName(def.name), id);
      ctx.changed.types = true;
    } else {
      const type = findType(ctx, change.name);
      item.title = `${change.action === "archive" ? "archive" : "~"} ${change.name}`;
      if (!type) {
        item.errors.push(`No exercise called "${change.name}" in your list.`);
        return;
      }
      if (change.action === "archive") {
        const uses = Object.values(ctx.templates).flat().filter((t) => t.exercises.some((s) => s.typeId === type.id)).length;
        if (uses) item.warnings.push(`Still used in ${uses} phase session(s) - they keep working, it just stops being offered for new exercises.`);
        if (on) {
          ctx.types = ctx.types.map((t) => (t.id === type.id ? { ...t, archived: true } : t));
          ctx.changed.types = true;
        }
        return;
      }
      const next: ExerciseTypeDef = { ...type };
      if (change.rename && change.rename !== type.name) {
        const clash = findType(ctx, change.rename);
        if (clash && clash.id !== type.id) item.errors.push(`Can't rename to "${change.rename}" - that name is taken.`);
        item.details.push(`name ${type.name} → ${change.rename}`);
        next.name = change.rename;
      }
      if (change.categoryName) {
        const category = resolveNewExerciseTypeCategory(change.categoryName, state.analyticsCategories);
        if (category !== type.category) item.details.push(`category ${type.category} → ${category}`);
        next.category = category;
      }
      if (change.parameters) {
        item.details.push(`tracks ${show(type.parameters)} → ${show(change.parameters)}`);
        next.parameters = change.parameters;
      }
      if (on && item.errors.length === 0) {
        ctx.types = ctx.types.map((t) => (t.id === type.id ? next : t));
        if (change.rename) {
          ctx.typeOrigin.set(normalizeName(next.name), id);
          ctx.untickedTypeNames.delete(normalizeName(next.name));
        }
        ctx.changed.types = true;
      } else if (!on && change.rename) {
        ctx.untickedTypeNames.add(normalizeName(change.rename));
      }
    }
  });

  // --- 2. Phases ---
  set.phases.forEach((change, i) => {
    const id = `phase-${i}`;
    const item: ChangeItem = { id, section: "phase", title: "", details: [], warnings: [], errors: [], dependsOn: [] };
    items.push(item);
    const on = isOn(id);
    if (change.action === "add") {
      item.title = `+ ${change.name}`;
      const existing = findPhase(ctx, change.name);
      if (existing && !existing.archived) {
        item.errors.push(`A phase called "${existing.name}" already exists - use "edit" to change it.`);
        return;
      }
      const templates = change.sessions.map((s) => templateFromSession(ctx, s, item));
      item.details.push(templates.length ? `typical week: ${templates.map((t) => sessionLabel({ notes: t.name, dayOfWeek: t.dayOfWeek })).join(", ")}` : "typical week: rest (no sessions)");
      if (!on) {
        ctx.untickedPhaseNames.add(normalizeName(change.name));
        return;
      }
      if (item.errors.length) return;
      const used = new Set(ctx.phaseDefs.filter((p) => !p.archived).map((p) => p.color));
      const def: PhaseDef = {
        id: newId(),
        name: change.name,
        color: PHASE_COLORS.find((c) => !used.has(c)) ?? PHASE_COLORS[ctx.phaseDefs.length % PHASE_COLORS.length],
        order: Math.max(0, ...ctx.phaseDefs.map((p) => p.order ?? 0)) + 1,
      };
      ctx.phaseDefs.push(def);
      ctx.templates[def.id] = templates;
      ctx.phaseOrigin.set(normalizeName(def.name), id);
      ctx.changed.phases = ctx.changed.templates = true;
      return;
    }
    const phase = findPhase(ctx, change.name);
    item.title = `${change.action === "delete" ? "delete" : "~"} ${change.name}`;
    if (!phase) {
      item.errors.push(`No phase called "${change.name}".`);
      return;
    }
    const origin = ctx.phaseOrigin.get(normalizeName(phase.name));
    if (origin) item.dependsOn.push(origin);
    if (change.action === "delete") {
      const futureWeeks = ctx.blocks.filter((b) => b.phaseId === phase.id && b.endWeekId >= state.currentWeekId);
      if (futureWeeks.length) item.warnings.push(`Still assigned to ${futureWeeks.length} current/upcoming block(s) - reassign those weeks, or they keep following it.`);
      item.details.push("archived (kept for your history, no longer offered)");
      if (on) {
        ctx.phaseDefs = ctx.phaseDefs.map((p) => (p.id === phase.id ? { ...p, archived: true } : p));
        ctx.changed.phases = true;
      }
      return;
    }
    const next: PhaseDef = { ...phase };
    if (change.rename && change.rename !== phase.name) {
      const clash = findPhase(ctx, change.rename);
      if (clash && clash.id !== phase.id) item.errors.push(`Can't rename to "${change.rename}" - that name is taken.`);
      item.details.push(`name ${phase.name} → ${change.rename}`);
      next.name = change.rename;
    }
    const before = ctx.templates[phase.id] ?? [];
    let after = before;
    if (change.sessions) {
      after = change.sessions.map((s) => templateFromSession(ctx, s, item));
      item.details.push(`typical week replaced (${before.length} → ${after.length} sessions)`, ...sessionListDiff(asEditable(before), asEditable(after)));
    } else if (change.sessionChanges) {
      const r = applySessionChanges(ctx, asEditable(before), change.sessionChanges, item, "Typical week", (s) => asEditable([templateFromSession(ctx, s, item)])[0]);
      after = fromEditable(r.sessions);
      item.details.push(...r.lines);
    }
    const following = ctx.blocks.filter((b) => b.phaseId === phase.id && b.endWeekId >= state.currentWeekId).length;
    if (after !== before && following) item.warnings.push("Weeks that follow this phase (and haven't been changed by hand) pick up the new typical week.");
    if (on && item.errors.length === 0) {
      ctx.phaseDefs = ctx.phaseDefs.map((p) => (p.id === phase.id ? next : p));
      ctx.templates[phase.id] = after;
      if (change.rename) ctx.phaseOrigin.set(normalizeName(next.name), id);
      ctx.changed.phases = ctx.changed.phases || !!change.rename;
      ctx.changed.templates = ctx.changed.templates || after !== before;
    } else if (!on && change.rename) {
      ctx.untickedPhaseNames.add(normalizeName(change.rename));
    }
  });

  // --- 3. Weeks ---
  set.weeks.forEach((change, i) => {
    const id = `week-${i}`;
    const weeks = change.weekIds;
    const item: ChangeItem = { id, section: "week", title: weekRangeLabel(weeks), details: [], warnings: [], errors: [], dependsOn: [] };
    items.push(item);
    const on = isOn(id);

    let blocksAfter = ctx.blocks;
    let phase: PhaseDef | undefined;
    if (change.phase) {
      phase = findPhase(ctx, change.phase);
      if (!phase) {
        item.errors.push(
          ctx.untickedPhaseNames.has(normalizeName(change.phase))
            ? `Follows the new phase "${change.phase}", which is unticked.`
            : `No phase called "${change.phase}" - add it under "phases" first.`,
        );
      } else {
        const origin = ctx.phaseOrigin.get(normalizeName(phase.name));
        if (origin) item.dependsOn.push(origin);
        if (phase.archived) item.warnings.push(`"${phase.name}" is archived.`);
        const start = weeks[0];
        const end = weeks[weeks.length - 1];
        const block: TrainingBlock = {
          id: newId(),
          name: phase.name,
          phaseId: phase.id,
          startWeekId: start,
          endWeekId: end,
          ...(change.blockNotes ? { notes: appendAINote(undefined, change.blockNotes) } : {}),
        };
        blocksAfter = [...carveBlocks(ctx.blocks, start, end, newId), block];
        const beforeNames = [...new Set(weeks.map((w) => effectivePhaseName(ctx, ctx.blocks, w) ?? "no phase"))];
        item.title += ` → ${phase.name}`;
        item.details.push(`phase ${beforeNames.join(" / ")} → ${phase.name}`);
        if (change.blockNotes) item.details.push(`block note: "${change.blockNotes}"`);
      }
    }
    if (weeks.some((w) => w < state.currentWeekId)) item.warnings.push("Includes past weeks - their completed sessions are kept, only the plan changes.");

    // Work out each week against the blocks as they'll be after this entry.
    const savedBlocks = ctx.blocks;
    ctx.blocks = blocksAfter;
    // `sessionsTouched: false` = a notes-only entry: the week's sessions stay as they are.
    const perWeek: { weekId: string; planned: Workout[] | null; customized: boolean; sessionsTouched: boolean; lines: string[] }[] = [];
    for (const weekId of weeks) {
      const was = currentWeekStateBefore(ctx, savedBlocks, weekId);
      const wasCustomized = !!state.weekOverrides.find((o) => o.weekId === weekId)?.customized && !ctx.weekState.has(weekId);
      const lines: string[] = [];
      let planned: Workout[] | null = null;
      let customized = wasCustomized;
      let sessionsTouched = true;
      if (change.sessions) {
        planned = change.sessions.map((s) => ({ ...workoutFromSession(ctx, weekId, s, item), blockId: getDominantBlockForWeek(ctx.blocks, weekId)?.id }));
        customized = true;
        lines.push(`sessions replaced (${was.planned.length} → ${planned.length})`, ...sessionListDiff(was.planned, planned));
        if (wasCustomized && was.planned.length) item.warnings.push(`${weekRangeLabel([weekId])} had hand edits - its planned sessions are replaced.`);
      } else if (change.sessionChanges) {
        const base = change.phase ? projected(ctx, weekId) : currentWeek(ctx, weekId).planned;
        const r = applySessionChanges(ctx, base, change.sessionChanges, item, weekRangeLabel([weekId]), (s) => workoutFromSession(ctx, weekId, s, item));
        planned = r.sessions.map((w) => ({ ...w, blockId: getDominantBlockForWeek(ctx.blocks, weekId)?.id, plannedLoad: workoutPlannedLoad(w.exercises) }));
        customized = true;
        lines.push(...r.lines);
      } else if (change.phase) {
        // Follow the phase: drop the planned sessions; keep a stored plan only
        // around completed sessions (a week with those can't be provisional).
        const next = projected(ctx, weekId);
        planned = was.completed.length ? next : null;
        customized = false;
        if (wasCustomized && was.planned.length) item.warnings.push(`${weekRangeLabel([weekId])} had hand edits - it now follows the phase instead.`);
        const diff = sessionLabelsDiff(was.planned, next);
        if (diff.length) lines.push(...diff);
      } else {
        sessionsTouched = false;
      }
      if (was.completed.length && (change.sessions || change.phase)) lines.push(`${was.completed.length} completed session(s) kept`);
      perWeek.push({ weekId, planned, customized, sessionsTouched, lines });
    }

    // Detail lines: identical across a range -> shown once.
    const rendered = perWeek.map((w) => w.lines.join("\n"));
    if (perWeek.length > 1 && rendered.every((r) => r === rendered[0])) {
      if (rendered[0]) item.details.push(...perWeek[0].lines.map((l) => `each week: ${l}`));
    } else {
      for (const w of perWeek) for (const l of w.lines) item.details.push(`${weekRangeLabel([w.weekId])}: ${l}`);
    }
    if (change.notes) item.details.push(`week note: "${change.notes}"`);

    if (!on || item.errors.length) {
      ctx.blocks = savedBlocks;
      return;
    }
    if (blocksAfter !== savedBlocks) ctx.changed.blocks = true;
    for (const w of perWeek) {
      if (w.sessionsTouched) ctx.weekState.set(w.weekId, { planned: w.planned, customized: w.customized });
      if (change.notes) {
        const merged = appendAINote(noteWrites.get(w.weekId) ?? weekNoteText(state.weekNotes, w.weekId), change.notes);
        noteWrites.set(w.weekId, merged);
      }
    }
  });

  // New exercise types with no tracked fields: infer them from what the plan uses.
  if (newTypeIds.length) {
    const used = new Map<string, Set<string>>();
    const collect = (slots: ExerciseSlot[]) => {
      for (const s of slots) {
        if (!newTypeIds.includes(s.typeId)) continue;
        const keys = used.get(s.typeId) ?? new Set();
        for (const k of Object.keys(s.prescribed ?? {})) if ((PARAMETER_BLOCKS as string[]).includes(k)) keys.add(k);
        used.set(s.typeId, keys);
      }
    };
    Object.values(ctx.templates).flat().forEach((t) => collect(t.exercises));
    for (const w of ctx.weekState.values()) (w.planned ?? []).forEach((p) => collect(p.exercises));
    ctx.types = ctx.types.map((t) => (newTypeIds.includes(t.id) && t.parameters.length === 0 ? { ...t, parameters: [...(used.get(t.id) ?? [])] as ExerciseTypeDef["parameters"] } : t));
  }

  const writes: PlanWrites = {
    ...(ctx.changed.types ? { exerciseTypes: ctx.types } : {}),
    ...(ctx.changed.phases ? { phaseDefs: ctx.phaseDefs } : {}),
    ...(ctx.changed.templates ? { templates: ctx.templates } : {}),
    ...(ctx.changed.blocks ? { trainingBlocks: ctx.blocks } : {}),
    weeks: [...ctx.weekState.entries()].map(([weekId, w]) => ({ weekId, planned: w.planned, customized: w.customized })),
    weekNotes: [...noteWrites.entries()].map(([weekId, text]) => ({ weekId, text })),
  };
  return { items, writes };
}

/** The week before this entry's own phase change (so diffs compare against what the user has now). */
function currentWeekStateBefore(ctx: Ctx, blocksBefore: TrainingBlock[], weekId: string) {
  const blocksNow = ctx.blocks;
  ctx.blocks = blocksBefore;
  const result = currentWeek(ctx, weekId);
  ctx.blocks = blocksNow;
  return result;
}

/** Session-level diff by name + day (ids differ between projections). */
function sessionLabelsDiff(before: Workout[], after: Workout[]): string[] {
  const key = (w: Workout) => `${w.dayOfWeek ?? ""}|${normalizeName(w.notes ?? "")}`;
  const b = before.map(key);
  const a = after.map(key);
  return [
    ...before.filter((w) => !a.includes(key(w))).map((w) => `− ${sessionLabel(w)}`),
    ...after.filter((w) => !b.includes(key(w))).map((w) => `+ ${sessionLabel(w)} (${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"})`),
  ];
}

function asEditable(templates: WorkoutTemplate[]): EditableSession[] {
  return templates.map((t) => ({ id: t.id, notes: t.name, description: t.description, dayOfWeek: t.dayOfWeek, startTime: t.startTime, plannedDuration: t.plannedDuration, exercises: t.exercises }));
}

function fromEditable(sessions: EditableSession[]): WorkoutTemplate[] {
  return sessions.map((s) => ({
    id: s.id,
    name: s.notes,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    plannedDuration: s.plannedDuration,
    ...(s.description ? { description: s.description } : {}),
    exercises: s.exercises,
  }));
}

/**
 * Plans with the user's ticks, then keeps unticking anything that can't
 * apply (an error, or a dependency that's unticked) until nothing changes.
 * Returns the final selection alongside the plan so the preview can show
 * which items were unticked automatically and why.
 */
export function planWithSelection(set: AIChangeSet, state: PlannerState, requested: Set<string>, newId: () => string = generateId): PlanResult & { selected: Set<string> } {
  const selected = new Set(requested);
  for (let guard = 0; guard < 50; guard++) {
    const plan = planChanges(set, state, selected, newId);
    const broken = plan.items.filter((it) => selected.has(it.id) && (it.errors.length > 0 || it.dependsOn.some((d) => !selected.has(d))));
    if (broken.length === 0) return { ...plan, selected };
    for (const b of broken) selected.delete(b.id);
  }
  return { ...planChanges(set, state, selected, newId), selected };
}

/** Every item id, for "all ticked" - the preview's starting point. */
export function allItemIds(set: AIChangeSet): Set<string> {
  return new Set([
    ...set.exerciseTypes.map((_, i) => `exercise-${i}`),
    ...set.phases.map((_, i) => `phase-${i}`),
    ...set.weeks.map((_, i) => `week-${i}`),
  ]);
}

