import type { ExerciseValues, ParameterBlock, PerSetKey, SetDetail } from "../types";
import { toRepsArray } from "./reps";

/**
 * Per-set numbers. An exercise's values hold one number per field; when sets
 * differ (10 kg, 12.5 kg, 15 kg; 6, 5, 4 reps) the differing fields also
 * carry one number per set. This module is the only place that knows how:
 * `reps` keeps its per-set array (older data has it), every other field
 * goes in `setDetails`, and the plain field beside it is the mean so a
 * reader that wants a single number never has to care.
 *
 * Uniform sets stay uniform: writing rows that are all the same writes the
 * plain fields and nothing else, so exercises that don't need this look
 * exactly as before.
 */

/** A set as one object: every per-set number it has. */
export type SetRow = Partial<Record<PerSetKey, number>>;

export const PER_SET_KEYS: PerSetKey[] = ["reps", "weight", "timeOn", "bodyweightPercent", "maxWeightPercent", "boardAngle", "holdSize", "distance"];

/** Defaults for which parameters can differ per set, when the exercise type doesn't say. */
export const DEFAULT_PER_SET: PerSetKey[] = ["reps", "weight", "timeOn", "bodyweightPercent", "maxWeightPercent", "boardAngle"];

/** The parameter block that holds each per-set field. */
const BLOCK_OF: Record<PerSetKey, ParameterBlock> = {
  reps: "reps",
  weight: "weight",
  timeOn: "timeOn",
  bodyweightPercent: "bodyweightPercent",
  maxWeightPercent: "maxWeightPercent",
  boardAngle: "boardAngle",
  holdSize: "holdSize",
  distance: "distance",
};

/** The per-set fields an exercise can log per set: its type's own choice (or the defaults), limited to what it tracks. */
export function perSetKeysFor(tracked: ParameterBlock[], typeChoice?: ParameterBlock[]): PerSetKey[] {
  const allowed = typeChoice ? PER_SET_KEYS.filter((k) => typeChoice.includes(BLOCK_OF[k])) : DEFAULT_PER_SET;
  return allowed.filter((k) => tracked.includes(BLOCK_OF[k]));
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** How many sets there are: the longest of the per-set lists, else `sets`, else one. */
export function setCount(values: ExerciseValues): number {
  const reps = toRepsArray(values.reps)?.length ?? 0;
  const details = values.setDetails?.length ?? 0;
  const sets = Math.max(0, Math.floor(num(values.sets) ?? 0));
  return Math.max(reps, details, sets, 1);
}

/** Whether any field differs between sets. */
export function hasPerSet(values: ExerciseValues): boolean {
  return (toRepsArray(values.reps)?.length ?? 0) > 1 || (values.setDetails?.length ?? 0) > 0;
}

/** One set's numbers: the plain fields, with the per-set ones laid over them. */
export function setRows(values: ExerciseValues, keys: PerSetKey[] = PER_SET_KEYS): SetRow[] {
  const repsList = toRepsArray(values.reps);
  return Array.from({ length: setCount(values) }, (_, i) => {
    const row: SetRow = {};
    for (const key of keys) {
      const own = key === "reps" ? repsList?.[Math.min(i, repsList.length - 1)] : num(values.setDetails?.[i]?.[key]);
      const plain = key === "reps" ? (repsList ? undefined : num(values.reps)) : num(values[key]);
      const value = own ?? plain;
      if (value !== undefined) row[key] = value;
    }
    return row;
  });
}

/** One field in one set (the plain value where the set has none of its own). */
export function setValue(values: ExerciseValues, index: number, key: PerSetKey): number | undefined {
  return setRows(values, [key])[index]?.[key];
}

const mean = (list: number[]) => Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100;

/**
 * Writes rows back into values: `sets` becomes the row count; each key whose
 * numbers are all the same goes into the plain field, each that differs goes
 * per set (and its plain field becomes the mean). Keys not in `keys` are left
 * as they were.
 */
export function withSetRows(base: ExerciseValues, rows: SetRow[], keys: PerSetKey[] = PER_SET_KEYS): ExerciseValues {
  const out: ExerciseValues = { ...base };
  delete out.setDetails;
  if (rows.length === 0) return out;
  out.sets = rows.length;
  const details: SetDetail[] = rows.map(() => ({}));
  let anyDetail = false;
  for (const key of keys) {
    const list = rows.map((r) => r[key]);
    const given = list.filter((v): v is number => v !== undefined);
    if (given.length === 0) {
      delete out[key as "weight"];
      continue;
    }
    // A set with nothing for this key takes the first given value, so every set has one.
    const filled = list.map((v) => v ?? given[0]);
    const uniform = filled.every((v) => v === filled[0]);
    if (key === "reps") {
      out.reps = uniform ? filled[0] : filled;
      continue;
    }
    (out as Record<string, unknown>)[key] = uniform ? filled[0] : mean(filled);
    if (!uniform) {
      anyDetail = true;
      filled.forEach((v, i) => { details[i][key] = v; });
    }
  }
  if (anyDetail) out.setDetails = details;
  return out;
}

/** "10 / 12.5 / 15" for a field that differs per set, else the one number (undefined when none). */
export function formatPerSet(values: ExerciseValues, key: PerSetKey, format: (n: number) => string = String): string | undefined {
  const list = setRows(values, [key]).map((r) => r[key]).filter((v): v is number => v !== undefined);
  if (list.length === 0) return undefined;
  return list.every((v) => v === list[0]) ? format(list[0]) : list.map(format).join(" / ");
}
