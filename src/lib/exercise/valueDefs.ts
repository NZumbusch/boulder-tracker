/**
 * Custom value types (`ValueDef`): naming, labelling, usage and removal.
 *
 * Their values live in `ExerciseValues.custom[defId]`, the exercise types
 * that track them list `v:<defId>` among their parameters. Deleting a def
 * has to reach every place a slot can live (sessions, phase templates,
 * week plans, circuits, undo snapshots), so removal walks the data rather
 * than knowing its shape.
 */
import { PARAMETER_LABELS } from "../constants";
import type { CustomParameter, ParameterBlock, ValueDef } from "../types";

export const customParam = (id: string): CustomParameter => `v:${id}`;
export const isCustomParam = (p: string): p is CustomParameter => p.startsWith("v:") && p.length > 2;
export const customIdOf = (p: CustomParameter): string => p.slice(2);

/** What a parameter is called: the built-in label, or the def's name (an unknown def reads as its id). */
export function paramLabel(param: ParameterBlock, defs: readonly ValueDef[]): string {
  if (!isCustomParam(param)) return PARAMETER_LABELS[param];
  const id = customIdOf(param);
  return defs.find((d) => d.id === id)?.name ?? id;
}

/** Whether a value type is offered for exercises or for benchmark tests (unset = both). */
export function usableFor(def: Pick<ValueDef, "uses">, kind: "exercise" | "benchmark"): boolean {
  return !def.uses || def.uses.includes(kind);
}

/** The benchmark tests (and how many results) that record a value type. */
export function benchmarkUsage(defId: string, types: readonly { fields?: { valueId: string }[] }[], results: readonly { values?: Record<string, unknown> }[]): { tests: number; values: number } {
  return {
    tests: types.filter((t) => t.fields?.some((f) => f.valueId === defId)).length,
    values: results.filter((r) => r.values && defId in r.values).length,
  };
}

/** A fresh id for `name`: lowercase letters/digits in camelCase, unique among `taken`. */
export function newDefId(name: string, taken: Iterable<string>): string {
  const words = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const base = words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join("") || "value";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

/** One stored value as text: "120 m", "Fast", or "" when there is none. */
export function formatCustomValue(def: ValueDef, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (def.kind === "number" && typeof value === "number") return def.unit ? `${value} ${def.unit}` : String(value);
  return String(value);
}

/** The name is free, the unit short and the pick-list non-empty: the problems with a def as drafted, if any. */
export function defProblem(def: Pick<ValueDef, "name" | "kind" | "unit" | "options">, otherNames: Iterable<string>): string | null {
  const name = def.name.trim();
  if (!name) return "Give it a name.";
  if ([...otherNames].some((n) => n.trim().toLowerCase() === name.toLowerCase())) return "Another value already has this name.";
  if (def.kind === "choice" && cleanOptions(def.options).length < 2) return "A pick-list needs at least two options.";
  return null;
}

/** Trimmed, de-duplicated (case-insensitively), blanks dropped. */
export function cleanOptions(options: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options ?? []) {
    const o = raw.trim();
    if (o && !seen.has(o.toLowerCase())) {
      seen.add(o.toLowerCase());
      out.push(o);
    }
  }
  return out;
}

// --- Usage and removal ------------------------------------------------------

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const PARAM_LISTS = new Set(["parameters", "possibleParameters", "activeParameters"]);

/**
 * Everything that still refers to the def: slots holding a value for it,
 * and exercise types / slots tracking it. `workouts` counts sessions, not slots.
 */
export interface DefUsage {
  values: number;
  workouts: number;
  trackedBy: number;
}

export function defUsage(defId: string, data: { workouts: unknown; exerciseTypes: unknown }): DefUsage {
  const param = customParam(defId);
  let values = 0;
  let workouts = 0;
  for (const w of Array.isArray(data.workouts) ? data.workouts : []) {
    const before = values;
    walk(w, (node) => {
      if (isObject(node.custom) && defId in node.custom) values++;
    });
    if (values > before) workouts++;
  }
  const trackedBy = (Array.isArray(data.exerciseTypes) ? data.exerciseTypes : []).filter(
    (t) => isObject(t) && [t.parameters, t.possibleParameters].some((l) => Array.isArray(l) && l.includes(param)),
  ).length;
  return { values, workouts, trackedBy };
}

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
  } else if (isObject(node)) {
    visit(node);
    for (const v of Object.values(node)) if (typeof v === "object" && v !== null) walk(v, visit);
  }
}

/**
 * Removes a def's values and every `v:<id>` from parameter lists, in place,
 * anywhere in `root` (an array, a table, or a whole database). Returns how
 * many values it removed. A `custom` object left empty goes too.
 */
export function scrubValueDef(root: unknown, defId: string): number {
  const param = customParam(defId);
  let removed = 0;
  walk(root, (node) => {
    if (isObject(node.custom) && defId in node.custom) {
      delete node.custom[defId];
      removed++;
      if (Object.keys(node.custom).length === 0) delete node.custom;
    }
    for (const key of PARAM_LISTS) {
      const list = node[key];
      if (Array.isArray(list) && list.includes(param)) node[key] = list.filter((p) => p !== param);
    }
  });
  return removed;
}
