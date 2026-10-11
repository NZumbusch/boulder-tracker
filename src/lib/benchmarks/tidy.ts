import type { Benchmark, BenchmarkField, BenchmarkTypeDef, ValueDef } from "../types";
import { resolveFields } from "./model";

/**
 * A guided tidy-up of the tests: the leftovers of how tests used to be
 * kept (one test per edge depth, a bodyweight "test", conditions only in
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

  // 2. A bodyweight "test": the daily bodyweight already covers it.
  for (const t of active) {
    if (handled.has(t.id)) continue;
    const fields = resolveFields(t, defs);
    if (/^(body ?weight|weight)$/i.test(t.name.trim()) && fields.length === 1 && fields[0].measure === "weight") {
      const n = count(t.id);
      out.push({ id: `archive-${t.id}`, kind: "archive", typeIds: [t.id], label: `Stop testing ${t.name}`, detail: `Your daily bodyweight (Home → Metrics) covers it${n ? `; the ${n} result${n === 1 ? "" : "s"} stay in history` : ""}.`, defaultOn: true });
    }
  }

  // 3. Tests that never got a result, as one proposal: off by default.
  const unused = active.filter((t) => !handled.has(t.id) && !out.some((p) => p.kind === "archive" && p.typeIds.includes(t.id)) && count(t.id) === 0);
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
