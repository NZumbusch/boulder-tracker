import { describe, expect, it } from "vitest";
import { dailyValues, planImport, importedEntryId } from "./import";
import type { DailyMetricEntry } from "../types";

describe("Health Connect readings to daily values", () => {
  const sleep = (date: string, start: string, time: string, asleepMinutes: number) => ({ date, start: `${start}Z`, time: `${time}Z`, asleepMinutes });
  const only = (sleeps: ReturnType<typeof sleep>[]) => dailyValues({ restingHeartRate: [], weight: [], sleep: sleeps });

  it("averages resting HR and keeps the day's last weight", () => {
    const values = dailyValues({
      restingHeartRate: [{ date: "2026-09-25", bpm: 50 }, { date: "2026-09-25", bpm: 53 }],
      weight: [{ date: "2026-09-25", kg: 68.44 }, { date: "2026-09-25", kg: 68.91 }],
      sleep: [],
    });
    expect(values).toEqual([
      { metricId: "rhr", date: "2026-09-25", value: 52 },
      { metricId: "bodyweight", date: "2026-09-25", value: 68.9 },
    ]);
  });

  it("the longest sleep ending that day is the night; the others are naps, stored apart", () => {
    expect(only([
      sleep("2026-09-25", "2026-09-24T22:30:00", "2026-09-25T06:00:00", 420),
      sleep("2026-09-25", "2026-09-25T13:00:00", "2026-09-25T13:25:00", 24),
      sleep("2026-09-25", "2026-09-25T17:00:00", "2026-09-25T17:20:00", 18),
    ])).toEqual([
      { metricId: "sleep-duration", date: "2026-09-25", value: 7 },
      { metricId: "nap-duration", date: "2026-09-25", value: 0.7 },
    ]);
  });

  it("counts the same night written by two apps once, keeping the longer record", () => {
    expect(only([
      sleep("2026-09-25", "2026-09-24T22:30:00", "2026-09-25T06:00:00", 420),
      sleep("2026-09-25", "2026-09-24T22:40:00", "2026-09-25T06:05:00", 432),
    ])).toEqual([{ metricId: "sleep-duration", date: "2026-09-25", value: 7.2 }]);
  });

  it("a nap recorded by two apps is also one nap", () => {
    const values = only([
      sleep("2026-09-25", "2026-09-24T22:30:00", "2026-09-25T06:00:00", 420),
      sleep("2026-09-25", "2026-09-25T13:00:00", "2026-09-25T13:30:00", 30),
      sleep("2026-09-25", "2026-09-25T13:05:00", "2026-09-25T13:30:00", 24),
    ]);
    expect(values.find((v) => v.metricId === "nap-duration")?.value).toBe(0.5);
  });

  it("drops sleep sessions with no time asleep", () => {
    expect(only([sleep("2026-09-25", "2026-09-25T13:00:00", "2026-09-25T13:10:00", 0)])).toEqual([]);
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
