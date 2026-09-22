import { describe, it, expect } from "vitest";
import type { DailyMetricEntry } from "../types";
import { isLoggedMetricValue, loggedMetrics } from "./metricValues";

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
