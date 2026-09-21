import type { DayOfWeek, ExerciseValues } from "../types";
import { getWeekIdRange } from "../dateUtils";
import {
  EXERCISE_VALUE_SPEC,
  EXERCISE_VALUE_FIELD_NAMES,
  matchEnumValue,
  renderValueFieldReference,
  resolveValueFieldName,
  splitCompoundValue,
  type ValueFieldSpec,
} from "./valueSpec";

/**
 * Runtime validators for the two AI JSON contracts (Phase 5 - see PLAN.md).
 * Hand-rolled rather than a schema library (zod etc.), per PLAN.md's stated
 * default. Untrusted/unpredictable input (pasted from an LLM, which "doesn't
 * reliably follow strict JSON contracts" per PLAN.md's own DoD) - never
 * partially trust it. Validation here is deliberately **all-or-nothing**:
 * if any required field is missing or has the wrong type anywhere in the
 * document, the whole parse is rejected (`valid: false`, no `data`) rather
 * than silently importing the well-formed parts. This is what makes "never
 * silently commit anything on invalid input" trivially true at the
 * validation layer - the caller (AIImportModal) only ever sees a `data`
 * object once every check below has passed.
 *
 * Deliberately permissive in one direction: unrecognized object keys
 * (top-level, per-week, per-workout, per-exercise, or inside `values`) are
 * silently ignored rather than rejected. LLMs commonly add extra
 * commentary/rationale fields even when told not to; rejecting on those
 * would make the feature unusably brittle for no safety benefit (an unknown
 * key can't corrupt stored data - it's simply never read).
 */

const DAYS_OF_WEEK: DayOfWeek[] = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

export interface ValidationIssue {
  /** Dotted/bracketed path into the input, e.g. "weeks[2].workouts[0].exercises[1].values.sets" */
  path: string;
  message: string;
  /**
   * "error" (the default when omitted) rejects the whole import, preserving
   * the all-or-nothing rule above. "repair" is something that was
   * automatically corrected and is reported for review rather than fatal -
   * see `validateExerciseValues` for exactly which mistakes qualify.
   */
  severity?: "error" | "repair";
}

export function isError(issue: ValidationIssue): boolean {
  return issue.severity !== "repair";
}

export interface ValidationResult<T> {
  valid: boolean;
  data: T | null;
  /** Fatal problems only. Empty whenever `valid` is true. */
  issues: ValidationIssue[];
  /** Auto-applied fixes, for the import UI to show before the user confirms. */
  repairs: ValidationIssue[];
}

export interface AIExercise {
  exerciseTypeName: string;
  /**
   * Optional Analytics Category name (Stage 10, UI_PLAN.md §5.8) - only
   * meaningful when `exerciseTypeName` doesn't match an existing catalog
   * entry and a new one gets created from this import. Resolved
   * case-insensitively against `AnalyticsCategory.name` by `planImport.ts`/
   * `workoutLogImport.ts`'s shared `resolveNewExerciseTypeCategory`; an
   * unresolvable or omitted value falls back to today's existing
   * first-non-archived-category default. This is a field on the AI JSON
   * contract only, not on `TrainingData` - see UI_PLAN.md §7's explicit
   * carve-out.
   */
  categoryName?: string;
  values: ExerciseValues;
}

export interface AIPlanWorkout {
  name?: string;
  dayOfWeek?: DayOfWeek;
  /** Planned time of day, normalised to "HH:mm" (24-hour). */
  startTime?: string;
  /** Planned session length in minutes. */
  plannedDuration?: number;
  exercises: AIExercise[];
}

export interface AIPlanWeek {
  weekId: string;
  phaseName: string;
  workouts: AIPlanWorkout[];
}

/**
 * One phase of the "phase format" contract: the phase, the week range it
 * covers, and the distinct sessions that make it up - stated once, not
 * repeated per week. See `expandPhasePlan`.
 */
export interface AIPlanPhase {
  phaseName: string;
  startWeekId: string;
  endWeekId: string;
  sessions: AIPlanWorkout[];
}

export interface AIPlanOutput {
  /** Which shape the pasted document used. Always set by `validateAIPlanOutput`. */
  format?: "weekly" | "phase";
  /**
   * Always populated: the per-week plan, expanded from `phases` when the
   * document used the phase format. Downstream import code reads only this.
   */
  weeks: AIPlanWeek[];
  /** Present only for `format: "phase"`, for the preview to show the block plan. */
  phases?: AIPlanPhase[];
}

const WEEK_ID = /^\d{4}-W\d{2}$/;

export interface AIWorkoutLogWorkout {
  /** ISO date string, if the AI could infer one from the pasted notes */
  date?: string;
  name?: string;
  exercises: AIExercise[];
}

export interface AIWorkoutLogOutput {
  workouts: AIWorkoutLogWorkout[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Records an auto-applied fix. Never fails the import - surfaced for review instead. */
function pushRepair(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message, severity: "repair" });
}

interface CoerceResult {
  /** The canonical value to store, or undefined if nothing usable survived. */
  value?: unknown;
  /** Text that could not be represented in this field and belongs in `notes`. */
  rescued?: string;
  /** Set only for input that is not repairable at all (wrong JSON type entirely). */
  error?: string;
  /** Human-readable description of what was changed, when anything was. */
  repair?: string;
}

/** A bare "45", "45kg", "30 min" - but deliberately not prose that happens to contain a digit. */
const LONE_NUMBER = /^\s*(-?\d+(?:[.,]\d+)?)\s*[a-z%\u00b0"']*\s*$/i;

function coerceNumber(raw: unknown): CoerceResult {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { value: raw } : { error: `Expected a number, got ${JSON.stringify(raw)}.` };
  }
  if (typeof raw === "string") {
    const match = raw.match(LONE_NUMBER);
    if (match) {
      const n = Number(match[1].replace(",", "."));
      if (Number.isFinite(n)) {
        return { value: n, repair: `Read ${JSON.stringify(raw)} as the number ${n}.` };
      }
    }
    // Prose in a numeric field (the model's most common mistake, e.g.
    // "cadence": "Continuous, 1 problem every 3-4 min"). Pulling a digit out
    // of that would invent a prescription nobody wrote, so the text is moved
    // to `notes` verbatim instead - lossless, and visible in the UI.
    return { rescued: raw.trim(), repair: `Not a number - moved to notes.` };
  }
  return { error: `Expected a number, got ${JSON.stringify(raw)}.` };
}

function coerceEnumScalar(raw: unknown, spec: ValueFieldSpec): CoerceResult {
  let text: string;
  if (typeof raw === "string") {
    text = raw;
  } else if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === "string") {
    text = raw[0];
  } else {
    return { error: `Expected a string, got ${JSON.stringify(raw)}.` };
  }

  const allowed = spec.enum!;
  const direct = matchEnumValue(text, allowed);
  if (direct) {
    return direct === text
      ? { value: direct }
      : { value: direct, repair: `Read ${JSON.stringify(text)} as "${direct}".` };
  }

  // "Steep and powerful" against a single-valued field: accept only when
  // exactly one token is unambiguously legal, keep the original text in notes.
  const matches = [...new Set(splitCompoundValue(text).map((t) => matchEnumValue(t, allowed)).filter(Boolean))] as string[];
  if (matches.length === 1) {
    return { value: matches[0], rescued: text.trim(), repair: `Read ${JSON.stringify(text)} as "${matches[0]}"; original kept in notes.` };
  }
  return { rescued: text.trim(), repair: `Not one of ${allowed.join(" / ")} - moved to notes.` };
}

function coerceEnumArray(raw: unknown, spec: ValueFieldSpec): CoerceResult {
  const allowed = spec.enum!;
  let items: string[];
  let wrapped = false;

  if (typeof raw === "string") {
    // The single most common fatal error in the user's 15-week paste:
    // "mobilityType": "Shoulders and Wrists" where the type is string[].
    items = [raw];
    wrapped = true;
  } else if (Array.isArray(raw)) {
    items = raw.map((v) => (typeof v === "string" ? v : String(v)));
  } else {
    return { error: `Expected an array of strings, got ${JSON.stringify(raw)}.` };
  }

  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const item of items) {
    for (const token of splitCompoundValue(item)) {
      const hit = matchEnumValue(token, allowed);
      if (hit) {
        if (!matched.includes(hit)) matched.push(hit);
      } else {
        unmatched.push(token);
      }
    }
  }

  const notes: string[] = [];
  if (wrapped) notes.push("wrapped a single string into an array");
  if (unmatched.length) notes.push(`${unmatched.map((u) => JSON.stringify(u)).join(", ")} not in ${allowed.join(" / ")} - moved to notes`);

  return {
    value: matched.length ? matched : undefined,
    rescued: unmatched.length ? unmatched.join(", ") : undefined,
    repair: notes.length ? notes.join("; ") : undefined,
  };
}

function coerceValue(raw: unknown, spec: ValueFieldSpec): CoerceResult {
  if (spec.type === "number") return coerceNumber(raw);
  if (spec.type === "string[]") return coerceEnumArray(raw, spec);
  if (spec.enum) return coerceEnumScalar(raw, spec);
  if (typeof raw === "string") return { value: raw };
  if (typeof raw === "number" || typeof raw === "boolean") {
    return { value: String(raw), repair: `Read ${JSON.stringify(raw)} as text.` };
  }
  return { error: `Expected a string, got ${JSON.stringify(raw)}.` };
}

/**
 * Validates and repairs one `values` object.
 *
 * Repairs (recorded, never silent) cover the mistakes an LLM reliably makes
 * against this contract, all of which are losslessly recoverable:
 * misnamed-but-obvious keys (`restTime` -> `timeBetweenSets`), a bare string
 * where an array is required, a spelled-out enum value ("Kilter" ->
 * "Kilterboard"), and a number written as text ("45kg" -> 45).
 *
 * Anything that cannot be represented faithfully - prose in a numeric field,
 * an enum value with no legal counterpart - is NOT guessed at. The text is
 * appended to `notes` so the coach's intent survives and is visible in the
 * workout, and the substitution is reported. Only a value whose JSON type is
 * flatly wrong (an object where a scalar belongs) is still a hard error.
 */
function validateExerciseValues(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ExerciseValues {
  const values: ExerciseValues = {};
  if (raw === undefined) return values;
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected an object, got ${JSON.stringify(raw)}.` });
    return values;
  }

  // Canonical spellings win over aliases, so a payload carrying both
  // `timeBetweenSets` and `restTime` keeps the one that is actually ours.
  const byField = new Map<keyof ExerciseValues, { rawKey: string; rawValue: unknown }>();
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    if (rawValue === undefined || rawValue === null) continue;
    const field = resolveValueFieldName(rawKey);
    if (!field) continue; // genuinely unknown key - ignored, as before
    const existing = byField.get(field);
    if (existing && existing.rawKey === field) continue;
    byField.set(field, { rawKey, rawValue });
  }

  const rescuedText: string[] = [];
  for (const field of EXERCISE_VALUE_FIELD_NAMES) {
    const entry = byField.get(field);
    if (!entry) continue;
    const fieldPath = `${path}.${field}`;
    if (entry.rawKey !== field) {
      pushRepair(issues, `${path}.${entry.rawKey}`, `No such field - read as "${field}".`);
    }
    const result = coerceValue(entry.rawValue, EXERCISE_VALUE_SPEC[field]);
    if (result.error) {
      issues.push({ path: fieldPath, message: result.error });
      continue;
    }
    if (result.repair) pushRepair(issues, fieldPath, result.repair);
    if (result.rescued && field !== "notes") rescuedText.push(`${field}: ${result.rescued}`);
    if (result.value !== undefined) (values as Record<string, unknown>)[field] = result.value;
  }

  if (rescuedText.length) {
    const carried = rescuedText.map((t) => `[${t}]`).join(" ");
    values.notes = values.notes ? `${values.notes} ${carried}` : carried;
  }
  return values;
}

function validateExercise(raw: unknown, path: string, issues: ValidationIssue[]): AIExercise | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected an exercise object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = raw.exerciseTypeName;
  if (typeof name !== "string" || name.trim() === "") {
    issues.push({ path: `${path}.exerciseTypeName`, message: "Required non-empty string." });
    return null;
  }
  const categoryName = validateOptionalString(raw.categoryName, `${path}.categoryName`, issues);
  const values = validateExerciseValues(raw.values, `${path}.values`, issues);
  return { exerciseTypeName: name.trim(), categoryName, values };
}

function validateExercises(raw: unknown, path: string, issues: ValidationIssue[]): AIExercise[] {
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `Expected an array, got ${JSON.stringify(raw)}.` });
    return [];
  }
  const result: AIExercise[] = [];
  raw.forEach((e, i) => {
    const validated = validateExercise(e, `${path}[${i}]`, issues);
    if (validated) result.push(validated);
  });
  return result;
}

function validateOptionalString(raw: unknown, path: string, issues: ValidationIssue[]): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    issues.push({ path, message: `Expected a string, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  return raw;
}

function validateDayOfWeek(raw: unknown, path: string, issues: ValidationIssue[]): DayOfWeek | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !DAYS_OF_WEEK.includes(raw as DayOfWeek)) {
    issues.push({ path, message: `Expected one of ${DAYS_OF_WEEK.join(", ")}, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  return raw as DayOfWeek;
}

/**
 * Normalises a planned time of day to "HH:mm". Accepts what a model
 * actually writes for a clock time - "9:30", "09:30:00", "6pm", "6:30 PM" -
 * and records each normalisation as a repair. Anything that isn't a clock
 * time at all is a hard error rather than a guess: silently dropping it
 * would schedule the session at no particular time without saying so.
 */
function validateTimeOfDay(raw: unknown, path: string, issues: ValidationIssue[]): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    issues.push({ path, message: `Expected a time like "18:00", got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  const text = raw.trim();
  if (text === "") return undefined;

  const match = text.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) {
    issues.push({ path, message: `Expected a time like "18:00", got ${JSON.stringify(raw)}.` });
    return undefined;
  }

  let hours = parseInt(match[1], 10);
  const minutes = match[2] === undefined ? 0 : parseInt(match[2], 10);
  const meridiem = match[3]?.toLowerCase();

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      issues.push({ path, message: `Expected a 12-hour clock time with "${meridiem}", got ${JSON.stringify(raw)}.` });
      return undefined;
    }
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }

  if (hours > 23 || minutes > 59) {
    issues.push({ path, message: `Expected a time like "18:00", got ${JSON.stringify(raw)}.` });
    return undefined;
  }

  const normalised = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  if (normalised !== text) {
    pushRepair(issues, path, `Read ${JSON.stringify(raw)} as "${normalised}".`);
  }
  return normalised;
}

/**
 * A planned session length in minutes. Reuses `coerceNumber`, so "90 min"
 * normalises to 90 the same way every numeric `values` field does; prose
 * ("about an hour and a half") is rejected rather than guessed at, since
 * unlike a `values` field there is no `notes` here to rescue it into.
 */
function validateDurationMinutes(raw: unknown, path: string, issues: ValidationIssue[]): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const result = coerceNumber(raw);
  if (result.error !== undefined || result.value === undefined) {
    issues.push({ path, message: `Expected a number of minutes, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  const minutes = result.value as number;
  if (minutes <= 0) {
    issues.push({ path, message: `Expected a positive number of minutes, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  if (result.repair) pushRepair(issues, path, result.repair);
  return minutes;
}

function validatePlanWorkout(raw: unknown, path: string, issues: ValidationIssue[]): AIPlanWorkout | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a workout object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = validateOptionalString(raw.name, `${path}.name`, issues);
  const dayOfWeek = validateDayOfWeek(raw.dayOfWeek, `${path}.dayOfWeek`, issues);
  const startTime = validateTimeOfDay(raw.startTime, `${path}.startTime`, issues);
  const plannedDuration = validateDurationMinutes(raw.plannedDuration, `${path}.plannedDuration`, issues);
  const exercises = validateExercises(raw.exercises, `${path}.exercises`, issues);
  return { name, dayOfWeek, startTime, plannedDuration, exercises };
}

function validatePlanWeek(raw: unknown, path: string, issues: ValidationIssue[]): AIPlanWeek | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a week object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const weekId = raw.weekId;
  if (typeof weekId !== "string" || !WEEK_ID.test(weekId)) {
    issues.push({ path: `${path}.weekId`, message: `Expected a week id like "2026-W25", got ${JSON.stringify(weekId)}.` });
  }
  const phaseName = raw.phaseName;
  if (typeof phaseName !== "string" || phaseName.trim() === "") {
    issues.push({ path: `${path}.phaseName`, message: "Required non-empty string." });
  }
  if (!Array.isArray(raw.workouts)) {
    issues.push({ path: `${path}.workouts`, message: `Expected an array, got ${JSON.stringify(raw.workouts)}.` });
    return null;
  }
  const workouts: AIPlanWorkout[] = [];
  raw.workouts.forEach((w, i) => {
    const validated = validatePlanWorkout(w, `${path}.workouts[${i}]`, issues);
    if (validated) workouts.push(validated);
  });
  if (typeof weekId !== "string" || typeof phaseName !== "string") return null;
  return { weekId, phaseName: phaseName.trim(), workouts };
}

function validatePlanPhase(raw: unknown, path: string, issues: ValidationIssue[]): AIPlanPhase | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a phase object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const phaseName = raw.phaseName;
  if (typeof phaseName !== "string" || phaseName.trim() === "") {
    issues.push({ path: `${path}.phaseName`, message: "Required non-empty string." });
  }
  const startWeekId = raw.startWeekId;
  const endWeekId = raw.endWeekId;
  for (const [key, value] of [["startWeekId", startWeekId], ["endWeekId", endWeekId]] as const) {
    if (typeof value !== "string" || !WEEK_ID.test(value)) {
      issues.push({ path: `${path}.${key}`, message: `Expected a week id like "2026-W25", got ${JSON.stringify(value)}.` });
    }
  }
  if (typeof startWeekId === "string" && typeof endWeekId === "string" && WEEK_ID.test(startWeekId) && WEEK_ID.test(endWeekId) && startWeekId > endWeekId) {
    issues.push({ path: `${path}.endWeekId`, message: `endWeekId ${JSON.stringify(endWeekId)} is before startWeekId ${JSON.stringify(startWeekId)}.` });
  }

  // "sessions" is the contract's name; accept "workouts" too, since the
  // weekly format uses that word and the model mixes them up.
  const rawSessions = raw.sessions ?? raw.workouts;
  if (!Array.isArray(rawSessions)) {
    issues.push({ path: `${path}.sessions`, message: `Expected an array, got ${JSON.stringify(rawSessions)}.` });
    return null;
  }
  if (raw.sessions === undefined && Array.isArray(raw.workouts)) {
    pushRepair(issues, `${path}.workouts`, 'Read as "sessions".');
  }
  const sessions: AIPlanWorkout[] = [];
  rawSessions.forEach((w, i) => {
    const validated = validatePlanWorkout(w, `${path}.sessions[${i}]`, issues);
    if (validated) sessions.push(validated);
  });

  if (typeof phaseName !== "string" || typeof startWeekId !== "string" || typeof endWeekId !== "string") return null;
  return { phaseName: phaseName.trim(), startWeekId, endWeekId, sessions };
}

/**
 * Expands the phase format into the week format.
 *
 * This is the whole point of the phase contract: the model states each
 * phase once, and the app instantiates its sessions across every week the
 * phase covers - exactly what assigning a phase to a week already does
 * natively via `generateWorkoutsFromTemplate`. Downstream
 * (`buildPlanPreview`, `buildPlanCommit`) therefore needs no phase
 * awareness at all; it keeps seeing weeks.
 *
 * Contiguous same-phase weeks are re-grouped into one `TrainingBlock` by
 * `buildPlanCommit`, which reproduces the declared block exactly.
 */
export function expandPhasePlan(phases: AIPlanPhase[]): AIPlanWeek[] {
  const weeks: AIPlanWeek[] = [];
  for (const phase of phases) {
    for (const weekId of getWeekIdRange(phase.startWeekId, phase.endWeekId)) {
      weeks.push({
        weekId,
        phaseName: phase.phaseName,
        // Fresh copies per week: ids are regenerated at commit time, but the
        // exercise objects themselves must not be shared between weeks.
        workouts: phase.sessions.map((session) => ({
          ...session,
          exercises: session.exercises.map((e): AIExercise => ({ ...e, values: { ...e.values } })),
        })),
      });
    }
  }
  return weeks.sort((a, b) => (a.weekId < b.weekId ? -1 : a.weekId > b.weekId ? 1 : 0));
}

/**
 * Validates a parsed JSON value against the `AIPlanOutput` contract.
 * Does not parse JSON itself - see `parseAIPlanOutput` for the
 * JSON.parse-and-validate convenience used by the import UI.
 *
 * Accepts either supported shape and reports which one it found, so the
 * import UI never needs a mode switch that has to agree with whatever the
 * user actually pasted: a document with a top-level "phases" array is the
 * phase format, one with "weeks" is the per-week format. `data.weeks` is
 * always populated either way.
 */
export function validateAIPlanOutput(raw: unknown): ValidationResult<AIPlanOutput> {
  const collected: ValidationIssue[] = [];
  const fail = (): ValidationResult<AIPlanOutput> => split<AIPlanOutput>(null, collected);

  if (!isPlainObject(raw)) {
    collected.push({ path: "", message: "Top-level JSON must be an object." });
    return fail();
  }

  const hasPhases = Array.isArray(raw.phases);
  const hasWeeks = Array.isArray(raw.weeks);
  if (!hasPhases && !hasWeeks) {
    collected.push({
      path: "",
      message: `Expected a top-level "phases" array (phase format) or "weeks" array (per-week format), got ${JSON.stringify(raw.phases ?? raw.weeks)}.`,
    });
    return fail();
  }
  if (hasPhases && hasWeeks) {
    collected.push({ path: "", message: 'Contains both "phases" and "weeks" - include exactly one.' });
    return fail();
  }

  if (hasPhases) {
    const phases: AIPlanPhase[] = [];
    (raw.phases as unknown[]).forEach((p, i) => {
      const validated = validatePlanPhase(p, `phases[${i}]`, collected);
      if (validated) phases.push(validated);
    });
    if (collected.some(isError)) return fail();
    return split({ format: "phase", phases, weeks: expandPhasePlan(phases) }, collected);
  }

  const weeks: AIPlanWeek[] = [];
  (raw.weeks as unknown[]).forEach((w, i) => {
    const validated = validatePlanWeek(w, `weeks[${i}]`, collected);
    if (validated) weeks.push(validated);
  });
  if (collected.some(isError)) return fail();
  return split({ format: "weekly", weeks }, collected);
}

/** Partitions collected issues into fatal errors and reported repairs. */
function split<T>(data: T | null, collected: ValidationIssue[]): ValidationResult<T> {
  const issues = collected.filter(isError);
  const repairs = collected.filter((i) => !isError(i));
  return { valid: issues.length === 0 && data !== null, data: issues.length === 0 ? data : null, issues, repairs };
}

function validateWorkoutLogWorkout(raw: unknown, path: string, issues: ValidationIssue[]): AIWorkoutLogWorkout | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a workout object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  let date: string | undefined;
  if (raw.date !== undefined) {
    if (typeof raw.date !== "string" || Number.isNaN(new Date(raw.date).getTime())) {
      issues.push({ path: `${path}.date`, message: `Expected a valid ISO date string, got ${JSON.stringify(raw.date)}.` });
    } else {
      date = raw.date;
    }
  }
  const name = validateOptionalString(raw.name, `${path}.name`, issues);
  const exercises = validateExercises(raw.exercises, `${path}.exercises`, issues);
  return { date, name, exercises };
}

/**
 * Validates a parsed JSON value against the `AIWorkoutLogOutput` contract -
 * the "paste free-text training notes, get structured exercises" flow.
 * Reuses the same per-exercise validation as `AIPlanOutput` (same
 * `AIExercise` shape, same name-resolution rule at import time).
 */
export function validateAIWorkoutLogOutput(raw: unknown): ValidationResult<AIWorkoutLogOutput> {
  const collected: ValidationIssue[] = [];
  if (!isPlainObject(raw)) {
    collected.push({ path: "", message: "Top-level JSON must be an object." });
    return split<AIWorkoutLogOutput>(null, collected);
  }
  if (!Array.isArray(raw.workouts)) {
    collected.push({ path: "workouts", message: `Expected an array, got ${JSON.stringify(raw.workouts)}.` });
    return split<AIWorkoutLogOutput>(null, collected);
  }
  const workouts: AIWorkoutLogWorkout[] = [];
  raw.workouts.forEach((w, i) => {
    const validated = validateWorkoutLogWorkout(w, `workouts[${i}]`, collected);
    if (validated) workouts.push(validated);
  });
  if (collected.some(isError)) return split<AIWorkoutLogOutput>(null, collected);
  return split({ workouts }, collected);
}

/**
 * JSON.parse + validate in one step, for pasted text straight from the
 * clipboard - garbage/non-JSON text and truncated input both surface as a
 * single clear issue instead of throwing.
 */
export function parseAIPlanOutput(text: string): ValidationResult<AIPlanOutput> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err: any) {
    return { valid: false, data: null, issues: [{ path: "", message: `Could not parse as JSON: ${err.message}` }], repairs: [] };
  }
  return validateAIPlanOutput(raw);
}

export function parseAIWorkoutLogOutput(text: string): ValidationResult<AIWorkoutLogOutput> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err: any) {
    return { valid: false, data: null, issues: [{ path: "", message: `Could not parse as JSON: ${err.message}` }], repairs: [] };
  }
  return validateAIWorkoutLogOutput(raw);
}

/** The set of `ExerciseValues` fields an AI import is allowed to set, for prompt text. */
export const AI_EXERCISE_VALUE_FIELD_NAMES: string[] = [...EXERCISE_VALUE_FIELD_NAMES];

/**
 * Embedded verbatim in the "Generate Plan" AI prompt (`AIPromptModal.svelte`)
 * so the instructions and the validator can't silently drift apart -
 * PLAN.md requires the prompt to "include the AIPlanOutput JSON schema/shape
 * inline and explicitly instruct the AI to return only JSON matching it."
 */
/**
 * The rules every AI prompt shares: what may go in `values`, and the
 * mistakes that a real 15-week plan actually made. Generated from
 * `EXERCISE_VALUE_SPEC` so the prompt can never describe a field the
 * validator doesn't implement, or omit an allowed value it does.
 */
const AI_VALUES_CONTRACT = `EXERCISE "values" REFERENCE - these are the ONLY keys allowed inside "values". Any other key is discarded silently, so do not invent one:

${renderValueFieldReference()}

HARD RULES for "values" - each of these was a real failure, not a hypothetical:
- Every numeric field must be a bare JSON number: 180, not "180", not "180s", not "3-4 min".
- NEVER put prose in a numeric field. "cadence": "Continuous, 1 problem every 3-4 min" is wrong; write "cadence": 4 and put the sentence in "notes".
- Fields marked "array of strings" must be JSON arrays, even for one value: "mobilityType": ["Shoulders"], never "mobilityType": "Shoulders". Split compound answers: "Shoulders and Wrists" is ["Shoulders", "Wrists"].
- Fields with an allowed-value list accept ONLY those exact strings. "Kilter" is wrong, "Kilterboard" is right. If what you mean is not in the list (e.g. a "Mixed" or "Steep and powerful" session), omit the field and describe it in "notes" instead.
- "routeDifficulty" is Easy/Moderate/Hard, NOT a climbing grade. Grades belong in "minGrade"/"maxGrade".
- There is no "restTime" field. Rest between sets is "timeBetweenSets".
- "notes" is the only field that takes free text. Put all coaching detail, pacing, intent and conditions there.
- Omit any field you have no value for. Never write null.`;

const AI_PLAN_SHARED_RULES = `- "phaseName" should be one of the Available Phases listed above where possible.
- "exerciseTypeName" should be one of the Custom Exercise Modalities listed above where possible; invent a new, sensibly-named one only if nothing fits.
- "categoryName" - only include this if "exerciseTypeName" is a new, invented one (not one of the Custom Exercise Modalities listed above): set it to the closest match from the Analytics Categories listed above. Omit it entirely when reusing an existing exercise type.
- "dayOfWeek" (if given) must be exactly one of: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- "startTime" (optional) is the planned time of day the session starts, 24-hour "HH:mm" - e.g. "18:00", never "6pm" or "evening". Give one when the time of day is part of the prescription (a morning fingerboard vs an evening session); omit it when any time of day would do.
- "plannedDuration" (optional) is how long the whole session is planned to take, in whole minutes as a bare number: 90, never "90 min" or "1.5h". This is the wall-clock length of the session including rest and warm-up - it is NOT the sum of the exercises' own "duration" values, and setting one does not replace them.`;

/**
 * Per-week format: every week spelled out in full. Maximum control, and
 * the only way to express week-to-week progression explicitly - at the cost
 * of a very long response, since sessions repeat across a phase's weeks.
 */
export const AI_PLAN_OUTPUT_INSTRUCTIONS = `Respond with ONLY a single JSON object matching exactly this shape - no markdown code fences, no commentary before or after it:

{
  "weeks": [
    {
      "weekId": "2026-W25",
      "phaseName": "Capacity",
      "workouts": [
        {
          "name": "Session name",
          "dayOfWeek": "Monday",
          "startTime": "18:00",
          "plannedDuration": 90,
          "exercises": [
            { "exerciseTypeName": "Hangboard", "values": { "duration": 30, "sets": 5, "reps": 6, "timeOn": 10, "timeOff": 180, "notes": "optional" } }
          ]
        }
      ]
    }
  ]
}

Rules:
- "weekId" must be one of the exact week ids from the Target Timeframe above (format "YYYY-Www").
${AI_PLAN_SHARED_RULES}
- Every week in the Target Timeframe must appear exactly once, even if it's a rest/deload week with an empty "workouts" array.

${AI_VALUES_CONTRACT}`;

/**
 * Phase format: each phase stated once, with the distinct sessions that
 * define it, and the app instantiates them across the phase's weeks (see
 * `expandPhasePlan`). Roughly a quarter of the output for a long plan,
 * which keeps the model's attention on periodisation rather than on
 * retyping the same session.
 */
export const AI_PLAN_PHASE_OUTPUT_INSTRUCTIONS = `Respond with ONLY a single JSON object matching exactly this shape - no markdown code fences, no commentary before or after it:

{
  "phases": [
    {
      "phaseName": "Capacity",
      "startWeekId": "2026-W25",
      "endWeekId": "2026-W28",
      "sessions": [
        {
          "name": "Session name",
          "dayOfWeek": "Monday",
          "startTime": "18:00",
          "plannedDuration": 90,
          "exercises": [
            { "exerciseTypeName": "Hangboard", "values": { "duration": 30, "sets": 5, "reps": 6, "timeOn": 10, "timeOff": 180, "notes": "optional" } }
          ]
        }
      ]
    }
  ]
}

You are designing a PHASE PLAN, not a week-by-week calendar. For each phase, give the week range it covers and the set of DISTINCT sessions that define a typical week in it. The app repeats those sessions across every week of the phase automatically.

Rules:
- Do NOT repeat a session once per week, and do NOT emit a "weeks" array. One entry per phase, each listing that phase's distinct weekly sessions once.
- "startWeekId"/"endWeekId" are inclusive, format "YYYY-Www", and must fall inside the Target Timeframe above.
- Phases must not overlap, and together they should cover the whole Target Timeframe. Use a short deload/rest phase where one belongs rather than leaving a gap.
- "sessions" is the typical week for that phase: one entry per training day, each with its own "dayOfWeek" (and "startTime"/"plannedDuration" where they matter). A rest week is a phase with an empty "sessions" array.
- Put any week-to-week progression inside the phase (e.g. "notes": "add 2kg each week, deload in the final week") rather than splitting the phase into one-week blocks to express it.
${AI_PLAN_SHARED_RULES}

${AI_VALUES_CONTRACT}`;

export const AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS = `You are structuring free-text climbing/training notes into JSON. Respond with ONLY a single JSON object matching exactly this shape - no markdown code fences, no commentary before or after it:

{
  "workouts": [
    {
      "date": "2026-09-16",
      "name": "Session name",
      "exercises": [
        { "exerciseTypeName": "Hangboard", "values": { "duration": 30, "sets": 5, "reps": 6, "timeOn": 10, "timeOff": 180, "notes": "optional" } }
      ]
    }
  ]
}

Rules:
- "date" (if you can infer one) must be an ISO date string ("YYYY-MM-DD").
- "exerciseTypeName" is a free-text exercise name - use whatever name best matches what was described.

${AI_VALUES_CONTRACT}

Here are my training notes to structure:
`;
