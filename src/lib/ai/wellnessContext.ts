import type { DailyMetricEntry, ExternalActivity } from "../types";
import { weekIdOfIso, weekDayIsos, addDaysIso, localIsoDate, getWeekId, decrementWeekId } from "../dateUtils";
import { loggedMetrics } from "../analytics/metricValues";
import { BODYWEIGHT_METRIC_ID } from "../constants";
import type { AIDetail, AIFields, AIRecoveryDetail, AIOtherTrainingDetail } from "../preferences/migrate";
import { DEFAULT_AI_DETAIL, DEFAULT_AI_FIELDS } from "../preferences/migrate";
import { activityDigest, digestLegend } from "./activityDigest";
import { DEFAULT_EXTERNAL_LOAD, effortKindOf, estimateMaxHr, externalLoad, type ExternalLoadConfig } from "../activity/externalLoad";

/**
 * What the coach is told about recovery and about training that isn't
 * climbing, each at a level of detail you choose (Settings -> What the AI
 * sees): enough to reason with, nothing that is only noise. Values are
 * rounded, a metric with no data is left out, and a quiet week is one short
 * line. Pure.
 */

export type RecoveryDetail = AIRecoveryDetail;
export type OtherTrainingDetail = AIOtherTrainingDetail;
export type { AIDetail };
export const DEFAULT_AI_DETAIL_VALUES = DEFAULT_AI_DETAIL;
export const AI_RECOVERY_DETAILS: { value: RecoveryDetail; label: string; hint: string }[] = [
  { value: "brief", label: "Brief", hint: "Last night, your 7- and 28-day averages and what is off" },
  { value: "standard", label: "Standard", hint: "Brief plus one line per week" },
  { value: "full", label: "Full", hint: "Standard plus every day of the last two weeks" },
];
export const AI_OTHER_DETAILS: { value: OtherTrainingDetail; label: string; hint: string }[] = [
  { value: "summary", label: "Summary", hint: "One line per week: how many, hours, load, what kinds" },
  { value: "list", label: "Every activity", hint: "Summary plus each activity in the recent weeks" },
];

// --- Recovery ------------------------------------------------------------------

const KEYS: Record<string, { key: string; digits: number }> = {
  "sleep-score": { key: "sleepScore", digits: 0 },
  "sleep-duration": { key: "sleepHours", digits: 1 },
  hrv: { key: "hrv", digits: 0 },
  rhr: { key: "restingHr", digits: 0 },
  stress: { key: "stress", digits: 0 },
  "body-battery-high": { key: "bodyBatteryHigh", digits: 0 },
  "body-battery-low": { key: "bodyBatteryLow", digits: 0 },
  steps: { key: "steps", digits: 0 },
  "breathing-sleep": { key: "breathingAsleep", digits: 1 },
  [BODYWEIGHT_METRIC_ID]: { key: "weightKg", digits: 1 },
  vo2max: { key: "vo2max", digits: 1 },
  "sleep-deep": { key: "deepSleepMin", digits: 0 },
  "sleep-rem": { key: "remSleepMin", digits: 0 },
};

/** The metrics that each switch adds; the others are always in. */
const FIELD_OF_METRIC: Record<string, keyof AIFields> = { vo2max: "vo2max", "sleep-deep": "sleepStages", "sleep-rem": "sleepStages" };

type Row = Record<string, number>;

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Per-day values: date -> metric key -> value. */
function byDate(entries: DailyMetricEntry[], fields: AIFields = DEFAULT_AI_FIELDS): Map<string, Row> {
  const days = new Map<string, Row>();
  for (const e of loggedMetrics(entries)) {
    const k = KEYS[e.metricId];
    if (!k) continue;
    const gate = FIELD_OF_METRIC[e.metricId];
    if (gate && !fields[gate]) continue;
    const row = days.get(e.date) ?? {};
    row[k.key] = e.value;
    days.set(e.date, row);
  }
  return days;
}

/** The mean of each metric over the days from `from` to `to`, rounded; metrics with no reading in the span are left out. */
function averages(days: Map<string, Row>, from: string, to: string): Row {
  const sums = new Map<string, number[]>();
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const row = days.get(d);
    if (!row) continue;
    for (const [k, v] of Object.entries(row)) sums.set(k, [...(sums.get(k) ?? []), v]);
  }
  const out: Row = {};
  for (const [id, { key, digits }] of Object.entries(KEYS)) {
    void id;
    const v = sums.get(key);
    if (v?.length) out[key] = round(mean(v), digits);
  }
  return out;
}

const rounded = (row: Row): Row => {
  const out: Row = {};
  for (const { key, digits } of Object.values(KEYS)) if (row[key] !== undefined) out[key] = round(row[key], digits);
  return out;
};

/** A row of values with its label (`date` or `week`) - JSON for the prompt. */
type Out = Record<string, number | string>;

export interface RecoveryContext {
  /** What this is, for the model. */
  about: string;
  lastNight?: Out;
  average7Days?: Row;
  average28Days?: Row;
  /** What is off, in words. */
  flags?: string[];
  /** One row per week, newest last (standard and full). */
  weekly?: Out[];
  /** One row per day for the last two weeks (full). */
  daily?: Out[];
}

const ABOUT = "Daily recovery data from my watch and my own entries (sleep score 0-100, hours asleep, deep and REM sleep minutes, overnight HRV in ms, resting heart rate, daily average stress 0-100, Body Battery highest/lowest of the day 0-100, steps, breathing rate asleep, running VO2max, weight). Missing values were not recorded.";

export function buildRecoveryContext(entries: DailyMetricEntry[], asOf: Date, detail: RecoveryDetail, weeks = 8, fields: AIFields = DEFAULT_AI_FIELDS): RecoveryContext | undefined {
  const days = byDate(entries, fields);
  if (days.size === 0) return undefined;
  const today = localIsoDate(asOf);
  const out: RecoveryContext = { about: ABOUT };

  // The latest day with a sleep or HRV reading in the last three days.
  let latest: string | undefined;
  for (let d = today, i = 0; i < 4; d = addDaysIso(d, -1), i++) {
    const r = days.get(d);
    if (r && (r.sleepScore !== undefined || r.hrv !== undefined || r.sleepHours !== undefined)) { latest = d; break; }
  }
  const avg28 = averages(days, addDaysIso(today, -27), today);
  const avg7 = averages(days, addDaysIso(today, -6), today);
  if (latest) {
    const row = rounded(days.get(latest)!);
    const hrvBase = averages(days, addDaysIso(latest, -28), addDaysIso(latest, -1)).hrv;
    out.lastNight = { date: latest, ...row, ...(row.hrv !== undefined && hrvBase ? { hrvVsBaselinePct: round(((row.hrv - hrvBase) / hrvBase) * 100, 0) } : {}) };
  }
  if (Object.keys(avg7).length) out.average7Days = avg7;
  if (Object.keys(avg28).length) out.average28Days = avg28;

  // What is off: a short, factual list.
  const flags: string[] = [];
  const last7 = Array.from({ length: 7 }, (_, i) => days.get(addDaysIso(today, -i))).filter((r): r is Row => !!r);
  if (avg28.hrv) {
    const below = last7.filter((r) => r.hrv !== undefined && r.hrv < avg28.hrv * 0.9).length;
    const withHrv = last7.filter((r) => r.hrv !== undefined).length;
    if (below >= 2) flags.push(`HRV was more than 10 % below your 28-day average on ${below} of the last ${withHrv} mornings with a reading`);
  }
  if (avg7.sleepScore !== undefined && avg28.sleepScore !== undefined && avg7.sleepScore <= avg28.sleepScore - 6) flags.push(`sleep score is down to ${avg7.sleepScore} this week from ${avg28.sleepScore} over 28 days`);
  if (avg7.restingHr !== undefined && avg28.restingHr !== undefined && avg7.restingHr >= avg28.restingHr + 3) flags.push(`resting heart rate is up to ${avg7.restingHr} this week from ${avg28.restingHr}`);
  if (avg7.stress !== undefined && avg28.stress !== undefined && avg7.stress >= avg28.stress + 8) flags.push(`stress is up to ${avg7.stress} this week from ${avg28.stress}`);
  if (flags.length) out.flags = flags;

  if (detail !== "brief" && weeks > 0) {
    const rows: Out[] = [];
    let week = getWeekId(asOf);
    for (let i = 0; i < Math.min(weeks, 26); i++) {
      const dates = weekDayIsos(week);
      const avg = averages(days, dates[0], dates[6]);
      if (Object.keys(avg).length) rows.unshift({ week, ...avg });
      week = decrementWeekId(week);
    }
    if (rows.length) out.weekly = rows;
  }
  if (detail === "full") {
    const daily: Out[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDaysIso(today, -i);
      const r = days.get(d);
      if (r) daily.push({ date: d, ...rounded(r) });
    }
    if (daily.length) out.daily = daily;
  }
  return out;
}

// --- Other training --------------------------------------------------------------

export interface OtherTrainingContext {
  about: string;
  /** One line per week, newest last. */
  weekly: { week: string; activities: number; hours: number; load: number; kinds: Record<string, number> }[];
  /** Each activity in the recent weeks (list detail). */
  activities?: ({ date: string; type: string; minutes: number; km?: number; avgHr?: number; load: number } & Record<string, string | number>)[];
}

/** The most activities one prompt lists in full; the weekly lines cover the rest. */
const MAX_LISTED = 40;

const OTHER_ABOUT = "Training that is not climbing, recorded on my watch or in Strava/Garmin (runs, rides, walks, workouts). 'load' is on the same scale as my climbing sessions' load (minutes x effort^1.2), so the two can be added.";

/**
 * `fullWeeks` and `summaryWeeks` are the history window: weekly lines cover
 * both; the activity list (when asked) covers the full weeks only. Activities
 * that count for nothing (effort set to 0) are left out.
 */
export function buildOtherTrainingContext(
  activities: ExternalActivity[],
  asOf: Date,
  detail: OtherTrainingDetail,
  window: { fullWeeks: number; summaryWeeks: number },
  config: ExternalLoadConfig = DEFAULT_EXTERNAL_LOAD,
  fields: AIFields = DEFAULT_AI_FIELDS,
): OtherTrainingContext | undefined {
  if (activities.length === 0) return undefined;
  const maxHr = estimateMaxHr(activities);
  const totalWeeks = Math.max(1, window.fullWeeks + window.summaryWeeks);
  const weeks: string[] = [];
  let w = getWeekId(asOf);
  for (let i = 0; i < totalWeeks; i++) {
    weeks.unshift(w);
    w = decrementWeekId(w);
  }
  const inWindow = new Set(weeks);
  const fullSet = new Set(weeks.slice(-Math.max(1, window.fullWeeks)));
  const counted = activities.map((a) => ({ a, load: externalLoad(a, config, maxHr) })).filter((x) => x.load > 0 && inWindow.has(weekIdOfIso(x.a.date)));
  if (counted.length === 0) return undefined;

  const weekly = weeks.map((week) => {
    const mine = counted.filter((x) => weekIdOfIso(x.a.date) === week);
    const kinds: Record<string, number> = {};
    for (const x of mine) kinds[effortKindOf(x.a.type)] = (kinds[effortKindOf(x.a.type)] ?? 0) + 1;
    return {
      week,
      activities: mine.length,
      hours: round(mine.reduce((s, x) => s + (x.a.movingSec || x.a.durationSec), 0) / 3600, 1),
      load: mine.reduce((s, x) => s + x.load, 0),
      kinds,
    };
  });
  const out: OtherTrainingContext = { about: OTHER_ABOUT, weekly: weekly.filter((x, i) => x.activities > 0 || i >= weekly.length - 2) };
  if (detail === "list") {
    out.activities = counted
      .filter((x) => fullSet.has(weekIdOfIso(x.a.date)))
      .sort((a, b) => a.a.start.localeCompare(b.a.start))
      .slice(-MAX_LISTED)
      .map(({ a, load }) => ({
        date: a.date,
        type: a.type,
        minutes: Math.round((a.movingSec || a.durationSec) / 60),
        ...(a.distanceM ? { km: round(a.distanceM / 1000, 1) } : {}),
        ...(a.avgHr ? { avgHr: a.avgHr } : {}),
        load,
        ...activityDigest(a, fields, maxHr),
      }));
    const present = new Set(out.activities.flatMap((x) => Object.keys(x)));
    out.about += digestLegend(present);
  }
  return out;
}
