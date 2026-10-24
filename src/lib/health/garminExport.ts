import { BODYWEIGHT_METRIC_ID, NAP_DURATION_METRIC, SLEEP_DURATION_METRIC, BODY_BATTERY_HIGH_METRIC, BODY_BATTERY_LOW_METRIC, BREATHING_METRIC, STEPS_METRIC, STRESS_METRIC, VO2MAX_METRIC, SLEEP_DEEP_METRIC, SLEEP_REM_METRIC } from "../constants";
import { RHR_METRIC_ID, type DailyValue } from "./import";
import type { ActivityStats } from "../types";

/**
 * A Garmin data export (garmin.com → Account → Data management → Export your
 * data) → one value per metric per day. Pure: it takes the parsed JSON of the
 * export's files; `importers/activityFiles.ts` finds and reads them.
 *
 * Where each value comes from (`DI_CONNECT/...`):
 *  - `DI-Connect-Aggregator/UDSFile_*.json`: daily summaries - resting heart
 *    rate, steps, average stress, Body Battery high and low;
 *  - `DI-Connect-Wellness/*_sleepData.json`: sleep score, hours asleep, naps,
 *    breathing rate asleep;
 *  - HRV: the HRV-status FIT files in `DI-Connect-Uploaded-Files` (565 nights
 *    in the export this was written against), then `*_healthStatusData.json`
 *    for any night they miss;
 *  - `DI-Connect-Metrics/MetricsMaxMetData_*.json`: VO2max (running);
 *  - `DI-Connect-Wellness/*_userBioMetrics.json`: weight.
 * A sleep belongs to the day it ends on (Garmin's `calendarDate`), as in the
 * Health Connect import. A value of zero or less is "not measured" and is
 * dropped. Garmin's field names are from a real export; fields that are
 * missing are skipped, never guessed.
 */

type Json = Record<string, any>;

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const day = (v: unknown): string | undefined => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);

function push(out: DailyValue[], metricId: string, date: string | undefined, value: number | undefined, digits = 0) {
  if (!date || value === undefined || !(value > 0)) return;
  out.push({ metricId, date, value: round(value, digits) });
}

/** UDSFile: one object per day. */
export function parseDailySummaries(days: Json[]): DailyValue[] {
  const out: DailyValue[] = [];
  for (const d of days) {
    const date = day(d.calendarDate);
    push(out, RHR_METRIC_ID, date, num(d.restingHeartRate));
    push(out, STEPS_METRIC.id, date, num(d.totalSteps));
    const total = (d.allDayStress?.aggregatorList as Json[] | undefined)?.find((a) => a.type === "TOTAL");
    push(out, STRESS_METRIC.id, date, num(total?.averageStressLevel)); // -1 = no reading
    const stats = (d.bodyBattery?.bodyBatteryStatList as Json[] | undefined) ?? [];
    push(out, BODY_BATTERY_HIGH_METRIC.id, date, num(stats.find((s) => s.bodyBatteryStatType === "HIGHEST")?.statsValue));
    push(out, BODY_BATTERY_LOW_METRIC.id, date, num(stats.find((s) => s.bodyBatteryStatType === "LOWEST")?.statsValue));
  }
  return out;
}

/** `*_sleepData.json`: one object per night (some entries have only `retro` and no night). */
export function parseSleep(nights: Json[]): DailyValue[] {
  const out: DailyValue[] = [];
  for (const n of nights) {
    const date = day(n.calendarDate);
    if (!date) continue;
    push(out, "sleep-score", date, num(n.sleepScores?.overallScore));
    const asleep = (num(n.deepSleepSeconds) ?? 0) + (num(n.lightSleepSeconds) ?? 0) + (num(n.remSleepSeconds) ?? 0);
    push(out, SLEEP_DURATION_METRIC.id, date, asleep / 3600, 1);
    const naps = ((n.napList as Json[] | undefined) ?? []).reduce((s, x) => s + (num(x.napTimeSec) ?? 0), 0);
    push(out, NAP_DURATION_METRIC.id, date, naps / 3600, 1);
    push(out, BREATHING_METRIC.id, date, num(n.averageRespiration), 1);
    push(out, SLEEP_DEEP_METRIC.id, date, (num(n.deepSleepSeconds) ?? 0) / 60);
    push(out, SLEEP_REM_METRIC.id, date, (num(n.remSleepSeconds) ?? 0) / 60);
  }
  return out;
}

/** `*_healthStatusData.json`: per day, a list of metrics; HRV is the overnight average. */
export function parseHealthStatusHrv(days: Json[]): DailyValue[] {
  const out: DailyValue[] = [];
  for (const d of days) {
    const hrv = (d.metrics as Json[] | undefined)?.find((m) => m.type === "HRV");
    push(out, "hrv", day(d.calendarDate), num(hrv?.value));
  }
  return out;
}

/** HRV-status FIT nights (`readFitHrv`) → daily values, on the UTC day of the status message (which matched Garmin's own `calendarDate` on 298 of 299 nights). */
export function hrvFromFit(nights: { t: number; lastNight: number }[]): DailyValue[] {
  const out: DailyValue[] = [];
  for (const n of nights) push(out, "hrv", new Date(n.t).toISOString().slice(0, 10), n.lastNight, 0);
  return out;
}

/** `MetricsMaxMetData_*.json`: VO2max per day and sport; running only. */
export function parseMaxMet(rows: Json[]): DailyValue[] {
  const out: DailyValue[] = [];
  for (const r of rows) if (r.sport === "RUNNING") push(out, VO2MAX_METRIC.id, day(r.calendarDate), num(r.vo2MaxValue), 1);
  return out;
}

/** `*_userBioMetrics.json`: entries with a weight in grams and a time; the last of a day stands. */
export function parseWeights(entries: Json[]): DailyValue[] {
  const byDay = new Map<string, { t: string; kg: number }>();
  for (const e of entries) {
    const grams = num(e.weight?.weight);
    const t = typeof e.weight?.timestampGMT === "string" ? e.weight.timestampGMT : undefined;
    const date = day(t);
    if (!date || !t || grams === undefined || grams <= 0) continue;
    const prev = byDay.get(date);
    if (!prev || t > prev.t) byDay.set(date, { t, kg: grams / 1000 });
  }
  const out: DailyValue[] = [];
  for (const [date, w] of byDay) push(out, BODYWEIGHT_METRIC_ID, date, w.kg, 1);
  return out;
}

/** Several sources for the same value: the earlier list wins per metric and day. */
export function firstWins(...lists: DailyValue[][]): DailyValue[] {
  const seen = new Set<string>();
  const out: DailyValue[] = [];
  for (const list of lists) {
    for (const v of list) {
      const key = `${v.metricId}|${v.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

export interface GarminDailySources {
  summaries: Json[];
  sleep: Json[];
  healthStatus: Json[];
  maxMet: Json[];
  bio: Json[];
  /** HRV from the HRV-status FIT files. */
  fitHrv: { t: number; lastNight: number }[];
}

export function garminDailyValues(s: GarminDailySources): DailyValue[] {
  return firstWins(hrvFromFit(s.fitHrv), parseHealthStatusHrv(s.healthStatus), parseDailySummaries(s.summaries), parseSleep(s.sleep), parseMaxMet(s.maxMet), parseWeights(s.bio));
}

/** Per metric: how many days and from when to when - for the preview. */
export function describeValues(values: DailyValue[]): { metricId: string; days: number; from: string; to: string }[] {
  const by = new Map<string, string[]>();
  for (const v of values) by.set(v.metricId, [...(by.get(v.metricId) ?? []), v.date]);
  return [...by].map(([metricId, dates]) => {
    const sorted = [...dates].sort();
    return { metricId, days: dates.length, from: sorted[0], to: sorted[sorted.length - 1] };
  });
}

// --- Activities --------------------------------------------------------------

const GARMIN_TYPES: Record<string, string> = {
  running: "Run", trail_running: "Trail Run", treadmill_running: "Run", cycling: "Ride", indoor_cycling: "Ride", mountain_biking: "Ride", gravel_cycling: "Ride",
  walking: "Walk", hiking: "Hike", strength_training: "Weight Training", indoor_cardio: "Workout", hiit: "Workout", cardio: "Workout", yoga: "Yoga",
  open_water_swimming: "Swim", lap_swimming: "Swim", resort_skiing: "Alpine Ski", resort_skiing_snowboarding: "Alpine Ski", rock_climbing: "Rock Climbing", bouldering: "Rock Climbing", indoor_climbing: "Rock Climbing",
};

/** "running" → "Run"; an unknown type reads as its own words ("badminton" → "Badminton"). */
export function garminTypeName(type: string | undefined): string {
  if (!type) return "Activity";
  return GARMIN_TYPES[type] ?? type.split("_").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

export interface GarminActivitySummary {
  startMs: number;
  name?: string;
  type: string;
  durationSec?: number;
  movingSec?: number;
  distanceM?: number;
  elevationM?: number;
  avgHr?: number;
  maxHr?: number;
  calories?: number;
  /** Where Garmin says it happened ("Bern"), for the note. */
  place?: string;
  activityId?: number;
  /** What Garmin made of it, as the export has it: a label, zone times, how it felt, Body Battery, cadence. See `statsOfSummary`. */
  stats?: ActivityStats;
}

const EFFECT_LABELS: Record<string, string> = { AEROBIC_BASE: "aerobic base", ANAEROBIC_CAPACITY: "anaerobic capacity", TEMPO: "tempo", SPEED: "speed", RECOVERY: "recovery", THRESHOLD: "threshold", VO2MAX: "VO2max", LACTATE_THRESHOLD: "threshold", AEROBIC_HIGH_SHORTAGE: "aerobic high", ANAEROBIC_CAPACITY_SHORTAGE: "anaerobic capacity" };

/**
 * The parts of a summary that say how the activity went, from a real export:
 *  - `hrTimeInZone_1..5` are milliseconds in your own heart-rate zones (0 = below zone 1);
 *  - `trainingEffectLabel` is a word ("TEMPO"), "UNKNOWN" when Garmin made none - the export has no numeric effect or load;
 *  - `workoutRpe` is 10-100 in steps of 10 (a 1-10 rating times ten), `workoutFeel` 0-100;
 *  - `differenceBodyBattery` is the Body Battery change; `avgDoubleCadence` steps per minute, `avgStrideLength` centimetres.
 */
export function statsOfSummary(a: Json): ActivityStats | undefined {
  const out: ActivityStats = {};
  const zones = [1, 2, 3, 4, 5].map((z) => num(a[`hrTimeInZone_${z}`]));
  if (zones.every((z) => z !== undefined) && zones.some((z) => z! > 0)) out.zonesSec = zones.map((z) => Math.round(z! / 1000));
  const label = typeof a.trainingEffectLabel === "string" ? a.trainingEffectLabel : undefined;
  if (label && label !== "UNKNOWN") out.effectLabel = EFFECT_LABELS[label] ?? label.toLowerCase().replace(/_/g, " ");
  const rpe = num(a.workoutRpe);
  if (rpe && rpe >= 10 && rpe <= 100) out.rpe = Math.round(rpe / 10);
  const feel = num(a.workoutFeel);
  if (feel !== undefined && feel >= 0 && feel <= 100) out.feel = Math.round(feel);
  const battery = num(a.differenceBodyBattery);
  if (battery !== undefined && battery !== 0) out.bodyBatteryDelta = Math.round(battery);
  if (num(a.avgDoubleCadence) && num(a.avgDoubleCadence)! > 0) out.avgCadence = Math.round(num(a.avgDoubleCadence)!);
  if (num(a.avgStrideLength) && num(a.avgStrideLength)! > 0) out.strideCm = Math.round(num(a.avgStrideLength)!);
  const loss = num(a.elevationLoss);
  if (loss && loss > 0) out.descentM = Math.round(loss / 100);
  return Object.keys(out).length ? out : undefined;
}

/**
 * `*_summarizedActivities.json` → summaries. Units as exported: durations in
 * milliseconds, distance and climb in centimetres, calories in kilojoules.
 */
export function parseSummarizedActivities(files: Json[]): GarminActivitySummary[] {
  const out: GarminActivitySummary[] = [];
  for (const file of files) {
    for (const a of (file.summarizedActivitiesExport as Json[] | undefined) ?? []) {
      const startMs = num(a.startTimeGmt) ?? num(a.beginTimestamp);
      if (startMs === undefined) continue;
      const ms = (v: unknown) => (num(v) !== undefined ? Math.round(num(v)! / 1000) : undefined);
      const cm = (v: unknown) => (num(v) !== undefined && num(v)! > 0 ? Math.round(num(v)! / 100) : undefined);
      const s: GarminActivitySummary = { startMs, type: garminTypeName(a.activityType) };
      if (typeof a.name === "string" && a.name.trim()) s.name = a.name.trim();
      const dur = ms(a.duration) ?? ms(a.elapsedDuration);
      if (dur) s.durationSec = dur;
      const moving = ms(a.movingDuration);
      if (moving) s.movingSec = moving;
      const dist = cm(a.distance);
      if (dist) s.distanceM = dist;
      const gain = cm(a.elevationGain);
      if (gain) s.elevationM = gain;
      if (num(a.avgHr) && num(a.avgHr)! > 0) s.avgHr = Math.round(num(a.avgHr)!);
      if (num(a.maxHr) && num(a.maxHr)! > 0) s.maxHr = Math.round(num(a.maxHr)!);
      if (num(a.calories) && num(a.calories)! > 0) s.calories = Math.round(num(a.calories)! / 4.184);
      if (typeof a.locationName === "string" && a.locationName.trim()) s.place = a.locationName.trim();
      if (num(a.activityId) !== undefined) s.activityId = num(a.activityId);
      const stats = statsOfSummary(a);
      if (stats) s.stats = stats;
      out.push(s);
    }
  }
  return out;
}
