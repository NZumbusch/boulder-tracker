import { describe, expect, it } from "vitest";
import type { DailyMetricEntry, ExternalActivity, Workout } from "../types";
import { recentReviews, weeklyReview } from "./weeklyReview";
import { weekDayIsos } from "../dateUtils";

const WEEK = "2026-W42";
const PREV = "2026-W41";
const day = (week: string, i: number) => weekDayIsos(week)[i];

const climb = (id: string, weekId: string, load: number, minutes = 60): Workout => ({ id, status: "completed", date: day(weekId, 1), weekId, loadFactor: load, actualDuration: minutes, exercises: [] }) as Workout;
const act = (id: string, type: string, date: string, minutes: number): ExternalActivity => ({ id, source: "strava", sourceId: id, date, start: `${date}T06:00:00Z`, name: id, type, durationSec: minutes * 60 });
const metric = (metricId: string, date: string, value: number): DailyMetricEntry => ({ id: `${metricId}${date}`, metricId, date, value });
const week = (metricId: string, w: string, value: number) => weekDayIsos(w).map((d) => metric(metricId, d, value));

describe("weeklyReview", () => {
  it("sums climbing and other training and compares total load with the week before", () => {
    const r = weeklyReview(WEEK, {
      workouts: [climb("a", WEEK, 500), climb("b", WEEK, 500), climb("p", PREV, 800)],
      activities: [act("run", "Run", day(WEEK, 2), 40), act("walk", "Walk", day(WEEK, 3), 60)],
      dailyMetrics: [],
    });
    expect(r.climbing).toEqual({ sessions: 2, hours: 2, load: 1000 });
    expect(r.other.sessions).toBe(2);
    expect(r.other.kinds).toEqual({ run: 1, walk: 1 });
    expect(r.loadChange).toBeGreaterThan(0.3);
    expect(r.lines[0]).toBe("Climbing: 2 sessions, 2 h, load 1,000.");
    expect(r.lines.join(" ")).toMatch(/Other training: 2 activities \(1 run, 1 walk\)/);
    expect(r.lines.join(" ")).toMatch(/Total load .*on the week before/);
  });

  it("says so for an empty week", () => {
    expect(weeklyReview(WEEK, { workouts: [], activities: [], dailyMetrics: [] }).lines).toEqual(["No training logged this week."]);
  });

  it("reads recovery averages against the week before and HRV against the four weeks before", () => {
    const hrv = [...[... "ABCD"].flatMap((_, k) => week("hrv", `2026-W${String(37 + k).padStart(2, "0")}`, 80)), ...week("hrv", WEEK, 70)];
    const r = weeklyReview(WEEK, { workouts: [climb("a", WEEK, 500)], activities: [], dailyMetrics: [...hrv, ...week("sleep-score", WEEK, 80), ...week("sleep-score", PREV, 76), ...week("rhr", WEEK, 52), ...week("rhr", PREV, 50)] });
    const text = r.lines.join(" ");
    expect(r.hrvVsBaseline).toBeCloseTo(-0.125, 2);
    expect(text).toMatch(/Sleep score: 80 \(\+4 on the week before\)/);
    expect(text).toMatch(/HRV: 70 ms, 12 % below your usual/);
    expect(text).toMatch(/Resting heart rate: 52 bpm \(\+2/);
  });

  it("remarks when load rose and HRV fell, or when a lighter week met good recovery - and otherwise stays quiet", () => {
    const base = [...[0, 1, 2, 3].flatMap((k) => week("hrv", `2026-W${37 + k}`, 80)), ...week("hrv", PREV, 80)];
    const rising = weeklyReview(WEEK, { workouts: [climb("a", WEEK, 1000), climb("p", PREV, 500)], activities: [], dailyMetrics: [...base, ...week("hrv", WEEK, 66)] });
    expect(rising.remark).toMatch(/Load rose 100 % while HRV sat below your usual/);
    const lighter = weeklyReview(WEEK, { workouts: [climb("a", WEEK, 300), climb("p", PREV, 800)], activities: [], dailyMetrics: [...base, ...week("hrv", WEEK, 84), ...week("sleep-score", WEEK, 85), ...week("sleep-score", PREV, 82)] });
    expect(lighter.remark).toMatch(/lighter week .* room to build/);
    const steady = weeklyReview(WEEK, { workouts: [climb("a", WEEK, 520), climb("p", PREV, 500)], activities: [], dailyMetrics: [...base, ...week("hrv", WEEK, 80)] });
    expect(steady.remark).toBeUndefined();
  });

  it("does not instruct", () => {
    const r = weeklyReview(WEEK, { workouts: [climb("a", WEEK, 1000), climb("p", PREV, 500)], activities: [], dailyMetrics: [...[0, 1, 2, 3].flatMap((k) => week("hrv", `2026-W${37 + k}`, 80)), ...week("hrv", WEEK, 66)] });
    expect(JSON.stringify(r)).not.toMatch(/\byou should\b|\byou must\b/i);
  });
});

describe("recentReviews", () => {
  it("is the last finished weeks, oldest first, never the current one", () => {
    const rs = recentReviews(new Date(2026, 9, 24, 12), 3, { workouts: [], activities: [], dailyMetrics: [] });
    expect(rs.map((r) => r.weekId)).toEqual(["2026-W40", "2026-W41", "2026-W42"]);
  });
});
