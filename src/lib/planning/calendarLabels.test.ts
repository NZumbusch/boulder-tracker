import { describe, it, expect } from "vitest";
import { calendarSublabel } from "./calendarLabels";

describe("calendarSublabel", () => {
  it("Day and Week say the week and then the counts", () => {
    expect(calendarSublabel({ mode: "week", weekId: "2026-W42", done: 3, planned: 2 })).toBe("Week 42 · 3 done · 2 planned");
    expect(calendarSublabel({ mode: "day", weekId: "2026-W42", done: 0, planned: 0 })).toBe("Week 42 · nothing planned");
  });
  it("Month and Year say the counts alone, never a raw week id", () => {
    expect(calendarSublabel({ mode: "month", weekId: "2026-W42", done: 4, planned: 5 })).toBe("4 done · 5 planned");
    expect(calendarSublabel({ mode: "year", weekId: "2026-W42", done: 0, planned: 0 })).toBe("Nothing planned");
  });
});
