import { describe, expect, it } from "vitest";
import type { DailyMetricEntry } from "../../types";
import { toUtcDayIndex } from "../../dateUtils";
import { buildRecoverySeries, dayIndexToIso } from "../recoverySeries";
import { buildReadingsIndex } from "../metricValues";
import { ReadingsModel } from "./readingsModel";

const DAY0 = toUtcDayIndex("2026-03-01");
const e = (metricId: string, day: number, value: number): DailyMetricEntry => ({ id: `${metricId}${day}`, metricId, date: dayIndexToIso(day), value });
const HRV = { id: "hrv", higherIsBetter: true };

function entries(): DailyMetricEntry[] {
  const out: DailyMetricEntry[] = [];
  for (let i = 0; i < 90; i++) {
    if (i >= 40 && i < 55) continue; // a break
    out.push(e("hrv", DAY0 + i, 60 + ((i * 7) % 25)), e("rhr", DAY0 + i, 50 + (i % 4)));
  }
  return out;
}

describe("ReadingsModel", () => {
  it("gives exactly the series the pure function gives, for any window, in either direction", () => {
    const data = entries();
    const model = new ReadingsModel(data);
    const byDay = buildReadingsIndex(data).get("hrv")!;
    for (const dir of [true, false]) {
      const spec = { id: "hrv", higherIsBetter: dir };
      expect(model.recoveryRange(spec, DAY0 - 5, DAY0 + 100)).toEqual(buildRecoverySeries(byDay, spec, DAY0 - 5, DAY0 + 100));
    }
  });

  it("serves overlapping windows from the same days, and a metric with no data as empty days", () => {
    const model = new ReadingsModel(entries());
    const a = model.recoveryRange(HRV, DAY0, DAY0 + 30);
    const b = model.recoveryRange(HRV, DAY0 + 10, DAY0 + 40);
    expect(b[0]).toBe(a[10]);
    expect(model.recovery(HRV)).toBe(model.recovery({ id: "hrv", higherIsBetter: true }));
    expect(model.recovery({ id: "hrv", higherIsBetter: false })).not.toBe(model.recovery(HRV));
    expect(model.recoveryRange({ id: "steps", higherIsBetter: true }, DAY0, DAY0 + 2).every((d) => d.value === undefined)).toBe(true);
  });

  it("is a snapshot: changing or replacing the entries afterwards changes nothing it says", () => {
    const data = entries();
    const model = new ReadingsModel(data);
    const before = model.recoveryRange(HRV, DAY0 + 20, DAY0 + 30).map((d) => d.value);
    for (const x of data) x.value = 1;
    data.length = 0;
    expect(model.recoveryRange(HRV, DAY0 + 20, DAY0 + 30).map((d) => d.value)).toEqual(before);
    expect(model.readings("hrv").size).toBeGreaterThan(0);
  });

  it("knows where its data is", () => {
    const model = new ReadingsModel(entries());
    expect(model.hasReadings("hrv", DAY0 + 41, DAY0 + 54)).toBe(false);
    expect(model.hasReadings("hrv", DAY0 + 41, DAY0 + 55)).toBe(true);
    expect(model.hasReadings("steps", DAY0, DAY0 + 100)).toBe(false);
    expect(model.firstReadingDay("hrv")).toBe(DAY0);
    expect(model.firstReadingDay("steps")).toBeUndefined();
    expect(model.hrvReadings().map((r) => r.day)).toEqual([...model.readings("hrv").keys()].sort((a, b) => a - b));
  });

  it("warms in slices until done, newest day first, and warming changes no answer", () => {
    const today = Math.floor(Date.now() / 86400000);
    const recent: DailyMetricEntry[] = Array.from({ length: 60 }, (_, i) => e("hrv", today - 59 + i, 70 + (i % 9)));
    const model = new ReadingsModel(recent);
    const cold = new ReadingsModel(recent).recoveryRange(HRV, today - 80, today);
    let rounds = 0;
    while (!model.warm(0) && rounds++ < 500);
    expect(rounds).toBeLessThan(500);
    expect(model.recovery(HRV).size).toBeGreaterThanOrEqual(60);
    expect(model.recoveryRange(HRV, today - 80, today)).toEqual(cold);
    expect(model.warm(5)).toBe(true);
  });
});
