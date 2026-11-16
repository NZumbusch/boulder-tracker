/**
 * Your sessions in a calendar of your own (Android): the app writes every
 * session of a window around today (by default all of it: from the first
 * session to the end of the plan) into one calendar you pick - typically an empty "Training"
 * calendar under a Google account - and keeps it up to date. The phone's
 * calendar provider is the only thing the app talks to; the account's own
 * sync (Google) takes the events to the cloud and every other device, so
 * no server, sign-in or key is needed.
 *
 * The app is the source, with one exception: a planned session moved in
 * the calendar (day, time, length - by you, or an agent planning your day)
 * moves in the app too, unless it was also moved in the app since the
 * last write (then the app's time wins). A session that is moved, changed
 * or deleted in the app moves, changes or goes in the calendar; anything
 * else edited in the calendar is put back. A planned session that wasn't
 * done goes once its day is over (unless "keep missed" is on). Only events
 * the app wrote (they end with its marker line, see `events.ts`) are ever
 * touched, so a calendar that also holds your own events is safe.
 *
 * When: shortly after the plan changes (also when Drive sync brings in a
 * change), when the app starts or comes back, on "Sync now" and when an
 * option changes. After a change only a week back onwards is compared;
 * everything once a day and on "Sync now". Never with the example data.
 * The settings are per device (calendar ids belong to the phone). The
 * calendar is only read while the app runs: a move made while it is
 * closed reaches the app when it is next opened.
 */
import { App } from "@capacitor/app";
import { trainingState } from "../state.svelte";
import { isDemoMode } from "../storage/persistence";
import { getWeekIdRange, localIsoDate, toUtcDayIndex } from "../dateUtils";
import { DAY_MS, dayNameOf, toCalendarSession, weekIdOfDayIndex } from "../planning/calendarEvents";
import type { Workout } from "../types";
import { DeviceCalendar, deviceCalendarSupported, type NativeCalendar } from "../native/deviceCalendar";
import { hashOf } from "../sync/merge";
import {
  DEFAULT_SYNC_OPTIONS, desiredEvents, hasChanges, localMidnight, moveTarget, planSpan, reconcile, syncWindow,
  type CalendarMove, type CalendarSyncOptions, type DesiredEvent,
} from "./events";

const SETTINGS_KEY = "boulder_tracker_calendar_write";
/** How long after a change to the plan the calendar is written - a few edits in a row become one write. */
const AFTER_CHANGE_MS = 10_000;
/**
 * After a change in the app only this far back is compared ("near"): history before it hardly ever changes, so a
 * sync costs the same however long the history grows. Everything is compared once a day and on "Sync now" ("full").
 */
const NEAR_BACK_DAYS = 7;

type Scope = "near" | "full";

interface Settings {
  enabled: boolean;
  calendarId: string | null;
  /** Kept to name the calendar when it is gone from the phone. */
  calendarName: string | null;
  options: CalendarSyncOptions;
  /** The day (YYYY-MM-DD) of the last full compare. */
  lastFullDay?: string | null;
}

const EMPTY: Settings = { enabled: false, calendarId: null, calendarName: null, options: { ...DEFAULT_SYNC_OPTIONS }, lastFullDay: null };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...EMPTY, ...saved, options: { ...DEFAULT_SYNC_OPTIONS, ...(saved?.options ?? {}) } };
    }
  } catch { /* fall through */ }
  return { ...EMPTY, options: { ...DEFAULT_SYNC_OPTIONS } };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export interface WriteResult {
  inserted: number;
  updated: number;
  deleted: number;
  /** Sessions moved in the app because they were moved in the calendar. */
  moved?: number;
  /** Sessions moved in both places: the app's time was kept. */
  conflicts?: number;
}

class CalendarSyncStore {
  supported = deviceCalendarSupported();
  enabled = $state(false);
  calendarId = $state<string | null>(null);
  calendarName = $state<string | null>(null);
  options = $state<CalendarSyncOptions>({ ...DEFAULT_SYNC_OPTIONS });
  /** The calendars events can be written to, for the picker. */
  writable = $state<NativeCalendar[]>([]);
  syncing = $state(false);
  lastSyncAt = $state<number | null>(null);
  lastResult = $state<WriteResult | null>(null);
  error = $state<string | null>(null);
  /** The chosen calendar is no longer on the phone (deleted, or its account removed). */
  missing = $state(false);

  #started = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #again: Scope | null = null;
  #pending: Scope = "near";
  /** The near events last written, so a change that doesn't change them costs nothing. */
  #lastWritten: string | null = null;
  #lastFullDay: string | null = null;

  init(): void {
    if (!this.supported || this.#started) return;
    this.#started = true;
    const s = loadSettings();
    this.enabled = s.enabled;
    this.calendarId = s.calendarId;
    this.calendarName = s.calendarName;
    this.options = s.options;
    this.#lastFullDay = s.lastFullDay ?? null;

    // Any change to what should be in the calendar (a session moved in the app, a change from Drive sync) schedules a write.
    $effect.root(() => {
      $effect(() => {
        if (!this.enabled || !this.calendarId || !this.#dataReady()) return;
        const key = hashOf(this.#desired("near").events);
        if (key === this.#lastWritten) return;
        // The first time after start: a full compare once a day, else the near one.
        if (this.#lastWritten === null) this.schedule(0, this.#dueScope());
        else this.schedule(AFTER_CHANGE_MS, "near");
      });
    });
    void App.addListener("resume", () => {
      // The day may have moved on, and the calendar may have been edited (or sessions moved) in the calendar app.
      if (this.enabled) this.schedule(0, this.#dueScope());
    });
  }

  /**
   * The plan is loaded and real: before the first load (or during an import) the sessions read as none, and writing
   * then would take every event out of the calendar.
   */
  #dataReady(): boolean {
    return !trainingState.isLoading && !trainingState.importProgress && !trainingState.demoActive && !isDemoMode();
  }

  /** "full" when today hasn't had a full compare yet. */
  #dueScope(): Scope {
    return this.#lastFullDay === localIsoDate() ? "near" : "full";
  }

  /**
   * The window and the events that should be in it - the whole window ("full") or from a week back ("near"), plus
   * the sessions by id (to move one). Reactive: reads the plan.
   */
  #desired(scope: Scope): { events: DesiredEvent[]; windowStart: number; sessions: Map<string, Workout> } {
    const today = toUtcDayIndex(localIsoDate());
    const full = syncWindow(today, this.options, planSpan(trainingState.workouts, trainingState.trainingBlocks));
    const fromDay = scope === "near" ? Math.max(full.fromDay, today - NEAR_BACK_DAYS) : full.fromDay;
    const toDay = full.toDay;
    const weeks = getWeekIdRange(weekIdOfDayIndex(fromDay), weekIdOfDayIndex(toDay));
    const workouts = weeks.flatMap((w) => trainingState.getWorkoutsForWeek(w));
    const events = desiredEvents({
      workouts,
      blocks: trainingState.trainingBlocks,
      exerciseTypes: trainingState.exerciseTypes,
      options: this.options,
      fromDay,
      toDay,
      today,
    });
    return { events, windowStart: localMidnight(fromDay), sessions: new Map(workouts.map((w) => [w.id, w])) };
  }

  /** Moves a session to where its event was moved in the calendar. False when it can't be moved now. */
  async #applyMove(move: CalendarMove, sessions: Map<string, Workout>): Promise<boolean> {
    const w = sessions.get(move.sessionId);
    if (!w || w.status !== "planned") return false;
    const current = toCalendarSession(w);
    const target = moveTarget(move);
    const pad = (n: number) => String(n).padStart(2, "0");
    const next: Workout = {
      ...($state.snapshot(w) as Workout),
      weekId: weekIdOfDayIndex(target.day),
      dayOfWeek: dayNameOf(target.day),
      startTime: target.startMin === undefined ? undefined : `${pad(Math.floor(target.startMin / 60))}:${pad(target.startMin % 60)}`,
    };
    // A longer or shorter event in the calendar is the session's new planned length.
    if (target.minutes !== undefined && target.minutes !== current?.minutes) next.plannedDuration = target.minutes;
    await trainingState.saveWorkoutQuiet(next);
    return true;
  }

  /** Reads which calendars can take events. Asks for calendar access (read and write) when `ask`. */
  async loadCalendars(ask = false): Promise<boolean> {
    this.error = null;
    try {
      const perm = ask ? await DeviceCalendar.requestWritePermission() : await DeviceCalendar.getCalendarPermission();
      if (!perm.writeGranted) {
        if (ask) this.error = "Calendar access wasn't allowed. You can allow it in the phone's app settings.";
        this.writable = [];
        return false;
      }
      const { calendars } = await DeviceCalendar.listCalendars();
      this.writable = calendars.filter((c) => c.writable !== false);
      return true;
    } catch (err) {
      this.error = errorText(err);
      return false;
    }
  }

  /** Starts writing into a calendar (or moves to another one - the old one keeps what was written). */
  choose(calendar: NativeCalendar): void {
    this.missing = false;
    this.error = null;
    this.#lastWritten = null;
    this.#save({ enabled: true, calendarId: calendar.id, calendarName: calendar.name });
    this.schedule(0, "full");
  }

  setOption<K extends keyof CalendarSyncOptions>(key: K, value: CalendarSyncOptions[K]): void {
    this.#save({ options: { ...this.options, [key]: value } });
    this.schedule(0, "full");
  }

  /** Stops writing. With `removeEvents`, also takes every event the app wrote out of the calendar (your own events stay). */
  async turnOff(removeEvents: boolean): Promise<void> {
    this.#clearTimer();
    const calendarId = this.calendarId;
    this.#save({ enabled: false });
    this.#lastWritten = null;
    this.lastResult = null;
    if (!removeEvents || !calendarId) return;
    try {
      const { events } = await DeviceCalendar.listAppEvents({ calendarId, from: 0 });
      const res = await DeviceCalendar.applyEventChanges({ calendarId, inserts: [], updates: [], deletes: events.map((e) => e.eventId) });
      this.lastResult = { inserted: 0, updated: 0, deleted: res.deleted };
    } catch (err) {
      this.error = errorText(err);
    }
  }

  /** Syncs after `delayMs`; a full compare asked for meanwhile is kept even if a near one is asked for after it. */
  schedule(delayMs: number, scope: Scope = "near"): void {
    const pending = this.#timer ? this.#pending : null;
    this.#clearTimer();
    this.#pending = pending === "full" ? "full" : scope;
    this.#timer = setTimeout(() => void this.syncNow(this.#pending), delayMs);
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** Writes the differences now - everything ("Sync now", once a day), or from a week back after a change. */
  async syncNow(scope: Scope = "full"): Promise<void> {
    this.#clearTimer();
    if (!this.supported || !this.enabled || !this.calendarId || !this.#dataReady()) return;
    if (this.syncing) {
      this.#again = this.#again === "full" ? "full" : scope;
      return;
    }
    this.syncing = true;
    const calendarId = this.calendarId;
    try {
      const perm = await DeviceCalendar.getCalendarPermission();
      if (!perm.writeGranted) {
        this.error = "Calendar access was taken away. Allow it again in the phone's settings for this app.";
        return;
      }
      const { calendars } = await DeviceCalendar.listCalendars();
      const target = calendars.find((c) => c.id === calendarId);
      if (!target) {
        this.missing = true;
        this.error = null;
        return;
      }
      this.missing = false;
      if (target.name !== this.calendarName) this.#save({ calendarName: target.name });

      let wanted = this.#desired(scope);
      // A day's margin before the window: all-day events sit on UTC midnights.
      const { events: existing } = await DeviceCalendar.listAppEvents({ calendarId, from: wanted.windowStart - DAY_MS });
      // Not while Plan B is being edited: a move would land in the Plan B.
      const takeMoves = this.options.takeMoves && !trainingState.planBEditing;
      let changes = reconcile(wanted.events, existing, wanted.windowStart, takeMoves);
      let moved = 0;
      if (changes.moves.length > 0) {
        // Sessions moved in the calendar move in the app first; then the events are compared again (their markers take the new times).
        for (const m of changes.moves) if (await this.#applyMove(m, wanted.sessions)) moved++;
        wanted = this.#desired(scope);
        changes = reconcile(wanted.events, existing, wanted.windowStart, false);
      }
      const result = hasChanges(changes)
        ? await DeviceCalendar.applyEventChanges({
            calendarId,
            inserts: changes.inserts.map(toInput),
            updates: changes.updates.map((u) => ({ ...toInput(u), eventId: u.eventId })),
            deletes: changes.deletes,
          })
        : { inserted: 0, updated: 0, deleted: 0 };
      this.lastResult = { ...result, moved, conflicts: changes.conflicts.length };
      this.lastSyncAt = Date.now();
      if (result.failed) {
        // The rest was written; the next sync tries these again.
        this.#lastWritten = null;
        this.error = `${result.failed} change${result.failed === 1 ? "" : "s"} could not be written${result.error ? `: ${result.error}` : ""}. The next sync tries again.`;
      } else {
        this.#lastWritten = hashOf(scope === "near" ? wanted.events : this.#desired("near").events);
        if (scope === "full") {
          this.#lastFullDay = localIsoDate();
          this.#save({ lastFullDay: this.#lastFullDay });
        }
        this.error = null;
      }
    } catch (err) {
      this.error = errorText(err);
    } finally {
      this.syncing = false;
      if (this.#again) {
        const again = this.#again;
        this.#again = null;
        this.schedule(0, again);
      }
    }
  }

  #save(patch: Partial<Settings>): void {
    const s: Settings = {
      enabled: this.enabled,
      calendarId: this.calendarId,
      calendarName: this.calendarName,
      options: this.options,
      lastFullDay: this.#lastFullDay,
      ...patch,
    };
    this.enabled = s.enabled;
    this.calendarId = s.calendarId;
    this.calendarName = s.calendarName;
    this.options = s.options;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* the choice just won't be remembered */ }
  }
}

const toInput = (d: DesiredEvent) => ({ begin: d.begin, end: d.end, allDay: d.allDay, title: d.title, location: d.location, description: d.description });

export const calendarSync = new CalendarSyncStore();

/** The calendar sessions are written into, while writing is on - the Plan calendar and the AI leave it out (it would show every session twice). */
export function writtenCalendarId(): string | null {
  return calendarSync.enabled ? calendarSync.calendarId : null;
}
