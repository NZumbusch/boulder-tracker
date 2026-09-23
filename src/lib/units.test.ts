import { describe, it, expect } from "vitest";
import { displayTemp, toCelsius, formatTemp, formatTempDelta, displayWind, displayWeight, toKg, formatWeight, validateUnits, DEFAULT_UNITS } from "./units";

describe("units", () => {
  it("converts temperatures both ways, and differences without the offset", () => {
    expect(displayTemp(10, "F")).toBe(50);
    expect(toCelsius(50, "F")).toBe(10);
    expect(displayTemp(10, "C")).toBe(10);
    expect(formatTemp(-3.6, "C")).toBe("-4°");
    expect(formatTempDelta(5, "F")).toBe("9°");
  });

  it("converts wind and weight", () => {
    expect(Math.round(displayWind(16.09344, "mph"))).toBe(10);
    expect(Math.round(displayWeight(70, "lb") * 10) / 10).toBe(154.3);
    expect(Math.round(toKg(154.3, "lb") * 10) / 10).toBe(70);
    expect(formatWeight(71.44, "kg")).toBe("71.4 kg");
  });

  it("repairs a stored units object", () => {
    expect(validateUnits(undefined)).toEqual(DEFAULT_UNITS);
    expect(validateUnits({ temperature: "F", weight: "stone", grades: "v" })).toEqual({ temperature: "F", weight: "kg", wind: "kmh", grades: "v" });
  });
});
