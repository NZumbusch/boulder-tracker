import type { ActivityStats } from "../types";
import type { FitActivity, FitPoint } from "./fit";

/**
 * How an activity went, from its recording: kilometre splits, how much the
 * second half differed from the first (pace and heart rate), time at each
 * heart rate, and the summary extras a Garmin file carries. Computed once at
 * import (the recording isn't kept), stored small, and turned into a few
 * words for the AI by `lib/ai/activityDigest.ts`. Pure.
 */

const EARTH_M = 6_371_000;
/** Foot activities get kilometre splits; a ride's splits say little next to its average speed. */
const FOOT = /run|walk|hike|trek/i;
/** Shortest recording worth splitting or comparing halves of. */
const MIN_SPLIT_M = 1000;
const MIN_HALF_SEC = 5 * 60;
const MAX_SPLITS = 60;
const MAX_LAPS = 24;
/** Bins of seconds per heart rate: below 100, then 10 bpm each up to 190+. */
export const HR_BIN_COUNT = 11;

const round = (v: number, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits;

function haversine(a: FitPoint, b: FitPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat! - a.lat!) * rad;
  const dLon = (b.lon! - a.lon!) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat! * rad) * Math.cos(b.lat! * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** Time (s since the start) at each point and the distance (m) covered by then: the device's own distance when it gave one, else along the GPS line. */
export function timeAndDistance(points: FitPoint[]): { t: number[]; d: number[] } | null {
  if (points.length < 2) return null;
  const t0 = points[0].t;
  const t = points.map((p) => (p.t - t0) / 1000);
  const hasDevice = points.filter((p) => p.d !== undefined).length >= points.length * 0.8;
  const d: number[] = [];
  if (hasDevice) {
    let last = 0;
    for (const p of points) {
      last = p.d ?? last;
      d.push(last);
    }
    return { t, d };
  }
  let total = 0;
  let prev: FitPoint | undefined;
  for (const p of points) {
    if (p.lat !== undefined && p.lon !== undefined) {
      if (prev) total += haversine(prev, p);
      prev = p;
    }
    d.push(total);
  }
  return total > 0 ? { t, d } : null;
}

/** The time at which `distance` was reached, interpolated between points. */
function timeAt(t: number[], d: number[], distance: number): number | undefined {
  for (let i = 1; i < d.length; i++) {
    if (d[i] >= distance) {
      const span = d[i] - d[i - 1];
      return span > 0 ? t[i - 1] + ((distance - d[i - 1]) / span) * (t[i] - t[i - 1]) : t[i];
    }
  }
  return undefined;
}

/** Seconds for each full kilometre. */
export function kmSplits(t: number[], d: number[]): number[] {
  const out: number[] = [];
  let previous = 0;
  for (let km = 1; km * 1000 <= d[d.length - 1] && out.length < MAX_SPLITS; km++) {
    const at = timeAt(t, d, km * 1000);
    if (at === undefined) break;
    out.push(Math.round(at - previous));
    previous = at;
  }
  return out;
}

/** Second half of the distance against the first, in % (+ = slower). Undefined for a short or stop-and-go recording. */
export function paceDrift(t: number[], d: number[]): number | undefined {
  const total = d[d.length - 1];
  const duration = t[t.length - 1];
  if (total < 2000 || duration < MIN_HALF_SEC * 2) return undefined;
  const half = timeAt(t, d, total / 2);
  if (!half || half <= 0) return undefined;
  const first = half;
  const second = duration - half;
  return round((second / first - 1) * 100, 0);
}

/** Average heart rate in the second half of the time minus the first. */
export function hrDrift(points: FitPoint[]): number | undefined {
  const withHr = points.filter((p) => p.hr !== undefined);
  if (withHr.length < 20) return undefined;
  const start = points[0].t;
  const end = points[points.length - 1].t;
  if ((end - start) / 1000 < MIN_HALF_SEC * 2) return undefined;
  const mid = start + (end - start) / 2;
  const avg = (list: FitPoint[]) => list.reduce((s, p) => s + p.hr!, 0) / list.length;
  const a = withHr.filter((p) => p.t < mid);
  const b = withHr.filter((p) => p.t >= mid);
  return a.length && b.length ? round(avg(b) - avg(a), 0) : undefined;
}

/** Seconds at each heart rate bin (`HR_BIN_COUNT`), each reading counted until the next one (a gap over 30 s counts as 1 s). */
export function hrBins(points: FitPoint[]): number[] | undefined {
  const bins = new Array<number>(HR_BIN_COUNT).fill(0);
  let any = false;
  for (let i = 0; i < points.length; i++) {
    const hr = points[i].hr;
    if (hr === undefined || hr < 30) continue;
    any = true;
    const next = points[i + 1];
    const gap = next ? (next.t - points[i].t) / 1000 : 1;
    bins[Math.min(HR_BIN_COUNT - 1, Math.max(0, Math.floor((hr - 90) / 10)))] += gap > 0 && gap <= 30 ? gap : 1;
  }
  return any ? bins.map((v) => Math.round(v)) : undefined;
}

/** The workout's own laps, when it has some: not a lap per kilometre (all the same distance) and not a single one. */
export function workoutLaps(laps: FitActivity["laps"]): ActivityStats["laps"] {
  if (laps.length < 3 || laps.length > MAX_LAPS) return undefined;
  const withDistance = laps.filter((l) => l.distanceM);
  if (withDistance.length === laps.length) {
    const mean = withDistance.reduce((s, l) => s + l.distanceM!, 0) / withDistance.length;
    // Automatic laps: every one (bar a shorter last) the same length.
    const body = withDistance.slice(0, -1);
    if (body.length >= 2 && body.every((l) => Math.abs(l.distanceM! - mean) / mean < 0.03)) return undefined;
  }
  return laps.map((l) => ({ sec: Math.round(l.elapsedSec), ...(l.distanceM ? { m: Math.round(l.distanceM) } : {}), ...(l.avgHr ? { hr: l.avgHr } : {}) }));
}

/** Everything the recording and its summary give, or undefined when there is nothing to say. */
export function computeStats(points: FitPoint[], type: string, fit?: FitActivity): ActivityStats | undefined {
  const out: ActivityStats = {};
  const run = timeAndDistance(points);
  if (run && run.d[run.d.length - 1] >= MIN_SPLIT_M && FOOT.test(type)) {
    const splits = kmSplits(run.t, run.d);
    if (splits.length) out.splitsSec = splits;
  }
  if (run && FOOT.test(type)) {
    const drift = paceDrift(run.t, run.d);
    if (drift !== undefined) out.paceDriftPct = drift;
  }
  const hr = hrDrift(points);
  if (hr !== undefined) out.hrDriftBpm = hr;
  const bins = hrBins(points);
  if (bins) out.hrBinsSec = bins;
  if (fit) {
    const laps = workoutLaps(fit.laps ?? []);
    if (laps) out.laps = laps;
    if (fit.maxSpeed) out.maxSpeedMs = round(fit.maxSpeed, 1);
    if (fit.descentM) out.descentM = Math.round(fit.descentM);
    if (fit.avgCadence) out.avgCadence = Math.round(fit.avgCadence);
    if (fit.avgPowerW) out.avgPowerW = Math.round(fit.avgPowerW);
    if (fit.avgTempC !== undefined) out.avgTempC = Math.round(fit.avgTempC);
    if (fit.trainingEffect) out.trainingEffect = round(fit.trainingEffect, 1);
    if (fit.anaerobicEffect) out.anaerobicEffect = round(fit.anaerobicEffect, 1);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Stats merged: what `extra` has wins only where `base` has nothing. */
export function mergeStats(base: ActivityStats | undefined, extra: ActivityStats | undefined): ActivityStats | undefined {
  if (!extra) return base;
  if (!base) return extra;
  return { ...extra, ...base };
}

// --- Zones --------------------------------------------------------------------

/** Zone edges as shares of the highest heart rate: Z1 from 50 %, Z2 60 %, Z3 70 %, Z4 80 %, Z5 90 %. */
const ZONE_FROM = [0.5, 0.6, 0.7, 0.8, 0.9];

/** Minutes in zones 1-5 from the bins and the highest heart rate; a bin counts for the zone its middle falls in. Undefined without bins. */
export function zoneMinutes(bins: number[] | undefined, maxHr: number): number[] | undefined {
  if (!bins?.length) return undefined;
  const zones = [0, 0, 0, 0, 0];
  bins.forEach((sec, i) => {
    const middle = i === 0 ? 95 : i === HR_BIN_COUNT - 1 ? 195 : 100 + (i - 1) * 10 + 5;
    const share = middle / maxHr;
    let zone = -1;
    ZONE_FROM.forEach((from, z) => {
      if (share >= from) zone = z;
    });
    if (zone >= 0) zones[zone] += sec / 60;
  });
  return zones.map((m) => Math.round(m));
}
