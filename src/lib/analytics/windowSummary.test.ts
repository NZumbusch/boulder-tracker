import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import { windowStats, comparisonSpans, percentChange } from "./windowSummary";
import { toUtcDayIndex } from "../dateUtils";

const D = (iso: string) => toUtcDayIndex(iso);

function workout(date: string, loadFactor: number, extra: Partial<Workout> = {}): Workout {
  return { id: date + loadFactor, status: "completed", date: `${date}T10:00:00.000Z`, weekId: "2026-W38", loadFactor, exercises: [], actualDuration: 90, ...extra };
}

describe("windowStats", () => {
  const data = {
    workouts: [
      workout("2026-09-14", 300),
      workout("2026-09-16", 200),
      workout("2026-09-30", 999),
      workout("2026-09-15", 500, { status: "planned", date: null }),
    ],
    dailyMetrics: [
      { id: "a", metricId: "hrv", date: "2026-09-14", value: 60 },
      { id: "b", metricId: "hrv", date: "2026-09-15", value: 70 },
      { id: "c", metricId: "hrv", date: "2026-09-16", value: 0 },
    ],
    outdoorAscents: [{ id: "s", date: "2026-09-19", grade: "7A" }],
  };

  it("adds up completed sessions, time and load inside the span only", () => {
    const s = windowStats(data, { startDay: D("2026-09-14"), endDay: D("2026-09-20") });
    expect(s.sessions).toBe(2);
    expect(s.minutes).toBe(180);
    expect(s.load).toBe(500);
    expect(s.sends).toBe(1);
  });

  it("averages real metric readings and skips zeros", () => {
    const s = windowStats(data, { startDay: D("2026-09-14"), endDay: D("2026-09-20") });
    expect(s.hrv).toBe(65);
    expect(s.rhr).toBeUndefined();
  });
});

describe("comparisonSpans", () => {
  const current = { startDay: 100, endDay: 190 };
  const previous = { startDay: 9, endDay: 99 };

  it("compares a finished window with the whole previous one", () => {
    expect(comparisonSpans(current, previous, 200)).toEqual({ current, previous });
  });

  it("cuts both to the elapsed days when today is inside the window", () => {
    expect(comparisonSpans(current, previous, 130)).toEqual({
      current: { startDay: 100, endDay: 130 },
      previous: { startDay: 9, endDay: 39 },
    });
  });

  it("has nothing to compare for a future window", () => {
    expect(comparisonSpans(current, previous, 50)).toBeUndefined();
  });
});

describe("percentChange", () => {
  it("is relative, and undefined against nothing", () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(10, 0)).toBeUndefined();
    expect(percentChange(undefined, 5)).toBeUndefined();
  });
});

describe("sleep hours next to the score", () => {
  it("averages Health Connect hours separately from the score", () => {
    const stats = windowStats(
      { workouts: [], dailyMetrics: [
        { id: "a", metricId: "sleep-duration", date: "2026-03-02", value: 7 },
        { id: "b", metricId: "sleep-duration", date: "2026-03-03", value: 8 },
      ], outdoorAscents: [] },
      { startDay: toUtcDayIndex("2026-03-01"), endDay: toUtcDayIndex("2026-03-07") },
    );
    expect(stats.sleepHours).toBe(7.5);
    expect(stats.sleep).toBeUndefined();
  });
});
