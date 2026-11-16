/**
 * Writing the sessions into a calendar on the phone (Android) - the pure
 * part. `desiredEvents` turns sessions into the events that should be in
 * the chosen calendar; `reconcile` compares them with what is there and
 * returns only the differences. The store (`calendarSync.svelte.ts`)
 * reads the calendar, calls these and hands the changes to the plugin.
 *
 * Every event the app writes ends with a marker line naming its session and
 * a hash of its content ("Boulder Tracker session <id> · <hash>"). The
 * marker is how an event is found again (the calendar provider gives apps
 * no private field that survives a Google sync), how an unchanged event
 * costs no write, and the guard that keeps the app away from any event it
 * did not write. The marker also records the times the event was written
 * with, so a planned session moved in the calendar (by you, or an agent
 * that plans your day) is moved in the app too. Anything else edited in
 * the calendar app is put back as the app has it on the next sync.
 */
import type { ExerciseTypeDef, TrainingBlock, Workout } from "../types";
import { DAY_MS, sessionDay, toCalendarSession } from "../planning/calendarEvents";
import { summarizeSession } from "../planning/sessionSummary";
import { phaseOnDay } from "../planning/trainingBlocks";
import { hashOf } from "../sync/merge";

/** "All": the whole plan ahead, or everything back to the first session. */
export const ALL_WEEKS = -1;

export interface CalendarSyncOptions {
  /** Whole weeks after today written to the calendar, or `ALL_WEEKS` (to the end of the plan). */
  weeksAhead: number;
  /** Whole weeks before today kept up to date (older events are left as they are), or `ALL_WEEKS` (from the first session). */
  weeksBack: number;
  /** Finished sessions stay, at the time they happened, marked ✓. */
  includeDone: boolean;
  /** The exercises in the description. */
  exercises: boolean;
  /** The plan's note in the description. */
  planNotes: boolean;
  /** "How it went" (the note after a session) in the description. */
  howItWent: boolean;
  /** A planned session that wasn't done stays after its day; off: it is removed once its day is over. */
  keepMissed: boolean;
  /** A planned session moved in the calendar (day, time, length) moves in the app too. */
  takeMoves: boolean;
}

export const DEFAULT_SYNC_OPTIONS: CalendarSyncOptions = {
  weeksAhead: ALL_WEEKS,
  weeksBack: ALL_WEEKS,
  includeDone: true,
  exercises: true,
  planNotes: true,
  howItWent: false,
  keepMissed: false,
  takeMoves: true,
};

export const WEEKS_AHEAD_CHOICES = [ALL_WEEKS, 1, 2, 4, 8, 12, 52] as const;
export const WEEKS_BACK_CHOICES = [ALL_WEEKS, 0, 1, 4, 12, 52] as const;

/** An event as the app wants it in the calendar. */
export interface DesiredEvent {
  sessionId: string;
  /** Epoch ms. A timed event: local times. An all-day event: UTC midnights, end exclusive (the calendar provider's rule). */
  begin: number;
  end: number;
  allDay: boolean;
  title: string;
  location: string;
  /** Ends with the marker line. */
  description: string;
  /** Only a planned session's time can be taken from the calendar. */
  movable: boolean;
}

/** An event the app wrote earlier, as read from the calendar. */
export interface ExistingEvent {
  eventId: string;
  begin: number;
  end: number;
  allDay: boolean;
  title: string | null;
  location: string | null;
  description: string | null;
}

/** A session moved in the calendar, to be moved in the app: the event's new times. */
export interface CalendarMove {
  sessionId: string;
  begin: number;
  end: number;
  allDay: boolean;
}

export interface EventChanges {
  inserts: DesiredEvent[];
  updates: (DesiredEvent & { eventId: string })[];
  deletes: string[];
  /** Sessions moved in the calendar (and not in the app since): the app takes the calendar's time. */
  moves: CalendarMove[];
  /** Sessions moved in both places since the last write: the app's time was kept. */
  conflicts: string[];
}

export const MARKER_PREFIX = "Boulder Tracker session ";
const MARKER = /Boulder Tracker session (\S+) · ([0-9a-z]+)(?: · ([0-9a-z]+)-([0-9a-z]+)(\/a)?)?\s*$/;

/** The times written into an event, as its marker records them. */
export interface WrittenTimes {
  begin: number;
  end: number;
  allDay: boolean;
}

/**
 * The session id and content hash of an event the app wrote, and the times it was written with (absent on events
 * written before moves were read back) - or null for any other event.
 */
export function readMarker(description: string | null | undefined): { sessionId: string; hash: string; written?: WrittenTimes } | null {
  const m = MARKER.exec(description ?? "");
  if (!m) return null;
  const written = m[3] ? { begin: parseInt(m[3], 36), end: parseInt(m[4], 36), allDay: m[5] === "/a" } : undefined;
  return { sessionId: m[1], hash: m[2], ...(written ? { written } : {}) };
}

/** The marker line: session id, content hash (times left out) and the times written. */
function markerLine(sessionId: string, hash: string, t: WrittenTimes): string {
  return `${MARKER_PREFIX}${sessionId} · ${hash} · ${t.begin.toString(36)}-${t.end.toString(36)}${t.allDay ? "/a" : ""}`;
}

const sameTimes = (a: WrittenTimes, b: WrittenTimes) => a.begin === b.begin && a.end === b.end && a.allDay === b.allDay;

/**
 * The days (as day indexes, inclusive) the sync looks after: `weeksBack` weeks before today to `weeksAhead` after.
 * "All" reaches to the plan's first / last day (`span`), never closer than today.
 */
export function syncWindow(
  today: number,
  options: Pick<CalendarSyncOptions, "weeksAhead" | "weeksBack">,
  span: { firstDay: number; lastDay: number } | null = null,
): { fromDay: number; toDay: number } {
  return {
    fromDay: options.weeksBack === ALL_WEEKS ? Math.min(today, span?.firstDay ?? today) : today - 7 * options.weeksBack,
    toDay: options.weeksAhead === ALL_WEEKS ? Math.max(today, span?.lastDay ?? today) : today + 7 * options.weeksAhead,
  };
}

/** The first and last day the plan has anything on: stored sessions and phases. Null when there is nothing. */
export function planSpan(workouts: Workout[], blocks: Pick<TrainingBlock, "startDate" | "endDate">[]): { firstDay: number; lastDay: number } | null {
  let firstDay = Infinity;
  let lastDay = -Infinity;
  const see = (day: number | null) => {
    if (day === null || !Number.isFinite(day)) return;
    firstDay = Math.min(firstDay, day);
    lastDay = Math.max(lastDay, day);
  };
  for (const w of workouts) see(sessionDay(w));
  for (const b of blocks) {
    see(Date.parse(`${b.startDate}T00:00:00Z`) / DAY_MS);
    see(Date.parse(`${b.endDate}T00:00:00Z`) / DAY_MS);
  }
  return Number.isFinite(firstDay) ? { firstDay, lastDay } : null;
}

/** Local midnight at the start of a day index. */
export function localMidnight(day: number): number {
  const d = new Date(day * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

function isoOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export interface DesiredArgs {
  /** Today's day index: a planned session before it was missed. */
  today: number;
  /** The sessions of every week touching the window, as `getWorkoutsForWeek` gives them. */
  workouts: Workout[];
  blocks: TrainingBlock[];
  exerciseTypes: ExerciseTypeDef[];
  options: CalendarSyncOptions;
  fromDay: number;
  toDay: number;
}

/** The events that should be in the calendar for the window, one per session, in day order. */
export function desiredEvents({ workouts, blocks, exerciseTypes, options, fromDay, toDay, today }: DesiredArgs): DesiredEvent[] {
  const out: DesiredEvent[] = [];
  const seen = new Set<string>();
  for (const w of workouts) {
    if (seen.has(w.id)) continue;
    const s = toCalendarSession(w);
    if (!s || s.day < fromDay || s.day > toDay) continue;
    if (s.done && !options.includeDone) continue;
    if (!s.done && s.day < today && !options.keepMissed) continue;
    seen.add(w.id);

    const allDay = s.startMin === undefined;
    const begin = allDay ? s.day * DAY_MS : localMidnight(s.day) + s.startMin! * 60_000;
    // Local wall-clock arithmetic for the end too, so a daylight-saving night doesn't shift it.
    const end = allDay
      ? (s.day + 1) * DAY_MS
      : (() => {
          const d = new Date(localMidnight(s.day));
          return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, s.startMin! + s.minutes).getTime();
        })();

    const name = w.notes?.trim() || "Training session";
    const lines: string[] = [];
    const phase = phaseOnDay(blocks, isoOfDay(s.day));
    if (phase) lines.push(`Phase: ${phase.name}`);
    lines.push(`Status: ${s.done ? "done" : "planned"}`);
    lines.push(`Duration: ${s.minutes} min${s.plannedMinutes ? ` (${s.plannedMinutes} planned)` : ""}`);
    if (options.exercises) {
      const names = summarizeSession(w, exerciseTypes, 50).exerciseNames;
      if (names.length) lines.push(`Exercises: ${names.join(", ")}`);
    }
    if (options.planNotes && w.description?.trim()) lines.push("", w.description.trim());
    if (options.howItWent && s.done && w.logNotes?.trim()) lines.push("", `How it went: ${w.logNotes.trim()}`);

    const body = lines.join("\n");
    const title = `${s.done ? "✓ " : ""}${name}`;
    const location = w.location?.trim() ?? "";
    const hash = hashOf({ title, location, body });
    const footer = s.done ? "Written by Boulder Tracker - edit it in the app." : "Written by Boulder Tracker - move it here or in the app; edit the rest in the app.";
    out.push({
      sessionId: w.id,
      begin,
      end,
      allDay,
      title,
      location,
      description: `${body}\n\n${footer}\n${markerLine(w.id, hash, { begin, end, allDay })}`,
      movable: !s.done,
    });
  }
  return out.sort((a, b) => a.begin - b.begin || a.sessionId.localeCompare(b.sessionId));
}

/** True when the event in the calendar is the desired one: the same marker (content and written times), times and title. */
function matches(e: ExistingEvent, d: DesiredEvent): boolean {
  const have = readMarker(e.description);
  const want = readMarker(d.description)!;
  return have?.hash === want.hash && !!have.written && sameTimes(have.written, d) && sameTimes(e, d) && (e.title ?? "") === d.title;
}

/**
 * What to change so the calendar holds exactly `desired`.
 *
 * - `existing` is every event in the calendar that starts at or after a day
 *   before the window (the margin covers all-day events, which sit at UTC
 *   midnight); events without the app's marker are never touched.
 * - A session with an event: updated when it differs. Two events for one
 *   session (two phones wrote it before syncing): the first stays, the rest go.
 * - An event of the app's with no desired session: deleted when it starts in
 *   the window or after it (so a shorter window or a removed session clears
 *   it); before the window it is history and stays.
 * - Moves (`takeMoves`): an event whose times differ from those it was
 *   written with was moved in the calendar. If the session's own time is
 *   still the written one, the app takes the calendar's (`moves`; the event
 *   is left until the app has moved the session). If the session moved in
 *   the app too, the app's time wins (`conflicts`). A done session is put
 *   back. An event written before the times were recorded counts as unmoved.
 */
export function reconcile(desired: DesiredEvent[], existing: ExistingEvent[], windowStart: number, takeMoves = false): EventChanges {
  const changes: EventChanges = { inserts: [], updates: [], deletes: [], moves: [], conflicts: [] };
  const bySession = new Map<string, ExistingEvent[]>();
  for (const e of existing) {
    const marker = readMarker(e.description);
    if (!marker) continue;
    bySession.set(marker.sessionId, [...(bySession.get(marker.sessionId) ?? []), e]);
  }
  for (const list of bySession.values()) list.sort((a, b) => a.begin - b.begin || Number(a.eventId) - Number(b.eventId) || a.eventId.localeCompare(b.eventId));

  const wanted = new Set<string>();
  for (const d of desired) {
    wanted.add(d.sessionId);
    const [first, ...extra] = bySession.get(d.sessionId) ?? [];
    changes.deletes.push(...extra.map((e) => e.eventId));
    if (!first) {
      changes.inserts.push(d);
      continue;
    }
    if (matches(first, d)) continue;
    const written = readMarker(first.description)?.written;
    const movedInCalendar = !!written && !sameTimes(first, written);
    if (takeMoves && movedInCalendar && d.movable && !sameTimes(first, d)) {
      if (sameTimes(d, written)) {
        changes.moves.push({ sessionId: d.sessionId, begin: first.begin, end: first.end, allDay: first.allDay });
        continue;
      }
      changes.conflicts.push(d.sessionId);
    }
    changes.updates.push({ ...d, eventId: first.eventId });
  }
  for (const [sessionId, list] of bySession) {
    if (wanted.has(sessionId)) continue;
    for (const e of list) {
      // An all-day event's begin is a UTC midnight: compare its day with the window's local day.
      const starts = e.allDay ? localMidnight(Math.floor(e.begin / DAY_MS)) : e.begin;
      if (starts >= windowStart) changes.deletes.push(e.eventId);
    }
  }
  return changes;
}

export const hasChanges = (c: EventChanges): boolean => c.inserts.length + c.updates.length + c.deletes.length > 0;

/**
 * Where a session goes for an event moved in the calendar: its day (index), start minute (none for an all-day
 * event) and, for a timed event, its length in minutes.
 */
export function moveTarget(m: CalendarMove): { day: number; startMin?: number; minutes?: number } {
  if (m.allDay) return { day: Math.floor(m.begin / DAY_MS) };
  const start = new Date(m.begin);
  const day = Math.floor(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) / DAY_MS);
  return { day, startMin: start.getHours() * 60 + start.getMinutes(), minutes: Math.max(1, Math.round((m.end - m.begin) / 60_000)) };
}
