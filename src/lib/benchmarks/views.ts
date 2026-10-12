/**
 * Choosing which of a test's results to look at.
 *
 * Every field of a result is recorded; nothing is split in the data. A view
 * (`BenchmarkView`) holds a filter per field - "no added weight", "10 kg or
 * more", "20 mm" - and these helpers apply them. The one built-in view,
 * "like your latest", keeps the old like-with-like behaviour as a default:
 * the fields that are usually set up beforehand (the *condition* fields)
 * must match the latest result.
 */
import type { Benchmark, BenchmarkFieldFilter, BenchmarkView } from "../types";
import type { WeightUnit } from "../units";
import { conditionFields, formatFieldValue, resultValues, toShown, unitLabel, type ResolvedField } from "./model";

export const LATEST_VIEW_ID = "latest";
export const ALL_VIEW_ID = "all";

const EPS = 1e-6;

/** Whether a value passes a filter. "none" is a value that was not logged or is 0 (no added weight). */
export function matchesFilter(filter: BenchmarkFieldFilter, value: number | string | undefined): boolean {
  switch (filter.op) {
    case "none":
      return value === undefined || value === "" || value === 0;
    case "eq":
      if (typeof filter.value === "string" || typeof value === "string") return value === filter.value;
      return value !== undefined && Math.abs(value - filter.value) < EPS;
    case "range":
      if (typeof value !== "number") return false;
      return (filter.min === undefined || value >= filter.min - EPS) && (filter.max === undefined || value <= filter.max + EPS);
  }
}

/** The results that pass every filter of the view. */
export function filterResults(results: readonly Benchmark[], fields: ResolvedField[], filters: BenchmarkView["filters"]): Benchmark[] {
  const active = Object.entries(filters ?? {});
  if (active.length === 0) return [...results];
  return results.filter((b) => {
    const values = resultValues(b, fields);
    return active.every(([id, f]) => matchesFilter(f, values[id]));
  });
}

/** The fields a view can filter: the ones that are not always the same value. */
export const filterableFields = (fields: ResolvedField[]) => fields.filter((f) => f.fixed === undefined);

/** The distinct values a field has among results, in order (numbers ascending). */
export function distinctValues(results: readonly Benchmark[], field: ResolvedField, fields: ResolvedField[]): (number | string)[] {
  const seen = new Set<number | string>();
  for (const b of results) {
    const v = resultValues(b, fields)[field.valueId];
    if (v !== undefined && v !== "") seen.add(typeof v === "number" ? Math.round(v * 100) / 100 : v);
  }
  const list = [...seen];
  if (field.kind === "choice") return list.sort((a, b) => field.options.indexOf(String(a)) - field.options.indexOf(String(b)));
  return list.sort((a, b) => Number(a) - Number(b));
}

/** The fields whose value differs between results - the ones worth filtering or splitting by. */
export function varyingFields(results: readonly Benchmark[], fields: ResolvedField[]): ResolvedField[] {
  return filterableFields(fields).filter((f) => distinctValues(results, f, fields).length > 1 || (results.some((b) => resultValues(b, fields)[f.valueId] === undefined) && distinctValues(results, f, fields).length > 0));
}

/** "Like your latest": the set-up fields (conditions) must match the latest result's - none when it had no such value. */
export function likeLatestView(fields: ResolvedField[], latest: Benchmark | undefined): BenchmarkView {
  const filters: NonNullable<BenchmarkView["filters"]> = {};
  if (latest) {
    const values = resultValues(latest, fields);
    for (const f of conditionFields(fields)) {
      if (f.fixed !== undefined) continue;
      const v = values[f.valueId];
      filters[f.valueId] = v === undefined || v === "" || v === 0 ? { op: "none" } : { op: "eq", value: v };
    }
  }
  return { id: LATEST_VIEW_ID, name: "Like your latest", ...(Object.keys(filters).length ? { filters } : {}) };
}

/** One filter in words: "20 mm", "10-20 kg", "no added weight". */
export function filterPhrase(filter: BenchmarkFieldFilter, field: ResolvedField, weight: WeightUnit): string {
  const shown = (v: number) => `${Number(toShown(field, v, weight).toFixed(2))}`;
  const unit = unitLabel(field, weight);
  switch (filter.op) {
    case "none":
      return `no ${field.label.toLowerCase()}`;
    case "eq":
      return typeof filter.value === "string" ? filter.value : formatFieldValue(field, filter.value, weight);
    case "range": {
      const { min, max } = filter;
      const u = unit ? ` ${unit}` : "";
      if (min !== undefined && max !== undefined) return `${shown(min)}-${shown(max)}${u}`;
      if (min !== undefined) return `${shown(min)}${u} or more`;
      if (max !== undefined) return `up to ${shown(max)}${u}`;
      return "any";
    }
  }
}

/** All of a view's filters in words, in the test's field order ("" when it filters nothing). */
export function filtersText(filters: BenchmarkView["filters"], fields: ResolvedField[], weight: WeightUnit): string {
  return fields
    .filter((f) => filters?.[f.valueId])
    .map((f) => filterPhrase(filters![f.valueId], f, weight))
    .join(" · ");
}

/** Whether two views show the same thing (for "unsaved changes"): name, id and Home flag aside. */
export function sameView(a: BenchmarkView, b: BenchmarkView): boolean {
  const pick = (v: BenchmarkView) => JSON.stringify([v.filters ?? {}, v.y ?? "", v.y2 ?? "", v.x ?? "", v.splitBy ?? "", v.agg ?? "all", v.stat ?? "best"].map((x) => (typeof x === "object" ? sortKeys(x) : x)));
  return pick(a) === pick(b);
}

function sortKeys<T>(o: T): T {
  if (!o || typeof o !== "object") return o;
  return Object.fromEntries(Object.entries(o as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) as T;
}
