/**
 * Benchmark results as series and metrics.
 *
 * A *series* is one test done one way - "Max Hang at 20 mm" - so results are
 * only compared like with like. A *metric* is a number read from a result:
 * any of its fields, or a score formed from several (an estimated one-rep
 * max from weight and reps, a load as % of bodyweight). Charts pick a
 * series and one or two metrics; "reps against weight" is two metrics of
 * one series plotted against each other.
 *
 * Values here are in the units shown (weights in the chosen unit), so the
 * charts need no conversion.
 */
import type { Benchmark, BenchmarkScore, BenchmarkTypeDef, ValueDef } from "../types";
import type { WeightUnit } from "../units";
import type { DailyMetricEntry } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { loggedMetrics } from "../analytics/metricValues";
import { BODYWEIGHT_METRIC_ID } from "../constants";
import {
  conditionKey, conditionsText, formatFieldValue, primaryField, resolveFields, resultValues, toShown, unitLabel, type ResolvedField,
} from "./model";

/** A bodyweight counts for a result this many days either side of it. */
export const BODYWEIGHT_WINDOW_DAYS = 14;

export interface Series {
  /** `typeId` and the conditions - unique per test and way of doing it. */
  key: string;
  type: BenchmarkTypeDef;
  fields: ResolvedField[];
  /** "20 mm" - empty for a test with no varying conditions. */
  conditions: string;
  /** "Max Hang · 20 mm". */
  label: string;
  /** Oldest first. */
  results: Benchmark[];
}

/** Every test's results grouped by the conditions they were done under; the one tested most recently first. Archived tests are left out; results of a deleted test form a plain one. */
export function buildSeries(benchmarks: readonly Benchmark[], types: readonly BenchmarkTypeDef[], defs: readonly ValueDef[], weight: WeightUnit): Series[] {
  const byKey = new Map<string, Series>();
  for (const b of benchmarks) {
    // A result whose test was deleted still counts, as a plain test of its own name and unit.
    const type = types.find((t) => t.id === b.typeId) ?? { id: b.typeId || b.type, name: b.type, unit: b.unit };
    if (type.archived) continue;
    const fields = resolveFields(type, defs);
    const key = `${type.id}|${conditionKey(b, fields)}`;
    let s = byKey.get(key);
    if (!s) {
      const conditions = conditionsText(b, fields, weight);
      s = { key, type, fields, conditions, label: conditions ? `${type.name} · ${conditions}` : type.name, results: [] };
      byKey.set(key, s);
    }
    s.results.push(b);
  }
  const all = [...byKey.values()];
  for (const s of all) s.results.sort((a, b) => a.date.localeCompare(b.date));
  return all.sort((a, b) => b.results[b.results.length - 1].date.localeCompare(a.results[a.results.length - 1].date));
}

// --- Metrics ---------------------------------------------------------------

export interface Metric {
  /** A field's value-type id, or "estimatedMax" / "relative". */
  id: string;
  label: string;
  /** As shown ("kg", "lb", "reps", "% BW"). */
  unit: string;
  field?: ResolvedField;
}

export interface Bodyweight {
  day: number;
  /** kg */
  value: number;
}

/** The weight and the reps of a result, where the test has both. */
function weightAndReps(fields: ResolvedField[], values: Record<string, number | string>): { weight: number; reps: number; field: ResolvedField } | undefined {
  const w = fields.find((f) => f.measure === "weight");
  if (!w) return undefined;
  const r = fields.find((f) => f.measure === "reps");
  const weight = values[w.valueId];
  const reps = r ? values[r.valueId] : 1;
  return typeof weight === "number" && typeof reps === "number" ? { weight, reps, field: w } : undefined;
}

/** What can be charted for a test: its numeric fields, and the scores its fields allow. The test's own choice comes first. */
export function metricsOf(type: Pick<BenchmarkTypeDef, "score">, fields: ResolvedField[], weight: WeightUnit): Metric[] {
  const primary = primaryField(fields);
  const out: Metric[] = fields
    .filter((f) => f.kind === "number" && f.fixed === undefined)
    .map((f) => ({ id: f.valueId, label: f.label, unit: unitLabel(f, weight), field: f }));
  if (fields.some((f) => f.measure === "weight") && fields.some((f) => f.measure === "reps")) {
    out.push({ id: "estimatedMax", label: "Estimated max", unit: weight });
  }
  if (primary?.measure === "weight") out.push({ id: "relative", label: "% of bodyweight", unit: "% BW" });
  const wanted = type.score && type.score !== "raw" ? type.score : primary?.valueId;
  const first = out.findIndex((m) => m.id === wanted);
  if (first > 0) out.unshift(...out.splice(first, 1));
  return out;
}

/** The logged bodyweights, for the % of bodyweight score. */
export function bodyweightsOf(dailyMetrics: readonly DailyMetricEntry[]): Bodyweight[] {
  return loggedMetrics([...dailyMetrics])
    .filter((m) => m.metricId === BODYWEIGHT_METRIC_ID)
    .map((m) => ({ day: toUtcDayIndex(m.date), value: m.value }));
}

/** The nearest logged bodyweight within `BODYWEIGHT_WINDOW_DAYS` of a day. */
export function bodyweightNear(day: number, weights: readonly Bodyweight[]): number | undefined {
  let best: Bodyweight | undefined;
  for (const w of weights) {
    if (Math.abs(w.day - day) > BODYWEIGHT_WINDOW_DAYS) continue;
    if (!best || Math.abs(w.day - day) < Math.abs(best.day - day)) best = w;
  }
  return best?.value;
}

/** One metric of one result, in shown units - or nothing when the result lacks what it needs. */
export function metricValue(metric: Metric, b: Benchmark, fields: ResolvedField[], weight: WeightUnit, bodyweights: readonly Bodyweight[]): number | undefined {
  const values = resultValues(b, fields);
  if (metric.field) {
    const v = values[metric.field.valueId];
    return typeof v === "number" ? Math.round(toShown(metric.field, v, weight) * 100) / 100 : undefined;
  }
  if (metric.id === "estimatedMax") {
    const wr = weightAndReps(fields, values);
    return wr ? Math.round(toShown(wr.field, wr.weight * (1 + wr.reps / 30), weight) * 10) / 10 : undefined;
  }
  if (metric.id === "relative") {
    const primary = primaryField(fields);
    const v = primary ? values[primary.valueId] : undefined;
    const bw = bodyweightNear(toUtcDayIndex(b.date), bodyweights);
    if (typeof v !== "number" || bw === undefined) return undefined;
    const total = primary!.basis === "total" ? v : bw + v;
    return Math.round((total / bw) * 1000) / 10;
  }
  return undefined;
}

export interface MetricPoint {
  id: string;
  day: number;
  value: number;
  result: Benchmark;
}

export function metricPoints(metric: Metric, series: Series, weight: WeightUnit, bodyweights: readonly Bodyweight[]): MetricPoint[] {
  return series.results.flatMap((b) => {
    const value = metricValue(metric, b, series.fields, weight, bodyweights);
    return value === undefined ? [] : [{ id: b.id, day: toUtcDayIndex(b.date), value, result: b }];
  });
}

/** Whether a change is an improvement: more is better unless the test says lower is. */
export function isImprovement(delta: number, type: Pick<BenchmarkTypeDef, "direction">): boolean | undefined {
  if (delta === 0) return undefined;
  return type.direction === "lower" ? delta < 0 : delta > 0;
}

/** The score a test charts by default (its own choice, else the primary result as logged). */
export function defaultMetric(series: Series, weight: WeightUnit): Metric | undefined {
  return metricsOf(series.type, series.fields, weight)[0];
}

export type { BenchmarkScore };

/** A series' result as text for lists: the primary result in the shown unit. */
export function primaryText(b: Benchmark, series: Series, weight: WeightUnit): string {
  const p = primaryField(series.fields);
  return p ? formatFieldValue(p, b.value, weight) : `${b.value} ${b.unit}`.trim();
}
