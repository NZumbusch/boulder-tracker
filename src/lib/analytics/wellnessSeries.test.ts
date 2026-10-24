import { describe, expect, it } from "vitest";
import type { DailyMetricEntry } from "../types";
import { ReadingsModel } from "./daily/readingsModel";
import type { RecoveryMetricSpec } from "./recoverySeries";

const buildRecoverySeries = (entries: DailyMetricEntry[], spec: RecoveryMetricSpec, first: number, last: number) => new ReadingsModel(entries).recoveryRange(spec, first, last);
import { measuresWithData, summariseSeries, WELLNESS_MEASURES } from "./wellnessSeries";

const DAY0 = Math.floor(Date.UTC(2026, 8, 1) / 86400000);
const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
const entries = (metricId: string, values: (number | undefined)[]): DailyMetricEntry[] =>
  values.flatMap((v, i) => (v === undefined ? [] : [{ id: `${metricId}${i}`, metricId, date: iso(DAY0 + i), value: v }]));

describe("measuresWithData", () => {
  it("offers only the measures with a reading in the window", () => {
    const e = [...entries("stress", [30, 32]), ...entries("body-battery-low", [10, 12])];
    expect(measuresWithData(new ReadingsModel(e), DAY0, DAY0 + 5).map((m) => m.id)).toEqual(["body-battery", "stress"]);
    expect(measuresWithData(new ReadingsModel(e), DAY0 + 100, DAY0 + 110)).toEqual([]);
    expect(measuresWithData(new ReadingsModel([]), DAY0, DAY0 + 5)).toEqual([]);
  });
  it("every measure draws known metric ids", () => {
    expect(WELLNESS_MEASURES.flatMap((m) => m.series.map((s) => s.id))).toEqual(["body-battery-high", "body-battery-low", "stress", "steps", "breathing-sleep", "vo2max"]);
  });
});

describe("summariseSeries", () => {
  const steady = Array.from({ length: 30 }, (_, i) => 8000 + (i % 2) * 500);

  it("reports the latest reading, the 7-day average and where it stands against your usual", () => {
    const days = buildRecoverySeries(entries("steps", [...steady, 8200]), { id: "steps", higherIsBetter: true }, DAY0, DAY0 + 30);
    const s = summariseSeries(days);
    expect(s.latest).toEqual({ value: 8200, date: iso(DAY0 + 30) });
    expect(s.position).toBe("within");
    expect(s.range!.low).toBeLessThan(s.range!.high);
  });

  it("says above or below once the average leaves the normal range", () => {
    const low = buildRecoverySeries(entries("steps", [...steady, 2000, 2000, 2000, 2000, 2000, 2000, 2000]), { id: "steps", higherIsBetter: true }, DAY0, DAY0 + 36);
    expect(summariseSeries(low).position).toBe("below");
    const high = buildRecoverySeries(entries("steps", [...steady, 20000, 20000, 20000, 20000, 20000, 20000, 20000]), { id: "steps", higherIsBetter: true }, DAY0, DAY0 + 36);
    expect(summariseSeries(high).position).toBe("above");
  });

  it("has no range or position without a baseline", () => {
    const days = buildRecoverySeries(entries("steps", [8000, 8100]), { id: "steps", higherIsBetter: true }, DAY0, DAY0 + 1);
    const s = summariseSeries(days);
    expect(s.latest?.value).toBe(8100);
    expect(s.range).toBeUndefined();
    expect(s.position).toBeUndefined();
  });
});
