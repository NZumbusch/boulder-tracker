import { describe, it, expect } from "vitest";
import type { Workout, DailyMetricEntry } from "../types";
import {
  buildRecoverySeries,
  dayIndexToIso,
  localDayIndex,
  readingsByDay,
  readinessByDay,
  loadRecoveryInsights,
  dailyLoadByDay,
  MIN_BASELINE_READINGS,
  sleepMetricId,
} from "./recoverySeries";
import { toUtcDayIndex } from "../dateUtils";

const DAY0 = toUtcDayIndex("2026-03-01");

function entry(metricId: string, day: number, value: number): DailyMetricEntry {
  return { id: `${metricId}-${day}`, metricId, date: dayIndexToIso(day), value };
}

function workout(day: number, loadFactor: number, extra: Partial<Workout> = {}): Workout {
  return { id: `w${day}`, status: "completed", date: `${dayIndexToIso(day)}T10:00:00.000Z`, weekId: "2026-W10", loadFactor, exercises: [], ...extra };
}

const HRV = { id: "hrv", higherIsBetter: true };
const RHR = { id: "rhr", higherIsBetter: false };

describe("day indices", () => {
  it("round-trips an ISO day", () => {
    expect(dayIndexToIso(toUtcDayIndex("2026-09-25"))).toBe("2026-09-25");
  });
  it("reads a local date by its calendar day, not its UTC instant", () => {
    expect(dayIndexToIso(localDayIndex(new Date(2026, 8, 21, 0, 0)))).toBe("2026-09-21");
  });
});

describe("readingsByDay", () => {
  it("drops zero readings and averages two readings on one day", () => {
    const byDay = readingsByDay([entry("hrv", DAY0, 60), { ...entry("hrv", DAY0, 70), id: "x" }, entry("hrv", DAY0 + 1, 0)], "hrv");
    expect(byDay.get(DAY0)).toBe(65);
    expect(byDay.has(DAY0 + 1)).toBe(false);
  });
});

describe("buildRecoverySeries", () => {
  const steady = Array.from({ length: 28 }, (_, i) => entry("hrv", DAY0 + i, i % 2 === 0 ? 58 : 62));

  it("has no baseline until enough prior days are logged", () => {
    const series = buildRecoverySeries(steady, HRV, DAY0, DAY0 + MIN_BASELINE_READINGS);
    expect(series[MIN_BASELINE_READINGS - 1].baseline).toBeUndefined();
    expect(series[MIN_BASELINE_READINGS].baseline).toBeCloseTo(60, 0);
  });

  it("gives one entry per day, including days without a reading", () => {
    const series = buildRecoverySeries([entry("hrv", DAY0, 60)], HRV, DAY0, DAY0 + 4);
    expect(series).toHaveLength(5);
    expect(series[3].value).toBeUndefined();
  });

  it("reports deviation from a baseline that excludes the day itself", () => {
    const data = [...steady, entry("hrv", DAY0 + 28, 48)];
    const last = buildRecoverySeries(data, HRV, DAY0 + 28, DAY0 + 28)[0];
    expect(last.baseline).toBe(60);
    expect(last.deviation).toBeCloseTo(-20);
    expect(last.sd).toBeGreaterThan(0);
  });

  it("flips resting HR so a higher heart rate reads as worse", () => {
    const data = [...Array.from({ length: 10 }, (_, i) => entry("rhr", DAY0 + i, 50)), entry("rhr", DAY0 + 10, 55)];
    expect(buildRecoverySeries(data, RHR, DAY0 + 10, DAY0 + 10)[0].deviation).toBeCloseTo(-10);
  });

  it("after a break, measures against the last readings before it instead of dropping the day", () => {
    // Four weeks of readings, a two-month break, then two new readings.
    const back = DAY0 + 28 + 60;
    const data = [...steady, entry("hrv", back, 66), entry("hrv", back + 1, 54)];
    const [first, second] = buildRecoverySeries(data, HRV, back, back + 1);
    expect(first.baseline).toBe(60);
    expect(first.deviation).toBeCloseTo(10);
    expect(first.baselineAfterBreak).toBe(true);
    // The new readings join the fallback baseline as they come in.
    expect(second.deviation).toBeDefined();
  });

  it("still has no baseline with fewer than the minimum readings ever, and only looks back a year", () => {
    const few = Array.from({ length: MIN_BASELINE_READINGS - 1 }, (_, i) => entry("rhr", DAY0 + i, 50));
    expect(buildRecoverySeries([...few, entry("rhr", DAY0 + 40, 55)], RHR, DAY0 + 40, DAY0 + 40)[0].deviation).toBeUndefined();
    const longAgo = DAY0 + 28 + 400;
    expect(buildRecoverySeries([...steady, entry("hrv", longAgo, 60)], HRV, longAgo, longAgo)[0].baseline).toBeUndefined();
  });

  it("smooths with a rolling average once two readings are in range", () => {
    const series = buildRecoverySeries([entry("hrv", DAY0, 50), entry("hrv", DAY0 + 2, 70)], HRV, DAY0, DAY0 + 2);
    expect(series[0].avg).toBeUndefined();
    expect(series[2].avg).toBe(60);
  });
});

describe("dailyLoadByDay", () => {
  it("sums completed sessions per day and ignores planned ones", () => {
    const byDay = dailyLoadByDay([workout(DAY0, 100), workout(DAY0, 50, { id: "b" }), workout(DAY0, 999, { id: "p", status: "planned" })]);
    expect(byDay.get(DAY0)).toBe(150);
  });
});

describe("readinessByDay", () => {
  it("ignores sessions that happen after the day being scored", () => {
    const hard = workout(DAY0 + 5, 300, { fingers: 10, core: 10, systemic: 10 });
    const scores = readinessByDay([hard], [], DAY0, DAY0 + 5);
    expect(scores.has(DAY0)).toBe(false);
    expect(scores.get(DAY0 + 5)).toBeLessThan(100);
  });
});

describe("loadRecoveryInsights", () => {
  it("finds HRV dipping after hard days and recovering after rest", () => {
    const entries: DailyMetricEntry[] = [];
    const workouts: Workout[] = [];
    // 60 days alternating: hard day (HRV the next morning 50), rest day (next morning 66).
    for (let i = 0; i < 60; i++) {
      const day = DAY0 + i;
      if (i % 2 === 0) workouts.push(workout(day, 400, { id: `w${i}` }));
      entries.push(entry("hrv", day, i % 2 === 1 ? 50 : 66));
    }
    const insights = loadRecoveryInsights(entries, workouts, DAY0 + 60);
    const hrv = insights.find((x) => x.metricId === "hrv");
    expect(hrv).toBeDefined();
    expect(hrv!.afterHard).toBeLessThan(hrv!.afterRest);
  });

  it("says nothing without enough data", () => {
    expect(loadRecoveryInsights([entry("hrv", DAY0, 60)], [workout(DAY0, 100)], DAY0 + 1)).toEqual([]);
  });
});

describe("the Sleep slot: score where there are scores, else hours", () => {
  it("uses the sleep score when the window has any", () => {
    expect(sleepMetricId([entry("sleep-score", DAY0, 80), entry("sleep-duration", DAY0 + 1, 7)], DAY0, DAY0 + 6)).toBe("sleep-score");
  });

  it("falls back to hours asleep when there are no scores in the window", () => {
    expect(sleepMetricId([entry("sleep-score", DAY0 - 30, 80), entry("sleep-duration", DAY0 + 1, 7)], DAY0, DAY0 + 6)).toBe("sleep-duration");
  });

  it("is the score when there's neither, so empty charts stay as they were", () => {
    expect(sleepMetricId([], DAY0, DAY0 + 6)).toBe("sleep-score");
  });
});

describe("readinessByDay with Health Connect sleep", () => {
  it("counts a short night and lets that day's naps soften it", () => {
    const short = readinessByDay([], [entry("sleep-duration", DAY0, 4)], DAY0, DAY0).get(DAY0)!;
    const napped = readinessByDay([], [entry("sleep-duration", DAY0, 4), entry("nap-duration", DAY0, 1.5)], DAY0, DAY0).get(DAY0)!;
    expect(short).toBeLessThan(100);
    expect(napped).toBeGreaterThan(short);
  });
});
