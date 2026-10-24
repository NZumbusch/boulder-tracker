import { describe, expect, it } from "vitest";
import type { ExternalActivity } from "../types";
import { DEFAULT_EXTERNAL_LOAD, effortFromHeartRate, effortKindOf, estimateMaxHr, externalAsWorkouts, externalEffort, externalLoad, isExternalWorkout } from "./externalLoad";
import { calculateRollingAcwr } from "../analytics/loadAnalytics";
import { computeFatigueDecay } from "../analytics/readiness";

const act = (type: string, minutes: number, extra: Partial<ExternalActivity> = {}): ExternalActivity => ({
  id: `${type}${minutes}`, source: "strava", sourceId: "1", date: "2026-10-05", start: "2026-10-05T06:00:00Z", name: type, type, durationSec: minutes * 60, ...extra,
});

describe("kinds", () => {
  it("maps imported types to the kinds you set effort for", () => {
    expect(effortKindOf("Walk")).toBe("walk");
    expect(effortKindOf("Trail Run")).toBe("run");
    expect(effortKindOf("Virtual Ride")).toBe("ride");
    expect(effortKindOf("Weight Training")).toBe("strength");
    expect(effortKindOf("Badminton")).toBe("workout");
    expect(effortKindOf("Rock Climbing")).toBe("climb");
    expect(effortKindOf("Breathwork")).toBe("other");
  });
});

describe("effort from heart rate", () => {
  it("rises with the share of the highest heart rate", () => {
    expect(effortFromHeartRate(90, 190)).toBe(1);
    expect(effortFromHeartRate(114, 190)).toBeCloseTo(3);
    expect(effortFromHeartRate(133, 190)).toBeCloseTo(5);
    expect(effortFromHeartRate(152, 190)).toBeCloseTo(7);
    expect(effortFromHeartRate(190, 190)).toBe(10);
    expect(effortFromHeartRate(143, 190)).toBeGreaterThan(effortFromHeartRate(133, 190));
  });
  it("estimates the highest from the activities, ignoring one spike, and falls back", () => {
    expect(estimateMaxHr([])).toBe(190);
    const many = Array.from({ length: 200 }, (_, i) => ({ maxHr: 150 + (i % 40) }));
    expect(estimateMaxHr([...many, { maxHr: 229 }])).toBeLessThan(229);
  });
});

describe("externalEffort / externalLoad", () => {
  const cfg = DEFAULT_EXTERNAL_LOAD;
  it("uses the heart rate for endurance, the set effort for weights", () => {
    expect(externalEffort(act("Run", 40, { avgHr: 152 }), cfg, 190)).toBeCloseTo(7);
    expect(externalEffort(act("Run", 40), cfg, 190)).toBe(6);
    expect(externalEffort(act("Weight Training", 50, { avgHr: 100 }), cfg, 190)).toBe(5);
    expect(externalEffort(act("Run", 40, { avgHr: 152 }), { ...cfg, useHeartRate: false }, 190)).toBe(6);
  });
  it("is minutes x effort^1.2 like a rated session, scaled by the weight", () => {
    expect(externalLoad(act("Run", 60), cfg, 190)).toBe(Math.round(60 * 6 ** 1.2));
    expect(externalLoad(act("Run", 60), { ...cfg, weight: 0.5 }, 190)).toBe(Math.round(Math.round(60 * 6 ** 1.2) * 0.5));
  });
  it("counts nothing for an effort of 0, or for less than a minute", () => {
    expect(externalLoad(act("Walk", 60), { ...cfg, effort: { ...cfg.effort, walk: 0 } }, 190)).toBe(0);
    expect(externalLoad(act("Run", 0.5), cfg, 190)).toBe(0);
  });
  it("prefers the moving time", () => {
    expect(externalLoad(act("Run", 60, { movingSec: 1800 }), cfg, 190)).toBe(Math.round(30 * 6 ** 1.2));
  });
});

describe("as pseudo-sessions for load, fatigue and readiness", () => {
  const items = [act("Run", 40, { avgHr: 152 }), act("Walk", 60)];

  it("makes completed sessions marked as external, only for what counts", () => {
    const ws = externalAsWorkouts(items, DEFAULT_EXTERNAL_LOAD);
    expect(ws).toHaveLength(2);
    expect(ws.every((w) => w.status === "completed" && isExternalWorkout(w) && w.weekId === "2026-W41")).toBe(true);
    expect(ws[0].systemic).toBeCloseTo(7, 0);
    expect(ws[0].fingers).toBeUndefined();
    expect(externalAsWorkouts(items, { ...DEFAULT_EXTERNAL_LOAD, enabled: false })).toEqual([]);
  });

  it("move the load ratio and systemic fatigue, and leave the finger reading unrated", () => {
    const ws = externalAsWorkouts(items, DEFAULT_EXTERNAL_LOAD);
    const asOf = new Date("2026-10-06T12:00:00Z");
    expect(calculateRollingAcwr(ws, asOf).acuteLoad).toBe(ws.reduce((s, w) => s + w.loadFactor, 0));
    const f = computeFatigueDecay(ws, asOf);
    expect(f.systemic).toBeGreaterThan(0);
    expect(f.fingers).toBeUndefined();
  });
});
