import { describe, it, expect } from "vitest";
import { rateFriction, labelFor, WET_RAIN_MM } from "./friction";

describe("rateFriction", () => {
  it("rates a cool, dry, breezy day as prime", () => {
    const f = rateFriction({ tempC: 8, humidityPercent: 40, dewPointC: -4, windKmh: 12 });
    expect(f.label).toBe("Prime");
    expect(f.score).toBeGreaterThanOrEqual(9);
    expect(f.reason).toBeUndefined();
  });

  it("marks a warm, humid day greasy and says why", () => {
    const f = rateFriction({ tempC: 26, humidityPercent: 85, dewPointC: 23 });
    expect(f.label).toBe("Greasy");
    expect(f.reason).toBeDefined();
  });

  it("calls it wet when raining or after heavy recent rain, whatever the air", () => {
    expect(rateFriction({ tempC: 8, humidityPercent: 40, dewPointC: -4, precipitationMm: 0.4 }).label).toBe("Wet");
    const soaked = rateFriction({ tempC: 8, humidityPercent: 40, dewPointC: -4, recentRainMm: WET_RAIN_MM });
    expect(soaked.label).toBe("Wet");
    expect(soaked.score).toBeLessThanOrEqual(2);
    expect(soaked.reason).toContain("mm of rain");
  });

  it("still rates with temperature alone", () => {
    expect(rateFriction({ tempC: 10 }).score).toBe(10);
    expect(rateFriction({ tempC: 30 }).label).toBe("Greasy");
  });

  it("gets worse as the dew point closes in", () => {
    const dry = rateFriction({ tempC: 10, humidityPercent: 60, dewPointC: 0 }).score;
    const close = rateFriction({ tempC: 10, humidityPercent: 60, dewPointC: 9 }).score;
    expect(close).toBeLessThan(dry);
  });
});

describe("labelFor", () => {
  it("maps score bands to words", () => {
    expect([9, 7, 5, 2].map(labelFor)).toEqual(["Prime", "Good", "OK", "Greasy"]);
  });
});
