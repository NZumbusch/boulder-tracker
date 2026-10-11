import { describe, it, expect } from "vitest";
import type { GoalEvent } from "../types";
import { coversDate, daysUntilGoal, goalEnd, goalLength, isOngoing, pastGoals, tripInForecast, upcomingGoals } from "./goals";

const comp: GoalEvent = { id: "c", kind: "competition", name: "League", date: "2026-11-02" };
const trip: GoalEvent = { id: "t", kind: "trip", name: "Font", date: "2026-10-05", endDate: "2026-10-12" };
const dayTrip: GoalEvent = { id: "d", kind: "trip", name: "Frankenjura", date: "2026-09-27", endDate: "2026-09-27" };

describe("goal dates", () => {
  it("treats a competition and a day trip as one day", () => {
    expect(goalEnd(comp)).toBe("2026-11-02");
    expect(goalLength(comp)).toBe(1);
    expect(goalLength(dayTrip)).toBe(1);
    expect(goalLength(trip)).toBe(8);
  });

  it("ignores an end date before the start", () => {
    expect(goalEnd({ ...trip, endDate: "2026-10-01" })).toBe("2026-10-05");
  });

  it("knows which days a goal covers, from plain dates or timestamps", () => {
    expect(coversDate(trip, "2026-10-12T12:00:00Z")).toBe(true);
    expect(coversDate(trip, "2026-10-13")).toBe(false);
    expect(coversDate(dayTrip, "2026-09-27")).toBe(true);
  });

  it("is ongoing from its first to its last day", () => {
    expect(isOngoing(trip, "2026-10-05")).toBe(true);
    expect(isOngoing(trip, "2026-10-12")).toBe(true);
    expect(isOngoing(trip, "2026-10-13")).toBe(false);
  });

  it("counts days until the start", () => {
    expect(daysUntilGoal(trip, "2026-09-30")).toBe(5);
    expect(daysUntilGoal(trip, "2026-10-07")).toBe(-2);
  });
});

describe("upcomingGoals / pastGoals", () => {
  it("puts an ongoing goal first, then by start, and leaves finished ones out", () => {
    expect(upcomingGoals([comp, trip, dayTrip], "2026-10-06").map((g) => g.id)).toEqual(["t", "c"]);
    expect(upcomingGoals([comp, trip, dayTrip], "2026-09-23").map((g) => g.id)).toEqual(["d", "t", "c"]);
    expect(pastGoals([comp, trip, dayTrip], "2026-10-20").map((g) => g.id)).toEqual(["t", "d"]);
  });
});

describe("tripInForecast", () => {
  const loc = { name: "Font", latitude: 48.4, longitude: 2.7 };
  it("is the next located trip starting within the week, or under way", () => {
    const located = { ...trip, location: loc };
    expect(tripInForecast([located, comp], "2026-09-28")).toBeUndefined(); // starts in 7 days - not yet
    expect(tripInForecast([located, comp], "2026-09-29")?.id).toBe("t");
    expect(tripInForecast([located], "2026-10-10")?.id).toBe("t");
    expect(tripInForecast([trip], "2026-10-01")).toBeUndefined(); // no location
  });
});
