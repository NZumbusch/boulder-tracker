import { describe, it, expect } from "vitest";
import type { DailyMetricEntry, PainLog, Workout } from "../types";
import { buildAlerts, type AlertInputs } from "./alerts";

const asOf = new Date("2026-09-23T12:00:00Z");
const all = { recovery: true, pain: true, missingData: true, backup: true };
const done = (date: string, extra: Partial<Workout> = {}) =>
  ({ id: date, status: "completed", date, weekId: "2026-W39", loadFactor: 100, exercises: [], fingers: 5, systemic: 5, ...extra }) as Workout;
const input = (over: Partial<AlertInputs>): AlertInputs => ({ asOf, workouts: [], dailyMetrics: [], painLogs: [], lastBackupAt: "2026-09-20T00:00:00Z", enabled: all, ...over });

describe("buildAlerts", () => {
  it("is empty when nothing is wrong", () => {
    expect(buildAlerts(input({}))).toEqual([]);
  });

  it("flags an ongoing run of training days without rest", () => {
    const run = ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"].map((d) => done(d));
    const alerts = buildAlerts(input({ workouts: run }));
    expect(alerts[0]).toMatchObject({ severity: "risk", text: "6 consecutive training days without a rest day" });
  });

  it("ignores an old streak", () => {
    const run = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"].map((d) => done(d));
    expect(buildAlerts(input({ workouts: run }))).toEqual([]);
  });

  it("lists recent pain, worst first, and skips older entries", () => {
    const pain: PainLog[] = [
      { id: "p1", date: "2026-09-21", weekId: "2026-W38", bodyPart: "Left ring finger", severity: 4 },
      { id: "p2", date: "2026-09-23", weekId: "2026-W39", bodyPart: "Elbow", severity: 7 },
      { id: "p3", date: "2026-09-01", weekId: "2026-W36", bodyPart: "Shoulder", severity: 8 },
    ];
    const texts = buildAlerts(input({ painLogs: pain })).map((a) => a.text);
    expect(texts).toEqual(["Elbow 7/10, today", "Left ring finger 4/10, 2 days ago"]);
  });

  it("flags a tracked metric gone quiet, but not one never tracked", () => {
    const metrics: DailyMetricEntry[] = [
      { id: "m1", metricId: "hrv", date: "2026-09-15", value: 60 },
      { id: "m2", metricId: "hrv", date: "2026-09-20", value: 0 }, // not a reading
    ];
    expect(buildAlerts(input({ dailyMetrics: metrics })).map((a) => a.text)).toEqual(["No HRV logged in 8 days"]);
  });

  it("nudges to rate a recent session without fatigue ratings", () => {
    const alerts = buildAlerts(input({ workouts: [done("2026-09-22", { id: "w1", notes: "Board", fingers: undefined, systemic: undefined })] }));
    expect(alerts).toEqual([{ id: "unrated-w1", severity: "info", text: 'Rate how "Board" felt', rateWorkoutId: "w1" }]);
  });

  it("flags an old backup, and a missing one only once there's data to lose", () => {
    expect(buildAlerts(input({ lastBackupAt: "2026-09-01T00:00:00Z" }))[0].text).toBe("Last backup 22 days ago");
    expect(buildAlerts(input({ lastBackupAt: undefined }))).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => done(`2026-07-${String(i + 10).padStart(2, "0")}`));
    expect(buildAlerts(input({ lastBackupAt: undefined, workouts: many })).map((a) => a.id)).toContain("backup");
  });

  it("flags sessions still planned during a trip", () => {
    const alerts = buildAlerts(input({ tripConflicts: [{ tripName: "Font", dates: "Oct 5 – 12", count: 2 }, { tripName: "Day", dates: "Oct 20", count: 0 }], enabled: { ...all, tripConflict: true } }));
    expect(alerts).toEqual([{ id: "trip-Font", severity: "caution", text: "2 sessions still planned during Font (Oct 5 – 12)" }]);
  });

  it("respects each toggle", () => {
    const off = { recovery: false, pain: false, missingData: false, backup: false };
    expect(buildAlerts(input({ enabled: off, lastBackupAt: "2026-01-01T00:00:00Z" }))).toEqual([]);
  });
});
