import { describe, it, expect } from "vitest";
import { formatClock, formatMinutes } from "./formatSession";

describe("formatClock", () => {
  it("shows M:SS under an hour", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9_000)).toBe("0:09");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("shows H:MM:SS from an hour up", () => {
    expect(formatClock(3_600_000)).toBe("1:00:00");
    expect(formatClock(3_600_000 + 5 * 60_000 + 7_000)).toBe("1:05:07");
  });

  it("floors rather than rounding, so the clock never shows a second early", () => {
    expect(formatClock(1_999)).toBe("0:01");
  });

  it("treats negative input as zero", () => {
    expect(formatClock(-5_000)).toBe("0:00");
  });
});

describe("formatMinutes", () => {
  it("shows bare minutes under an hour", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
  });

  it("drops the minutes on a round hour", () => {
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(120)).toBe("2h");
  });

  it("shows hours and minutes together", () => {
    expect(formatMinutes(112)).toBe("1h 52m");
  });

  it("rounds fractional minutes and floors negatives at zero", () => {
    expect(formatMinutes(45.6)).toBe("46m");
    expect(formatMinutes(-10)).toBe("0m");
  });
});
