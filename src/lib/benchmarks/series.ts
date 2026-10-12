/**
 * Benchmark results as tracked series and metrics.
 *
 * A *series* is one test seen one way - "Max Hang at 20 mm" - so the number
 * followed on Home, in the overview and in Insights compares like with like.
 * The way is a view (`BenchmarkView`): each saved view marked for Home is a
 * series, and a test with none follows "like your latest" (the set-up fields
 * match the latest result's). The chart in Analytics explores all results
 * through any view instead (`explore.ts`).
 *
 * A *metric* is a number read from a result: any of its fields, or a score
 * formed from several (an estimated one-rep max from weight and reps, a load
 * as % of bodyweight).
 *
 * Values here are in the units shown (weights in the chosen unit), so the
 * charts need no conversion.
 */
import type { Benchmark, BenchmarkScore, BenchmarkTypeDef, BenchmarkView, ValueDef } from "../types";
import type { WeightUnit } from "../units";
import type { DailyMetricEntry } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { loggedMetrics } from "../analytics/metricValues";
import { BODYWEIGHT_METRIC_ID } from "../constants";
import {
  formatFieldValue, primaryField, resolveFields, resultValues, toShown, unitLabel, conditionsText, type ResolvedField,
} from "./model";
import { filterResults, likeLatestView } from "./views";

/** A bodyweight counts for a result this many days either side of it. */
export const BODYWEIGHT_WINDOW_DAYS = 14;

export interface Series {
  /** `typeId` and the view - unique per tracked series. */
  key: string;
  type: BenchmarkTypeDef;
  fields: ResolvedField[];
  /** The way it is seen, in words ("20 mm"); empty when nothing is filtered. */
  conditions: string;
  /** "Max Hang · 20 mm". */
  label: string;
  /** The results that pass the view, oldest first. */
  results: Benchmark[];
  /** The view that makes this series (its metric is followed). */
  view?: BenchmarkView;
}

/** Every test's tracked series; the one tested most recently first. Archived tests are left out; results of a deleted test form a plain one. */
export function buildSeries(benchmarks: readonly Benchmark[], types: readonly BenchmarkTypeDef[], defs: readonly ValueDef[], weight: WeightUnit): Series[] {
  const byType = new Map<string, Benchmark[]>();
  for (const b of benchmarks) {
    const key = types.some((t) => t.id === b.typeId) ? b.typeId : b.typeId || b.type;
    byType.set(key, [...(byType.get(key) ?? []), b]);
  }
  const out: Series[] = [];
  for (const [id, all] of byType) {
    // A result whose test was deleted still counts, as a plain test of its own name and unit.
    const first = all[0];
    const type = types.find((t) => t.id === id) ?? { id, name: first.type, unit: first.unit };
    if (type.archived) continue;
    const fields = resolveFields(type, defs);
    const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const marked = (type.views ?? []).filter((v) => v.onHome);
    const views = marked.length > 0 ? marked : [likeLatestView(fields, latest)];
    for (const view of views) {
      const results = filterResults(sorted, fields, view.filters);
      if (results.length === 0) continue;
      const implicit = marked.length === 0;
      const conditions = implicit ? conditionsText(latest, fields, weight) : view.name;
      out.push({
        key: `${type.id}|${view.id}`,
        type, fields, conditions, view,
        label: conditions ? `${type.name} · ${conditions}` : type.name,
        results,
      });
    }
  }
  return out.sort((a, b) => b.results[b.results.length - 1].date.localeCompare(a.results[a.results.length - 1].date));
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
    let v = values[metric.field.valueId];
    // An added weight left blank is no added weight (pull-ups with just bodyweight), so it plots at 0.
    if (v === undefined && metric.field.measure === "weight" && metric.field.basis === "added") v = 0;
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
  const metrics = metricsOf(series.type, series.fields, weight);
  return metrics.find((m) => m.id === series.view?.y) ?? metrics[0];
}

export type { BenchmarkScore };

/** A series' result as text for lists: the primary result in the shown unit. */
export function primaryText(b: Benchmark, series: Series, weight: WeightUnit): string {
  const p = primaryField(series.fields);
  return p ? formatFieldValue(p, b.value, weight) : `${b.value} ${b.unit}`.trim();
}
