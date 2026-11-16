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
 * did not write. One-way: an event edited in the calendar app is put back
 * as the app has it on the next sync.
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
}

export const DEFAULT_SYNC_OPTIONS: CalendarSyncOptions = {
  weeksAhead: ALL_WEEKS,
  weeksBack: ALL_WEEKS,
  includeDone: true,
  exercises: true,
  planNotes: true,
  howItWent: false,
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

export interface EventChanges {
  inserts: DesiredEvent[];
  updates: (DesiredEvent & { eventId: string })[];
  deletes: string[];
}

export const MARKER_PREFIX = "Boulder Tracker session ";
const MARKER = /Boulder Tracker session (\S+) · ([0-9a-z]+)\s*$/;

/** The session id and content hash of an event the app wrote, or null for any other event. */
export function readMarker(description: string | null | undefined): { sessionId: string; hash: string } | null {
  const m = MARKER.exec(description ?? "");
  return m ? { sessionId: m[1], hash: m[2] } : null;
}

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
  /** The sessions of every week touching the window, as `getWorkoutsForWeek` gives them. */
  workouts: Workout[];
  blocks: TrainingBlock[];
  exerciseTypes: ExerciseTypeDef[];
  options: CalendarSyncOptions;
  fromDay: number;
  toDay: number;
}

/** The events that should be in the calendar for the window, one per session, in day order. */
export function desiredEvents({ workouts, blocks, exerciseTypes, options, fromDay, toDay }: DesiredArgs): DesiredEvent[] {
  const out: DesiredEvent[] = [];
  const seen = new Set<string>();
  for (const w of workouts) {
    if (seen.has(w.id)) continue;
    const s = toCalendarSession(w);
    if (!s || s.day < fromDay || s.day > toDay) continue;
    if (s.done && !options.includeDone) continue;
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
    const hash = hashOf({ begin, end, allDay, title, location, body });
    out.push({
      sessionId: w.id,
      begin,
      end,
      allDay,
      title,
      location,
      description: `${body}\n\nWritten by Boulder Tracker - edit it in the app.\n${MARKER_PREFIX}${w.id} · ${hash}`,
    });
  }
  return out.sort((a, b) => a.begin - b.begin || a.sessionId.localeCompare(b.sessionId));
}

/** True when the event in the calendar is the desired one: same content hash, and its times and title not changed in the calendar app. */
function matches(e: ExistingEvent, d: DesiredEvent): boolean {
  return (
    readMarker(e.description)?.hash === readMarker(d.description)?.hash &&
    e.begin === d.begin &&
    e.end === d.end &&
    e.allDay === d.allDay &&
    (e.title ?? "") === d.title
  );
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
 */
export function reconcile(desired: DesiredEvent[], existing: ExistingEvent[], windowStart: number): EventChanges {
  const changes: EventChanges = { inserts: [], updates: [], deletes: [] };
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
    if (!first) changes.inserts.push(d);
    else if (!matches(first, d)) changes.updates.push({ ...d, eventId: first.eventId });
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
