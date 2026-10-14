import { describe, it, expect } from "vitest";
import {
  dayAgenda,
  dayNameOf, weekIdOfDayIndex, parseStartTime, sessionDay, toCalendarSession, sessionsByDay, layoutDay, visibleHours,
} from "./calendarEvents";
import { weekStartDay } from "../analytics/range";
import type { Workout } from "../types";

const w = (over: Partial<Workout>): Workout =>
  ({ id: "w1", status: "planned", date: null, weekId: "2026-W41", dayOfWeek: "Monday", exercises: [], loadFactor: 0, ...over }) as Workout;

const monday = weekStartDay("2026-W41")!; // 2026-10-05

describe("day helpers", () => {
  it("names days and weeks from a day index", () => {
    expect(dayNameOf(monday)).toBe("Monday");
    expect(dayNameOf(monday + 6)).toBe("Sunday");
    expect(weekIdOfDayIndex(monday)).toBe("2026-W41");
    expect(weekIdOfDayIndex(monday + 6)).toBe("2026-W41");
    expect(weekIdOfDayIndex(monday + 7)).toBe("2026-W42");
  });
  it("parses start times", () => {
    expect(parseStartTime("18:30")).toBe(1110);
    expect(parseStartTime("7:05")).toBe(425);
    expect(parseStartTime("25:00")).toBeUndefined();
    expect(parseStartTime(undefined)).toBeUndefined();
  });
});

describe("sessionDay", () => {
  it("puts a planned session on its week and day, ignoring the date it was created", () => {
    expect(sessionDay(w({ dayOfWeek: "Wednesday", date: "2026-01-01T10:00:00.000Z" }))).toBe(monday + 2);
  });
  it("has no day for an unassigned planned session", () => {
    expect(sessionDay(w({ dayOfWeek: undefined }))).toBeNull();
  });
  it("puts a completed session on the day it was done, not the day it was planned", () => {
    const done = w({ status: "completed", dayOfWeek: "Monday", date: new Date(2026, 9, 7, 19, 0).toISOString() });
    expect(sessionDay(done)).toBe(monday + 2);
  });
});

describe("toCalendarSession durations", () => {
  it("draws a planned session at its planned length", () => {
    const s = toCalendarSession(w({ plannedDuration: 90, startTime: "18:00" }))!;
    expect(s.minutes).toBe(90);
    expect(s.startMin).toBe(1080);
    expect(s.done).toBe(false);
  });
  it("redraws a finished live session at the time it actually took", () => {
    const s = toCalendarSession(
      w({ status: "completed", plannedDuration: 60, actualDuration: 95, date: new Date(2026, 9, 5, 19).toISOString() }),
    )!;
    expect(s.minutes).toBe(95);
    expect(s.plannedMinutes).toBe(60);
    expect(s.done).toBe(true);
  });
  it("does not flag a planned length when the session took exactly that", () => {
    const s = toCalendarSession(w({ status: "completed", plannedDuration: 60, actualDuration: 60, date: new Date(2026, 9, 5).toISOString() }))!;
    expect(s.plannedMinutes).toBeUndefined();
  });
  it("grows a running session past its plan", () => {
    expect(toCalendarSession(w({ plannedDuration: 60 }), 75)!.minutes).toBe(75);
    expect(toCalendarSession(w({ plannedDuration: 60 }), 20)!.minutes).toBe(60);
  });
  it("skips a planned session with no day", () => {
    expect(toCalendarSession(w({ dayOfWeek: undefined }))).toBeNull();
  });
});

describe("sessionsByDay", () => {
  it("orders timed sessions by time, untimed last", () => {
    const a = toCalendarSession(w({ id: "a" }))!;
    const b = toCalendarSession(w({ id: "b", startTime: "19:00" }))!;
    const c = toCalendarSession(w({ id: "c", startTime: "08:00" }))!;
    expect(sessionsByDay([a, b, c]).get(monday)!.map((s) => s.workout.id)).toEqual(["c", "b", "a"]);
  });
});

describe("layoutDay", () => {
  const block = (startMin: number, minutes: number) => ({ startMin, minutes });
  it("keeps separate blocks in one lane", () => {
    const out = layoutDay([block(480, 60), block(600, 60)]);
    expect(out.map((p) => [p.lane, p.lanes])).toEqual([[0, 1], [0, 1]]);
  });
  it("puts overlapping blocks side by side", () => {
    const out = layoutDay([block(480, 90), block(510, 60)]);
    expect(out.map((p) => [p.lane, p.lanes])).toEqual([[0, 2], [1, 2]]);
  });
  it("reuses a lane once its block has ended", () => {
    const out = layoutDay([block(480, 120), block(500, 30), block(540, 30)]);
    expect(out.map((p) => p.lane)).toEqual([0, 1, 1]);
  });
  it("draws a short block at the minimum height and clips at midnight", () => {
    const [short] = layoutDay([block(480, 5)], 30);
    expect(short.bottom - short.top).toBe(30);
    const [late] = layoutDay([block(1400, 120)], 30);
    expect(late.bottom).toBe(1440);
  });
});

describe("visibleHours", () => {
  it("shows 08-20 when empty", () => {
    expect(visibleHours([])).toEqual({ from: 8, to: 20 });
  });
  it("fits the sessions with an hour either side", () => {
    expect(visibleHours([{ top: 18 * 60, bottom: 21 * 60 }])).toEqual({ from: 17, to: 22 });
  });
  it("widens a short span to the minimum and stays inside the day", () => {
    const h = visibleHours([{ top: 23 * 60, bottom: 24 * 60 }]);
    expect(h.to).toBe(24);
    expect(h.to - h.from).toBe(5);
    expect(visibleHours([{ top: 0, bottom: 30 }]).from).toBe(0);
  });
  it("covers early and late sessions in the same week", () => {
    expect(visibleHours([{ top: 6 * 60, bottom: 7 * 60 }, { top: 19 * 60, bottom: 21 * 60 }])).toEqual({ from: 5, to: 22 });
  });
});

describe("dayAgenda", () => {
  const session = (id: string, startMin?: number) => ({ workout: { id } as Workout, day: 0, startMin, minutes: 60, done: false });
  const event = (id: string, startMin?: number, allDay = false) => ({ id, title: id, calendarId: "c", day: 0, startMin, minutes: 30, allDay });
  const order = (items: ReturnType<typeof dayAgenda>) => items.map((i) => (i.kind === "session" ? i.session.workout.id : i.event.id));

  it("puts phone events and sessions in the order of their start times", () => {
    // The week list used to show every session first, then every event.
    const items = dayAgenda([session("climb-15", 900), session("climb-18", 1080)], [event("piano", 570), event("meeting", 600), event("late", 960)]);
    expect(order(items)).toEqual(["piano", "meeting", "climb-15", "late", "climb-18"]);
  });
  it("starts with all-day events and ends with sessions that have no time", () => {
    expect(order(dayAgenda([session("free"), session("early", 480)], [event("holiday", undefined, true), event("noon", 720)]))).toEqual(["holiday", "early", "noon", "free"]);
  });
  it("lists a session before an event starting the same minute, and keeps the given order of equals", () => {
    expect(order(dayAgenda([session("s", 600)], [event("e1", 600), event("e2", 600)]))).toEqual(["s", "e1", "e2"]);
  });
});
