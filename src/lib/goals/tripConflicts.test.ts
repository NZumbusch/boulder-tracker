import { describe, it, expect } from "vitest";
import type { GoalEvent, Workout } from "../types";
import { plannedDate, sessionsDuringTrip } from "./tripConflicts";

const w = (weekId: string, dayOfWeek: string, extra: Partial<Workout> = {}) =>
  ({ id: weekId + dayOfWeek, status: "planned", date: null, weekId, dayOfWeek, loadFactor: 0, exercises: [{ id: "s", typeId: "t" }], ...extra }) as unknown as Workout;

describe("plannedDate", () => {
  it("resolves week + weekday to a date", () => {
    expect(plannedDate(w("2026-W41", "Monday"))).toBe("2026-10-05");
    expect(plannedDate(w("2026-W41", "Sunday"))).toBe("2026-10-11");
  });
});

describe("sessionsDuringTrip", () => {
  const trip: GoalEvent = { id: "t", kind: "trip", name: "Font", date: "2026-10-07", endDate: "2026-10-12" };

  it("finds planned sessions on the trip's remaining days", () => {
    const sessions = [
      w("2026-W41", "Monday"), // before the trip
      w("2026-W41", "Thursday"), // during
      w("2026-W41", "Friday", { exercises: [{ id: "s", typeId: "t", skipped: true }] } as Partial<Workout>), // skipped
      w("2026-W42", "Monday"), // 12th - last day
      w("2026-W41", "Saturday", { status: "completed" }),
    ];
    expect(sessionsDuringTrip(trip, sessions, "2026-09-23").map((s) => s.dayOfWeek)).toEqual(["Thursday", "Monday"]);
    expect(sessionsDuringTrip(trip, sessions, "2026-10-10").map((s) => s.dayOfWeek)).toEqual(["Monday"]);
  });

  it("works for a day trip and ignores competitions", () => {
    const day: GoalEvent = { id: "d", kind: "trip", name: "Day", date: "2026-10-08", endDate: "2026-10-08" };
    expect(sessionsDuringTrip(day, [w("2026-W41", "Thursday")], "2026-09-23")).toHaveLength(1);
    expect(sessionsDuringTrip({ ...day, kind: "competition" }, [w("2026-W41", "Thursday")], "2026-09-23")).toHaveLength(0);
  });
});
