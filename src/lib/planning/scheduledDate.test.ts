import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import { loggedDateFor } from "./scheduledDate";

const planned = (over: Partial<Workout>): Workout => ({ id: "w", status: "planned", date: null, weekId: "2026-W38", loadFactor: 0, exercises: [], ...over });
// 2026-W38 runs Monday 14 - Sunday 20 September 2026.
const now = new Date(2026, 8, 18, 20, 0); // Friday evening

describe("loggedDateFor", () => {
  it("dates a missed session on the day it was planned, at its start time", () => {
    const d = new Date(loggedDateFor(planned({ dayOfWeek: "Monday", startTime: "18:30" }), now));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 14, 18, 30]);
  });

  it("uses midday when the session has no start time", () => {
    const d = new Date(loggedDateFor(planned({ dayOfWeek: "Wednesday" }), now));
    expect([d.getDate(), d.getHours()]).toEqual([16, 12]);
  });

  it("uses now for a session planned later than now - logging it early", () => {
    expect(loggedDateFor(planned({ dayOfWeek: "Sunday" }), now)).toBe(now.toISOString());
  });

  it("uses now when the session has no day", () => {
    expect(loggedDateFor(planned({}), now)).toBe(now.toISOString());
  });

  it("goes by the planned day, not the date a session was created with", () => {
    const d = new Date(loggedDateFor(planned({ date: "2026-09-10T08:00:00.000Z", dayOfWeek: "Tuesday" }), now));
    expect(d.getDate()).toBe(15);
  });
});
