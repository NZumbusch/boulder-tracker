import type { DailyMetricEntry, Workout } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { exerciseHistory, metricsOf, valueOf, type ProgressMetric } from "./exerciseProgress";
import { buildRecoverySeries, dailyLoadByDay, readingsByDay } from "./recoverySeries";

/**
 * What goes with your best sessions. Each logged session gets a performance
 * number (how its exercises went against your own recent usual), each day its
 * recovery picture (last night's sleep, HRV against your baseline, resting
 * heart rate, Body Battery, yesterday's stress, steps and load), and the two
 * are compared with a rank correlation. Honest about what it can't know: a
 * finding needs enough sessions, says how sure it is, and is a pattern in
 * your own data - not a cause. Pure.
 */

/** A performance below/above this is clipped, so one odd entry can't dominate. */
const PERF_CLIP = 0.5;
/** Prior sessions of an exercise needed before a session is judged against them, and how many of them make "usual". */
const MIN_PRIOR = 4;
const USUAL_OF = 6;
/** Sessions with a performance needed before anything is said. */
export const MIN_SESSIONS = 15;
/** Sessions that also have a given predictor, needed for a finding on it. */
export const MIN_PAIRS = 12;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export interface SessionPerformance {
  workoutId: string;
  day: number;
  /** Mean over the session's exercises of (value / usual - 1), clipped to ±0.5; positive = better than your usual. */
  perf: number;
  exercises: number;
}

/**
 * How each completed session went against your usual. For every exercise with
 * enough history, the session's value (heaviest weight, else longest hold,
 * else most reps) is compared with the median of its previous six sessions;
 * a session is the mean of its exercises' comparisons.
 */
export function sessionPerformances(workouts: readonly Workout[], asOf: Date): SessionPerformance[] {
  const typeIds = new Set<string>();
  for (const w of workouts) if (w.status === "completed") for (const s of w.exercises) if (s.logged && !s.test) typeIds.add(s.typeId);
  const perByWorkout = new Map<string, { day: number; values: number[] }>();
  for (const typeId of typeIds) {
    const history = exerciseHistory(workouts, typeId, asOf);
    const metric = (["weight", "timeOn", "reps"] as ProgressMetric[]).find((m) => metricsOf(history).includes(m));
    if (!metric) continue;
    const series = history.map((h) => ({ h, v: valueOf(h, metric) })).filter((x): x is { h: (typeof history)[number]; v: number } => x.v !== undefined && x.v > 0);
    for (let i = MIN_PRIOR; i < series.length; i++) {
      const usual = median(series.slice(Math.max(0, i - USUAL_OF), i).map((x) => x.v));
      if (usual <= 0) continue;
      const perf = Math.max(-PERF_CLIP, Math.min(PERF_CLIP, series[i].v / usual - 1));
      const entry = perByWorkout.get(series[i].h.workoutId) ?? { day: series[i].h.day, values: [] };
      entry.values.push(perf);
      perByWorkout.set(series[i].h.workoutId, entry);
    }
  }
  return [...perByWorkout].map(([workoutId, e]) => ({ workoutId, day: e.day, perf: mean(e.values), exercises: e.values.length })).sort((a, b) => a.day - b.day);
}

// --- Predictors --------------------------------------------------------------

export interface PredictorDef {
  id: string;
  /** How it reads in a sentence: "a high sleep score". */
  label: string;
  unit: string;
  /** The value for a session on `day`, or undefined when there is none. */
  value: (ctx: PredictorContext, day: number) => number | undefined;
}

export interface PredictorContext {
  readings: (metricId: string) => Map<number, number>;
  /** Raw % away from the 28-day baseline, per metric and day. */
  deviation: (metricId: string, day: number) => number | undefined;
  loadByDay: Map<number, number>;
  sessionDays: number[];
}

const raw = (metricId: string) => (c: PredictorContext, day: number) => c.readings(metricId).get(day);
const dev = (metricId: string, offset = 0) => (c: PredictorContext, day: number) => c.deviation(metricId, day + offset);

export const PREDICTORS: PredictorDef[] = [
  { id: "sleep-score", label: "last night's sleep score", unit: "pts", value: raw("sleep-score") },
  { id: "sleep-duration", label: "hours slept", unit: "h", value: raw("sleep-duration") },
  { id: "hrv", label: "HRV against your baseline", unit: "%", value: dev("hrv") },
  { id: "rhr", label: "resting heart rate against your baseline", unit: "%", value: dev("rhr") },
  { id: "body-battery-high", label: "Body Battery in the morning", unit: "pts", value: raw("body-battery-high") },
  { id: "stress", label: "yesterday's stress against your usual", unit: "%", value: dev("stress", -1) },
  { id: "steps", label: "yesterday's steps against your usual", unit: "%", value: dev("steps", -1) },
  { id: "load-1", label: "yesterday's training load", unit: "", value: (c, day) => c.loadByDay.get(day - 1) ?? 0 },
  { id: "load-3", label: "the last three days' training load", unit: "", value: (c, day) => (c.loadByDay.get(day - 1) ?? 0) + (c.loadByDay.get(day - 2) ?? 0) + (c.loadByDay.get(day - 3) ?? 0) },
  { id: "rest", label: "days since your last session", unit: "days", value: (c, day) => { const prev = c.sessionDays.filter((d) => d < day).pop(); return prev === undefined ? undefined : day - prev; } },
];

// --- Statistics ----------------------------------------------------------------

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k].i] = r;
    i = j + 1;
  }
  return out;
}

/** Spearman's rank correlation, or undefined when one side doesn't vary. */
export function spearman(x: number[], y: number[]): number | undefined {
  const n = x.length;
  if (n < 3 || new Set(x).size < 2 || new Set(y).size < 2) return undefined;
  const rx = ranks(x);
  const ry = ranks(y);
  const mx = mean(rx);
  const my = mean(ry);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : undefined;
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Two-sided p-value of a rank correlation (Fisher transform; fine from about ten pairs). */
export function correlationP(rho: number, n: number): number {
  if (n <= 3) return 1;
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, rho))) * Math.sqrt(n - 3);
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export interface PredictorFinding {
  id: string;
  label: string;
  unit: string;
  rho: number;
  n: number;
  p: number;
  /** "clear" below p 0.05, "hint" below 0.15. */
  confidence: "clear" | "hint";
  /** Sessions in the highest and lowest third of the predictor: their mean performance (fraction, 0.03 = 3 % above usual) and the predictor's typical value in each. */
  high: { perf: number; typical: number };
  low: { perf: number; typical: number };
}

export interface PredictorReport {
  sessions: number;
  findings: PredictorFinding[];
  /** Predictors tried with enough data and nothing to report - so "nothing stands out" can be said honestly. */
  checked: number;
}

export function predictBestSessions(workouts: readonly Workout[], dailyMetrics: DailyMetricEntry[], loadWorkouts: readonly Workout[], asOf: Date): PredictorReport {
  const perfs = sessionPerformances(workouts, asOf);
  if (perfs.length < MIN_SESSIONS) return { sessions: perfs.length, findings: [], checked: 0 };

  const firstDay = Math.min(...perfs.map((p) => p.day)) - 40;
  const lastDay = Math.max(...perfs.map((p) => p.day));
  const readingsCache = new Map<string, Map<number, number>>();
  const devCache = new Map<string, Map<number, number | undefined>>();
  const ctx: PredictorContext = {
    readings: (id) => {
      if (!readingsCache.has(id)) readingsCache.set(id, readingsByDay(dailyMetrics, id));
      return readingsCache.get(id)!;
    },
    deviation: (id, day) => {
      if (!devCache.has(id)) devCache.set(id, new Map(buildRecoverySeries(dailyMetrics, { id, higherIsBetter: true }, firstDay, lastDay + 1).map((d) => [d.day, d.deviation])));
      return devCache.get(id)!.get(day);
    },
    loadByDay: dailyLoadByDay(loadWorkouts as Workout[]),
    sessionDays: [...new Set(workouts.filter((w) => w.status === "completed" && w.date).map((w) => toUtcDayIndex(w.date!)))].sort((a, b) => a - b),
  };

  const findings: PredictorFinding[] = [];
  let checked = 0;
  for (const def of PREDICTORS) {
    const pairs = perfs.map((s) => ({ x: def.value(ctx, s.day), y: s.perf })).filter((p): p is { x: number; y: number } => p.x !== undefined && Number.isFinite(p.x));
    if (pairs.length < MIN_PAIRS) continue;
    checked++;
    const rho = spearman(pairs.map((p) => p.x), pairs.map((p) => p.y));
    if (rho === undefined) continue;
    const p = correlationP(rho, pairs.length);
    if (p >= 0.15) continue;
    const sorted = [...pairs].sort((a, b) => a.x - b.x);
    const third = Math.max(3, Math.floor(sorted.length / 3));
    const lowThird = sorted.slice(0, third);
    const highThird = sorted.slice(-third);
    findings.push({
      id: def.id, label: def.label, unit: def.unit, rho, n: pairs.length, p, confidence: p < 0.05 ? "clear" : "hint",
      high: { perf: mean(highThird.map((q) => q.y)), typical: median(highThird.map((q) => q.x)) },
      low: { perf: mean(lowThird.map((q) => q.y)), typical: median(lowThird.map((q) => q.x)) },
    });
  }
  findings.sort((a, b) => a.p - b.p);
  return { sessions: perfs.length, findings, checked };
}

const pct = (f: number) => `${f >= 0 ? "+" : "−"}${Math.abs(Math.round(f * 100))} %`;
const num = (v: number, unit: string) => `${Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Math.round(v * 10) / 10}${unit ? ` ${unit}` : ""}`;

/** One finding in a sentence: "Sessions after a high sleep score (about 88 pts) ran +4 % against your usual, after a low one (about 60 pts) −3 % - 31 sessions, fairly clear." */
export function describeFinding(f: PredictorFinding): string {
  const better = f.rho > 0 ? f.high : f.low;
  const worse = f.rho > 0 ? f.low : f.high;
  const word = f.rho > 0 ? ["high", "low"] : ["low", "high"];
  return `With ${word[0]} ${f.label} (about ${num(better.typical, f.unit)}) your sessions ran ${pct(better.perf)} against your usual; with ${word[1]} (about ${num(worse.typical, f.unit)}) ${pct(worse.perf)}. ${f.n} sessions, ${f.confidence === "clear" ? "a fairly clear pattern" : "only a hint"}.`;
}
