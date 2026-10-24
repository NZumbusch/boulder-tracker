import { describe, expect, it } from "vitest";
import type { DailyMetricEntry, ExerciseSlot, Workout } from "../types";
import { correlationP, describeFinding, MIN_SESSIONS, predictBestSessions, sessionPerformances, spearman } from "./sessionPredictors";

const DAY0 = Math.floor(Date.UTC(2026, 0, 5) / 86400000);
const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);

/** A logged hangboard-style slot with the heaviest set at `kg`. */
const slot = (kg: number): ExerciseSlot => ({ typeId: "hang", logged: { weight: kg, reps: 5, sets: 1 } } as unknown as ExerciseSlot);
const session = (i: number, kg: number): Workout => ({ id: `w${i}`, status: "completed", date: iso(DAY0 + i * 2), weekId: "2026-W01", loadFactor: 0, exercises: [slot(kg)] }) as Workout;

describe("spearman and its p-value", () => {
  it("is +1 for a rising pair, -1 for a falling one, and undefined when a side is flat", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 1, 1, 1], [1, 2, 3, 4])).toBeUndefined();
  });
  it("handles ties by average rank", () => {
    expect(spearman([1, 2, 2, 3], [1, 2, 3, 4])).toBeGreaterThan(0.9);
  });
  it("calls a strong correlation on many pairs unlikely by chance, and a weak one on few not", () => {
    expect(correlationP(0.6, 30)).toBeLessThan(0.01);
    expect(correlationP(0.2, 12)).toBeGreaterThan(0.4);
    expect(correlationP(0.5, 3)).toBe(1);
  });
});

describe("sessionPerformances", () => {
  it("judges a session against the median of the previous ones, from the fifth on", () => {
    const ws = [60, 60, 60, 60, 66, 54].map((kg, i) => session(i, kg));
    const p = sessionPerformances(ws, new Date(iso(DAY0 + 100)));
    expect(p.map((x) => x.workoutId)).toEqual(["w4", "w5"]);
    expect(p[0].perf).toBeCloseTo(0.1);
    expect(p[1].perf).toBeCloseTo(54 / 60 - 1 /* usual of the last six = 60 */, 1);
  });
  it("is empty without enough history", () => {
    expect(sessionPerformances([60, 60, 60].map((kg, i) => session(i, kg)), new Date(iso(DAY0 + 100)))).toEqual([]);
  });
});

describe("predictBestSessions", () => {
  // Thirty sessions; the weight is 5 % up when the night before scored 85+, 5 % down when it scored 50.
  const N = 30;
  const sleepAt = (i: number) => (i % 3 === 0 ? 50 : i % 3 === 1 ? 70 : 88);
  const workouts = Array.from({ length: N }, (_, i) => session(i, 60 * (sleepAt(i) >= 85 ? 1.05 : sleepAt(i) <= 55 ? 0.95 : 1)));
  const metrics = (valueAt: (i: number) => number, metricId = "sleep-score"): DailyMetricEntry[] =>
    Array.from({ length: N }, (_, i) => ({ id: `${metricId}${i}`, metricId, date: iso(DAY0 + i * 2), value: valueAt(i) }));

  it("finds the sleep score that goes with the better sessions, and says how sure it is", () => {
    const r = predictBestSessions(workouts, metrics(sleepAt), workouts, new Date(iso(DAY0 + 200)));
    expect(r.sessions).toBeGreaterThanOrEqual(MIN_SESSIONS);
    const f = r.findings.find((x) => x.id === "sleep-score")!;
    expect(f).toBeTruthy();
    expect(f.rho).toBeGreaterThan(0.5);
    expect(f.confidence).toBe("clear");
    expect(f.high.perf).toBeGreaterThan(f.low.perf);
    expect(describeFinding(f)).toMatch(/high last night's sleep score/);
  });

  it("reports nothing for a predictor that does not vary with the sessions, and says nothing with too few sessions", () => {
    const flat = predictBestSessions(workouts, metrics(() => 80), workouts, new Date(iso(DAY0 + 200)));
    expect(flat.findings.find((x) => x.id === "sleep-score")).toBeUndefined();
    const few = predictBestSessions(workouts.slice(0, 8), metrics(sleepAt), workouts, new Date(iso(DAY0 + 200)));
    expect(few.findings).toEqual([]);
  });
});
