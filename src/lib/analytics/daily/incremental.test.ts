import { describe, expect, it } from "vitest";
import type { DailyMetricEntry, PainIssue, PainLog, Workout } from "../../types";
import { DEFAULT_READINESS_CONFIG, type ReadinessConfig } from "../readiness";
import { DayRanges, DaySeries } from "./daySeries";
import { ReadinessModel } from "./readinessModel";
import { ReadingsModel } from "./readingsModel";

/**
 * The gate for carrying a model's worked-out days over to the next one: after any change, a model built from the new data
 * and the previous model must say exactly what a model built from the new data alone says, on every day. Tried on random
 * data with random edits, chained generation after generation.
 */

const BASE = Date.UTC(2025, 5, 1) / 86400000;
const DAYS = 170;
/** The days compared: a little before and after the data, as real day indexes. */
const FIRST = BASE - 60;
const LAST = BASE + DAYS + 40;
const iso = (d: number) => new Date((BASE + d) * 86400000).toISOString().slice(0, 10);

function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  };
}
type R = ReturnType<typeof rng>;

interface World {
  entries: DailyMetricEntry[];
  workouts: Workout[];
  issues: PainIssue[];
  logs: PainLog[];
  config: ReadinessConfig;
  halfLife: number;
  seq: number;
}

const METRICS = ["hrv", "sleep-score", "sleep-duration", "nap-duration", "rhr", "bodyweight", "steps", "stress"];
const value = (r: R, metric: string) => (metric === "hrv" ? 55 + r.int(40) : metric === "sleep-score" ? 40 + r.int(58) : metric === "sleep-duration" ? 4 + r.int(50) / 10 : metric === "nap-duration" ? 0.3 + r.int(15) / 10 : metric === "rhr" ? 44 + r.int(14) : metric === "bodyweight" ? 68 + r.int(40) / 10 : metric === "steps" ? 2000 + r.int(14000) : 20 + r.int(60));

function session(r: R, id: string, day = r.int(DAYS)): Workout {
  const w: Partial<Workout> = { id, status: "completed", date: `${iso(day)}T${r.pick(["06", "12", "18", "22"])}:30:00.000Z`, weekId: "x", loadFactor: 100 + r.int(700), exercises: [] };
  if (r.chance(0.8)) w.systemic = 1 + r.int(9);
  if (r.chance(0.7)) w.fingers = 1 + r.int(9);
  if (r.chance(0.4)) w.core = 1 + r.int(8);
  if (r.chance(0.2)) w.arms = 1 + r.int(8);
  return w as Workout;
}

function randomWorld(r: R): World {
  const w: World = { entries: [], workouts: [], issues: [], logs: [], config: structuredClone(DEFAULT_READINESS_CONFIG), halfLife: 3, seq: 0 };
  // Gaps (a break) in some metrics, scattered missing days in others.
  const breakStart = r.int(DAYS - 40);
  for (let d = 0; d < DAYS; d++) {
    for (const m of METRICS) {
      if (d >= breakStart && d < breakStart + 30 && r.chance(0.9)) continue;
      if (r.chance(m === "bodyweight" ? 0.92 : 0.25)) continue;
      w.entries.push({ id: `e${w.seq++}`, metricId: m, date: iso(d), value: value(r, m) });
    }
  }
  for (let i = 0; i < 28; i++) w.workouts.push(session(r, `w${w.seq++}`));
  if (r.chance(0.6)) {
    const start = r.int(DAYS - 20);
    w.issues.push({ id: "pi1", bodyPart: "finger", startDate: iso(start), ...(r.chance(0.5) ? { endDate: iso(start + 10) } : {}) } as PainIssue);
    w.logs.push({ id: "pl1", issueId: "pi1", date: iso(start + 1), weekId: "x", bodyPart: "finger", severity: 3 + r.int(6) } as PainLog);
  }
  return w;
}

/** One random edit, applied to a copy. Returns a description (for the failure message). */
function edit(r: R, w: World): string {
  const kind = r.pick(["addReading", "addReading", "delReading", "changeReading", "moveReading", "addSession", "addSession", "delSession", "changeSession", "moveSession", "unfinishSession", "addPain", "changePain", "delPain", "setting", "nothing", "today"]);
  switch (kind) {
    case "addReading": { const m = r.pick(METRICS); w.entries.push({ id: `e${w.seq++}`, metricId: m, date: iso(r.int(DAYS)), value: value(r, m) }); break; }
    case "delReading": if (w.entries.length) w.entries.splice(r.int(w.entries.length), 1); break;
    case "changeReading": if (w.entries.length) { const e = r.pick(w.entries); e.value = value(r, e.metricId); } break;
    case "moveReading": if (w.entries.length) r.pick(w.entries).date = iso(r.int(DAYS)); break;
    case "addSession": w.workouts.push(session(r, `w${w.seq++}`)); break;
    case "delSession": if (w.workouts.length) w.workouts.splice(r.int(w.workouts.length), 1); break;
    case "changeSession": if (w.workouts.length) { const s = r.pick(w.workouts); s.loadFactor = 100 + r.int(700); s.systemic = r.chance(0.8) ? 1 + r.int(9) : undefined; s.fingers = r.chance(0.5) ? 1 + r.int(9) : undefined; } break;
    case "moveSession": if (w.workouts.length) { const s = r.pick(w.workouts); s.date = `${iso(r.int(DAYS))}T18:30:00.000Z`; } break;
    case "unfinishSession": if (w.workouts.length) { const s = r.pick(w.workouts); s.status = s.status === "completed" ? "planned" : "completed"; } break;
    case "addPain": { const start = r.int(DAYS); const id = `pi${w.seq++}`; w.issues.push({ id, bodyPart: "elbow", startDate: iso(start) } as PainIssue); w.logs.push({ id: `pl${w.seq++}`, issueId: id, date: iso(start), weekId: "x", bodyPart: "elbow", severity: 2 + r.int(7) } as PainLog); break; }
    case "changePain": if (w.logs.length) r.pick(w.logs).severity = 1 + r.int(9); if (w.issues.length && r.chance(0.5)) { const i = r.pick(w.issues); if (i.endDate) delete i.endDate; else i.endDate = iso(Math.min(DAYS, 5 + r.int(DAYS))); } break;
    case "delPain": if (w.logs.length) w.logs.splice(r.int(w.logs.length), 1); if (w.issues.length && r.chance(0.3)) w.issues.splice(r.int(w.issues.length), 1); break;
    case "setting": if (r.chance(0.5)) w.config = { ...w.config, sleepLow: 40 + r.int(30), hrvDip: 0.05 + r.int(10) / 100 }; else w.halfLife = r.pick([2, 3, 4, 6]); break;
    case "today": w.entries.push({ id: `e${w.seq++}`, metricId: r.pick(METRICS), date: iso(DAYS - 1), value: 70 }); break;
    default: break;
  }
  return kind;
}

const copy = (w: World): World => structuredClone(w);

const SPECS = [
  { id: "hrv", higherIsBetter: true }, { id: "hrv", higherIsBetter: false }, { id: "sleep-score", higherIsBetter: true }, { id: "sleep-duration", higherIsBetter: true },
  { id: "rhr", higherIsBetter: false }, { id: "bodyweight", higherIsBetter: true }, { id: "steps", higherIsBetter: true }, { id: "stress", higherIsBetter: false },
];

const build = (w: World, prev?: { readings: ReadingsModel; readiness: ReadinessModel }) => {
  const readings = new ReadingsModel(w.entries, prev?.readings);
  const readiness = new ReadinessModel(readings, { workouts: w.workouts, pain: { issues: w.issues, logs: w.logs }, config: w.config, halfLife: w.halfLife }, prev?.readiness);
  return { readings, readiness };
};

/** Works every day of every series out, so the next build has something to take over. */
function warmAll(m: { readings: ReadingsModel; readiness: ReadinessModel }) {
  for (const spec of SPECS) m.readings.recoveryRange(spec, FIRST, LAST);
  m.readiness.range(FIRST, LAST);
}

describe("carrying a model's days over to the next one", () => {
  it("says exactly what a model built from scratch says, after every kind of change, generation after generation", () => {
    let totalCarried = 0;
    let steps = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed * 7919);
      let world = randomWorld(r);
      let prev = build(world);
      warmAll(prev);
      for (let step = 0; step < 14; step++) {
        const next = copy(world);
        // Sometimes several edits at once (an import).
        const kinds: string[] = [];
        for (let k = r.chance(0.2) ? 1 + r.int(5) : 1; k > 0; k--) kinds.push(edit(r, next));
        const carried = build(next, prev);
        const fresh = build(next);
        const where = `seed ${seed}, step ${step} (${kinds.join("+")})`;

        for (const spec of SPECS) {
          const a = carried.readings.recoveryRange(spec, FIRST, LAST);
          const b = fresh.readings.recoveryRange(spec, FIRST, LAST);
          for (let i = 0; i < a.length; i++) expect(a[i], `${where}: ${spec.id}/${spec.higherIsBetter} day ${i - 60}`).toEqual(b[i]);
        }
        for (let day = FIRST; day <= LAST; day++) expect(carried.readiness.score(day), `${where}: readiness day ${day - BASE}`).toBe(fresh.readiness.score(day));

        totalCarried += carried.readings.carriedDays + carried.readiness.carriedDays;
        steps++;
        world = next;
        prev = carried;
        warmAll(prev);
      }
    }
    // It really did reuse work: not just "equal because it recomputed everything".
    expect(steps).toBe(840);
    expect(totalCarried / steps).toBeGreaterThan(300);
  }, 120000);

  it("works out only the days a change reaches: a new reading today costs a handful of days, not the whole history", () => {
    const r = rng(42);
    const world = randomWorld(r);
    const prev = build(world);
    warmAll(prev);
    const next = copy(world);
    next.entries.push({ id: "today", metricId: "hrv", date: iso(DAYS - 1), value: 80 });
    const m = build(next, prev);
    const before = m.readings.recovery({ id: "hrv", higherIsBetter: true }).computed;
    m.readings.recoveryRange({ id: "hrv", higherIsBetter: true }, FIRST, LAST);
    const recomputedSeries = m.readings.recovery({ id: "hrv", higherIsBetter: true }).computed - before;
    // The day, the week after it for the average, and the baselines after it - all of which end inside the range at DAYS + 40.
    expect(recomputedSeries).toBeLessThanOrEqual(LAST - (BASE + DAYS - 1) + 1);
    const readinessBefore = m.readiness.carriedDays;
    expect(readinessBefore).toBeGreaterThan(150);
  });

  it("takes nothing over when a setting changed (everything is different), and everything when nothing changed", () => {
    const r = rng(5);
    const world = randomWorld(r);
    const prev = build(world);
    warmAll(prev);
    const changed = copy(world);
    changed.halfLife = 6;
    expect(build(changed, prev).readiness.carriedDays).toBe(0);
    const same = build(copy(world), prev);
    expect(same.readiness.carriedDays).toBe(DAYS + 100 + 1);
    expect(same.readings.carriedDays).toBeGreaterThan(0);
  });

  it("does not touch the previous model", () => {
    const r = rng(9);
    const world = randomWorld(r);
    const prev = build(world);
    warmAll(prev);
    const before = [...prev.readiness.range(FIRST, LAST)];
    const edited = copy(world);
    for (let i = 0; i < 6; i++) edit(r, edited);
    const next = build(edited, prev);
    warmAll(next);
    expect([...prev.readiness.range(FIRST, LAST)]).toEqual(before);
  });
});

describe("DayRanges and DaySeries.adopt", () => {
  it("merges ranges, handles infinity and answers membership", () => {
    const r = new DayRanges().add(10, 12).add(11, 20).add(30, Infinity).add(5, 4);
    for (const [day, has] of [[9, false], [10, true], [20, true], [21, false], [29, false], [30, true], [1e9, true]] as const) expect(r.has(day), `day ${day}`).toBe(has);
    expect(new DayRanges().empty).toBe(true);
    expect(new DayRanges().has(3)).toBe(false);
  });

  it("takes over the unaffected days as they are, and leaves its own work and the affected days to itself", () => {
    const old = new DaySeries((d) => ({ d, from: "old" }));
    old.range(0, 9);
    const next = new DaySeries((d) => ({ d, from: "new" }));
    const mine = next.get(3);
    expect(next.adopt(old, new DayRanges().add(5, 6))).toBe(7);
    expect(next.get(3)).toBe(mine);
    expect(next.get(0)).toBe(old.get(0));
    expect(next.get(5).from).toBe("new");
    expect(next.computed).toBe(2);
    expect(old.computed).toBe(10);
  });
});
