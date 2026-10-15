import { describe, it, expect } from "vitest";
import { headerBars, capBars, isBarEvent, barEvents, type HeaderBar } from "./headerBars";
import { toDeviceEvents } from "../calendar/deviceEvents";
import type { NativeEvent } from "../native/deviceCalendar";
import { toUtcDayIndex } from "../dateUtils";
import type { GoalEvent } from "../types";

const day = (iso: string) => toUtcDayIndex(iso);
const week = Array.from({ length: 7 }, (_, i) => day("2026-10-05") + i); // Mon 5 - Sun 11 Oct
const trip = (id: string, date: string, endDate?: string): GoalEvent => ({ id, kind: "trip", name: id, date, ...(endDate ? { endDate } : {}) });
const comp = (id: string, date: string): GoalEvent => ({ id, kind: "competition", name: id, date });
const allDay = (id: string, from: string, toExclusive: string): NativeEvent =>
  ({ id, title: id, allDay: true, calendarId: "c", color: "#112233", begin: Date.parse(`${from}T00:00:00Z`), end: Date.parse(`${toExclusive}T00:00:00Z`) }) as NativeEvent;
const timed = (id: string, from: Date, to: Date): NativeEvent =>
  ({ id, title: id, allDay: false, calendarId: "c", color: "#112233", begin: from.getTime(), end: to.getTime() }) as NativeEvent;
const name = (b: HeaderBar) => (b.kind === "goal" ? b.goal.id : b.event.id);
const show = (bars: HeaderBar[]) => bars.map((b) => `${name(b)}:${b.from}+${b.span}@${b.lane}${b.startsBefore ? "<" : ""}${b.endsAfter ? ">" : ""}`);

describe("which events are bars", () => {
  it("takes all-day events and anything twelve hours or longer, not an evening that runs past midnight", () => {
    const [a] = toDeviceEvents([allDay("a", "2026-10-14", "2026-10-15")]);
    const [night] = toDeviceEvents([timed("n", new Date(2026, 9, 14, 22), new Date(2026, 9, 15, 1, 30))]);
    const [lecture] = toDeviceEvents([timed("l", new Date(2026, 9, 14, 0), new Date(2026, 9, 15, 0))]);
    const [short] = toDeviceEvents([timed("s", new Date(2026, 9, 14, 9), new Date(2026, 9, 14, 10))]);
    expect([a, night, lecture, short].map(isBarEvent)).toEqual([true, false, true, false]);
  });
  it("counts an event once, however many days it was cut into", () => {
    const pieces = toDeviceEvents([allDay("trip", "2026-10-07", "2026-10-10"), allDay("trip", "2026-10-14", "2026-10-15")]);
    expect(pieces).toHaveLength(4);
    expect(barEvents(pieces).map((e) => `${e.id}:${e.firstDay - day("2026-10-05")}-${e.lastDay - day("2026-10-05")}`)).toEqual(["trip:2-4", "trip:9-9"]);
  });
});

describe("headerBars", () => {
  it("draws a multi-day event over its days and a goal over its own", () => {
    const events = toDeviceEvents([allDay("umzug", "2026-10-10", "2026-10-12")]);
    expect(show(headerBars([trip("t", "2026-10-07", "2026-10-08"), comp("c", "2026-10-11")], events, week))).toEqual(["t:2+2@0", "c:6+1@0", "umzug:5+2@1"]);
  });
  it("clips to the days shown and says which side was cut", () => {
    const events = toDeviceEvents([allDay("long", "2026-10-02", "2026-10-30")]);
    expect(show(headerBars([], events, week))).toEqual(["long:0+7@0<>"]);
  });
  it("leaves out what misses the days shown", () => {
    expect(headerBars([comp("c", "2026-10-04")], toDeviceEvents([allDay("x", "2026-10-12", "2026-10-13")]), week)).toEqual([]);
  });
  it("puts overlapping bars on their own rows and reuses a row once it is free", () => {
    const events = toDeviceEvents([allDay("a", "2026-10-05", "2026-10-09"), allDay("b", "2026-10-07", "2026-10-11"), allDay("c", "2026-10-09", "2026-10-10")]);
    expect(show(headerBars([], events, week))).toEqual(["a:0+4@0", "b:2+4@1", "c:4+1@0"]);
  });
  it("keeps your goals on the top rows", () => {
    const events = toDeviceEvents([allDay("e", "2026-10-05", "2026-10-12")]);
    expect(show(headerBars([comp("c", "2026-10-07")], events, week))).toEqual(["c:2+1@0", "e:0+7@1"]);
  });
  it("works for a single day", () => {
    const events = toDeviceEvents([allDay("e", "2026-10-07", "2026-10-10")]);
    expect(show(headerBars([], events, [day("2026-10-08")]))).toEqual(["e:0+1@0<>"]);
  });
  it("leaves short timed events to the hour grid", () => {
    expect(headerBars([], toDeviceEvents([timed("m", new Date(2026, 9, 7, 9), new Date(2026, 9, 7, 10))]), week)).toEqual([]);
  });
});

describe("capBars", () => {
  const events = toDeviceEvents([
    allDay("a", "2026-10-05", "2026-10-07"),
    allDay("b", "2026-10-05", "2026-10-07"),
    allDay("c", "2026-10-05", "2026-10-06"),
    allDay("d", "2026-10-06", "2026-10-07"),
  ]);
  const bars = headerBars([], events, week);
  it("shows everything when it fits, or when there is no limit", () => {
    expect(capBars(bars, 7, 4)).toEqual({ bars, hidden: [0, 0, 0, 0, 0, 0, 0], rows: 3 });
    expect(capBars(bars, 7, 0).bars).toHaveLength(4);
  });
  it("turns the last row into a +N row and counts what is hidden under each day", () => {
    const capped = capBars(bars, 7, 2);
    expect(show(capped.bars)).toEqual(["a:0+2@0"]);
    expect(capped.hidden).toEqual([2, 2, 0, 0, 0, 0, 0]);
    expect(capped.rows).toBe(2);
  });
});
