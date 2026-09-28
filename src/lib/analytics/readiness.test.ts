import { describe, it, expect } from "vitest";
import type { Workout, DailyMetricEntry } from "../types";
import {
  computeFatigueDecay,
  fatigueReading,
  computeHrvBaseline,
  computeReadiness,
  READINESS_GOOD_THRESHOLD,
  READINESS_CAUTION_THRESHOLD,
  MAX_FATIGUE_PENALTY,
  MAX_ACWR_PENALTY,
  MAX_SLEEP_PENALTY,
  MAX_HRV_PENALTY,
  SLEEP_SCORE_LOW_THRESHOLD,
  DEFAULT_READINESS_CONFIG,
} from "./readiness";
import { ACWR_HIGH_RISK_RATIO, type RollingAcwrResult } from "./loadAnalytics";

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: "w",
    status: "planned",
    date: null,
    weekId: "2026-W01",
    loadFactor: 0,
    exercises: [],
    ...overrides,
  };
}

const asOf = new Date(Date.UTC(2026, 2, 28)); // 2026-03-28

describe("computeFatigueDecay", () => {
  it("no workouts -> every axis undefined, zero coverage", () => {
    const r = computeFatigueDecay([], asOf);
    expect(r).toEqual({
      fingers: undefined,
      arms: undefined,
      core: undefined,
      systemic: undefined,
      coverage: { total: 0, fingers: 0, arms: 0, core: 0, systemic: 0 },
    });
  });

  it("ignores planned workouts", () => {
    const r = computeFatigueDecay([makeWorkout({ status: "planned", date: "2026-03-28", fingers: 9 })], asOf);
    expect(r.fingers).toBeUndefined();
    expect(r.coverage.total).toBe(0);
  });

  it("a single completed workout today carries full weight - axis value equals its raw value", () => {
    const r = computeFatigueDecay(
      [makeWorkout({ status: "completed", date: "2026-03-28", fingers: 8, core: 4 })],
      asOf,
    );
    expect(r.fingers).toBeCloseTo(8, 10);
    expect(r.core).toBeCloseTo(4, 10);
    expect(r.arms).toBeUndefined();
    expect(r.systemic).toBeUndefined();
    expect(r.coverage).toEqual({ total: 1, fingers: 1, arms: 0, core: 1, systemic: 0 });
  });

  it("sessions add up, each faded by the half-life (3 days by default)", () => {
    // 2 today + 10 three days ago (one half-life -> 5) = 7, below the soft knee.
    const workouts = [
      makeWorkout({ status: "completed", date: "2026-03-28", fingers: 2 }),
      makeWorkout({ status: "completed", date: "2026-03-25", fingers: 8 }),
    ];
    const r = computeFatigueDecay(workouts, asOf);
    expect(r.fingers).toBeCloseTo(2 + 4, 10);
  });

  it("rest brings it down: one session rated 8 halves after one half-life and is near zero after ten days", () => {
    const one = [makeWorkout({ status: "completed", date: "2026-03-25", fingers: 8 })];
    expect(computeFatigueDecay(one, asOf).fingers).toBeCloseTo(4, 10);
    const old = [makeWorkout({ status: "completed", date: "2026-03-18", fingers: 8 })];
    expect(computeFatigueDecay(old, asOf).fingers!).toBeLessThan(1);
  });

  it("an axis missing on some workouts adds nothing to it, and isn't imputed", () => {
    const workouts = [
      makeWorkout({ status: "completed", date: "2026-03-28", fingers: 3, arms: 3 }),
      // No `arms` - e.g. a pre-arms-slider historical workout.
      makeWorkout({ status: "completed", date: "2026-03-28", fingers: 2 }),
    ];
    const r = computeFatigueDecay(workouts, asOf);
    expect(r.arms).toBeCloseTo(3, 10);
    expect(r.fingers).toBeCloseTo(5, 10);
    expect(r.coverage).toEqual({ total: 2, fingers: 2, arms: 1, core: 0, systemic: 0 });
  });

  it("respects a custom half-life (a plain number is the half-life)", () => {
    const workouts = [makeWorkout({ status: "completed", date: "2026-03-27", fingers: 4 })];
    expect(computeFatigueDecay(workouts, asOf, 1).fingers).toBeCloseTo(2, 10);
    expect(computeFatigueDecay(workouts, asOf, { halfLifeDays: 1 }).fingers).toBeCloseTo(2, 10);
  });

  it("clamps a workout dated after asOf to full weight rather than a >1 weight", () => {
    const workouts = [makeWorkout({ status: "completed", date: "2026-04-05", fingers: 6 })];
    const r = computeFatigueDecay(workouts, asOf);
    expect(r.fingers).toBeCloseTo(6, 10);
  });

  it("without softening (the default), stacked sessions are capped at 10", () => {
    const workouts = ["2026-03-26", "2026-03-27", "2026-03-28"].map((date) => makeWorkout({ status: "completed", date, fingers: 7 }));
    expect(computeFatigueDecay(workouts, asOf).fingers).toBe(10);
  });

  it("with softening, stacked sessions approach 10 without reaching it, and more fatigue still reads higher", () => {
    const days = (n: number) => Array.from({ length: n }, (_, i) => makeWorkout({ status: "completed", date: `2026-03-${28 - i}`, fingers: 7 }));
    const two = computeFatigueDecay(days(2), asOf, { soften: true }).fingers!;
    const three = computeFatigueDecay(days(3), asOf, { soften: true }).fingers!;
    expect(two).toBeLessThan(10);
    expect(three).toBeLessThan(10);
    expect(three).toBeGreaterThan(two);
  });
});

describe("fatigueReading", () => {
  it("leaves readings up to the knee exactly as they are", () => {
    expect(fatigueReading(5, { soften: true, softKnee: 6 })).toBe(5);
    expect(fatigueReading(6, { soften: true, softKnee: 6 })).toBe(6);
  });

  it("bends smoothly above the knee: continuous, rising, and below 10", () => {
    const m = { soften: true, softKnee: 6 };
    expect(fatigueReading(6.0001, m)).toBeCloseTo(6, 3);
    expect(fatigueReading(8, m)).toBeGreaterThan(7);
    expect(fatigueReading(8, m)).toBeLessThan(8);
    expect(fatigueReading(30, m)).toBeLessThan(10);
    expect(fatigueReading(30, m)).toBeGreaterThan(fatigueReading(15, m));
  });

  it("never goes below zero", () => {
    expect(fatigueReading(0)).toBe(0);
    expect(fatigueReading(-3)).toBe(0);
  });
});

describe("computeHrvBaseline", () => {
  it("no hrv entries -> undefined", () => {
    expect(computeHrvBaseline([], asOf)).toBeUndefined();
  });

  it("averages hrv entries within the trailing 14-day window (default)", () => {
    const entries: DailyMetricEntry[] = [
      { id: "1", metricId: "hrv", date: "2026-03-28", value: 60 },
      { id: "2", metricId: "hrv", date: "2026-03-20", value: 40 },
    ];
    expect(computeHrvBaseline(entries, asOf)).toBeCloseTo(50, 10);
  });

  it("excludes entries older than the window and entries for other metrics", () => {
    const entries: DailyMetricEntry[] = [
      { id: "1", metricId: "hrv", date: "2026-03-28", value: 60 },
      { id: "1b", metricId: "hrv", date: "2026-03-26", value: 60 },
      { id: "1c", metricId: "hrv", date: "2026-03-24", value: 60 },
      { id: "2", metricId: "hrv", date: "2026-03-01", value: 999 }, // >14 days back
      { id: "3", metricId: "sleep-score", date: "2026-03-28", value: 1 },
    ];
    expect(computeHrvBaseline(entries, asOf)).toBeCloseTo(60, 10);
  });

  it("after a break, uses the last readings before it rather than today's alone", () => {
    const before = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, metricId: "hrv", date: `2026-01-${String(i + 1).padStart(2, "0")}`, value: 70 }));
    const back: DailyMetricEntry = { id: "t", metricId: "hrv", date: "2026-03-28", value: 56 };
    // The last 14 readings: 13 old at 70, today at 56.
    expect(computeHrvBaseline([...before, back], asOf)).toBeCloseTo((13 * 70 + 56) / 14, 6);
  });

  it("ignores zero entries (a dead tracker, not an HRV of 0)", () => {
    const entries: DailyMetricEntry[] = [
      { id: "1", metricId: "hrv", date: "2026-03-28", value: 0 },
      { id: "2", metricId: "hrv", date: "2026-03-27", value: 0 },
      { id: "3", metricId: "hrv", date: "2026-03-20", value: 60 },
    ];
    expect(computeHrvBaseline(entries, asOf)).toBeCloseTo(60, 10);
  });

  it("is undefined when every entry in the window is zero", () => {
    const entries: DailyMetricEntry[] = [{ id: "1", metricId: "hrv", date: "2026-03-28", value: 0 }];
    expect(computeHrvBaseline(entries, asOf)).toBeUndefined();
  });

  it("respects a custom window", () => {
    const entries: DailyMetricEntry[] = [
      { id: "1", metricId: "hrv", date: "2026-03-28", value: 60 }, // today (offset 0)
      { id: "2", metricId: "hrv", date: "2026-03-27", value: 40 }, // yesterday (offset 1)
    ];
    expect(computeHrvBaseline(entries, asOf, 2)).toBeCloseTo(50, 10); // both offsets < 2
    expect(computeHrvBaseline(entries, asOf, 1)).toBeCloseTo(60, 10); // only offset 0 < 1
  });
});

describe("computeReadiness", () => {
  const sufficientAcwr = (ratio: number | undefined): RollingAcwrResult => ({
    acuteLoad: 0,
    chronicLoad: 0,
    ratio,
    daysCovered: 28,
    sufficient: true,
    activeWeeks: 4,
  });
  const insufficientAcwr = (ratio: number | undefined): RollingAcwrResult => ({
    acuteLoad: 0,
    chronicLoad: 0,
    ratio,
    daysCovered: 5,
    sufficient: false,
    activeWeeks: 0,
  });

  it("no inputs at all -> undefined score, neutral status, nothing marked as used", () => {
    const r = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined) });
    expect(r.score).toBeUndefined();
    expect(r.status).toBe("neutral");
    expect(r.inputsUsed).toEqual({ fatigue: false, acwr: false, sleep: false, hrv: false });
  });

  it("fatigue-only, low fatigue -> near-max score, good status, only fatigue marked used", () => {
    const r = computeReadiness({
      fatigue: { fingers: 1, core: 1, systemic: 1 },
      acwr: insufficientAcwr(undefined),
    });
    expect(r.score).toBeCloseTo(100, 10); // (1-1)/9 * penalty = 0
    expect(r.status).toBe("good");
    expect(r.inputsUsed).toEqual({ fatigue: true, acwr: false, sleep: false, hrv: false });
  });

  it("fatigue-only, max fatigue -> score reduced by exactly MAX_FATIGUE_PENALTY", () => {
    const r = computeReadiness({
      fatigue: { fingers: 10, core: 10, systemic: 10 },
      acwr: insufficientAcwr(undefined),
    });
    expect(r.score).toBeCloseTo(100 - MAX_FATIGUE_PENALTY, 10);
  });

  it("an insufficient ACWR window is never used, even when a ratio value is present", () => {
    const r = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(5) });
    expect(r.inputsUsed.acwr).toBe(false);
    expect(r.score).toBeUndefined(); // no input was usable at all
  });

  it("a sufficient, high ACWR ratio costs up to MAX_ACWR_PENALTY, capped at the high-risk ratio", () => {
    const atThreshold = computeReadiness({ fatigue: {}, acwr: sufficientAcwr(ACWR_HIGH_RISK_RATIO) });
    expect(atThreshold.score).toBeCloseTo(100 - MAX_ACWR_PENALTY, 10);

    const wellAbove = computeReadiness({ fatigue: {}, acwr: sufficientAcwr(ACWR_HIGH_RISK_RATIO * 3) });
    expect(wellAbove.score).toBeCloseTo(100 - MAX_ACWR_PENALTY, 10); // still capped, not worse
  });

  it("a sufficient ACWR ratio at or below 1 costs nothing", () => {
    const r = computeReadiness({ fatigue: {}, acwr: sufficientAcwr(0.7) });
    expect(r.score).toBeCloseTo(100, 10);
  });

  it("sleep below the low threshold costs points proportionally; at/above it costs nothing", () => {
    const low = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), sleep: 0 });
    expect(low.score).toBeCloseTo(100 - MAX_SLEEP_PENALTY, 10);

    const atThreshold = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), sleep: SLEEP_SCORE_LOW_THRESHOLD });
    expect(atThreshold.score).toBeCloseTo(100, 10);

    const high = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), sleep: 95 });
    expect(high.score).toBeCloseTo(100, 10);
    expect(high.inputsUsed.sleep).toBe(true);
  });

  it("an HRV dip below the 14-day baseline costs points, scaling to the full penalty at a 100% dip; HRV at/above baseline costs nothing", () => {
    const fullDip = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 0, hrvBaseline: 60 }); // 100% dip
    expect(fullDip.score).toBeCloseTo(100 - MAX_HRV_PENALTY, 10);

    // 50% dip: clamp((0.5 - 0.1) / (1 - 0.1), 0, 1) * MAX_HRV_PENALTY = (0.4/0.9) * MAX_HRV_PENALTY.
    const partialDip = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 30, hrvBaseline: 60 });
    expect(partialDip.score).toBeCloseTo(100 - (0.4 / 0.9) * MAX_HRV_PENALTY, 10);

    const atBaseline = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 60, hrvBaseline: 60 });
    expect(atBaseline.score).toBeCloseTo(100, 10);

    const aboveBaseline = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 70, hrvBaseline: 60 });
    expect(aboveBaseline.score).toBeCloseTo(100, 10);
  });

  it("hrv without a baseline (not enough history) is not used", () => {
    const r = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 30 });
    expect(r.inputsUsed.hrv).toBe(false);
  });

  it("never scores below 0 or above 100 even when every penalty stacks", () => {
    const worst = computeReadiness({
      fatigue: { fingers: 10, core: 10, systemic: 10 },
      acwr: sufficientAcwr(10),
      sleep: 0,
      hrv: 1,
      hrvBaseline: 100,
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
  });

  it("status buckets follow the score thresholds", () => {
    expect(computeReadiness({ fatigue: { fingers: 1, core: 1, systemic: 1 }, acwr: insufficientAcwr(undefined) }).status).toBe("good");

    const cautionScore = 100 - (READINESS_GOOD_THRESHOLD - READINESS_CAUTION_THRESHOLD - 1);
    // Sanity: thresholds are ordered sensibly.
    expect(READINESS_GOOD_THRESHOLD).toBeGreaterThan(READINESS_CAUTION_THRESHOLD);
    expect(cautionScore).toBeGreaterThan(0);
  });

  it("confidence names what's missing when only fatigue is available", () => {
    const r = computeReadiness({ fatigue: { fingers: 3, core: 3, systemic: 3 }, acwr: insufficientAcwr(undefined) });
    expect(r.confidence.toLowerCase()).toContain("fatigue");
    expect(r.confidence.toLowerCase()).toContain("hrv");
  });

  it("advice describes state, not an instruction - never issues a directive like 'rest' or 'avoid'", () => {
    const r = computeReadiness({
      fatigue: { fingers: 10, core: 10, systemic: 10 },
      acwr: sufficientAcwr(3),
    });
    expect(r.advice.toLowerCase()).not.toMatch(/\b(avoid|do not|don't|must|should|rest today)\b/);
  });

  it("advice falls back to a steady-state message when nothing stands out", () => {
    const r = computeReadiness({ fatigue: { fingers: 3, core: 3, systemic: 3 }, acwr: sufficientAcwr(1) });
    expect(r.advice.length).toBeGreaterThan(0);
  });
});

describe("computeReadiness penalties (the breakdown behind the score)", () => {
  const acwr = (ratio: number): RollingAcwrResult => ({ acuteLoad: 0, chronicLoad: 0, ratio, daysCovered: 28, sufficient: true, activeWeeks: 4 });

  it("reports what each input took off, and they add up to 100 - score", () => {
    const r = computeReadiness({
      fatigue: { fingers: 7, core: 3, systemic: 6 },
      acwr: acwr(1.25),
      sleep: 45,
      hrv: 45,
      hrvBaseline: 60,
    });
    const { fatigue, acwr: load, sleep, hrv } = r.penalties;
    expect(fatigue).toBeGreaterThan(0);
    expect(load).toBeGreaterThan(0);
    expect(sleep).toBeGreaterThan(0);
    expect(hrv).toBeGreaterThan(0);
    expect(100 - (fatigue + load + sleep + hrv)).toBeCloseTo(r.score!, 10);
  });

  it("is zero for inputs that were missing or cost nothing", () => {
    const r = computeReadiness({ fatigue: {}, acwr: acwr(0.9), sleep: 85 });
    expect(r.penalties).toEqual({ fatigue: 0, acwr: 0, sleep: 0, hrv: 0 });
  });
});

describe("computeReadiness with a custom config", () => {
  const acwr = (ratio: number): RollingAcwrResult => ({ acuteLoad: 0, chronicLoad: 0, ratio, daysCovered: 28, sufficient: true, activeWeeks: 4 });
  const base = { fatigue: { fingers: 6, core: 4, systemic: 6 }, acwr: acwr(1.3), sleep: 55, hrv: 50, hrvBaseline: 60 };

  it("leaves out inputs that are switched off", () => {
    const r = computeReadiness(base, { ...DEFAULT_READINESS_CONFIG, use: { fatigue: true, acwr: false, sleep: false, hrv: false } });
    expect(r.inputsUsed).toEqual({ fatigue: true, acwr: false, sleep: false, hrv: false });
    expect(r.penalties.acwr + r.penalties.sleep + r.penalties.hrv).toBe(0);
  });

  it("uses the configured low-sleep score and HRV dip", () => {
    const strict = computeReadiness(base, { ...DEFAULT_READINESS_CONFIG, sleepLow: 50, hrvDip: 0.2 });
    expect(strict.penalties.sleep).toBe(0); // 55 is above a low of 50
    expect(strict.penalties.hrv).toBe(0); // a 17% dip is inside a 20% allowance
    expect(computeReadiness(base).penalties.sleep).toBeGreaterThan(0);
  });

  it("scales the load penalty to the configured high-risk ratio", () => {
    const lenient = computeReadiness(base, { ...DEFAULT_READINESS_CONFIG, acwrHighRisk: 2 });
    expect(lenient.penalties.acwr).toBeLessThan(computeReadiness(base).penalties.acwr);
  });
});

describe("sleep duration (Health Connect) when there's no sleep score", () => {
  const acwr = { acuteLoad: 0, chronicLoad: 0, ratio: undefined, sufficient: false, activeWeeks: 0 } as never;

  it("costs nothing at or above the short-sleep line, the full sleep penalty three hours under it", () => {
    expect(computeReadiness({ fatigue: {}, acwr, sleepHours: 7.5 }).penalties.sleep).toBe(0);
    expect(computeReadiness({ fatigue: {}, acwr, sleepHours: 5.5 }).penalties.sleep).toBeCloseTo(MAX_SLEEP_PENALTY / 2);
    expect(computeReadiness({ fatigue: {}, acwr, sleepHours: 3 }).penalties.sleep).toBe(MAX_SLEEP_PENALTY);
  });

  it("counts as the sleep input and says the night was short", () => {
    const r = computeReadiness({ fatigue: {}, acwr, sleepHours: 5.5 });
    expect(r.inputsUsed.sleep).toBe(true);
    expect(r.advice.toLowerCase()).toContain("sleep was short (5.5 h)");
  });

  it("a sleep score, when there is one, is used instead", () => {
    const r = computeReadiness({ fatigue: {}, acwr, sleep: 80, sleepHours: 4 });
    expect(r.penalties.sleep).toBe(0);
  });
});

describe("naps boost sleep duration", () => {
  const acwr = { acuteLoad: 0, chronicLoad: 0, ratio: undefined, sufficient: false, activeWeeks: 0 } as never;

  it("add to the night's hours", () => {
    const night = computeReadiness({ fatigue: {}, acwr, sleepHours: 5.5 });
    const napped = computeReadiness({ fatigue: {}, acwr, sleepHours: 5.5, napHours: 1 });
    expect(napped.penalties.sleep).toBeCloseTo(MAX_SLEEP_PENALTY / 6);
    expect(napped.penalties.sleep).toBeLessThan(night.penalties.sleep);
    expect(napped.advice.toLowerCase()).toContain("sleep was short (6.5 h with naps)");
  });

  it("don't count without a night to add to, or when there's a sleep score", () => {
    expect(computeReadiness({ fatigue: {}, acwr, napHours: 1 }).inputsUsed.sleep).toBe(false);
    expect(computeReadiness({ fatigue: {}, acwr, sleep: 50, napHours: 3 }).penalties.sleep)
      .toBe(computeReadiness({ fatigue: {}, acwr, sleep: 50 }).penalties.sleep);
  });
});
