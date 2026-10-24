import { describe, expect, it } from "vitest";
import type { DailyMetricEntry, ExternalActivity } from "../types";
import { addDaysIso } from "../dateUtils";
import { buildOtherTrainingContext, buildRecoveryContext } from "./wellnessContext";

const ASOF = new Date(2026, 9, 24, 12); // Sat 24 Oct 2026, local
const TODAY = "2026-10-24";
const e = (metricId: string, daysAgo: number, value: number): DailyMetricEntry => ({ id: `${metricId}${daysAgo}`, metricId, date: addDaysIso(TODAY, -daysAgo), value });
const series = (metricId: string, values: (number | undefined)[]) => values.flatMap((v, i) => (v === undefined ? [] : [e(metricId, i, v)]));

describe("buildRecoveryContext", () => {
  const entries = [
    ...series("hrv", Array.from({ length: 40 }, (_, i) => (i < 3 ? 60 : 80))),
    ...series("sleep-score", Array.from({ length: 40 }, (_, i) => (i < 7 ? 70 : 82))),
    ...series("rhr", Array.from({ length: 40 }, () => 50)),
    ...series("body-battery-high", [95, 90]),
    ...series("sleep-duration", [7.04, 7.5]),
  ];

  it("is nothing without data", () => {
    expect(buildRecoveryContext([], ASOF, "full")).toBeUndefined();
  });

  it("brief: last night with HRV against baseline, two averages and what is off - no weekly or daily rows", () => {
    const r = buildRecoveryContext(entries, ASOF, "brief")!;
    expect(r.lastNight).toMatchObject({ date: TODAY, hrv: 60, sleepScore: 70, sleepHours: 7, bodyBatteryHigh: 95 });
    expect(r.lastNight!.hrvVsBaselinePct).toBeLessThan(-20);
    expect(r.average7Days!.sleepScore).toBe(70);
    expect(r.average28Days!.sleepScore).toBeGreaterThan(70);
    expect(r.flags!.join(" ")).toMatch(/HRV was more than 10 % below/);
    expect(r.flags!.join(" ")).toMatch(/sleep score is down to 70/);
    expect(r.weekly).toBeUndefined();
    expect(r.daily).toBeUndefined();
  });

  it("standard adds one row per week; full adds the last two weeks day by day", () => {
    const s = buildRecoveryContext(entries, ASOF, "standard", 4)!;
    expect(s.weekly!.length).toBeGreaterThan(1);
    expect(s.weekly!.length).toBeLessThanOrEqual(4);
    expect(s.weekly![s.weekly!.length - 1].week).toBe("2026-W43");
    expect(s.daily).toBeUndefined();
    const f = buildRecoveryContext(entries, ASOF, "full", 4)!;
    expect(f.daily!).toHaveLength(14);
    expect(f.daily![f.daily!.length - 1]).toMatchObject({ date: TODAY, hrv: 60 });
  });

  it("leaves out metrics with no data and uses the latest night within three days", () => {
    const old = buildRecoveryContext(series("hrv", [undefined, undefined, 75, 76]), ASOF, "brief")!;
    expect(old.lastNight).toMatchObject({ date: addDaysIso(TODAY, -2), hrv: 75 });
    expect(old.lastNight).not.toHaveProperty("sleepScore");
    const stale = buildRecoveryContext(series("hrv", [undefined, undefined, undefined, undefined, undefined, 75]), ASOF, "brief")!;
    expect(stale.lastNight).toBeUndefined();
  });
});

describe("buildOtherTrainingContext", () => {
  const act = (id: string, type: string, date: string, minutes: number, extra: Partial<ExternalActivity> = {}): ExternalActivity => ({
    id, source: "strava", sourceId: id, date, start: `${date}T06:00:00Z`, name: id, type, durationSec: minutes * 60, ...extra,
  });
  const items = [
    act("a", "Run", "2026-10-22", 40, { avgHr: 152, distanceM: 7000 }),
    act("b", "Walk", "2026-10-21", 60),
    act("c", "Ride", "2026-10-06", 90),
    act("old", "Run", "2025-01-01", 30),
  ];

  it("is nothing without activities that count", () => {
    expect(buildOtherTrainingContext([], ASOF, "summary", { fullWeeks: 2, summaryWeeks: 4 })).toBeUndefined();
    expect(buildOtherTrainingContext([act("x", "Run", "2025-01-01", 30)], ASOF, "summary", { fullWeeks: 2, summaryWeeks: 4 })).toBeUndefined();
  });

  it("summary: one line per week with count, hours, load and kinds, outside the window left out", () => {
    const r = buildOtherTrainingContext(items, ASOF, "summary", { fullWeeks: 2, summaryWeeks: 4 })!;
    const w43 = r.weekly.find((w) => w.week === "2026-W43")!;
    expect(w43).toMatchObject({ activities: 2, hours: 1.7, kinds: { run: 1, walk: 1 } });
    expect(w43.load).toBeGreaterThan(0);
    expect(r.weekly.find((w) => w.week === "2026-W41")!.kinds).toEqual({ ride: 1 });
    expect(r.activities).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("2025");
  });

  it("list: adds the activities of the recent full weeks only", () => {
    const r = buildOtherTrainingContext(items, ASOF, "list", { fullWeeks: 2, summaryWeeks: 4 })!;
    expect(r.activities!.map((a) => a.type)).toEqual(["Walk", "Run"]);
    expect(r.activities![1]).toMatchObject({ minutes: 40, km: 7, avgHr: 152 });
  });
});
