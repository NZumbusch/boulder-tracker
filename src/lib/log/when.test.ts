import { describe, it, expect } from "vitest";
import { dayHeading, dayOf } from "./when";

describe("day headings", () => {
  const now = new Date(2026, 10, 26, 15, 0);
  it("says Today and Yesterday, else the date", () => {
    expect(dayHeading("2026-11-26", now)).toBe("Today");
    expect(dayHeading("2026-11-25", now)).toBe("Yesterday");
    expect(dayHeading("2026-11-23", now)).toMatch(/23/);
  });
  it("takes an entry's local day", () => {
    expect(dayOf(new Date(2026, 10, 23, 23, 59).toISOString())).toBe("2026-11-23");
  });
});
