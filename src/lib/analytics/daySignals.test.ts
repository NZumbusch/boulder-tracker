import { describe, expect, it } from "vitest";
import { daySignals, usualPlannedLoad, type DaySignalsInput } from "./daySignals";

const base: DaySignalsInput = { hrvDip: 0.1, sleepLow: 60, bodyBatteryLow: 50 };

describe("daySignals", () => {
  it("needs at least two signals before it says anything", () => {
    expect(daySignals({ ...base })).toBeNull();
    expect(daySignals({ ...base, hrv: 80, hrvBaseline: 80 })).toBeNull();
    expect(daySignals({ ...base, sleepScore: 90 })).toBeNull();
  });

  it("leans good when HRV, sleep and Body Battery are all up", () => {
    const s = daySignals({ ...base, hrv: 90, hrvBaseline: 80, sleepScore: 88, bodyBattery: 92 })!;
    expect(s.lean).toBe("good");
    expect(s.reasons).toHaveLength(3);
    expect(s.signals).toBe(3);
    expect(s.headline).toMatch(/look good/);
  });

  it("leans easy when HRV dipped and sleep was poor, naming why", () => {
    const s = daySignals({ ...base, hrv: 60, hrvBaseline: 80, sleepScore: 45 })!;
    expect(s.lean).toBe("easy");
    expect(s.reasons.join(" ")).toMatch(/25 % below your baseline/);
    expect(s.reasons.join(" ")).toMatch(/sleep score 45 is low/);
  });

  it("stays steady on mixed signals, and a small HRV wobble counts for nothing", () => {
    expect(daySignals({ ...base, hrv: 78, hrvBaseline: 80, sleepScore: 70 })!.lean).toBe("steady");
    expect(daySignals({ ...base, hrv: 90, hrvBaseline: 80, sleepScore: 40 })!.lean).toBe("steady");
  });

  it("counts a low readiness score heavily", () => {
    expect(daySignals({ ...base, readinessScore: 30, sleepScore: 75 })!.lean).toBe("easy");
    expect(daySignals({ ...base, readinessScore: 95, sleepScore: 85 })!.lean).toBe("good");
  });

  it("remarks on today's plan only when it stands out against the lean", () => {
    const easy = { ...base, hrv: 60, hrvBaseline: 80, sleepScore: 45 };
    expect(daySignals({ ...easy, planned: { load: 600, usual: 400 } })!.plan).toMatch(/heavier than your usual/);
    expect(daySignals({ ...easy, planned: { load: 400, usual: 400 } })!.plan).toBeUndefined();
    const good = { ...base, hrv: 90, hrvBaseline: 80, sleepScore: 88 };
    expect(daySignals({ ...good, planned: { load: 200, usual: 400 } })!.plan).toMatch(/lighter than your usual/);
  });

  it("describes and does not instruct", () => {
    const text = JSON.stringify([daySignals({ ...base, hrv: 60, hrvBaseline: 80, sleepScore: 45 }), daySignals({ ...base, hrv: 90, hrvBaseline: 80, sleepScore: 88 })]);
    expect(text).not.toMatch(/\byou should\b|\byou must\b|\bdo not\b|\bdon't\b/i);
  });
});

describe("usualPlannedLoad", () => {
  it("is the median planned load of recent sessions that had one, or 0 with too few", () => {
    expect(usualPlannedLoad([{ plannedLoad: 300 }, { plannedLoad: 500 }, { plannedLoad: 400 }, {}])).toBe(400);
    expect(usualPlannedLoad([{ plannedLoad: 300 }])).toBe(0);
  });
});
