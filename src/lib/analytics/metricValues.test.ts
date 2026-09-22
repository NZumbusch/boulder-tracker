import { describe, it, expect } from "vitest";
import type { DailyMetricEntry } from "../types";
import { averageReading, isLoggedMetricValue, loggedMetrics } from "./metricValues";

describe("isLoggedMetricValue", () => {
  it("accepts positive readings", () => {
    expect(isLoggedMetricValue(58)).toBe(true);
    expect(isLoggedMetricValue(0.5)).toBe(true);
  });

  it("rejects zero, negatives and non-finite values", () => {
    expect(isLoggedMetricValue(0)).toBe(false);
    expect(isLoggedMetricValue(-3)).toBe(false);
    expect(isLoggedMetricValue(NaN)).toBe(false);
    expect(isLoggedMetricValue(Infinity)).toBe(false);
  });
});

describe("loggedMetrics", () => {
  it("drops zero entries and keeps the rest in order", () => {
    const entries: DailyMetricEntry[] = [
      { id: "1", metricId: "hrv", date: "2026-09-10", value: 58 },
      { id: "2", metricId: "hrv", date: "2026-09-11", value: 0 },
      { id: "3", metricId: "hrv", date: "2026-09-12", value: 61 },
    ];
    expect(loggedMetrics(entries).map((e) => e.id)).toEqual(["1", "3"]);
  });
});

describe("averageReading", () => {
  const asOf = new Date("2026-09-22T12:00:00Z");
  const entries: DailyMetricEntry[] = [
    { id: "a", metricId: "bw", date: "2026-09-22", value: 71 },
    { id: "b", metricId: "bw", date: "2026-09-20", value: 72 },
    { id: "c", metricId: "bw", date: "2026-09-19", value: 0 },
    { id: "d", metricId: "bw", date: "2026-09-14", value: 73 },
    { id: "e", metricId: "bw", date: "2026-09-05", value: 99 }, // outside both windows
  ];

  it("averages the real readings in the last seven days", () => {
    expect(averageReading(entries, "bw", asOf)).toBeCloseTo(71.5, 10);
  });

  it("averages the week before with an offset", () => {
    expect(averageReading(entries, "bw", asOf, 7, 7)).toBeCloseTo(73, 10);
  });

  it("is undefined with no readings in the window", () => {
    expect(averageReading(entries, "hrv", asOf)).toBeUndefined();
  });
});
