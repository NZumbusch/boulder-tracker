import { describe, it, expect } from "vitest";
import { toDeviceEvents, eventsByDay, plainNotes } from "./deviceEvents";
import type { NativeEvent } from "../native/deviceCalendar";

const native = (over: Partial<NativeEvent>): NativeEvent =>
  ({ id: "e1", begin: 0, end: 0, title: "Dentist", allDay: false, calendarId: "1", color: "#123456", ...over }) as NativeEvent;

const dayOf = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m, d) / 86_400_000);

describe("toDeviceEvents", () => {
  it("places a timed event on its local day and time", () => {
    const [e] = toDeviceEvents([native({ begin: new Date(2026, 9, 14, 9, 30).getTime(), end: new Date(2026, 9, 14, 10, 15).getTime() })]);
    expect(e.day).toBe(dayOf(2026, 9, 14));
    expect(e.startMin).toBe(570);
    expect(e.minutes).toBe(45);
    expect(e.allDay).toBe(false);
  });

  it("splits an event that runs past midnight over both days", () => {
    const events = toDeviceEvents([native({ begin: new Date(2026, 9, 14, 22, 0).getTime(), end: new Date(2026, 9, 15, 1, 30).getTime() })]);
    expect(events.map((e) => [e.day, e.startMin, e.minutes])).toEqual([
      [dayOf(2026, 9, 14), 1320, 120],
      [dayOf(2026, 9, 15), 0, 90],
    ]);
  });

  it("reads an all-day event as dates, whatever the time zone", () => {
    // The provider stores 14 Oct as UTC midnight to the next UTC midnight (end exclusive).
    const [e] = toDeviceEvents([native({ allDay: true, begin: Date.UTC(2026, 9, 14), end: Date.UTC(2026, 9, 15) })]);
    expect(e.day).toBe(dayOf(2026, 9, 14));
    expect(e.allDay).toBe(true);
    expect(e.startMin).toBeUndefined();
  });

  it("gives a multi-day all-day event a day each, not the day after it ends", () => {
    const events = toDeviceEvents([native({ allDay: true, begin: Date.UTC(2026, 9, 14), end: Date.UTC(2026, 9, 17) })]);
    expect(events.map((e) => e.day)).toEqual([dayOf(2026, 9, 14), dayOf(2026, 9, 15), dayOf(2026, 9, 16)]);
  });

  it("keeps a zero-length event visible and names an untitled one", () => {
    const t = new Date(2026, 9, 14, 12, 0).getTime();
    const [e] = toDeviceEvents([native({ begin: t, end: t, title: " " })]);
    expect(e.minutes).toBe(1);
    expect(e.title).toBe("(No title)");
  });
});

describe("eventsByDay", () => {
  it("puts all-day events first, then by time", () => {
    const day = dayOf(2026, 9, 14);
    const list = eventsByDay(toDeviceEvents([
      native({ id: "b", title: "B", begin: new Date(2026, 9, 14, 15).getTime(), end: new Date(2026, 9, 14, 16).getTime() }),
      native({ id: "c", title: "C", allDay: true, begin: Date.UTC(2026, 9, 14), end: Date.UTC(2026, 9, 15) }),
      native({ id: "a", title: "A", begin: new Date(2026, 9, 14, 8).getTime(), end: new Date(2026, 9, 14, 9).getTime() }),
    ])).get(day)!;
    expect(list.map((e) => e.title)).toEqual(["C", "A", "B"]);
  });
});

describe("what the detail sheet needs", () => {
  it("carries the whole event, its colour, location and notes along", () => {
    const [e] = toDeviceEvents([native({ begin: new Date(2026, 9, 14, 18, 30).getTime(), end: new Date(2026, 9, 14, 19, 30).getTime(), location: " Raum: 555 ", description: "<p>Adresse: Arsenalstrasse&nbsp;28a</p><br>Kriens" })]);
    expect(e).toMatchObject({ begin: new Date(2026, 9, 14, 18, 30).getTime(), end: new Date(2026, 9, 14, 19, 30).getTime(), color: "#123456", location: "Raum: 555", notes: "Adresse: Arsenalstrasse 28a\n\nKriens" });
  });
  it("leaves out what is not there", () => {
    const [e] = toDeviceEvents([native({ begin: new Date(2026, 9, 14, 9, 0).getTime(), end: new Date(2026, 9, 14, 10, 0).getTime(), location: "  ", description: "<br>" })]);
    expect(e.location).toBeUndefined();
    expect(e.notes).toBeUndefined();
  });
  it("keeps every day of a split event pointing at the same whole", () => {
    const events = toDeviceEvents([native({ begin: new Date(2026, 9, 14, 22, 0).getTime(), end: new Date(2026, 9, 15, 1, 30).getTime() })]);
    expect(new Set(events.map((x) => `${x.begin}-${x.end}`)).size).toBe(1);
  });
});

describe("plainNotes", () => {
  it("turns markup into readable lines", () => {
    expect(plainNotes("<div>One</div><div>Two &amp; three</div>")).toBe("One\nTwo & three");
    expect(plainNotes(undefined)).toBeUndefined();
  });
});
