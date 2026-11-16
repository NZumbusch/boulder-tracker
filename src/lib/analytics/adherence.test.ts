import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { adherenceBreakdown, countOutcomes, doneShare, sessionOutcome } from "./adherence";

const w = (over: Partial<Workout>): Workout =>
  ({ id: Math.random().toString(36), notes: "Limit", weekId: "2026-W46", dayOfWeek: "Tuesday", exercises: [], status: "planned", date: null, loadFactor: 0, ...over }) as Workout;

const TUE = toUtcDayIndex("2026-11-10");

describe("sessionOutcome", () => {
  it("tells done, skipped, missed and upcoming apart", () => {
    expect(sessionOutcome(w({ status: "completed", date: "2026-11-10T18:00:00.000Z" }), TUE + 5)).toBe("done");
    expect(sessionOutcome(w({ exercises: [{ skipped: true } as never] }), TUE + 5)).toBe("skipped");
    expect(sessionOutcome(w({}), TUE + 1)).toBe("missed");
    expect(sessionOutcome(w({}), TUE)).toBe("upcoming");
  });

  it("counts a session with no day as missed once its week is over", () => {
    expect(sessionOutcome(w({ dayOfWeek: undefined }), TUE + 4)).toBe("upcoming");
    expect(sessionOutcome(w({ dayOfWeek: undefined }), TUE + 6)).toBe("missed");
  });
});

describe("counts", () => {
  it("add up, and % done leaves skipped and upcoming out", () => {
    const c = countOutcomes([w({ status: "completed", date: "2026-11-10T18:00:00.000Z" }), w({}), w({ dayOfWeek: "Sunday" }), w({ exercises: [{ skipped: true } as never] })], TUE + 2);
    expect(c).toEqual({ done: 1, skipped: 1, missed: 1, upcoming: 1 });
    expect(doneShare(c)).toBe(0.5);
    expect(doneShare({ done: 0, missed: 0 })).toBeUndefined();
  });
});

describe("adherenceBreakdown", () => {
  it("lists every weekday and the session names missed most", () => {
    const list = [
      w({ notes: "Board", dayOfWeek: "Monday" }),
      w({ notes: "Board", dayOfWeek: "Thursday", weekId: "2026-W45" }),
      w({ notes: "Hangboard", dayOfWeek: "Tuesday" }),
      w({ notes: "Hangboard", status: "completed", date: "2026-11-03T18:00:00.000Z", weekId: "2026-W45" }),
      w({ notes: "Run", status: "completed", date: "2026-11-11T07:00:00.000Z", dayOfWeek: "Wednesday" }),
    ];
    const { byWeekday, byKind } = adherenceBreakdown(list, TUE + 2);
    expect(byWeekday.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(byWeekday[0]).toMatchObject({ missed: 1, done: 0 });
    expect(byWeekday[1]).toMatchObject({ missed: 1, done: 1 });
    expect(byKind.map((k) => [k.label, k.missed, k.done])).toEqual([["Board", 2, 0], ["Hangboard", 1, 1]]);
  });
});
