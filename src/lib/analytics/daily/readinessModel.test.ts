import { describe, expect, it } from "vitest";
import type { DailyMetricEntry, PainIssue, PainLog, Workout } from "../../types";
import { toUtcDayIndex } from "../../dateUtils";
import { calculateRollingAcwr } from "../loadAnalytics";
import { computeFatigueDecay, computeHrvBaseline, computeReadiness, DEFAULT_READINESS_CONFIG } from "../readiness";
import { buildReadingsIndex } from "../metricValues";
import { ReadingsModel } from "./readingsModel";
import { ReadinessModel } from "./readinessModel";

const BASE = Date.UTC(2025, 0, 1) / 86400000;
const iso = (d: number) => new Date((BASE + d) * 86400000).toISOString().slice(0, 10);

/** A small deterministic generator, so the data is the same every run. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function data(fingersGap = true) {
  const r = rng(7);
  const workouts: Workout[] = [];
  for (let d = 0; d < 400; d++) {
    if (d >= 120 && d < 210) continue; // a three-month break
    if (r() > 0.45) continue;
    const w: Partial<Workout> = { id: `w${d}`, status: "completed", date: `${iso(d)}T18:00:00.000Z`, weekId: "x", loadFactor: Math.round(200 + r() * 600), exercises: [], systemic: Math.round(2 + r() * 7) };
    // Nothing rated on the fingers after day 250: that axis is "not rated lately", not "fresh".
    if (!(fingersGap && d > 250)) w.fingers = Math.round(2 + r() * 7);
    if (r() > 0.4) w.core = Math.round(1 + r() * 6);
    workouts.push(w as Workout);
  }
  workouts.push({ id: "p", status: "planned", date: null, weekId: "x", loadFactor: 0, exercises: [] } as Workout);
  const entries: DailyMetricEntry[] = [];
  for (let d = 0; d < 400; d++) {
    if (d >= 150 && d < 190) continue;
    if (r() > 0.8) continue;
    entries.push({ id: `h${d}`, metricId: "hrv", date: iso(d), value: 60 + Math.round(r() * 30) }, { id: `s${d}`, metricId: "sleep-score", date: iso(d), value: 50 + Math.round(r() * 45) });
  }
  return { workouts, entries };
}

/** The calculation as it was written first: every day looks at every session up to it. */
function reference(workouts: Workout[], entries: DailyMetricEntry[], first: number, last: number) {
  const completed = workouts.filter((w) => w.status === "completed" && w.date).map((w) => ({ w, day: toUtcDayIndex(w.date!) })).sort((a, b) => a.day - b.day);
  const idx = buildReadingsIndex(entries);
  const out = new Map<number, number>();
  let upTo = 0;
  for (let day = first; day <= last; day++) {
    while (upTo < completed.length && completed[upTo].day <= day) upTo++;
    const seen = completed.slice(0, upTo).map((c) => c.w);
    const asOf = new Date(day * 86400000 + 12 * 3600000);
    const fatigue = computeFatigueDecay(seen, asOf, 3);
    const res = computeReadiness({ fatigue: { fingers: fatigue.fingers, core: fatigue.core, systemic: fatigue.systemic }, acwr: calculateRollingAcwr(seen, asOf), sleep: idx.get("sleep-score")?.get(day), hrv: idx.get("hrv")?.get(day), hrvBaseline: computeHrvBaseline(entries, asOf) }, DEFAULT_READINESS_CONFIG);
    if (res.score !== undefined) out.set(day, res.score);
  }
  return out;
}

const model = (workouts: Workout[], entries: DailyMetricEntry[], pain?: { issues: PainIssue[]; logs: PainLog[] }) =>
  new ReadinessModel(new ReadingsModel(entries), { workouts, pain, config: DEFAULT_READINESS_CONFIG, halfLife: 3 });

describe("ReadinessModel", () => {
  const first = BASE;
  const last = BASE + 420;

  it("gives the readiness that looking at every session gives, on every day of a year with breaks and unrated axes", () => {
    for (const gap of [true, false]) {
      const { workouts, entries } = data(gap);
      const fast = model(workouts, entries).range(first, last);
      const slow = reference(workouts, entries, first, last);
      expect([...fast.keys()]).toEqual([...slow.keys()]);
      let worst = 0;
      for (const [day, score] of slow) worst = Math.max(worst, Math.abs(fast.get(day)! - score));
      // Sessions older than 14 half-lives are left out: under a thousandth of a point each.
      expect(worst).toBeLessThan(0.01);
    }
  });

  it("gives the same days whichever window is asked for, and after asking for others", () => {
    const { workouts, entries } = data();
    const m = model(workouts, entries);
    const year = m.range(first + 30, last - 30);
    const week = m.range(first + 200, first + 206);
    expect([...m.range(first + 30, last - 30)]).toEqual([...year]);
    for (const [d, s] of week) expect(year.get(d)).toBe(s);
  });

  it("only sees the sessions up to the day it scores", () => {
    const hard = { id: "h", status: "completed", date: `${iso(5)}T10:00:00.000Z`, weekId: "x", loadFactor: 300, exercises: [], fingers: 10, core: 10, systemic: 10 } as Workout;
    const scores = model([hard], []).range(first, first + 5);
    expect(scores.has(first)).toBe(false);
    expect(scores.get(first + 5)).toBeLessThan(100);
  });

  it("is a snapshot: changing the sessions, readings or pain afterwards changes nothing it says", () => {
    const { workouts, entries } = data();
    const issues = [{ id: "i", bodyPart: "finger", startDate: iso(280) } as PainIssue];
    const logs = [{ id: "l", issueId: "i", date: iso(285), severity: 6, weekId: "x", bodyPart: "finger" } as PainLog];
    const m = model(workouts, entries, { issues, logs });
    const before = [...m.range(first + 290, first + 300)];
    for (const w of workouts) { w.systemic = 10; w.fingers = 10; w.core = 10; w.loadFactor = 9999; }
    for (const x of entries) x.value = 5;
    logs[0].severity = 0;
    issues[0].endDate = iso(286);
    // Days not worked out before the change are worked out from the snapshot, not from what the objects say now.
    const fresh = model(workouts.map((w) => ({ ...w })), entries.map((x) => ({ ...x })), { issues, logs }).range(first + 290, first + 300);
    expect([...m.range(first + 290, first + 300)]).toEqual(before);
    expect([...fresh]).not.toEqual(before);
  });

  it("counts open pain on the days it is open", () => {
    const { workouts, entries } = data();
    const issues = [{ id: "i", bodyPart: "finger", startDate: iso(300) } as PainIssue];
    const logs = [{ id: "l", issueId: "i", date: iso(300), severity: 8, weekId: "x", bodyPart: "finger" } as PainLog];
    const with_ = model(workouts, entries, { issues, logs }).range(first + 305, first + 305);
    const without = model(workouts, entries).range(first + 305, first + 305);
    expect(with_.get(first + 305)).toBeLessThan(without.get(first + 305)!);
  });

  it("warms in slices until done and warming changes no answer", () => {
    const { workouts, entries } = data();
    const warmed = model(workouts, entries);
    let rounds = 0;
    while (!warmed.warm(0) && rounds++ < 3000);
    expect(rounds).toBeLessThan(3000);
    expect([...warmed.range(first, last)]).toEqual([...model(workouts, entries).range(first, last)]);
  });
});
