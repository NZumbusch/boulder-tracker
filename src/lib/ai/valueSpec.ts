import type { ExerciseValues, ValueDef } from "../types";

/**
 * The single source of truth for what every `ExerciseValues` field means:
 * its JSON type, its unit, and - crucially - its allowed values when the
 * TypeScript type is a union of string literals.
 *
 * Why this file exists (2026-09-21): the AI plan contract used to describe
 * `values` to the model as nothing but a bare list of field *names*
 * (`AI_EXERCISE_VALUE_FIELD_NAMES.join(", ")`), and `schema.ts` validated
 * them as nothing but "number" | "string" | "string[]". Both halves were
 * weaker than the real type in `types.ts`, which produced two distinct
 * classes of failure in a real 15-week plan the user pasted:
 *
 *  1. Loud, fatal ones - the model sent `"mobilityType": "Shoulders and
 *     Wrists"` (a string where the type is `string[]`) and
 *     `"cadence": "Continuous, 1 problem every 3-4 min"` (prose where the
 *     type is `number`). ~170 of these rejected the entire import.
 *  2. Silent, corrupting ones - the model sent `"boardType": "Kilter"`
 *     (not one of the four legal board types), `"campusType": "Max
 *     Ladders"`, and `"routeDifficulty": "6B+"` (a climbing grade, where
 *     the field is Easy/Moderate/Hard). The old validator type-checked
 *     these as "string", passed them, and stored values the rest of the app
 *     can never render. It also silently *dropped* every `"restTime"` the
 *     model emitted, because the real field is `timeBetweenSets` and
 *     unrecognized keys are (deliberately) ignored.
 *
 * Class 2 is the dangerous one: an import that "succeeds" and writes
 * garbage is worse than one that fails. Both classes have the same root
 * cause - the model was never told the rules - so the fix is to derive both
 * the prompt text and the validator from this one table. They cannot drift.
 */

export type ValueFieldType = "number" | "string" | "string[]";

export interface ValueFieldSpec {
  type: ValueFieldType;
  /** Allowed values, when the underlying TS type is a string-literal union. */
  enum?: readonly string[];
  /** Unit or range, rendered into the prompt so the model picks sane numbers. */
  unit?: string;
  /** One-line meaning, rendered into the prompt. */
  description: string;
}

// Canonical option lists. These were previously hardcoded inside
// ExerciseForm.svelte's `<script>` block; they now live here so the form's
// dropdowns, the AI prompt and the AI validator are provably the same list.
export const BOULDER_GRADES = [
  "5A", "5B", "5C", "6A", "6A+", "6B", "6B+", "6C", "6C+",
  "7A", "7A+", "7B", "7B+", "7C", "7C+", "8A", "8A+", "8B", "8B+", "8C",
] as const;

export const ROUTE_GRADES = [
  "5a", "5b", "5c", "6a", "6a+", "6b", "6b+", "6c", "6c+",
  "7a", "7a+", "7b", "7b+", "7c", "7c+", "8a", "8a+", "8b", "8b+", "8c", "8c+",
  "9a", "9a+", "9b", "9b+", "9c",
] as const;

export const CLIMBING_STYLES = ["Slab", "Coordination", "Power", "Board"] as const;
export const BOARD_TYPES = ["Kilterboard", "Moonboard", "Tension Board", "Spraywall"] as const;
export const BOARD_ANGLES = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70] as const;
export const HOLD_TYPES = ["Crimp", "Half Crimp", "Full Crimp", "Open Hand", "Sloper", "Pocket"] as const;
export const CAMPUS_TYPES = ["Jumps", "One Arm Ladders"] as const;
export const MOBILITY_TYPES = ["Hamstrings", "Shoulders", "Hips", "Spine", "Ankles", "Wrists"] as const;
export const LEAD_STYLES = ["Onsight", "Flash", "Redpoint", "Projecting"] as const;
export const ROUTE_DIFFICULTIES = ["Easy", "Moderate", "Hard"] as const;

/** The built-in fields. `custom` (the athlete's own value types) is described per athlete - see `customValuesReference`. */
export type BuiltInValueField = Exclude<keyof ExerciseValues, "custom">;

export const EXERCISE_VALUE_SPEC: Record<BuiltInValueField, ValueFieldSpec> = {
  notes: { type: "string", description: "Free text. The ONLY field that accepts prose - coaching cues, session intent, anything qualitative." },
  duration: { type: "number", unit: "minutes", description: "Total working time for this exercise." },
  plannedLoad: { type: "number", unit: "1-10", description: "Intended stress of this exercise." },

  minGrade: { type: "string", enum: BOULDER_GRADES, description: "Easiest grade in the working range." },
  maxGrade: { type: "string", enum: BOULDER_GRADES, description: "Hardest grade in the working range." },
  cadence: { type: "number", unit: "minutes per boulder", description: "Pacing as a NUMBER, e.g. 3 means one problem every 3 minutes. Describe pacing in words in `notes`, never here." },
  climbingStyle: { type: "string[]", enum: CLIMBING_STYLES, description: "Wall/movement emphasis. Anything outside this list (e.g. steepness, 'Mixed', 'Performance') belongs in `notes`." },
  boardType: { type: "string", enum: BOARD_TYPES, description: 'Systematic board. Note the exact spelling "Kilterboard", not "Kilter".' },
  boardAngle: { type: "number", unit: `degrees, one of ${BOARD_ANGLES.join("/")}`, description: "Board overhang angle." },

  leadStyle: { type: "string[]", enum: LEAD_STYLES, description: "Rope-climbing attempt style." },

  sets: { type: "number", description: "Number of sets." },
  reps: { type: "number", description: "Repetitions per set." },
  movesPerRoute: { type: "number", description: "Moves in each circuit/route." },

  holdType: { type: "string", enum: HOLD_TYPES, description: "Grip position used." },
  timeOn: { type: "number", unit: "seconds", description: "Time under tension per rep." },
  timeOff: { type: "number", unit: "seconds", description: "Rest between reps inside a set." },
  timeBetweenSets: { type: "number", unit: "seconds", description: 'Rest between sets. There is NO "restTime" field - this is it.' },
  weight: { type: "number", unit: "kg", description: "Added weight (not bodyweight)." },
  holdSize: { type: "number", unit: "mm", description: "Edge depth." },
  distance: { type: "number", unit: "km", description: "Distance covered, for cardio." },

  campusType: { type: "string", enum: CAMPUS_TYPES, description: "Campus protocol. Only these two exist; describe any other protocol in `notes`." },

  difficulty: { type: "number", unit: "1-10", description: "Perceived exertion / RPE." },
  routeDifficulty: { type: "string", enum: ROUTE_DIFFICULTIES, description: "Relative difficulty band. NOT a climbing grade - grades go in minGrade/maxGrade." },
  bodyweightPercent: { type: "number", unit: "%", description: "Load as a percentage of bodyweight (100 = bodyweight)." },
  maxWeightPercent: { type: "number", unit: "%", description: "Load as a percentage of 1RM." },

  mobilityType: { type: "string[]", enum: MOBILITY_TYPES, description: "Body areas mobilised. Split compound answers, e.g. \"Shoulders and Wrists\" is [\"Shoulders\", \"Wrists\"]." },
};

export const EXERCISE_VALUE_FIELD_NAMES = Object.keys(EXERCISE_VALUE_SPEC) as BuiltInValueField[];

/**
 * Wrong-but-obvious field names, mapped to the real one.
 *
 * `restTime` is the motivating case and is not the model's fault: it's the
 * name used by `ParameterBlock`/`PARAMETER_LABELS` for the same concept, so
 * it reads as correct, and every occurrence in the user's pasted 15-week
 * plan was silently discarded by the old importer. Keys are compared
 * lowercased with non-alphanumerics stripped, so "rest_time"/"Rest Time"
 * all land here too.
 */
export const VALUE_FIELD_ALIASES: Record<string, keyof ExerciseValues> = {
  resttime: "timeBetweenSets",
  rest: "timeBetweenSets",
  restbetweensets: "timeBetweenSets",
  restseconds: "timeBetweenSets",
  timebetweenreps: "timeOff",
  hangtime: "timeOn",
  worktime: "timeOn",
  load: "plannedLoad",
  rpe: "difficulty",
  intensity: "difficulty",
  addedweight: "weight",
  edgesize: "holdSize",
  gripttype: "holdType",
  griptype: "holdType",
  angle: "boardAngle",
  board: "boardType",
  style: "climbingStyle",
  minutes: "duration",
  note: "notes",
  comment: "notes",
  comments: "notes",
};

/** Lookup key for alias/canonical matching: lowercase, alphanumerics only. */
export function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CANONICAL_BY_NORMALIZED_KEY = new Map<string, keyof ExerciseValues>(
  EXERCISE_VALUE_FIELD_NAMES.map((name) => [normalizeFieldKey(name), name]),
);

/**
 * Resolves a key the AI used to a real `ExerciseValues` field: exact match
 * first, then case/punctuation-insensitive, then the alias table. Returns
 * null for a key that genuinely isn't one of ours (still ignored, as
 * before - an unknown key can't corrupt anything).
 */
export function resolveValueFieldName(key: string): keyof ExerciseValues | null {
  if (Object.prototype.hasOwnProperty.call(EXERCISE_VALUE_SPEC, key)) {
    return key as keyof ExerciseValues;
  }
  const normalized = normalizeFieldKey(key);
  return CANONICAL_BY_NORMALIZED_KEY.get(normalized) ?? VALUE_FIELD_ALIASES[normalized] ?? null;
}

/**
 * Matches one free-text token against an enum's allowed values, in
 * decreasing order of confidence. Deliberately stops short of fuzzy
 * matching: a token that doesn't clearly correspond to a legal value is
 * reported as unmatched and preserved in `notes` rather than guessed at.
 *
 * The prefix rule is what turns the model's "Kilter" into "Kilterboard" and
 * "Tension" into "Tension Board". It intentionally does NOT match "Ladders"
 * to "One Arm Ladders" - a generic campus ladder is not a one-arm ladder,
 * and silently upgrading it would invent training the user never planned.
 */
export function matchEnumValue(token: string, allowed: readonly string[]): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  const exact = allowed.find((v) => v.toLowerCase() === lower);
  if (exact) return exact;

  const squashed = normalizeFieldKey(trimmed);
  const bySquash = allowed.find((v) => normalizeFieldKey(v) === squashed);
  if (bySquash) return bySquash;

  const byPrefix = allowed.filter((v) => v.toLowerCase().startsWith(lower));
  if (byPrefix.length === 1) return byPrefix[0];

  return null;
}

/** Splits a compound answer ("Shoulders and Wrists", "Slab, Power") into tokens. */
export function splitCompoundValue(raw: string): string[] {
  return raw
    .split(/\s*(?:,|\/|\+|&|\band\b)\s*/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** The `values` field reference embedded in every AI prompt. */
export function renderValueFieldReference(): string {
  const lines = EXERCISE_VALUE_FIELD_NAMES.map((name) => {
    const spec = EXERCISE_VALUE_SPEC[name];
    const parts: string[] = [];
    parts.push(spec.type === "string[]" ? "array of strings" : spec.type);
    if (spec.unit) parts.push(spec.unit);
    let line = `- ${name} (${parts.join(", ")}): ${spec.description}`;
    if (spec.enum) {
      line += `\n    Allowed values (use EXACTLY one of these strings): ${spec.enum.map((v) => `"${v}"`).join(", ")}`;
    }
    return line;
  });
  return lines.join("\n");
}

/**
 * The athlete's own value types, as prompt text - empty when there are none
 * in use. They go in `values.custom` by id; the matching "v:<id>" is what an
 * exercise lists among its "parameters". Archived ones are left out: nothing
 * new should be written to them.
 */
export function customValuesReference(defs: readonly ValueDef[]): string {
  const live = defs.filter((d) => !d.archived);
  if (!live.length) return "";
  const rows = live.map((d) =>
    d.kind === "choice"
      ? `- "${d.id}" (${d.name}): one of ${(d.options ?? []).map((o) => JSON.stringify(o)).join(" / ")}`
      : `- "${d.id}" (${d.name}): a number${d.unit ? ` in ${d.unit}` : ""}`,
  );
  return `MY OWN VALUE TYPES - besides the fields above, "values" may carry a "custom" object of these, keyed by the id in quotes: "custom": { "${live[0].id}": ${live[0].kind === "choice" ? JSON.stringify((live[0].options ?? [""])[0]) : 42} }. In an exercise's "parameters" list one as "v:<id>" (e.g. "v:${live[0].id}"). They are only recorded - they don't change load.
${rows.join("\n")}`;
}
