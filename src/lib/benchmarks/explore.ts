/**
 * A test's results through a view: the filtered results as chart lines.
 *
 * Over time or against another metric, optionally one line per value of a
 * field, and optionally the best (or average) per week, month or x value
 * rather than every result. Values are in the units shown.
 */
import type { Benchmark, BenchmarkTypeDef, BenchmarkView } from "../types";
import type { WeightUnit } from "../units";
import { toUtcDayIndex } from "../dateUtils";
import { formatFieldValue, primaryField, resultValues, type ResolvedField } from "./model";
import { metricValue, metricsOf, type Bodyweight, type Metric } from "./series";
import { filterResults } from "./views";

export const MAX_LINES = 6;

export interface ExPoint {
  /** The result this point stands for (the best one of a period or x value). */
  id: string;
  /** Day index of the result. */
  day: number;
  /** Across: the day, or the x metric. */
  x: number;
  y: number;
  /** The second line's value at the same result, when asked for. */
  y2?: number;
  result: Benchmark;
  /** How many results it stands for. */
  n: number;
}

export interface ExLine {
  key: string;
  label: string;
  points: ExPoint[];
}

export interface Exploration {
  /** The results that passed the filters. */
  results: Benchmark[];
  lines: ExLine[];
  y?: Metric;
  y2?: Metric;
  /** The metric across; undefined = over time. */
  x?: Metric;
  split?: ResolvedField;
}

export interface ExploreInput {
  type: Pick<BenchmarkTypeDef, "direction" | "score">;
  fields: ResolvedField[];
  results: readonly Benchmark[];
  view: BenchmarkView;
  weight: WeightUnit;
  bodyweights: readonly Bodyweight[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Monday-based week number of a day index (day 0 was a Thursday). */
const weekOf = (day: number) => Math.floor((day + 3) / 7);

export function explore(input: ExploreInput): Exploration {
  const { type, fields, view, weight, bodyweights } = input;
  const metrics = metricsOf(type, fields, weight);
  const byId = (id: string | undefined) => (id ? metrics.find((m) => m.id === id) : undefined);
  const y = byId(view.y) ?? metrics[0];
  const x = byId(view.x);
  const split = view.splitBy ? fields.find((f) => f.valueId === view.splitBy && f.fixed === undefined) : undefined;
  const y2 = !split && !x ? byId(view.y2) : undefined;
  const results = filterResults(input.results, fields, view.filters).sort((a, b) => a.date.localeCompare(b.date));
  if (!y) return { results, lines: [] };

  const primary = primaryField(fields);
  const lowerBetter = type.direction === "lower" && y.id === primary?.valueId;
  const agg = x ? (view.agg === "each" ? "each" : "all") : view.agg === "week" || view.agg === "month" ? view.agg : "all";
  const stat = view.stat === "average" ? "average" : "best";

  // One group per split value, in a stable order; the rest lumped when there are too many.
  const groupOf = (b: Benchmark): string => {
    if (!split) return "";
    let v = resultValues(b, fields)[split.valueId];
    if ((v === undefined || v === "") && split.measure === "weight" && split.basis === "added") v = 0;
    return v === undefined || v === "" ? "" : String(typeof v === "number" ? round2(v) : v);
  };
  const groups = new Map<string, Benchmark[]>();
  for (const b of results) {
    const k = groupOf(b);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  let keys = [...groups.keys()];
  if (split) {
    keys.sort((a, b) => {
      if (a === "") return 1;
      if (b === "") return -1;
      if (split.kind === "choice") return split.options.indexOf(a) - split.options.indexOf(b);
      return Number(a) - Number(b);
    });
    // The most-used values keep their own line.
    if (keys.length > MAX_LINES) {
      const keep = new Set([...keys].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length).slice(0, MAX_LINES - 1));
      const other: Benchmark[] = [];
      for (const k of keys) if (!keep.has(k)) { other.push(...groups.get(k)!); groups.delete(k); }
      keys = keys.filter((k) => keep.has(k));
      groups.set("\u0000other", other.sort((a, b) => a.date.localeCompare(b.date)));
      keys.push("\u0000other");
    }
  }

  const labelOf = (k: string): string => {
    if (!split) return "";
    if (k === "\u0000other") return "Other";
    if (k === "") return `No ${split.label.toLowerCase()}`;
    if (split.measure === "weight" && Number(k) === 0) return `No ${split.label.toLowerCase()}`;
    return split.kind === "choice" ? k : formatFieldValue(split, Number(k), weight);
  };

  const lines: ExLine[] = keys.map((k) => {
    const raw: ExPoint[] = groups.get(k)!.flatMap((b) => {
      const yv = metricValue(y, b, fields, weight, bodyweights);
      if (yv === undefined) return [];
      const day = toUtcDayIndex(b.date);
      const xv = x ? metricValue(x, b, fields, weight, bodyweights) : day;
      if (xv === undefined) return [];
      const y2v = y2 ? metricValue(y2, b, fields, weight, bodyweights) : undefined;
      return [{ id: b.id, day, x: xv, y: yv, ...(y2v !== undefined ? { y2: y2v } : {}), result: b, n: 1 }];
    });
    return { key: k, label: labelOf(k), points: aggregate(raw, agg, stat, lowerBetter) };
  });
  return { results, lines: lines.filter((l) => l.points.length > 0 || !split), y, ...(y2 ? { y2 } : {}), ...(x ? { x } : {}), ...(split ? { split } : {}) };
}

function aggregate(points: ExPoint[], agg: "all" | "week" | "month" | "each", stat: "best" | "average", lowerBetter: boolean): ExPoint[] {
  if (agg === "all") return points; // time order already
  const bucket = (p: ExPoint): string =>
    agg === "week" ? String(weekOf(p.day)) : agg === "month" ? p.result.date.slice(0, 7) : String(round2(p.x));
  const buckets = new Map<string, ExPoint[]>();
  for (const p of points) buckets.set(bucket(p), [...(buckets.get(bucket(p)) ?? []), p]);
  const out = [...buckets.values()].map((list): ExPoint => {
    if (stat === "average") {
      const last = list[list.length - 1];
      const mean = (f: (p: ExPoint) => number) => round2(list.reduce((s, p) => s + f(p), 0) / list.length);
      const y2s = list.filter((p) => p.y2 !== undefined);
      return { ...last, y: mean((p) => p.y), ...(y2s.length ? { y2: round2(y2s.reduce((s, p) => s + p.y2!, 0) / y2s.length) } : {}), n: list.length };
    }
    const best = list.reduce((a, b) => (lowerBetter ? (b.y < a.y ? b : a) : b.y > a.y ? b : a));
    return { ...best, n: list.length };
  });
  return agg === "each" ? out.sort((a, b) => a.x - b.x) : out.sort((a, b) => a.day - b.day);
}
