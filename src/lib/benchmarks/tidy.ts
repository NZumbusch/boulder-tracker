import type { Benchmark, BenchmarkField, BenchmarkTypeDef, BenchmarkView, ValueDef } from "../types";
import { resolveFields } from "./model";
import { isWeighInType } from "./bodyweight";

/**
 * A guided tidy-up of the tests: the leftovers of how tests used to be
 * kept (one test per edge depth, conditions only in
 * the name) turned into proposals the athlete ticks. Nothing here writes
 * anything - `proposeTidy` reads, `applyTidy` returns the new lists.
 */

export type TidyProposal =
  | {
      id: string;
      kind: "merge";
      label: string;
      detail: string;
      defaultOn: boolean;
      fromId: string;
      intoId: string;
      /** Condition fields the target gains from the test it absorbs. */
      addFields: BenchmarkField[];
      /** Conditions read out of an old result's name ("Max Hang 20mm 7s") that its values lack. */
      fill: { resultId: string; values: Record<string, number | string> }[];
      moves: number;
    }
  | {
      id: string;
      kind: "combine";
      label: string;
      detail: string;
      defaultOn: boolean;
      /** The weighted single ("1RM Weighted Pullup") - its results move over as one rep at their weight, and it is archived. */
      fromId: string;
      /** The reps test ("Max Pullups") - gains an added-weight set-up field and a view for each of the two. */
      intoId: string;
      weightField: BenchmarkField;
      weightId: string;
      repsId: string;
      /** The reps a single is: its fixed value. */
      singleReps: number;
      views: BenchmarkView[];
      moves: number;
    }
  | { id: string; kind: "archive"; label: string; detail: string; defaultOn: boolean; typeIds: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const compact = (s: string) => norm(s).replace(/ /g, "");

/** Tests that are the same one kept twice: one's id extends the other's ("max-hang-20" beside "max-hang"), or the names agree. */
function isSameTest(a: BenchmarkTypeDef, b: BenchmarkTypeDef, defs: readonly ValueDef[]): boolean {
  const ra = resolveFields(a, defs).find((f) => f.role === "result");
  const rb = resolveFields(b, defs).find((f) => f.role === "result");
  if (!ra || !rb || ra.valueId !== rb.valueId || a.unit !== b.unit) return false;
  return a.id.startsWith(`${b.id}-`) || b.id.startsWith(`${a.id}-`) || compact(a.name) === compact(b.name);
}

/** The lift a test's name is about: "Max Pullups" and "1RM Weighted Pullup" are both "pullup". */
const STEM_NOISE = new Set(["1rm", "max", "weighted", "weight", "test", "one", "rep", "reps"]);
export const liftStem = (name: string): string =>
  norm(name).split(" ").filter((w) => w && !STEM_NOISE.has(w)).join(" ").replace(/s$/, "");

/** A test of how many reps, with no weight field: "Max Pullups". */
function repsOnly(t: BenchmarkTypeDef, defs: readonly ValueDef[]) {
  const fields = resolveFields(t, defs);
  const results = fields.filter((f) => f.role === "result");
  if (results.length !== 1 || results[0].measure !== "reps" || fields.some((f) => f.measure === "weight")) return undefined;
  return results[0];
}

/** A test of the heaviest single: a weight result with the reps fixed at 1 or more: "1RM Weighted Pullup". */
function weightedSingle(t: BenchmarkTypeDef, defs: readonly ValueDef[]) {
  const fields = resolveFields(t, defs);
  const results = fields.filter((f) => f.role === "result");
  const reps = fields.find((f) => f.measure === "reps" && typeof f.fixed === "number");
  if (results.length !== 1 || results[0].measure !== "weight" || !reps) return undefined;
  return { weight: results[0], reps: reps.valueId, singleReps: reps.fixed as number };
}

/** "Max Hang 20mm 7s" -> { length: 20, time: 7 }: what a legacy result's name said about how it was done. */
export function conditionsFromLabel(label: string): { length?: number; time?: number } {
  const out: { length?: number; time?: number } = {};
  const mm = label.match(/(\d+(?:[.,]\d+)?)\s*mm\b/i);
  if (mm) out.length = Number(mm[1].replace(",", "."));
  const sec = label.match(/(?:^|[\s(,])(\d+(?:[.,]\d+)?)\s*s(?:ec(?:onds?)?)?\b/i);
  if (sec) out.time = Number(sec[1].replace(",", "."));
  return out;
}

export function proposeTidy(types: readonly BenchmarkTypeDef[], benchmarks: readonly Benchmark[], defs: readonly ValueDef[]): TidyProposal[] {
  const out: TidyProposal[] = [];
  const active = types.filter((t) => !t.archived);
  const count = (id: string) => benchmarks.filter((b) => b.typeId === id).length;
  const handled = new Set<string>();

  // 1. The same test kept twice.
  for (const a of active) {
    for (const b of active) {
      if (a.id >= b.id || handled.has(a.id) || handled.has(b.id) || !isSameTest(a, b, defs)) continue;
      // Into the general one: the shorter id; a tie goes to the one with more results.
      const [into, from] = a.id.length !== b.id.length ? (a.id.length < b.id.length ? [a, b] : [b, a]) : count(a.id) >= count(b.id) ? [a, b] : [b, a];
      const intoFields = resolveFields(into, defs);
      const fromFields = resolveFields(from, defs);
      const addFields: BenchmarkField[] = (from.fields ?? [])
        .filter((f) => f.role === "condition" && !intoFields.some((t) => t.valueId === f.valueId))
        .map((f) => ({ ...f }));
      const target = [...intoFields, ...addFields.map((f) => ({ valueId: f.valueId }))];
      const fill: { resultId: string; values: Record<string, number | string> }[] = [];
      for (const r of benchmarks.filter((x) => x.typeId === from.id)) {
        const hints = conditionsFromLabel(r.type);
        const values: Record<string, number | string> = {};
        for (const f of fromFields.concat(intoFields)) {
          if (f.role !== "condition" || f.fixed !== undefined || r.values?.[f.valueId] !== undefined || values[f.valueId] !== undefined) continue;
          if (!target.some((t) => t.valueId === f.valueId)) continue;
          if (f.measure === "length" && hints.length !== undefined) values[f.valueId] = hints.length;
          else if (f.measure === "time" && hints.time !== undefined) values[f.valueId] = hints.time;
        }
        if (Object.keys(values).length) fill.push({ resultId: r.id, values });
      }
      const moves = count(from.id);
      const parts = [`${moves} result${moves === 1 ? " moves" : "s move"} over`];
      if (addFields.length) parts.push(`${into.name} gains ${addFields.map((f) => resolveFields({ unit: "", fields: [f] }, defs)[0].label.toLowerCase()).join(" and ")}`);
      if (fill.length) parts.push("conditions in the old names are filled in");
      out.push({ id: `merge-${from.id}-${into.id}`, kind: "merge", label: `Merge ${from.name} into ${into.name}`, detail: `They are the same test. ${parts.join("; ")}.`, defaultOn: true, fromId: from.id, intoId: into.id, addFields, fill, moves });
      handled.add(from.id);
      handled.add(into.id);
    }
  }

  // 1b. The same lift kept as a max-reps test and a heaviest-single test: one test, with the weight as a set-up and a view for each.
  for (const reps of active) {
    const r = repsOnly(reps, defs);
    if (!r || handled.has(reps.id) || isWeighInType(reps, defs)) continue;
    const single = active.find((t) => t.id !== reps.id && !handled.has(t.id) && liftStem(t.name) !== "" && liftStem(t.name) === liftStem(reps.name) && weightedSingle(t, defs)?.reps === r.valueId);
    if (!single) continue;
    const w = weightedSingle(single, defs)!;
    const weightField: BenchmarkField = { valueId: w.weight.valueId, role: "condition", label: "Added weight", ...(w.weight.basis === "total" ? { basis: "total" as const } : {}) };
    const moves = count(single.id);
    const views: BenchmarkView[] = [
      { id: `combine-${single.id}-reps`, name: "Max reps, no weight", filters: { [weightField.valueId]: { op: "none" } }, y: r.valueId, onHome: true },
      { id: `combine-${single.id}-single`, name: w.singleReps === 1 ? "Heaviest single" : `Heaviest for ${w.singleReps} reps`, filters: { [w.reps]: { op: "eq", value: w.singleReps } }, y: w.weight.valueId, onHome: true },
    ];
    out.push({
      id: `combine-${single.id}-${reps.id}`,
      kind: "combine",
      label: `Combine ${reps.name} and ${single.name}`,
      detail: `Both are the same lift. ${reps.name} gains an added weight, ${moves} result${moves === 1 ? "" : "s"} of ${single.name} move over as ${w.singleReps} rep${w.singleReps === 1 ? "" : "s"} at their weight, and ${single.name} is archived. Home keeps both rows (max reps, heaviest single) and the chart can plot reps against weight across all of it.`,
      defaultOn: true,
      fromId: single.id,
      intoId: reps.id,
      weightField,
      weightId: weightField.valueId,
      repsId: r.valueId,
      singleReps: w.singleReps,
      views,
      moves,
    });
    handled.add(reps.id);
    handled.add(single.id);
  }

  // 2. A bodyweight "test" is handled apart: `planWeighInMigration` turns its results into daily readings.

  // 3. Tests that never got a result, as one proposal: off by default.
  const unused = active.filter((t) => !handled.has(t.id) && !isWeighInType(t, defs) && !out.some((p) => p.kind === "archive" && p.typeIds.includes(t.id)) && count(t.id) === 0);
  if (unused.length > 0) {
    out.push({
      id: "archive-unused",
      kind: "archive",
      typeIds: unused.map((t) => t.id),
      label: `Archive ${unused.length === 1 ? unused[0].name : `${unused.length} tests you have never done`}`,
      detail: `${unused.length === 1 ? "Never done" : unused.map((t) => t.name).join(", ")}. Archived tests stay out of the way, and the AI won't consider them, until you restore one.`,
      defaultOn: false,
    });
  }
  return out;
}

export interface TidyResult { types: BenchmarkTypeDef[]; benchmarks: Benchmark[] }

/** The lists after the chosen proposals; benchmarks returned are only the ones that changed. */
export function applyTidy(chosen: readonly TidyProposal[], types: readonly BenchmarkTypeDef[], benchmarks: readonly Benchmark[]): TidyResult {
  let nextTypes = types.map((t) => ({ ...t }));
  const changed = new Map<string, Benchmark>();
  for (const p of chosen) {
    if (p.kind === "archive") {
      nextTypes = nextTypes.map((t) => (p.typeIds.includes(t.id) ? { ...t, archived: true } : t));
      continue;
    }
    if (p.kind === "combine") {
      const into = nextTypes.find((t) => t.id === p.intoId);
      if (!into) continue;
      const fields = [...(into.fields ?? [{ valueId: p.repsId, role: "result" as const }])];
      if (!fields.some((f) => f.valueId === p.weightId)) fields.push({ ...p.weightField });
      // The weighted single stays as an archived test: a session still planned with it keeps resolving.
      nextTypes = nextTypes.map((t) => {
        if (t.id === p.fromId) return { ...t, archived: true };
        if (t.id !== p.intoId) return t;
        const views = [...(t.views ?? [])];
        for (const v of p.views) if (!views.some((x) => x.id === v.id)) views.push({ ...v, ...(v.filters ? { filters: { ...v.filters } } : {}) });
        return { ...t, fields, views, mergedFrom: [...new Set([...(t.mergedFrom ?? []), p.fromId])] };
      });
      for (const r of benchmarks) {
        if (r.typeId !== p.fromId) continue;
        const weightKg = typeof r.values?.[p.weightId] === "number" ? (r.values![p.weightId] as number) : r.value;
        changed.set(r.id, { ...r, typeId: p.intoId, type: into.name, unit: into.unit, value: p.singleReps, values: { ...(r.values ?? {}), [p.repsId]: p.singleReps, [p.weightId]: weightKg } });
      }
      continue;
    }
    const into = nextTypes.find((t) => t.id === p.intoId);
    if (!into) continue;
    const fields = [...(into.fields ?? [])];
    for (const f of p.addFields) if (!fields.some((x) => x.valueId === f.valueId)) fields.push({ ...f });
    nextTypes = nextTypes
      .filter((t) => t.id !== p.fromId)
      .map((t) => (t.id === p.intoId ? { ...t, ...(fields.length ? { fields } : {}), mergedFrom: [...new Set([...(t.mergedFrom ?? []), p.fromId])] } : t));
    for (const r of benchmarks) {
      if (r.typeId !== p.fromId) continue;
      const fill = p.fill.find((f) => f.resultId === r.id)?.values;
      changed.set(r.id, { ...r, typeId: p.intoId, type: into.name, unit: into.unit, values: { ...(r.values ?? { [resolveFields(into, []).find((f) => f.role === "result")?.valueId ?? "result"]: r.value }), ...(fill ?? {}) } });
    }
  }
  return { types: nextTypes, benchmarks: [...changed.values()] };
}
