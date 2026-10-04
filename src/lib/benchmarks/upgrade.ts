/**
 * The 3.33 -> 3.34 step: benchmark tests get fields.
 *
 * Before, a test was a name and a unit, so "what was varied" lived in the
 * name ("Max Hang 20mm", "Max Hang 15mm") and nothing could compare one
 * result with another. Now a test lists the value types it records
 * (`BenchmarkField`) and a result keeps all of them (`Benchmark.values`),
 * while `value` stays the primary result, so everything that read the old
 * shape still reads it.
 *
 * What it does, smartly and the same on every device (sync upgrades an old
 * device's data with this same code, so the outcome must not depend on
 * who runs it):
 * - every test gets fields from its unit: kg/lb -> Weight, reps -> Reps,
 *   s/min -> Time, anything else -> a value type of that unit; pounds and
 *   minutes are converted (weight is stored in kg, time in seconds);
 * - the known tests get their natural conditions: a one-rep max fixes
 *   reps at 1, max pull-ups can carry an added weight;
 * - tests that differ only by an edge in mm ("Max Hang 20mm" and "... 15mm",
 *   two or more of them) become one test with an Edge depth condition, and
 *   their results are moved over with the edge filled in;
 * - nothing is deleted: every result stays, with its value.
 * Idempotent: a test that already has fields is left alone.
 */
import type { Benchmark, BenchmarkField, BenchmarkTypeDef, ValueDef } from "../types";
import { newDefId } from "../exercise/valueDefs";

type Key = "weight" | "reps" | "time" | "edge";

/** The value types that ship for benchmark tests (frozen here: a migration must not change when the app's defaults do). */
export const BENCHMARK_VALUE_DEFS: Record<Key, ValueDef> = {
  weight: { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight", builtIn: true, uses: ["benchmark"] },
  reps: { id: "reps", name: "Reps", unit: "reps", kind: "number", measure: "reps", builtIn: true, uses: ["benchmark"] },
  time: { id: "time", name: "Time", unit: "s", kind: "number", measure: "time", builtIn: true, uses: ["benchmark"] },
  edge: { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length", builtIn: true, uses: ["benchmark"] },
};

/** The four that came with value types, for data old enough to have no table yet. */
const ORIGINAL_VALUE_DEFS: ValueDef[] = [
  { id: "elevation", name: "Height / elevation", unit: "m", kind: "number", builtIn: true },
  { id: "speed", name: "Speed", unit: "km/h", kind: "number", builtIn: true },
  { id: "heartRate", name: "Heart rate", unit: "bpm", kind: "number", builtIn: true },
  { id: "count", name: "Count", unit: "", kind: "number", builtIn: true },
];

/** The folders the shipped tests are listed under (by their old ids, and the merged hang). */
const KNOWN_GROUPS: Record<string, string> = {
  "max-hang": "Fingers", "max-hang-20": "Fingers", "max-hang-15": "Fingers", "max-hang-10": "Fingers",
  "1rm-weighted-pullup": "Pulling", "max-pullups": "Pulling",
  "1rm-weighted-dip": "Pushing",
  "lsit-duration": "Core", "front-lever-duration": "Core",
};

const LB = 0.45359237;

/** What a unit written by hand means. */
export function measureOfUnit(unit: string): { key: Key; factor: number; unit: string } | null {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  if (["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"].includes(u)) return { key: "weight", factor: 1, unit: "kg" };
  if (["lb", "lbs", "pound", "pounds"].includes(u)) return { key: "weight", factor: LB, unit: "kg" };
  if (["rep", "reps", "x"].includes(u)) return { key: "reps", factor: 1, unit: "reps" };
  if (["s", "sec", "secs", "second", "seconds"].includes(u)) return { key: "time", factor: 1, unit: "s" };
  if (["min", "mins", "minute", "minutes"].includes(u)) return { key: "time", factor: 60, unit: "s" };
  return null;
}

/** "Max Hang 20mm", "Max hang - 15 mm", "Max Hang (10mm)" -> the base name and the edge. */
export function splitEdgeName(name: string): { base: string; edge: number } | null {
  const m = name.trim().match(/^(.*?)[\s\-–—_:,]*\(?\s*(\d+(?:[.,]\d+)?)\s*mm\s*\)?$/i);
  if (!m) return null;
  const base = m[1].trim();
  const edge = Number(m[2].replace(",", "."));
  return base && Number.isFinite(edge) && edge > 0 ? { base, edge } : null;
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "test";

interface Defs {
  list: ValueDef[];
  id: Record<Key, string>;
}

/** The benchmark value types present, added where missing; a user's own number type with the same id is used as it is. */
function ensureDefs(valueDefs: ValueDef[] | undefined): Defs {
  const list = (valueDefs ?? structuredClone(ORIGINAL_VALUE_DEFS)).map((d) => ({ ...d }));
  const id = {} as Record<Key, string>;
  for (const key of Object.keys(BENCHMARK_VALUE_DEFS) as Key[]) {
    const wanted = BENCHMARK_VALUE_DEFS[key];
    const existing = list.find((d) => d.id === wanted.id);
    if (existing && existing.kind === "number") {
      existing.measure ??= wanted.measure;
      id[key] = existing.id;
    } else if (existing) {
      const fresh = { ...wanted, id: newDefId(wanted.name, list.map((d) => d.id)) };
      list.push(fresh);
      id[key] = fresh.id;
    } else {
      list.push({ ...wanted });
      id[key] = wanted.id;
    }
  }
  return { list, id };
}

/** The value type for a unit with no known meaning: one with that unit if there is one, else a new one. */
function customDefFor(unit: string, defs: Defs): string {
  const u = unit.trim();
  const found = defs.list.find((d) => d.kind === "number" && !d.measure && (d.unit ?? "").trim().toLowerCase() === u.toLowerCase() && d.name.toLowerCase().startsWith("result"));
  if (found) return found.id;
  const name = u ? `Result (${u})` : "Result";
  const def: ValueDef = { id: newDefId(name, defs.list.map((d) => d.id)), name, unit: u, kind: "number" };
  defs.list.push(def);
  return def.id;
}

interface Plan {
  type: BenchmarkTypeDef;
  /** Multiplier from the old value to the new one (pounds -> kg). */
  factor: number;
  /** The result field's value type. */
  resultId: string;
  /** Values every result of this test gets besides the primary one. */
  extra: Record<string, number | string>;
}

function planFor(type: BenchmarkTypeDef, defs: Defs): Plan {
  const m = measureOfUnit(type.unit);
  const resultId = m ? defs.id[m.key] : customDefFor(type.unit, defs);
  const unit = m ? m.unit : type.unit;
  const result: BenchmarkField = { valueId: resultId, role: "result" };
  const fields: BenchmarkField[] = [result];
  const extra: Record<string, number | string> = {};

  // The tests that ship have natural conditions; recognised by their id, so a rename does not lose them.
  if (m?.key === "weight" && (type.id === "1rm-weighted-pullup" || type.id === "1rm-weighted-dip")) {
    result.label = "Added weight";
    fields.push({ valueId: defs.id.reps, role: "condition", fixed: 1 });
    extra[defs.id.reps] = 1;
  } else if (m?.key === "reps" && type.id === "max-pullups") {
    fields.push({ valueId: defs.id.weight, role: "condition", label: "Added weight" });
  }
  const group = type.group ?? KNOWN_GROUPS[type.id];
  return { type: { ...type, unit, fields, ...(group ? { group } : {}) }, factor: m?.factor ?? 1, resultId, extra };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function upgradeBenchmarks(input: { types: BenchmarkTypeDef[]; results: Benchmark[]; valueDefs?: ValueDef[] }): {
  types: BenchmarkTypeDef[];
  results: Benchmark[];
  valueDefs: ValueDef[];
} {
  const defs = ensureDefs(input.valueDefs);
  const todo = input.types.filter((t) => !t.fields);
  const plans = new Map(todo.map((t) => [t.id, planFor(t, defs)]));

  // Tests that differ only by an edge in mm, two or more with the same unit.
  const groups = new Map<string, { base: string; members: { type: BenchmarkTypeDef; edge: number }[] }>();
  for (const t of todo) {
    const split = splitEdgeName(t.name);
    if (!split) continue;
    const key = `${split.base.toLowerCase()}|${t.unit.trim().toLowerCase()}`;
    const g = groups.get(key) ?? { base: split.base, members: [] };
    g.members.push({ type: t, edge: split.edge });
    groups.set(key, g);
  }
  const merged = new Map<string, { id: string; name: string; edge: number }>(); // old id -> merged test
  const mergedTypes = new Map<string, BenchmarkTypeDef>(); // first member's id -> the merged test
  const dropped = new Set<string>();
  const taken = new Set(input.types.map((t) => t.id));
  for (const { base, members } of groups.values()) {
    if (members.length < 2) continue;
    const ids = members.map((m) => m.type.id).sort();
    const wanted = slug(base);
    const id = !taken.has(wanted) || ids.includes(wanted) ? wanted : ids[0];
    taken.add(id);
    const first = plans.get(members[0].type.id)!;
    // A hang is weight added to the body.
    const resultField: BenchmarkField = { ...first.type.fields![0], ...(first.type.fields![0].valueId === defs.id.weight ? { label: "Added weight" } : {}) };
    const type: BenchmarkTypeDef = {
      ...first.type,
      id,
      name: base,
      archived: members.every((m) => m.type.archived) ? true : undefined,
      fields: [{ valueId: defs.id.edge, role: "condition" }, resultField],
      mergedFrom: ids.filter((i) => i !== id),
    };
    if (type.archived === undefined) delete type.archived;
    mergedTypes.set(members[0].type.id, type);
    for (const m of members) {
      merged.set(m.type.id, { id, name: base, edge: m.edge });
      if (m.type.id !== members[0].type.id) dropped.add(m.type.id);
    }
  }

  const types: BenchmarkTypeDef[] = [];
  for (const t of input.types) {
    if (dropped.has(t.id)) continue;
    types.push(mergedTypes.get(t.id) ?? plans.get(t.id)?.type ?? t);
  }

  const results = input.results.map((r) => {
    const plan = plans.get(r.typeId);
    if (!plan) return r;
    const into = merged.get(r.typeId);
    const value = round(r.value * plan.factor);
    const out: Benchmark = { ...r, value, unit: plan.type.unit };
    if (!r.values) {
      out.values = { [plan.resultId]: value, ...plan.extra, ...(into ? { [defs.id.edge]: into.edge } : {}) };
    }
    if (into) {
      out.typeId = into.id;
      out.type = into.name;
    }
    return out;
  });

  return { types, results, valueDefs: defs.list };
}
