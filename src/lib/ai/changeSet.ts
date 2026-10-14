/**
 * The AI change-set contract: one JSON document that can create a whole
 * plan or adjust any single part of one. Four sections, applied in order:
 *
 *   exerciseTypes - add / edit / archive entries in the exercise list
 *   phases        - add / edit / delete phases and their typical week
 *   weeks         - per week (or range): follow a phase, spell the week
 *                   out, or edit what's already there; plus notes
 *   planB         - uncertain days: what Plan B does differently from the
 *                   plan the sections above produced (see `PlanAlternative`)
 *   coachNotes    - the coaching memory every future AI reads (`coachNotes.ts`)
 *   circuits      - the saved-circuit library (`lib/exercise/circuits.ts`),
 *                   applied right after exerciseTypes so sessions can use them
 *   places        - where training happens (`lib/places`): add a gym, edit a place's details, remove one;
 *                   a session's `place` may name one added in the same document
 *
 * This module is structure only: shapes, types, repairs. Whether a named
 * phase, session or exercise actually exists is the planner's job
 * (`changePlanner.ts`), because the answer depends on the user's data and
 * on the other changes in the same document.
 */
import type { DayOfWeek, ExerciseValues, ParameterBlock, PlanSide } from "../types";
import { PARAMETER_LABELS } from "../constants";
import { addDaysIso, getWeekIdRange, weekIdOfIso } from "../dateUtils";
import { resolveValueFieldName } from "./valueSpec";
import { PLACE_KINDS, type PlaceKind } from "../places/places";
import { MAX_COACH_NOTE_LENGTH, type CoachNoteChange } from "./coachNotes";
import {
  isPlainObject,
  pushRepair,
  isError,
  split,
  validateExercise,
  validateExercises,
  validateExerciseValues,
  validateNote,
  validateOptionalString,
  validateDayOfWeek,
  validateTimeOfDay,
  validateDurationMinutes,
  WEEK_ID,
  type AIExercise,
  type ValidationIssue,
  type ValidationResult,
} from "./schema";

export const PARAMETER_BLOCKS = Object.keys(PARAMETER_LABELS) as ParameterBlock[];

// --- Shapes ---------------------------------------------------------------

export interface CSCircuitTiming {
  rounds?: number;
  /** Seconds between exercises within a round. */
  transition?: number;
  /** Seconds after each round. */
  roundRest?: number;
}

/**
 * A circuit or superset among a session's exercises: a saved one by name
 * (`saved`, optionally re-timed - a progression), or one spelled out with
 * its own exercises. Becomes an `ExerciseGroup` with its members.
 */
export interface CSCircuit extends CSCircuitTiming {
  circuit: string;
  saved: boolean;
  exercises: AIExercise[];
}

/** One entry in a session's exercise list. */
export type CSItem = AIExercise | CSCircuit;

export function isCircuitItem(item: CSItem): item is CSCircuit {
  return "circuit" in item;
}

export type CSCircuitChange =
  | ({ action: "add"; name: string; description?: string; exercises: AIExercise[] } & CSCircuitTiming)
  | ({ action: "edit"; name: string; rename?: string; description?: string; exercises?: AIExercise[] } & CSCircuitTiming)
  | { action: "delete"; name: string };

export interface CSSession {
  name: string;
  dayOfWeek?: DayOfWeek;
  startTime?: string;
  plannedDuration?: number;
  /** A note about the session as a whole (shown with the session, not on an exercise). */
  notes?: string;
  /** Where: the name of one of the athlete's places (or any text). */
  place?: string;
  exercises: CSItem[];
}

/** Picks one existing session: by name, by day, or both. */
export interface CSSessionMatch {
  name?: string;
  dayOfWeek?: DayOfWeek;
}

/** Picks one exercise in a session: by type name, and which occurrence if it appears more than once (1-based). */
export interface CSExerciseMatch {
  exerciseTypeName: string;
  occurrence?: number;
}

export type CSExerciseChange =
  | { action: "add"; exercise: CSItem; /** 1-based; appended when absent. */ position?: number }
  /** Re-times or renames a circuit already in the session, found by its name. */
  | { action: "editCircuit"; circuit: string; set: CSCircuitTiming & { name?: string } }
  /** Removes a circuit and all its exercises from the session. */
  | { action: "removeCircuit"; circuit: string }
  | {
      action: "edit";
      match: CSExerciseMatch;
      /** Merged into the exercise's planned values. */
      values: ExerciseValues;
      /** Fields to remove from the planned values (a null in the AI's "values"). */
      clear: (keyof ExerciseValues)[];
      /** Swap the exercise for a different type, keeping its values. */
      exerciseTypeName?: string;
    }
  | { action: "remove"; match: CSExerciseMatch };

export interface CSSessionFields {
  name?: string;
  dayOfWeek?: DayOfWeek;
  startTime?: string;
  plannedDuration?: number;
  notes?: string;
  /** "" clears it. */
  place?: string;
}

export type CSSessionChange =
  | { action: "add"; session: CSSession }
  | {
      action: "edit";
      match: CSSessionMatch;
      set: CSSessionFields;
      /** Replace every exercise. Exclusive with `exerciseChanges`. */
      exercises?: CSItem[];
      exerciseChanges?: CSExerciseChange[];
    }
  | { action: "remove"; match: CSSessionMatch };

export type CSExerciseTypeChange =
  | { action: "add"; name: string; categoryName?: string; parameters?: ParameterBlock[]; group?: string; description?: string }
  | { action: "edit"; name: string; rename?: string; categoryName?: string; parameters?: ParameterBlock[]; group?: string; description?: string }
  | { action: "archive"; name: string };

/**
 * Analytics categories (the chart groups). Ids and colours are the app's:
 * a new one gets the next unused colour, and exercises reach it by name via
 * `categoryName` in "exerciseTypes".
 */
export type CSCategoryChange =
  | { action: "add"; name: string }
  | { action: "rename"; name: string; rename: string }
  | { action: "archive"; name: string };

/** Custom value types (the trackable fields): tidy names and units, retire one - ids and stored values are never touched. */
export type CSValueTypeChange =
  | { action: "edit"; name: string; rename?: string; unit?: string }
  | { action: "archive"; name: string };

/** Benchmark tests: tidy the name, folder and protocol text, retire one. Its results are never touched. */
export type CSBenchmarkTypeChange =
  | { action: "edit"; name: string; rename?: string; group?: string; protocol?: string }
  | { action: "archive"; name: string };

/** Competitions and trips, found by name (and date when two share one): tidy the name or notes, remove one that is over. */
export type CSGoalChange =
  | { action: "edit"; name: string; date?: string; rename?: string; notes?: string }
  | { action: "remove"; name: string; date?: string };

/**
 * The places training happens at (`lib/places`), found by name. "add" saves a new one (a gym, a crag, a friend's
 * garage); "edit" renames it or changes what is written about it ("" clears a price, hours or notes); "remove" takes it
 * off the list (sessions that name it keep the name as text). Coordinates come in a pair.
 */
export type CSPlaceChange =
  | { action: "add"; name: string; kind?: PlaceKind; price?: string; hours?: string; notes?: string; latitude?: number; longitude?: number }
  | { action: "edit"; name: string; rename?: string; kind?: PlaceKind; price?: string; hours?: string; notes?: string; latitude?: number; longitude?: number }
  | { action: "remove"; name: string };

/** Pain issues, found by name (and start date when one body part recurs). */
export type CSPainIssueChange =
  | { action: "edit"; name: string; startDate?: string; rename?: string; notes?: string; watchCategories?: string[] }
  | { action: "resolve"; name: string; startDate?: string; endDate: string };

export type CSPhaseChange =
  | { action: "add"; name: string; sessions: CSSession[] }
  | { action: "edit"; name: string; rename?: string; sessions?: CSSession[]; sessionChanges?: CSSessionChange[] }
  | { action: "delete"; name: string };

export interface CSWeekChange {
  /** Every week this entry applies to, in order (one for "week", the range for "from"/"to", the weeks the days touch for "fromDate"/"toDate"). */
  weekIds: string[];
  /** A phase for exactly these days ("YYYY-MM-DD", both inclusive) instead of whole weeks: it only sets the phase, sessions are not touched. Needs `phase`. */
  fromDate?: string;
  toDate?: string;
  /** Assign this phase to the weeks. */
  phase?: string;
  /** Spell the week out: these replace its planned sessions. */
  sessions?: CSSession[];
  /** Edit the week's current sessions. */
  sessionChanges?: CSSessionChange[];
  /** Note for each of the weeks. */
  notes?: string;
  /** Note for the training block this entry creates (needs `phase`). */
  blockNotes?: string;
}

export interface CSDay {
  weekId: string;
  day: DayOfWeek;
}

/**
 * A Plan B for an uncertain stretch of days. Its changes are ordinary
 * session changes, applied per week to the plan as the earlier sections
 * leave it - Plan A - and must stay on the stretch's days.
 */
export type CSPlanB =
  | {
      action: "add";
      start: CSDay;
      /** Last day, inclusive. Absent = one day. */
      end?: CSDay;
      label?: string;
      likely?: PlanSide;
      outdoor?: PlanSide;
      /** Repeat every week, up to and including this week (the week an occurrence starts in). */
      repeatUntil?: string;
      changes: { weekId: string; sessionChanges: CSSessionChange[] }[];
    }
  | { action: "delete"; start: CSDay };

export interface AIChangeSet {
  /** The AI's one-paragraph summary of what it changed and why. */
  summary?: string;
  /** Optional: change sets from before categories existed have none. */
  categories?: CSCategoryChange[];
  exerciseTypes: CSExerciseTypeChange[];
  phases: CSPhaseChange[];
  weeks: CSWeekChange[];
  planB: CSPlanB[];
  coachNotes: CoachNoteChange[];
  circuits: CSCircuitChange[];
  /** Optional, like categories: older change sets have none. */
  valueTypes?: CSValueTypeChange[];
  benchmarkTypes?: CSBenchmarkTypeChange[];
  goals?: CSGoalChange[];
  painIssues?: CSPainIssueChange[];
  places?: CSPlaceChange[];
}

// --- Validation -----------------------------------------------------------

type Issues = ValidationIssue[];

function requireString(raw: unknown, path: string, issues: Issues): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    issues.push({ path, message: "Required non-empty string." });
    return undefined;
  }
  return raw.trim();
}

function validateParameters(raw: unknown, path: string, issues: Issues): ParameterBlock[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `Expected an array of field names, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  const result: ParameterBlock[] = [];
  raw.forEach((p, i) => {
    if (typeof p === "string" && ((PARAMETER_BLOCKS as string[]).includes(p) || /^v:[A-Za-z0-9_-]+$/.test(p))) {
      if (!result.includes(p as ParameterBlock)) result.push(p as ParameterBlock);
    } else {
      pushRepair(issues, `${path}[${i}]`, `${JSON.stringify(p)} is not a trackable field - dropped.`);
    }
  });
  return result;
}

function wholeNumber(raw: unknown, path: string, issues: Issues, min: number, max: number, what: string): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n === "number" && Number.isFinite(n) && n >= min && n <= max) return Math.round(n);
  issues.push({ path, message: `Expected ${what} (${min}-${max}), got ${JSON.stringify(raw)}.` });
  return undefined;
}

function validateTiming(raw: Record<string, unknown>, path: string, issues: Issues): CSCircuitTiming {
  const timing: CSCircuitTiming = {
    rounds: wholeNumber(raw.rounds, `${path}.rounds`, issues, 1, 50, "a number of rounds"),
    transition: wholeNumber(raw.transition, `${path}.transition`, issues, 0, 3600, "seconds"),
    roundRest: wholeNumber(raw.roundRest, `${path}.roundRest`, issues, 0, 3600, "seconds"),
  };
  return Object.fromEntries(Object.entries(timing).filter(([, v]) => v !== undefined)) as CSCircuitTiming;
}

/**
 * `{ "circuit": "Core A", "rounds": 4 }` - a saved circuit, maybe re-timed -
 * or `{ "circuit": { "name": ..., "rounds": 3, ... }, "exercises": [...] }`,
 * one spelled out here.
 */
function validateCircuitItem(raw: Record<string, unknown>, path: string, issues: Issues): CSCircuit | null {
  if (typeof raw.circuit === "string") {
    const name = raw.circuit.trim();
    if (!name) {
      issues.push({ path: `${path}.circuit`, message: "Name the saved circuit." });
      return null;
    }
    if (raw.exercises !== undefined) pushRepair(issues, `${path}.exercises`, "A saved circuit brings its own exercises - ignored. Spell a circuit out with an object instead.");
    return { circuit: name, saved: true, exercises: [], ...validateTiming(raw, path, issues) };
  }
  if (!isPlainObject(raw.circuit)) {
    issues.push({ path: `${path}.circuit`, message: `Expected a saved circuit's name or { "name", "rounds", "transition", "roundRest" }, got ${JSON.stringify(raw.circuit)}.` });
    return null;
  }
  const timing = validateTiming(raw.circuit, `${path}.circuit`, issues);
  if (timing.rounds === undefined) {
    issues.push({ path: `${path}.circuit.rounds`, message: 'A circuit needs "rounds".' });
    return null;
  }
  const exercises = raw.exercises === undefined ? [] : validateExercises(raw.exercises, `${path}.exercises`, issues);
  if (exercises.length === 0) {
    issues.push({ path: `${path}.exercises`, message: "A circuit needs its exercises." });
    return null;
  }
  const name = typeof raw.circuit.name === "string" ? raw.circuit.name.trim() : "";
  return { circuit: name, saved: false, exercises, ...timing };
}

/** One entry of a session's exercise list: an exercise, or a circuit. */
function validateItem(raw: unknown, path: string, issues: Issues): CSItem | null {
  if (isPlainObject(raw) && "circuit" in raw) return validateCircuitItem(raw, path, issues);
  return validateExercise(raw, path, issues);
}

function validateItems(raw: unknown, path: string, issues: Issues): CSItem[] {
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `Expected an array, got ${JSON.stringify(raw)}.` });
    return [];
  }
  return raw.map((e, i) => validateItem(e, `${path}[${i}]`, issues)).filter((e): e is CSItem => !!e);
}

function validateCircuitChange(raw: unknown, path: string, issues: Issues): CSCircuitChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a circuit change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  if (!name) return null;
  const description = validateNote(raw.description, `${path}.description`, issues);
  switch (raw.action) {
    case "add": {
      const timing = validateTiming(raw, path, issues);
      const exercises = raw.exercises === undefined ? [] : validateExercises(raw.exercises, `${path}.exercises`, issues);
      if (timing.rounds === undefined) issues.push({ path: `${path}.rounds`, message: 'A new circuit needs "rounds".' });
      if (exercises.length === 0) issues.push({ path: `${path}.exercises`, message: "A new circuit needs its exercises." });
      if (timing.rounds === undefined || exercises.length === 0) return null;
      return { action: "add", name, ...(description ? { description } : {}), exercises, ...timing };
    }
    case "edit": {
      const timing = validateTiming(raw, path, issues);
      const rename = validateOptionalString(raw.rename, `${path}.rename`, issues)?.trim() || undefined;
      const exercises = raw.exercises === undefined ? undefined : validateExercises(raw.exercises, `${path}.exercises`, issues);
      if (!rename && !description && !exercises && Object.keys(timing).length === 0) {
        issues.push({ path, message: 'A circuit "edit" needs something to change: "rename", "description", "rounds", "transition", "roundRest" or "exercises".' });
        return null;
      }
      return { action: "edit", name, ...(rename ? { rename } : {}), ...(description ? { description } : {}), ...(exercises ? { exercises } : {}), ...timing };
    }
    case "delete":
      return { action: "delete", name };
    default:
      issues.push({ path: `${path}.action`, message: `Expected "add", "edit" or "delete", got ${JSON.stringify(raw.action)}.` });
      return null;
  }
}

/** A place name: text, trimmed; an empty one means "none" (only where `allowEmpty`, i.e. in an edit, where it clears the place). */
function validatePlaceName(raw: unknown, path: string, issues: Issues, allowEmpty = false): string | undefined {
  if (raw === undefined || raw === null) return allowEmpty && raw === null ? "" : undefined;
  if (typeof raw !== "string") {
    issues.push({ path, message: `Expected the name of a place as text, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  const name = raw.trim().slice(0, 80);
  return name === "" && !allowEmpty ? undefined : name;
}

function validateSession(raw: unknown, path: string, issues: Issues): CSSession | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a session object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  const session: CSSession = {
    name: name ?? "",
    dayOfWeek: validateDayOfWeek(raw.dayOfWeek, `${path}.dayOfWeek`, issues),
    startTime: validateTimeOfDay(raw.startTime, `${path}.startTime`, issues),
    plannedDuration: validateDurationMinutes(raw.plannedDuration, `${path}.plannedDuration`, issues),
    notes: validateNote(raw.notes, `${path}.notes`, issues),
    place: validatePlaceName(raw.place, `${path}.place`, issues),
    exercises: raw.exercises === undefined ? [] : validateItems(raw.exercises, `${path}.exercises`, issues),
  };
  return name ? session : null;
}

function validateSessions(raw: unknown, path: string, issues: Issues): CSSession[] {
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `Expected an array of sessions, got ${JSON.stringify(raw)}.` });
    return [];
  }
  return raw.map((s, i) => validateSession(s, `${path}[${i}]`, issues)).filter((s): s is CSSession => !!s);
}

function validateSessionMatch(raw: unknown, path: string, issues: Issues): CSSessionMatch | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected {"name": ..., "dayOfWeek": ...} to pick a session, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const match: CSSessionMatch = {
    name: validateOptionalString(raw.name, `${path}.name`, issues)?.trim() || undefined,
    dayOfWeek: validateDayOfWeek(raw.dayOfWeek, `${path}.dayOfWeek`, issues),
  };
  if (!match.name && !match.dayOfWeek) {
    issues.push({ path, message: 'Needs "name" or "dayOfWeek" (or both) to pick a session.' });
    return null;
  }
  return match;
}

function validateExerciseMatch(raw: unknown, path: string, issues: Issues): CSExerciseMatch | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected {"exerciseTypeName": ...} to pick an exercise, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const exerciseTypeName = requireString(raw.exerciseTypeName, `${path}.exerciseTypeName`, issues);
  let occurrence: number | undefined;
  if (raw.occurrence !== undefined) {
    if (typeof raw.occurrence === "number" && Number.isInteger(raw.occurrence) && raw.occurrence >= 1) occurrence = raw.occurrence;
    else issues.push({ path: `${path}.occurrence`, message: `Expected a whole number from 1, got ${JSON.stringify(raw.occurrence)}.` });
  }
  return exerciseTypeName ? { exerciseTypeName, occurrence } : null;
}

/** Partial values for an edit: known fields validated as usual, and a null marks a field to clear. */
function validatePartialValues(raw: unknown, path: string, issues: Issues): { values: ExerciseValues; clear: (keyof ExerciseValues)[] } {
  if (raw === undefined) return { values: {}, clear: [] };
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected an object, got ${JSON.stringify(raw)}.` });
    return { values: {}, clear: [] };
  }
  const clear: (keyof ExerciseValues)[] = [];
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null) {
      const field = resolveValueFieldName(key);
      if (field) clear.push(field);
      else pushRepair(issues, `${path}.${key}`, "No such field - ignored.");
    } else {
      rest[key] = value;
    }
  }
  return { values: validateExerciseValues(rest, path, issues), clear };
}

function validateExerciseChange(raw: unknown, path: string, issues: Issues): CSExerciseChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected an exercise change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  switch (raw.action) {
    case "editCircuit": {
      const circuit = requireString(raw.circuit, `${path}.circuit`, issues);
      const set = isPlainObject(raw.set) ? raw.set : {};
      const timing = validateTiming(set, `${path}.set`, issues);
      const name = validateOptionalString(set.name, `${path}.set.name`, issues)?.trim() || undefined;
      if (circuit && Object.keys(timing).length === 0 && !name) {
        issues.push({ path: `${path}.set`, message: 'Needs "set" with "rounds", "transition", "roundRest" or "name".' });
        return null;
      }
      return circuit ? { action: "editCircuit", circuit, set: { ...timing, ...(name ? { name } : {}) } } : null;
    }
    case "removeCircuit": {
      const circuit = requireString(raw.circuit, `${path}.circuit`, issues);
      return circuit ? { action: "removeCircuit", circuit } : null;
    }
    case "add": {
      const exercise = validateItem(raw.exercise, `${path}.exercise`, issues);
      let position: number | undefined;
      if (raw.position !== undefined) {
        if (typeof raw.position === "number" && Number.isInteger(raw.position) && raw.position >= 1) position = raw.position;
        else pushRepair(issues, `${path}.position`, "Not a whole number from 1 - the exercise is added at the end.");
      }
      return exercise ? { action: "add", exercise, position } : null;
    }
    case "edit": {
      const match = validateExerciseMatch(raw.match, `${path}.match`, issues);
      const { values, clear } = validatePartialValues(raw.values, `${path}.values`, issues);
      const exerciseTypeName = validateOptionalString(raw.exerciseTypeName, `${path}.exerciseTypeName`, issues)?.trim() || undefined;
      if (match && Object.keys(values).length === 0 && clear.length === 0 && !exerciseTypeName) {
        issues.push({ path, message: 'An exercise "edit" needs "values" (null clears a field) or a new "exerciseTypeName".' });
        return null;
      }
      return match ? { action: "edit", match, values, clear, exerciseTypeName } : null;
    }
    case "remove": {
      const match = validateExerciseMatch(raw.match, `${path}.match`, issues);
      return match ? { action: "remove", match } : null;
    }
    default:
      issues.push({ path: `${path}.action`, message: `Expected "add", "edit", "remove", "editCircuit" or "removeCircuit", got ${JSON.stringify(raw.action)}.` });
      return null;
  }
}

function validateSessionFields(raw: unknown, path: string, issues: Issues): CSSessionFields {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected an object of session fields, got ${JSON.stringify(raw)}.` });
    return {};
  }
  const fields: CSSessionFields = {};
  if (raw.name !== undefined) fields.name = requireString(raw.name, `${path}.name`, issues);
  if (raw.dayOfWeek !== undefined) fields.dayOfWeek = validateDayOfWeek(raw.dayOfWeek, `${path}.dayOfWeek`, issues);
  if (raw.startTime !== undefined) fields.startTime = validateTimeOfDay(raw.startTime, `${path}.startTime`, issues);
  if (raw.plannedDuration !== undefined) fields.plannedDuration = validateDurationMinutes(raw.plannedDuration, `${path}.plannedDuration`, issues);
  if (raw.notes !== undefined) fields.notes = typeof raw.notes === "string" ? raw.notes.trim() : validateNote(raw.notes, `${path}.notes`, issues);
  if (raw.place !== undefined) fields.place = validatePlaceName(raw.place, `${path}.place`, issues, true);
  return fields;
}

function validateSessionChange(raw: unknown, path: string, issues: Issues): CSSessionChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a session change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  switch (raw.action) {
    case "add": {
      const session = validateSession(raw.session, `${path}.session`, issues);
      return session ? { action: "add", session } : null;
    }
    case "edit": {
      const match = validateSessionMatch(raw.match, `${path}.match`, issues);
      const set = validateSessionFields(raw.set, `${path}.set`, issues);
      if (raw.exercises !== undefined && raw.exerciseChanges !== undefined) {
        issues.push({ path, message: 'Use either "exercises" (replace all) or "exerciseChanges" (individual edits), not both.' });
        return null;
      }
      const exercises = raw.exercises === undefined ? undefined : validateItems(raw.exercises, `${path}.exercises`, issues);
      let exerciseChanges: CSExerciseChange[] | undefined;
      if (raw.exerciseChanges !== undefined) {
        if (!Array.isArray(raw.exerciseChanges)) {
          issues.push({ path: `${path}.exerciseChanges`, message: "Expected an array." });
        } else {
          exerciseChanges = raw.exerciseChanges
            .map((c, i) => validateExerciseChange(c, `${path}.exerciseChanges[${i}]`, issues))
            .filter((c): c is CSExerciseChange => !!c);
        }
      }
      if (match && Object.keys(set).length === 0 && !exercises && !exerciseChanges?.length) {
        issues.push({ path, message: 'A session "edit" needs "set", "exercises" or "exerciseChanges".' });
        return null;
      }
      return match ? { action: "edit", match, set, exercises, exerciseChanges } : null;
    }
    case "remove": {
      const match = validateSessionMatch(raw.match, `${path}.match`, issues);
      return match ? { action: "remove", match } : null;
    }
    default:
      issues.push({ path: `${path}.action`, message: `Expected "add", "edit" or "remove", got ${JSON.stringify(raw.action)}.` });
      return null;
  }
}

function validateSessionChanges(raw: unknown, path: string, issues: Issues): CSSessionChange[] {
  if (!Array.isArray(raw)) {
    issues.push({ path, message: "Expected an array of session changes." });
    return [];
  }
  return raw.map((c, i) => validateSessionChange(c, `${path}[${i}]`, issues)).filter((c): c is CSSessionChange => !!c);
}

function validateCategoryChange(raw: unknown, path: string, issues: Issues): CSCategoryChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a category change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  if (!name) return null;
  switch (raw.action) {
    case "add":
      return { action: "add", name };
    case "rename": {
      const rename = requireString(raw.rename, `${path}.rename`, issues);
      return rename ? { action: "rename", name, rename } : null;
    }
    case "archive":
      return { action: "archive", name };
    default:
      issues.push({ path: `${path}.action`, message: `Expected "add", "rename" or "archive", got ${JSON.stringify(raw.action)}.` });
      return null;
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(raw: unknown, path: string, issues: Issues): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string" && ISO_DAY.test(raw)) return raw;
  issues.push({ path, message: `Expected a date like "2026-09-30", got ${JSON.stringify(raw)}.` });
  return undefined;
}

function trimmed(raw: unknown, path: string, issues: Issues): string | undefined {
  const v = validateOptionalString(raw, path, issues)?.trim();
  return v || undefined;
}

function validateValueTypeChange(raw: unknown, path: string, issues: Issues): CSValueTypeChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a value type change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  if (!name) return null;
  if (raw.action === "archive") return { action: "archive", name };
  if (raw.action !== "edit") {
    issues.push({ path: `${path}.action`, message: `Expected "edit" or "archive", got ${JSON.stringify(raw.action)}.` });
    return null;
  }
  const rename = trimmed(raw.rename, `${path}.rename`, issues);
  const unit = trimmed(raw.unit, `${path}.unit`, issues);
  if (!rename && unit === undefined) {
    issues.push({ path, message: 'A value type "edit" needs "rename" or "unit".' });
    return null;
  }
  return { action: "edit", name, ...(rename ? { rename } : {}), ...(unit !== undefined ? { unit } : {}) };
}

function validateBenchmarkTypeChange(raw: unknown, path: string, issues: Issues): CSBenchmarkTypeChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a benchmark change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  if (!name) return null;
  if (raw.action === "archive") return { action: "archive", name };
  if (raw.action !== "edit") {
    issues.push({ path: `${path}.action`, message: `Expected "edit" or "archive", got ${JSON.stringify(raw.action)}.` });
    return null;
  }
  const rename = trimmed(raw.rename, `${path}.rename`, issues);
  const group = trimmed(raw.group, `${path}.group`, issues);
  const protocol = trimmed(raw.protocol, `${path}.protocol`, issues);
  if (!rename && !group && !protocol) {
    issues.push({ path, message: 'A benchmark "edit" needs "rename", "group" or "protocol".' });
    return null;
  }
  return { action: "edit", name, ...(rename ? { rename } : {}), ...(group ? { group } : {}), ...(protocol ? { protocol } : {}) };
}

function validateGoalChange(raw: unknown, path: string, issues: Issues): CSGoalChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a goal change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  if (!name) return null;
  const date = isoDay(raw.date, `${path}.date`, issues);
  if (raw.action === "remove") return { action: "remove", name, ...(date ? { date } : {}) };
  if (raw.action !== "edit") {
    issues.push({ path: `${path}.action`, message: `Expected "edit" or "remove", got ${JSON.stringify(raw.action)}.` });
    return null;
  }
  const rename = trimmed(raw.rename, `${path}.rename`, issues);
  const notes = validateNote(raw.notes, `${path}.notes`, issues);
  if (!rename && notes === undefined) {
    issues.push({ path, message: 'A goal "edit" needs "rename" or "notes".' });
    return null;
  }
  return { action: "edit", name, ...(date ? { date } : {}), ...(rename ? { rename } : {}), ...(notes !== undefined ? { notes } : {}) };
}

/** Text for a place's price, hours or notes: `undefined` = leave alone, "" = clear (edits only). */
function placeText(raw: unknown, path: string, issues: Issues, max: number): string | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return "";
  if (typeof raw !== "string") {
    pushRepair(issues, path, `Not text (${JSON.stringify(raw)}) - dropped.`);
    return undefined;
  }
  return raw.trim().slice(0, max);
}

function validatePlaceChange(raw: unknown, path: string, issues: Issues): CSPlaceChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a place change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues)?.slice(0, 80);
  if (!name) return null;
  if (raw.action === "remove") return { action: "remove", name };
  if (raw.action !== "add" && raw.action !== "edit") {
    issues.push({ path: `${path}.action`, message: `Expected "add", "edit" or "remove", got ${JSON.stringify(raw.action)}.` });
    return null;
  }
  let kind: PlaceKind | undefined;
  if (raw.kind !== undefined) {
    if (PLACE_KINDS.includes(raw.kind as PlaceKind)) kind = raw.kind as PlaceKind;
    else pushRepair(issues, `${path}.kind`, `${JSON.stringify(raw.kind)} is not a kind of place (${PLACE_KINDS.join(", ")}) - ${raw.action === "add" ? 'taken as "other"' : "left as it is"}.`);
  }
  const price = placeText(raw.price, `${path}.price`, issues, 80);
  const hours = placeText(raw.hours, `${path}.hours`, issues, 200);
  const notes = placeText(raw.notes, `${path}.notes`, issues, 1000);
  const hasLat = raw.latitude !== undefined && raw.latitude !== null;
  const hasLon = raw.longitude !== undefined && raw.longitude !== null;
  let coordinates: { latitude: number; longitude: number } | undefined;
  if (hasLat || hasLon) {
    const { latitude, longitude } = raw;
    if (hasLat && hasLon && typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      coordinates = { latitude, longitude };
    } else {
      pushRepair(issues, `${path}.latitude`, 'Coordinates need both "latitude" (-90 to 90) and "longitude" (-180 to 180) as numbers - dropped.');
    }
  }
  const fields = {
    ...(kind ? { kind } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(hours !== undefined ? { hours } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(coordinates ?? {}),
  };
  if (raw.action === "add") return { action: "add", name, ...fields };
  const rename = trimmed(raw.rename, `${path}.rename`, issues)?.slice(0, 80);
  if (!rename && Object.keys(fields).length === 0) {
    issues.push({ path, message: 'A place "edit" needs something to change: "rename", "kind", "price", "hours", "notes" or "latitude" and "longitude".' });
    return null;
  }
  return { action: "edit", name, ...(rename ? { rename } : {}), ...fields };
}

function validatePainIssueChange(raw: unknown, path: string, issues: Issues): CSPainIssueChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a pain issue change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  if (!name) return null;
  const startDate = isoDay(raw.startDate, `${path}.startDate`, issues);
  if (raw.action === "resolve") {
    const endDate = isoDay(raw.endDate, `${path}.endDate`, issues);
    if (!endDate) {
      issues.push({ path: `${path}.endDate`, message: 'A "resolve" needs the "endDate".' });
      return null;
    }
    return { action: "resolve", name, ...(startDate ? { startDate } : {}), endDate };
  }
  if (raw.action !== "edit") {
    issues.push({ path: `${path}.action`, message: `Expected "edit" or "resolve", got ${JSON.stringify(raw.action)}.` });
    return null;
  }
  const rename = trimmed(raw.rename, `${path}.rename`, issues);
  const notes = validateNote(raw.notes, `${path}.notes`, issues);
  let watchCategories: string[] | undefined;
  if (raw.watchCategories !== undefined) {
    if (Array.isArray(raw.watchCategories) && raw.watchCategories.every((c) => typeof c === "string")) watchCategories = raw.watchCategories.map((c: string) => c.trim()).filter(Boolean);
    else issues.push({ path: `${path}.watchCategories`, message: "Expected an array of category names." });
  }
  if (!rename && notes === undefined && !watchCategories) {
    issues.push({ path, message: 'A pain issue "edit" needs "rename", "notes" or "watchCategories".' });
    return null;
  }
  return { action: "edit", name, ...(startDate ? { startDate } : {}), ...(rename ? { rename } : {}), ...(notes !== undefined ? { notes } : {}), ...(watchCategories ? { watchCategories } : {}) };
}

function validateExerciseTypeChange(raw: unknown, path: string, issues: Issues): CSExerciseTypeChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected an exercise type change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  if (!name) return null;
  switch (raw.action) {
    case "add":
      return {
        action: "add",
        name,
        categoryName: validateOptionalString(raw.categoryName, `${path}.categoryName`, issues)?.trim() || undefined,
        parameters: validateParameters(raw.parameters, `${path}.parameters`, issues),
        group: validateOptionalString(raw.group, `${path}.group`, issues)?.trim() || undefined,
        description: validateOptionalString(raw.description, `${path}.description`, issues)?.trim() || undefined,
      };
    case "edit": {
      const change: CSExerciseTypeChange = {
        action: "edit",
        name,
        rename: validateOptionalString(raw.rename, `${path}.rename`, issues)?.trim() || undefined,
        categoryName: validateOptionalString(raw.categoryName, `${path}.categoryName`, issues)?.trim() || undefined,
        parameters: validateParameters(raw.parameters, `${path}.parameters`, issues),
        group: validateOptionalString(raw.group, `${path}.group`, issues)?.trim() || undefined,
        description: validateOptionalString(raw.description, `${path}.description`, issues)?.trim() || undefined,
      };
      if (!change.rename && !change.categoryName && !change.parameters && !change.group && !change.description) {
        issues.push({ path, message: 'An exercise type "edit" needs "rename", "categoryName", "parameters", "group" or "description".' });
        return null;
      }
      return change;
    }
    case "archive":
      return { action: "archive", name };
    default:
      issues.push({ path: `${path}.action`, message: `Expected "add", "edit" or "archive", got ${JSON.stringify(raw.action)}.` });
      return null;
  }
}

function validatePhaseChange(raw: unknown, path: string, issues: Issues): CSPhaseChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a phase change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = requireString(raw.name, `${path}.name`, issues);
  if (!name) return null;
  switch (raw.action) {
    case "add":
      return { action: "add", name, sessions: raw.sessions === undefined ? [] : validateSessions(raw.sessions, `${path}.sessions`, issues) };
    case "edit": {
      if (raw.sessions !== undefined && raw.sessionChanges !== undefined) {
        issues.push({ path, message: 'Use either "sessions" (replace the typical week) or "sessionChanges" (individual edits), not both.' });
        return null;
      }
      const change: CSPhaseChange = {
        action: "edit",
        name,
        rename: validateOptionalString(raw.rename, `${path}.rename`, issues)?.trim() || undefined,
        sessions: raw.sessions === undefined ? undefined : validateSessions(raw.sessions, `${path}.sessions`, issues),
        sessionChanges: raw.sessionChanges === undefined ? undefined : validateSessionChanges(raw.sessionChanges, `${path}.sessionChanges`, issues),
      };
      if (!change.rename && !change.sessions && !change.sessionChanges?.length) {
        issues.push({ path, message: 'A phase "edit" needs "rename", "sessions" or "sessionChanges".' });
        return null;
      }
      return change;
    }
    case "delete":
      return { action: "delete", name };
    default:
      issues.push({ path: `${path}.action`, message: `Expected "add", "edit" or "delete", got ${JSON.stringify(raw.action)}.` });
      return null;
  }
}

function validateWeekChange(raw: unknown, path: string, issues: Issues): CSWeekChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a week entry, got ${JSON.stringify(raw)}.` });
    return null;
  }
  let weekIds: string[] = [];
  let fromDate: string | undefined;
  let toDate: string | undefined;
  if (raw.fromDate !== undefined || raw.toDate !== undefined) {
    const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && addDaysIso(v, 0) === v;
    if (raw.week !== undefined || raw.from !== undefined || raw.to !== undefined) {
      issues.push({ path, message: 'Use "fromDate"/"toDate" (days) or "week"/"from"/"to" (whole weeks), not both.' });
    } else if (!isDate(raw.fromDate) || !isDate(raw.toDate)) {
      issues.push({ path, message: 'Needs both "fromDate" and "toDate" as days like "2026-10-15".' });
    } else if (raw.fromDate > raw.toDate) {
      issues.push({ path: `${path}.toDate`, message: `"toDate" (${raw.toDate}) is before "fromDate" (${raw.fromDate}).` });
    } else {
      [fromDate, toDate] = [raw.fromDate, raw.toDate];
      weekIds = getWeekIdRange(weekIdOfIso(fromDate), weekIdOfIso(toDate));
    }
    if (raw.sessions !== undefined || raw.sessionChanges !== undefined) {
      issues.push({ path, message: '"fromDate"/"toDate" only set a phase for those days. To change sessions, use a week entry ("week" or "from"/"to").' });
      return null;
    }
  } else if (raw.week !== undefined) {
    if (typeof raw.week === "string" && WEEK_ID.test(raw.week)) weekIds = [raw.week];
    else issues.push({ path: `${path}.week`, message: `Expected a week id like "2026-W25", got ${JSON.stringify(raw.week)}.` });
    if (raw.from !== undefined || raw.to !== undefined) issues.push({ path, message: 'Use "week" for one week or "from"/"to" for a range, not both.' });
  } else {
    const ok = (v: unknown) => typeof v === "string" && WEEK_ID.test(v);
    if (!ok(raw.from) || !ok(raw.to)) {
      issues.push({ path, message: 'Needs "week" (one week) or both "from" and "to" (a range), as week ids like "2026-W25".' });
    } else if ((raw.from as string) > (raw.to as string)) {
      issues.push({ path: `${path}.to`, message: `"to" (${raw.to}) is before "from" (${raw.from}).` });
    } else {
      weekIds = getWeekIdRange(raw.from as string, raw.to as string);
    }
  }
  if (raw.sessions !== undefined && raw.sessionChanges !== undefined) {
    issues.push({ path, message: 'Use either "sessions" (spell the week out) or "sessionChanges" (edit it), not both.' });
    return null;
  }
  const change: CSWeekChange = {
    weekIds,
    ...(fromDate && toDate ? { fromDate, toDate } : {}),
    phase: validateOptionalString(raw.phase, `${path}.phase`, issues)?.trim() || undefined,
    sessions: raw.sessions === undefined ? undefined : validateSessions(raw.sessions, `${path}.sessions`, issues),
    sessionChanges: raw.sessionChanges === undefined ? undefined : validateSessionChanges(raw.sessionChanges, `${path}.sessionChanges`, issues),
    notes: validateNote(raw.notes, `${path}.notes`, issues),
    blockNotes: validateNote(raw.blockNotes, `${path}.blockNotes`, issues),
  };
  if (change.blockNotes && !change.phase) {
    pushRepair(issues, `${path}.blockNotes`, '"blockNotes" belongs to a phase assignment ("phase") - dropped.');
    delete change.blockNotes;
  }
  if (weekIds.length === 0) return null;
  if (fromDate && !change.phase) {
    issues.push({ path, message: '"fromDate"/"toDate" need a "phase" to start on those days.' });
    return null;
  }
  if (!change.phase && !change.sessions && !change.sessionChanges?.length && !change.notes) {
    issues.push({ path, message: 'A week entry needs at least one of "phase", "sessions", "sessionChanges" or "notes".' });
    return null;
  }
  return change;
}

function validateDay(raw: unknown, path: string, issues: Issues): CSDay | null {
  if (!isPlainObject(raw) || typeof raw.week !== "string" || !WEEK_ID.test(raw.week)) {
    issues.push({ path, message: `Expected {"week": "2026-W43", "day": "Saturday"}, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const day = validateDayOfWeek(raw.day, `${path}.day`, issues);
  if (!day) {
    issues.push({ path: `${path}.day`, message: 'Needs a "day" (Monday ... Sunday).' });
    return null;
  }
  return { weekId: raw.week, day };
}

function validateSide(raw: unknown, path: string, issues: Issues): PlanSide | undefined {
  if (raw === undefined) return undefined;
  if (raw === "A" || raw === "B") return raw;
  pushRepair(issues, path, `Expected "A" or "B", got ${JSON.stringify(raw)} - ignored.`);
  return undefined;
}

function validatePlanB(raw: unknown, path: string, issues: Issues): CSPlanB | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a Plan B entry, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const start = validateDay(raw.start, `${path}.start`, issues);
  if (!start) return null;
  const action = raw.action ?? "add";
  if (action === "delete") return { action: "delete", start };
  if (action !== "add") {
    issues.push({ path: `${path}.action`, message: `Expected "add" or "delete", got ${JSON.stringify(raw.action)}.` });
    return null;
  }
  const end = raw.end === undefined ? undefined : validateDay(raw.end, `${path}.end`, issues) ?? undefined;
  let repeatUntil: string | undefined;
  if (raw.repeatUntil !== undefined) {
    if (typeof raw.repeatUntil === "string" && WEEK_ID.test(raw.repeatUntil) && raw.repeatUntil >= start.weekId) repeatUntil = raw.repeatUntil;
    else issues.push({ path: `${path}.repeatUntil`, message: `Expected a week id from ${start.weekId} on, got ${JSON.stringify(raw.repeatUntil)}.` });
  }
  if (!Array.isArray(raw.changes) || raw.changes.length === 0) {
    issues.push({ path: `${path}.changes`, message: 'Needs "changes": [{ "week": ..., "sessionChanges": [...] }] - what Plan B does differently.' });
    return null;
  }
  const changes: { weekId: string; sessionChanges: CSSessionChange[] }[] = [];
  raw.changes.forEach((c, i) => {
    const at = `${path}.changes[${i}]`;
    if (!isPlainObject(c) || typeof c.week !== "string" || !WEEK_ID.test(c.week)) {
      issues.push({ path: at, message: `Expected {"week": "2026-W43", "sessionChanges": [...]}, got ${JSON.stringify(c)}.` });
      return;
    }
    const sessionChanges = validateSessionChanges(c.sessionChanges, `${at}.sessionChanges`, issues);
    if (sessionChanges.length) changes.push({ weekId: c.week, sessionChanges });
  });
  return {
    action: "add",
    start,
    ...(end ? { end } : {}),
    label: validateOptionalString(raw.label, `${path}.label`, issues)?.trim() || undefined,
    likely: validateSide(raw.likely, `${path}.likely`, issues),
    outdoor: validateSide(raw.outdoor, `${path}.outdoor`, issues),
    ...(repeatUntil ? { repeatUntil } : {}),
    changes,
  };
}

function validateCoachNoteChange(raw: unknown, path: string, issues: Issues): CoachNoteChange | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a coach note change, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const text = (): string | null => {
    const t = requireString(raw.text, `${path}.text`, issues);
    if (!t) return null;
    if (t.length > MAX_COACH_NOTE_LENGTH) {
      pushRepair(issues, `${path}.text`, `Longer than ${MAX_COACH_NOTE_LENGTH} characters - shortened.`);
      return `${t.slice(0, MAX_COACH_NOTE_LENGTH - 1).trimEnd()}…`;
    }
    return t;
  };
  switch (raw.action) {
    case "add": {
      const t = text();
      return t ? { action: "add", text: t } : null;
    }
    case "edit": {
      const id = requireString(raw.id, `${path}.id`, issues);
      const t = text();
      return id && t ? { action: "edit", id, text: t } : null;
    }
    case "remove": {
      const id = requireString(raw.id, `${path}.id`, issues);
      return id ? { action: "remove", id } : null;
    }
    default:
      issues.push({ path: `${path}.action`, message: `Expected "add", "edit" or "remove", got ${JSON.stringify(raw.action)}.` });
      return null;
  }
}

function validateList<T>(raw: unknown, path: string, issues: Issues, one: (r: unknown, p: string, i: Issues) => T | null): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `Expected an array, got ${JSON.stringify(raw)}.` });
    return [];
  }
  return raw.map((r, i) => one(r, `${path}[${i}]`, issues)).filter((r): r is T => r !== null);
}

/**
 * Validates the change-set's structure. Fatal problems (wrong JSON types,
 * missing required fields) make the whole document invalid so the AI can
 * be asked to fix them; tidy-ups (unknown fields, a blockNotes without a
 * phase) are repairs the preview reports.
 */
export function validateChangeSet(raw: unknown): ValidationResult<AIChangeSet> {
  const issues: Issues = [];
  if (!isPlainObject(raw)) {
    issues.push({ path: "", message: "Top-level JSON must be an object." });
    return split<AIChangeSet>(null, issues);
  }
  const set: AIChangeSet = {
    summary: validateNote(raw.summary, "summary", issues),
    ...(raw.categories !== undefined ? { categories: validateList(raw.categories, "categories", issues, validateCategoryChange) } : {}),
    exerciseTypes: validateList(raw.exerciseTypes, "exerciseTypes", issues, validateExerciseTypeChange),
    phases: validateList(raw.phases, "phases", issues, validatePhaseChange),
    weeks: validateList(raw.weeks, "weeks", issues, validateWeekChange),
    planB: validateList(raw.planB, "planB", issues, validatePlanB),
    coachNotes: validateList(raw.coachNotes, "coachNotes", issues, validateCoachNoteChange),
    circuits: validateList(raw.circuits, "circuits", issues, validateCircuitChange),
    ...(raw.valueTypes !== undefined ? { valueTypes: validateList(raw.valueTypes, "valueTypes", issues, validateValueTypeChange) } : {}),
    ...(raw.benchmarkTypes !== undefined ? { benchmarkTypes: validateList(raw.benchmarkTypes, "benchmarkTypes", issues, validateBenchmarkTypeChange) } : {}),
    ...(raw.goals !== undefined ? { goals: validateList(raw.goals, "goals", issues, validateGoalChange) } : {}),
    ...(raw.painIssues !== undefined ? { painIssues: validateList(raw.painIssues, "painIssues", issues, validatePainIssueChange) } : {}),
    ...(raw.places !== undefined ? { places: validateList(raw.places, "places", issues, validatePlaceChange) } : {}),
  };
  if (!issues.some(isError) && (set.categories?.length ?? 0) + set.exerciseTypes.length + set.phases.length + set.weeks.length + set.planB.length + set.coachNotes.length + set.circuits.length + (set.valueTypes?.length ?? 0) + (set.benchmarkTypes?.length ?? 0) + (set.goals?.length ?? 0) + (set.painIssues?.length ?? 0) + (set.places?.length ?? 0) === 0) {
    issues.push({ path: "", message: 'Nothing to do - expected at least one entry in "categories", "exerciseTypes", "circuits", "phases", "weeks", "planB", "coachNotes", "valueTypes", "benchmarkTypes", "goals", "painIssues" or "places".' });
  }
  return split(issues.some(isError) ? null : set, issues);
}

/** True if a parsed document looks like a change set rather than the older weekly/phase plan formats. */
export function isChangeSetShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (raw.categories !== undefined || raw.exerciseTypes !== undefined || raw.planB !== undefined || raw.coachNotes !== undefined || raw.circuits !== undefined || raw.valueTypes !== undefined || raw.benchmarkTypes !== undefined || raw.goals !== undefined || raw.painIssues !== undefined || raw.places !== undefined) return true;
  const phases = Array.isArray(raw.phases) ? raw.phases : [];
  const weeks = Array.isArray(raw.weeks) ? raw.weeks : [];
  if (phases.some((p) => isPlainObject(p) && "action" in p)) return true;
  if (weeks.some((w) => isPlainObject(w) && ("week" in w || "from" in w || "fromDate" in w))) return true;
  return false;
}
