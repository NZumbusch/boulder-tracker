import type { DailyMetricEntry } from "../types";
import { BODYWEIGHT_METRIC_ID, NAP_DURATION_METRIC, SLEEP_DURATION_METRIC } from "../constants";

/**
 * Health Connect readings → one value per metric per day → what to store.
 * Pure; the plugin (plugins/health-connect) supplies the readings, each
 * already carrying the local day it belongs to.
 *
 * Rules (decided with the user 2026-09-26):
 * - Resting HR: the day's average. Weight: the day's last reading.
 * - Sleep belongs to the day you wake up on. The longest sleep ending that
 *   day is the night (`sleep-duration`); any others are naps, stored as the
 *   day's total apart (`nap-duration`) so they boost readiness without
 *   changing the night's number. Overlapping sessions (one night written by
 *   the watch's app and another app) count once, as the longer record.
 * - A value typed by hand is never overwritten: any entry for that metric
 *   and day without `source: "health-connect"` wins.
 * - Imported entries have fixed ids (`hc-<metric>-<day>`), so two devices
 *   importing the same night don't produce two entries once synced.
 */

export interface HealthReadings {
  restingHeartRate: { date: string; bpm: number }[];
  weight: { date: string; kg: number }[];
  /** `start`/`time` are ISO instants: when the sleep began and ended. */
  sleep: { date: string; start: string; time: string; asleepMinutes: number }[];
}

export interface DailyValue {
  metricId: string;
  date: string;
  value: number;
}

export const RHR_METRIC_ID = "rhr";

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

function byDay<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const item of items) {
    const list = days.get(item.date) ?? [];
    list.push(item);
    days.set(item.date, list);
  }
  return days;
}

export function dailyValues(readings: HealthReadings): DailyValue[] {
  const out: DailyValue[] = [];
  for (const [date, list] of byDay(readings.restingHeartRate)) {
    out.push({ metricId: RHR_METRIC_ID, date, value: Math.round(list.reduce((s, r) => s + r.bpm, 0) / list.length) });
  }
  // The plugin returns records oldest first, so the last one is the latest.
  for (const [date, list] of byDay(readings.weight)) {
    out.push({ metricId: BODYWEIGHT_METRIC_ID, date, value: round(list[list.length - 1].kg, 1) });
  }
  for (const [date, sleeps] of byDay(distinctSleeps(readings.sleep))) {
    const [night, ...naps] = sleeps.sort((a, b) => b.asleepMinutes - a.asleepMinutes);
    out.push({ metricId: SLEEP_DURATION_METRIC.id, date, value: round(night.asleepMinutes / 60, 1) });
    const napMinutes = naps.reduce((s, n) => s + n.asleepMinutes, 0);
    if (napMinutes > 0) out.push({ metricId: NAP_DURATION_METRIC.id, date, value: round(napMinutes / 60, 1) });
  }
  return out;
}

/** One record per real sleep: sessions that overlap in time are the same sleep, and the one with the most time asleep stands for it. */
function distinctSleeps(sessions: HealthReadings["sleep"]): HealthReadings["sleep"] {
  const sorted = sessions.filter((s) => s.asleepMinutes > 0).sort((a, b) => a.start.localeCompare(b.start));
  const out: { best: HealthReadings["sleep"][number]; end: string }[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      if (s.asleepMinutes > last.best.asleepMinutes) last.best = s;
      if (s.time > last.end) last.end = s.time;
    } else {
      out.push({ best: s, end: s.time });
    }
  }
  return out.map((c) => c.best);
}

export function importedEntryId(metricId: string, date: string): string {
  return `hc-${metricId}-${date}`;
}

export interface ImportPlan {
  /** Entries to create or update. */
  upserts: DailyMetricEntry[];
  /** Days skipped because a hand-entered value is there. */
  keptManual: number;
}

export function planImport(existing: DailyMetricEntry[], values: DailyValue[]): ImportPlan {
  const byKey = new Map<string, DailyMetricEntry[]>();
  for (const e of existing) {
    const key = `${e.metricId}|${e.date}`;
    byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }
  const upserts: DailyMetricEntry[] = [];
  let keptManual = 0;
  for (const v of values) {
    const there = byKey.get(`${v.metricId}|${v.date}`) ?? [];
    if (there.some((e) => e.source !== "health-connect")) {
      keptManual++;
      continue;
    }
    const mine = there.find((e) => e.source === "health-connect");
    if (mine && mine.value === v.value) continue;
    upserts.push({
      id: mine?.id ?? importedEntryId(v.metricId, v.date),
      metricId: v.metricId,
      date: v.date,
      value: v.value,
      source: "health-connect",
    });
  }
  return { upserts, keptManual };
}
