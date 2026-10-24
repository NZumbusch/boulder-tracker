import { describe, expect, it } from "vitest";
import type { DailyMetricEntry, Workout } from "../types";
import { buildRecoverySeries, readinessByDay } from "./recoverySeries";
import { calculateRollingAcwr } from "./loadAnalytics";
import { computeFatigueDecay, computeHrvBaseline, computeReadiness, DEFAULT_READINESS_CONFIG } from "./readiness";
import { readingsByDay } from "./recoverySeries";
import { toUtcDayIndex } from "../dateUtils";

const BASE = Date.UTC(2025, 0, 1) / 86400000;
const iso = (d: number) => new Date((BASE + d) * 86400000).toISOString().slice(0, 10);

/** A small deterministic generator, so the data is the same every run. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function data(sessionsGap = true) {
  const r = rng(7);
  const workouts: Workout[] = [];
  for (let d = 0; d < 400; d++) {
    // A break of three months, and nothing rated on the fingers after day 250 (so that axis is "not rated lately", not "fresh").
    if (d >= 120 && d < 210) continue;
    if (r() > 0.45) continue;
    const w: Partial<Workout> = {
      id: `w${d}`, status: "completed", date: `${iso(d)}T18:00:00.000Z`, weekId: "x", loadFactor: Math.round(200 + r() * 600), exercises: [],
      systemic: Math.round(2 + r() * 7),
    };
    if (!(sessionsGap && d > 250)) w.fingers = Math.round(2 + r() * 7);
    if (r() > 0.4) w.core = Math.round(1 + r() * 6);
    workouts.push(w as Workout);
  }
  // A planned session and one without a date, which are never part of it.
  workouts.push({ id: "p", status: "planned", date: null, weekId: "x", loadFactor: 0, exercises: [] } as Workout);
  const entries: DailyMetricEntry[] = [];
  for (let d = 0; d < 400; d++) {
    if (d >= 150 && d < 190) continue;
    if (r() > 0.8) continue;
    entries.push({ id: `h${d}`, metricId: "hrv", date: iso(d), value: 60 + Math.round(r() * 30) });
    entries.push({ id: `s${d}`, metricId: "sleep-score", date: iso(d), value: 50 + Math.round(r() * 45) });
  }
  return { workouts, entries };
}

/** The calculation as it was before: every day looks at every session up to it. */
function reference(workouts: Workout[], entries: DailyMetricEntry[], first: number, last: number) {
  const completed = workouts.filter((w) => w.status === "completed" && w.date).map((w) => ({ w, day: toUtcDayIndex(w.date!) })).sort((a, b) => a.day - b.day);
  const sleep = readingsByDay(entries, "sleep-score");
  const hrv = readingsByDay(entries, "hrv");
  const out = new Map<number, number>();
  let upTo = 0;
  for (let day = first; day <= last; day++) {
    while (upTo < completed.length && completed[upTo].day <= day) upTo++;
    const seen = completed.slice(0, upTo).map((c) => c.w);
    const asOf = new Date(day * 86400000 + 12 * 3600000);
    const fatigue = computeFatigueDecay(seen, asOf, 3);
    const res = computeReadiness({ fatigue: { fingers: fatigue.fingers, core: fatigue.core, systemic: fatigue.systemic }, acwr: calculateRollingAcwr(seen, asOf), sleep: sleep.get(day), hrv: hrv.get(day), hrvBaseline: computeHrvBaseline(entries, asOf) }, DEFAULT_READINESS_CONFIG);
    if (res.score !== undefined) out.set(day, res.score);
  }
  return out;
}

describe("readinessByDay", () => {
  const first = BASE;
  const last = BASE + 420;

  it("gives the same readiness as looking at every session, on every day of a year with breaks and unrated axes", () => {
    for (const gap of [true, false]) {
      const { workouts, entries } = data(gap);
      const fast = readinessByDay(workouts, entries, first, last);
      const slow = reference(workouts, entries, first, last);
      expect([...fast.keys()]).toEqual([...slow.keys()]);
      let worst = 0;
      for (const [day, score] of slow) worst = Math.max(worst, Math.abs(fast.get(day)! - score));
      // Sessions older than 14 half-lives are left out: under a thousandth of a point.
      expect(worst).toBeLessThan(0.01);
    }
  });

  it("gives the same days whichever window is asked for, and after asking for others", () => {
    const { workouts, entries } = data();
    const year = readinessByDay(workouts, entries, first + 30, last - 30);
    const week = readinessByDay(workouts, entries, first + 200, first + 206);
    const again = readinessByDay(workouts, entries, first + 30, last - 30);
    expect([...again]).toEqual([...year]);
    for (const [d, s] of week) expect(year.get(d)).toBe(s);
  });

  it("is recomputed when the sessions or the readings change", () => {
    const { workouts, entries } = data();
    const before = readinessByDay(workouts, entries, first + 300, first + 310);
    // A session in the days just before the window being read.
    const target = workouts.find((w) => w.date && w.date >= iso(296) && w.date < iso(300))!;
    expect(target).toBeTruthy();
    const heavier = workouts.map((w) => (w.id === target.id ? { ...w, systemic: 10, fingers: 10, core: 10 } : w));
    const changed = readinessByDay(heavier, entries, first + 300, first + 310);
    expect([...changed]).not.toEqual([...before]);
    const moreSleep = entries.map((e) => (e.metricId === "sleep-score" ? { ...e, value: 20 } : e));
    expect([...readinessByDay(workouts, moreSleep, first + 300, first + 310)]).not.toEqual([...before]);
    // Same inputs as the first call again: the first answer.
    expect([...readinessByDay(workouts, entries, first + 300, first + 310)]).toEqual([...before]);
  });
});

describe("buildRecoverySeries reuse", () => {
  it("returns identical days for overlapping windows, and fresh ones after the entries change", () => {
    const { entries } = data();
    const spec = { id: "hrv", higherIsBetter: true };
    const a = buildRecoverySeries(entries, spec, first(), first() + 100);
    const b = buildRecoverySeries(entries, spec, first() + 50, first() + 150);
    expect(b[0]).toBe(a[50]);
    const edited = entries.map((e) => (e.id === "h60" ? { ...e, value: 999 } : e));
    const c = buildRecoverySeries(edited, spec, first(), first() + 100);
    expect(c[60].value).not.toBe(a[60].value);
    // The direction matters: a lower-is-better series is its own.
    expect(buildRecoverySeries(entries, { id: "hrv", higherIsBetter: false }, first(), first() + 100)[60]).not.toBe(a[60]);
  });
  function first() { return BASE; }
});
