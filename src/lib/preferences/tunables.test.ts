import { describe, it, expect } from "vitest";
import { TUNABLES, defaultTunables, validateTunables, resetTopic, num, flag } from "./tunables";

describe("TUNABLES registry", () => {
  it("has unique ids and defaults inside their ranges", () => {
    expect(new Set(TUNABLES.map((t) => t.id)).size).toBe(TUNABLES.length);
    for (const t of TUNABLES) {
      if (t.kind === "number") {
        expect(t.default, t.id).toBeGreaterThanOrEqual(t.min);
        expect(t.default, t.id).toBeLessThanOrEqual(t.max);
      }
    }
  });

  it("keeps today's behaviour as the defaults", () => {
    const d = defaultTunables();
    expect([d["acwr.sweetMin"], d["acwr.caution"], d["acwr.highRisk"]]).toEqual([0.8, 1.3, 1.5]);
    expect(d["fatigue.halfLifeDays"]).toBe(3);
    expect(d["readiness.sleepLow"]).toBe(60);
    expect(d["alerts.backupDays"]).toBe(14);
  });
});

describe("validateTunables", () => {
  it("defaults everything for garbage", () => {
    for (const bad of [undefined, null, 3, "x", [1]]) expect(validateTunables(bad)).toEqual(defaultTunables());
  });

  it("keeps valid values, clamps out-of-range ones, rejects wrong types, drops unknown ids", () => {
    const v = validateTunables({ "fatigue.halfLifeDays": 5, "readiness.sleepLow": 500, "readiness.useHrv": "no", "gone.value": 1 });
    expect(v["fatigue.halfLifeDays"]).toBe(5);
    expect(v["readiness.sleepLow"]).toBe(95);
    expect(v["readiness.useHrv"]).toBe(true);
    expect("gone.value" in v).toBe(false);
  });

  it("keeps the ACWR zones and the temperature band in order", () => {
    const v = validateTunables({ "acwr.sweetMin": 1.1, "acwr.caution": 1.0, "acwr.highRisk": 1.1, "friction.idealMinC": 15, "friction.idealMaxC": 10 });
    expect(v["acwr.caution"] as number).toBeGreaterThan(v["acwr.sweetMin"] as number);
    expect(v["acwr.highRisk"] as number).toBeGreaterThan(v["acwr.caution"] as number);
    expect(v["friction.idealMaxC"] as number).toBeGreaterThan(v["friction.idealMinC"] as number);
  });
});

describe("resetTopic / num / flag", () => {
  it("resets one topic only", () => {
    const edited = { ...defaultTunables(), "fatigue.halfLifeDays": 7, "friction.wetRainMm": 10 };
    const reset = resetTopic(edited, "model");
    expect(reset["fatigue.halfLifeDays"]).toBe(3);
    expect(reset["friction.wetRainMm"]).toBe(10);
  });

  it("reads values with defaults as a fallback", () => {
    expect(num({}, "home.recentActivityCount")).toBe(3);
    expect(flag({}, "readiness.useSleep")).toBe(true);
    expect(num({ "home.recentActivityCount": 5 }, "home.recentActivityCount")).toBe(5);
  });
});
