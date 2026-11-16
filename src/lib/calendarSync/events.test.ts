import { describe, it, expect } from "vitest";
import type { TrainingBlock, Workout } from "../types";
import { DAY_MS } from "../planning/calendarEvents";
import { toUtcDayIndex } from "../dateUtils";
import {
  ALL_WEEKS, DEFAULT_SYNC_OPTIONS, desiredEvents, localMidnight, planSpan, readMarker, reconcile, syncWindow,
  type CalendarSyncOptions, type DesiredEvent, type ExistingEvent,
} from "./events";

const workout = (over: Partial<Workout>): Workout =>
  ({ id: "w1", notes: "Limit boulders", weekId: "2026-W46", dayOfWeek: "Tuesday", exercises: [], plannedDuration: 90, status: "planned", date: null, loadFactor: 0, ...over }) as Workout;

const TUE = toUtcDayIndex("2026-11-10");
const desired = (workouts: Workout[], options: Partial<CalendarSyncOptions> = {}, blocks: TrainingBlock[] = []) =>
  desiredEvents({ workouts, blocks, exerciseTypes: [], options: { ...DEFAULT_SYNC_OPTIONS, ...options }, fromDay: TUE - 28, toDay: TUE + 7 });

/** The events in the calendar after the app wrote `list`. */
const written = (list: DesiredEvent[]): ExistingEvent[] =>
  list.map((d, i) => ({ eventId: String(100 + i), begin: d.begin, end: d.end, allDay: d.allDay, title: d.title, location: d.location, description: d.description }));

describe("desiredEvents", () => {
  it("writes a timed session at its local time, as long as planned", () => {
    const [e] = desired([workout({ startTime: "18:30" })]);
    expect(e.allDay).toBe(false);
    expect(new Date(e.begin)).toEqual(new Date(2026, 10, 10, 18, 30));
    expect(new Date(e.end)).toEqual(new Date(2026, 10, 10, 20, 0));
    expect(e.title).toBe("Limit boulders");
  });

  it("writes a session with no time as an all-day event on UTC midnights", () => {
    const [e] = desired([workout({})]);
    expect(e.allDay).toBe(true);
    expect(e.begin).toBe(Date.UTC(2026, 10, 10));
    expect(e.end - e.begin).toBe(DAY_MS);
  });

  it("marks a done session and keeps it at the day it happened, or leaves it out when asked", () => {
    const done = workout({ status: "completed", date: "2026-11-11T19:00:00.000Z", startTime: "18:00", actualDuration: 120 });
    const [e] = desired([done]);
    expect(e.title).toBe("✓ Limit boulders");
    expect(new Date(e.begin)).toEqual(new Date(2026, 10, 11, 18, 0));
    expect(e.end - e.begin).toBe(120 * 60_000);
    expect(e.description).toContain("Status: done");
    expect(desired([done], { includeDone: false })).toEqual([]);
  });

  it("leaves out sessions outside the window, without a day, or listed twice", () => {
    expect(desired([workout({ weekId: "2026-W30" }), workout({ id: "x", dayOfWeek: undefined })])).toEqual([]);
    expect(desired([workout({}), workout({})])).toHaveLength(1);
  });

  it("describes phase, place, exercises and notes by the options", () => {
    const block = { id: "b", name: "Power", phaseId: "p", startDate: "2026-11-01", endDate: "2026-11-30" } as TrainingBlock;
    const w = workout({ location: "Gym", description: "Fresh fingers", logNotes: "Felt strong", status: "completed", date: "2026-11-10T18:00:00.000Z" });
    const [e] = desired([w], {}, [block]);
    expect(e.location).toBe("Gym");
    expect(e.description).toMatch(/^Phase: Power\nStatus: done\nDuration: \d+ min/);
    expect(e.description).toContain("Fresh fingers");
    expect(e.description).not.toContain("Felt strong");
    const [f] = desired([w], { planNotes: false, howItWent: true }, [block]);
    expect(f.description).not.toContain("Fresh fingers");
    expect(f.description).toContain("How it went: Felt strong");
  });

  it("ends with a marker that names the session and changes with the content", () => {
    const [a] = desired([workout({ id: "prov:2026-W46:t1", startTime: "18:00" })]);
    const [b] = desired([workout({ id: "prov:2026-W46:t1", startTime: "19:00" })]);
    expect(readMarker(a.description)?.sessionId).toBe("prov:2026-W46:t1");
    expect(readMarker(a.description)?.hash).not.toBe(readMarker(b.description)?.hash);
  });
});

describe("readMarker", () => {
  it("ignores events the app did not write", () => {
    expect(readMarker(null)).toBeNull();
    expect(readMarker("Dentist")).toBeNull();
  });
});

describe("syncWindow", () => {
  it("runs from weeks back to weeks ahead of today", () => {
    expect(syncWindow(100, { weeksBack: 4, weeksAhead: 1 })).toEqual({ fromDay: 72, toDay: 107 });
  });

  it("reaches the whole plan for All, never closer than today", () => {
    expect(syncWindow(100, { weeksBack: ALL_WEEKS, weeksAhead: ALL_WEEKS }, { firstDay: 10, lastDay: 300 })).toEqual({ fromDay: 10, toDay: 300 });
    expect(syncWindow(100, { weeksBack: ALL_WEEKS, weeksAhead: ALL_WEEKS }, { firstDay: 120, lastDay: 90 })).toEqual({ fromDay: 100, toDay: 100 });
    expect(syncWindow(100, { weeksBack: ALL_WEEKS, weeksAhead: 1 }, null)).toEqual({ fromDay: 100, toDay: 107 });
  });
});

describe("planSpan", () => {
  it("covers stored sessions and phases", () => {
    const block = { startDate: "2026-12-01", endDate: "2027-02-28" };
    const done = workout({ status: "completed", date: "2025-03-04T18:00:00.000Z" });
    expect(planSpan([done], [block])).toEqual({ firstDay: toUtcDayIndex("2025-03-04"), lastDay: toUtcDayIndex("2027-02-28") });
    expect(planSpan([], [])).toBeNull();
  });
});

describe("reconcile", () => {
  const start = localMidnight(TUE - 28);

  it("inserts what is missing and leaves an up-to-date calendar alone", () => {
    const want = desired([workout({ startTime: "18:00" }), workout({ id: "w2", dayOfWeek: "Thursday" })]);
    expect(reconcile(want, [], start).inserts).toHaveLength(2);
    expect(reconcile(want, written(want), start)).toEqual({ inserts: [], updates: [], deletes: [] });
  });

  it("updates a changed session and puts back an event moved in the calendar app", () => {
    const before = desired([workout({ startTime: "18:00" })]);
    const after = desired([workout({ startTime: "19:00" })]);
    expect(reconcile(after, written(before), start).updates.map((u) => u.eventId)).toEqual(["100"]);
    const moved = written(before).map((e) => ({ ...e, begin: e.begin + 3_600_000, end: e.end + 3_600_000 }));
    expect(reconcile(before, moved, start).updates).toHaveLength(1);
  });

  it("deletes a removed session's event in or after the window, keeps older ones and never touches other events", () => {
    const old = { eventId: "1", begin: start - DAY_MS * 3, end: start - DAY_MS * 3 + 1, allDay: false, title: "x", location: null, description: "…\nBoulder Tracker session gone1 · abc" };
    const later = { ...old, eventId: "2", begin: start + DAY_MS * 50, description: "…\nBoulder Tracker session gone2 · abc" };
    const dentist = { ...old, eventId: "3", begin: start + DAY_MS, description: "Dentist" };
    expect(reconcile([], [old, later, dentist], start).deletes).toEqual(["2"]);
  });

  it("judges an all-day event by its day, not its UTC midnight", () => {
    const e = { eventId: "4", begin: (TUE - 28) * DAY_MS, end: (TUE - 27) * DAY_MS, allDay: true, title: "x", location: null, description: "Boulder Tracker session g · a" };
    expect(reconcile([], [e], start).deletes).toEqual(["4"]);
  });

  it("keeps one event when two were written for the same session", () => {
    const want = desired([workout({ startTime: "18:00" })]);
    const twice = [...written(want), { ...written(want)[0], eventId: "205" }];
    expect(reconcile(want, twice, start)).toEqual({ inserts: [], updates: [], deletes: ["205"] });
  });
});
