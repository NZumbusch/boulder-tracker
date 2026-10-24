import type { DailyMetricEntry, ExternalActivity, Workout } from "../types";
import { getWeekId, decrementWeekId, weekDayIsos, addDaysIso } from "../dateUtils";
import { loggedMetrics } from "./metricValues";
import { BODYWEIGHT_METRIC_ID } from "../constants";
import { DEFAULT_EXTERNAL_LOAD, effortKindOf, estimateMaxHr, externalLoad, type ExternalLoadConfig } from "../activity/externalLoad";

/**
 * One week in a few plain lines: climbing, other training, sleep, HRV,
 * resting heart rate and weight, each against the week before, and - only
 * where the numbers make a clear case - one remark about what the week
 * means for the next. Descriptive, like the readiness text: it says what
 * happened, and leaves the decision to you. Pure.
 */

export interface WeekTotals {
  sessions: number;
  hours: number;
  load: number;
}

export interface WeeklyReview {
  weekId: string;
  climbing: WeekTotals;
  other: WeekTotals & { kinds: Record<string, number> };
  /** Total load (climbing + other) against the previous week, as a fraction; undefined without a previous week's load. */
  loadChange?: number;
  /** Metric averages for the week, and the previous week's. */
  metrics: Record<string, { avg: number; prev?: number }>;
  /** HRV against the 28 days before the week, as a fraction. */
  hrvVsBaseline?: number;
  lines: string[];
  remark?: string;
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined);

function metricAverages(entries: DailyMetricEntry[], weekId: string): Record<string, number> {
  const dates = new Set(weekDayIsos(weekId));
  const sums = new Map<string, number[]>();
  for (const e of loggedMetrics(entries)) if (dates.has(e.date)) sums.set(e.metricId, [...(sums.get(e.metricId) ?? []), e.value]);
  const out: Record<string, number> = {};
  for (const [id, v] of sums) out[id] = avg(v)!;
  return out;
}

export interface WeeklyReviewInput {
  workouts: Workout[];
  activities: ExternalActivity[];
  dailyMetrics: DailyMetricEntry[];
  loadConfig?: ExternalLoadConfig;
  /** Fraction below baseline that counts as a dip (0.1 = 10 %). */
  hrvDip?: number;
}

function totals(i: WeeklyReviewInput, weekId: string, maxHr: number, config: ExternalLoadConfig) {
  const done = i.workouts.filter((w) => w.status === "completed" && w.weekId === weekId);
  const climbing: WeekTotals = { sessions: done.length, hours: round(done.reduce((s, w) => s + (w.actualDuration ?? 0), 0) / 60), load: done.reduce((s, w) => s + (w.loadFactor || 0), 0) };
  const dates = new Set(weekDayIsos(weekId));
  const mine = i.activities.filter((a) => dates.has(a.date));
  const kinds: Record<string, number> = {};
  let load = 0;
  let seconds = 0;
  let count = 0;
  for (const a of mine) {
    const l = externalLoad(a, config, maxHr);
    if (l <= 0) continue;
    count++;
    load += l;
    seconds += a.movingSec || a.durationSec;
    kinds[effortKindOf(a.type)] = (kinds[effortKindOf(a.type)] ?? 0) + 1;
  }
  return { climbing, other: { sessions: count, hours: round(seconds / 3600), load, kinds } };
}

const signed = (v: number, digits = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(round(v, digits))}`;
const pct = (f: number) => `${Math.abs(Math.round(f * 100))} %`;
const KIND_WORDS: Record<string, [string, string]> = { run: ["run", "runs"], ride: ["ride", "rides"], walk: ["walk", "walks"], hike: ["hike", "hikes"], swim: ["swim", "swims"], ski: ["ski day", "ski days"], strength: ["weight session", "weight sessions"], workout: ["workout", "workouts"], climb: ["watch-recorded climb", "watch-recorded climbs"], other: ["other", "other"] };

export function weeklyReview(weekId: string, i: WeeklyReviewInput): WeeklyReview {
  const config = i.loadConfig ?? DEFAULT_EXTERNAL_LOAD;
  const maxHr = estimateMaxHr(i.activities);
  const cur = totals(i, weekId, maxHr, config);
  const prevWeek = decrementWeekId(weekId);
  const prev = totals(i, prevWeek, maxHr, config);
  const totalLoad = cur.climbing.load + (config.enabled ? cur.other.load : 0);
  const prevLoad = prev.climbing.load + (config.enabled ? prev.other.load : 0);
  const loadChange = prevLoad > 0 ? totalLoad / prevLoad - 1 : undefined;

  const now = metricAverages(i.dailyMetrics, weekId);
  const before = metricAverages(i.dailyMetrics, prevWeek);
  const metrics: WeeklyReview["metrics"] = {};
  for (const [id, v] of Object.entries(now)) metrics[id] = { avg: v, ...(before[id] !== undefined ? { prev: before[id] } : {}) };

  // HRV against the four weeks before this one.
  const start = weekDayIsos(weekId)[0];
  const baseDates = new Set(Array.from({ length: 28 }, (_, k) => addDaysIso(start, -1 - k)));
  const baseHrv = avg(loggedMetrics(i.dailyMetrics).filter((e) => e.metricId === "hrv" && baseDates.has(e.date)).map((e) => e.value));
  const hrvVsBaseline = metrics.hrv && baseHrv ? metrics.hrv.avg / baseHrv - 1 : undefined;

  const lines: string[] = [];
  if (cur.climbing.sessions || cur.other.sessions) {
    if (cur.climbing.sessions) lines.push(`Climbing: ${cur.climbing.sessions} session${cur.climbing.sessions === 1 ? "" : "s"}${cur.climbing.hours ? `, ${cur.climbing.hours} h` : ""}, load ${cur.climbing.load.toLocaleString()}.`);
    if (cur.other.sessions && config.enabled) {
      const kinds = Object.entries(cur.other.kinds).map(([k, n]) => `${n} ${KIND_WORDS[k]?.[n === 1 ? 0 : 1] ?? k}`).join(", ");
      lines.push(`Other training: ${cur.other.sessions} activit${cur.other.sessions === 1 ? "y" : "ies"} (${kinds}), ${cur.other.hours} h, load ${cur.other.load.toLocaleString()}.`);
    }
    if (loadChange !== undefined) lines.push(`Total load ${totalLoad.toLocaleString()}, ${signed(loadChange * 100)} % on the week before.`);
  } else {
    lines.push("No training logged this week.");
  }
  const cmp = (id: string, label: string, unit: string, digits = 0) => {
    const m = metrics[id];
    if (!m) return;
    lines.push(`${label}: ${round(m.avg, digits)}${unit}${m.prev !== undefined ? ` (${signed(m.avg - m.prev, digits)} on the week before)` : ""}.`);
  };
  cmp("sleep-score", "Sleep score", "");
  cmp("sleep-duration", "Sleep", " h a night", 1);
  if (metrics.hrv) lines.push(`HRV: ${Math.round(metrics.hrv.avg)} ms${hrvVsBaseline !== undefined ? `, ${pct(hrvVsBaseline)} ${hrvVsBaseline < 0 ? "below" : "above"} your usual` : ""}${metrics.hrv.prev !== undefined ? ` (${signed(metrics.hrv.avg - metrics.hrv.prev)} on the week before)` : ""}.`);
  cmp("rhr", "Resting heart rate", " bpm");
  cmp(BODYWEIGHT_METRIC_ID, "Weight", " kg", 1);

  // One remark, only when load and recovery clearly point the same way.
  const dip = i.hrvDip ?? 0.1;
  const sleepDown = metrics["sleep-score"]?.prev !== undefined && metrics["sleep-score"].avg <= metrics["sleep-score"].prev - 5;
  const hrvLow = hrvVsBaseline !== undefined && hrvVsBaseline <= -dip;
  const hrvGood = hrvVsBaseline !== undefined && hrvVsBaseline >= 0;
  const sleepGood = metrics["sleep-score"] !== undefined && metrics["sleep-score"].avg >= 78 && !sleepDown;
  let remark: string | undefined;
  if (loadChange !== undefined && loadChange >= 0.25 && (hrvLow || sleepDown)) remark = `Load rose ${pct(loadChange)} while ${hrvLow ? "HRV sat below your usual" : "sleep slipped"} - a lighter week next would give recovery room to catch up.`;
  else if (loadChange !== undefined && loadChange <= -0.25 && hrvGood && sleepGood) remark = `A lighter week (${pct(loadChange)} less load) and recovery looks good - there is room to build again.`;
  else if (loadChange === undefined || Math.abs(loadChange) < 0.25) {
    if (hrvLow && sleepDown) remark = "HRV and sleep both slipped this week without a jump in load - worth a look at what else was going on.";
  }

  return { weekId, climbing: cur.climbing, other: cur.other, ...(loadChange !== undefined ? { loadChange } : {}), metrics, ...(hrvVsBaseline !== undefined ? { hrvVsBaseline } : {}), lines, ...(remark ? { remark } : {}) };
}

/** The reviews of the last `weeks` finished weeks (not the current one), oldest first. */
export function recentReviews(asOf: Date, weeks: number, i: WeeklyReviewInput): WeeklyReview[] {
  const out: WeeklyReview[] = [];
  let w = decrementWeekId(getWeekId(asOf));
  for (let k = 0; k < weeks; k++) {
    out.unshift(weeklyReview(w, i));
    w = decrementWeekId(w);
  }
  return out;
}
