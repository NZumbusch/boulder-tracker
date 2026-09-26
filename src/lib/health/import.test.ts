import { describe, expect, it } from "vitest";
import { dailyValues, planImport, importedEntryId } from "./import";
import type { DailyMetricEntry } from "../types";

describe("Health Connect readings to daily values", () => {
  it("averages resting HR, keeps the day's last weight, and adds up sleep in hours", () => {
    const values = dailyValues({
      restingHeartRate: [{ date: "2026-09-25", bpm: 50 }, { date: "2026-09-25", bpm: 53 }],
      weight: [{ date: "2026-09-25", kg: 68.44 }, { date: "2026-09-25", kg: 68.91 }],
      sleep: [{ date: "2026-09-25", asleepMinutes: 420 }, { date: "2026-09-25", asleepMinutes: 30 }],
    });
    expect(values).toEqual([
      { metricId: "rhr", date: "2026-09-25", value: 52 },
      { metricId: "bodyweight", date: "2026-09-25", value: 68.9 },
      { metricId: "sleep-duration", date: "2026-09-25", value: 7.5 },
    ]);
  });

  it("drops sleep sessions with no time asleep", () => {
    expect(dailyValues({ restingHeartRate: [], weight: [], sleep: [{ date: "2026-09-25", asleepMinutes: 0 }] })).toEqual([]);
  });
});

describe("what an import stores", () => {
  const v = (metricId: string, date: string, value: number) => ({ metricId, date, value });

  it("creates entries with fixed ids, marked as imported", () => {
    const { upserts } = planImport([], [v("rhr", "2026-09-25", 52)]);
    expect(upserts).toEqual([{ id: "hc-rhr-2026-09-25", metricId: "rhr", date: "2026-09-25", value: 52, source: "health-connect" }]);
  });

  it("never overwrites a value typed by hand", () => {
    const manual: DailyMetricEntry = { id: "abc", metricId: "rhr", date: "2026-09-25", value: 49 };
    const plan = planImport([manual], [v("rhr", "2026-09-25", 52)]);
    expect(plan.upserts).toEqual([]);
    expect(plan.keptManual).toBe(1);
  });

  it("treats an imported value edited by hand as hand-entered", () => {
    const edited: DailyMetricEntry = { id: importedEntryId("rhr", "2026-09-25"), metricId: "rhr", date: "2026-09-25", value: 47 };
    expect(planImport([edited], [v("rhr", "2026-09-25", 52)]).upserts).toEqual([]);
  });

  it("updates its own earlier import when Health Connect has a newer value, and skips unchanged ones", () => {
    const earlier: DailyMetricEntry = { id: "hc-rhr-2026-09-25", metricId: "rhr", date: "2026-09-25", value: 50, source: "health-connect" };
    expect(planImport([earlier], [v("rhr", "2026-09-25", 52)]).upserts[0]).toMatchObject({ id: "hc-rhr-2026-09-25", value: 52 });
    expect(planImport([earlier], [v("rhr", "2026-09-25", 50)]).upserts).toEqual([]);
  });

  it("leaves other metrics and days alone", () => {
    const manual: DailyMetricEntry = { id: "abc", metricId: "rhr", date: "2026-09-24", value: 49 };
    expect(planImport([manual], [v("rhr", "2026-09-25", 52), v("bodyweight", "2026-09-24", 68)]).upserts).toHaveLength(2);
  });
});
