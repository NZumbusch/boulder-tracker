import { describe, it, expect } from "vitest";
import { buildCalendarContext } from "./aiCalendar";
import type { DeviceEvent } from "./deviceEvents";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const timed = (id: string, title: string, begin: number, end: number, extra: Partial<DeviceEvent> = {}): DeviceEvent => ({ id, title, calendarId: "1", day: 0, startMin: 0, minutes: 0, allDay: false, begin, end, firstDay: 0, lastDay: 0, location: "Raum 5", notes: "private", ...extra });

describe("the phone calendar as the AI coach sees it", () => {
  it("gives day, time and title - and never the place or the notes", () => {
    const { entries } = buildCalendarContext([timed("a", "Lecture", at(2026, 10, 19, 9), at(2026, 10, 19, 11))]);
    expect(entries).toEqual([{ day: "Mon 2026-10-19", time: "09:00-11:00", title: "Lecture" }]);
    expect(JSON.stringify(entries)).not.toMatch(/Raum|private/);
  });

  it("is one entry for an event cut into days, in the order they happen", () => {
    const night = at(2026, 10, 20, 22);
    const end = at(2026, 10, 21, 6);
    const { entries } = buildCalendarContext([
      timed("late", "Flight", night, end),
      timed("late", "Flight", night, end, { day: 1 }),
      timed("early", "Dentist", at(2026, 10, 19, 8), at(2026, 10, 19, 8, 45)),
    ]);
    expect(entries.map((e) => e.title)).toEqual(["Dentist", "Flight"]);
    expect(entries[1]).toEqual({ day: "Tue 2026-10-20", until: "Wed 2026-10-21", time: "22:00 to 06:00", title: "Flight" });
  });

  it("reads an all-day event as dates, with its last day when it spans several", () => {
    const utc = (d: number) => Date.UTC(2026, 9, d);
    const { entries } = buildCalendarContext([
      timed("trip", "Trip", utc(23), utc(26), { allDay: true }),
      timed("bday", "Birthday", utc(21), utc(22), { allDay: true }),
    ]);
    expect(entries).toEqual([
      { day: "Wed 2026-10-21", allDay: true, title: "Birthday" },
      { day: "Fri 2026-10-23", until: "Sun 2026-10-25", allDay: true, title: "Trip" },
    ]);
  });

  it("shortens long titles, and says how many it left out", () => {
    const many = Array.from({ length: 83 }, (_, i) => timed(`e${i}`, "x".repeat(100), at(2026, 10, 19, 6) + i * 60_000, at(2026, 10, 19, 7) + i * 60_000));
    const { entries, more } = buildCalendarContext(many);
    expect(entries).toHaveLength(80);
    expect(more).toBe(3);
    expect(entries[0].title).toHaveLength(60);
  });
});
