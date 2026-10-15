import { describe, it, expect } from "vitest";
import { acwrZone, ACWR_ZONE_LABEL } from "./acwrZone";

const zones = { sweetMin: 0.8, caution: 1.3, highRisk: 1.5 };

describe("acwrZone", () => {
  it("names the zones the way Home does", () => {
    expect(acwrZone(0.5, zones)).toBe("low");
    expect(acwrZone(0.8, zones)).toBe("sweet");
    expect(acwrZone(1.0, zones)).toBe("sweet");
    expect(acwrZone(1.3, zones)).toBe("sweet");
    expect(acwrZone(1.31, zones)).toBe("caution");
    expect(acwrZone(1.5, zones)).toBe("caution");
    expect(acwrZone(1.51, zones)).toBe("risk");
  });

  it("follows adjusted zone edges", () => {
    const custom = { sweetMin: 1, caution: 1.2, highRisk: 1.4 };
    expect(acwrZone(0.9, custom)).toBe("low");
    expect(acwrZone(1.45, custom)).toBe("risk");
  });

  it("has a label for every zone, as Home prints them", () => {
    expect(ACWR_ZONE_LABEL).toEqual({ low: "low", sweet: "sweet spot", caution: "caution", risk: "high risk" });
  });
});
