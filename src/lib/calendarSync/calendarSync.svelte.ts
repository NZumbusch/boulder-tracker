/**
 * Your sessions in a calendar of your own (Android): the app writes every
 * session of a window around today (by default all of it: from the first
 * session to the end of the plan) into one calendar you pick - typically an empty "Training"
 * calendar under a Google account - and keeps it up to date. The phone's
 * calendar provider is the only thing the app talks to; the account's own
 * sync (Google) takes the events to the cloud and every other device, so
 * no server, sign-in or key is needed.
 *
 * One-way: the app is the source. A session that is moved, changed or
 * deleted in the app moves, changes or goes in the calendar; an event
 * edited in the calendar app is put back on the next sync. Only events the
 * app wrote (they end with its marker line, see `events.ts`) are ever
 * touched, so a calendar that also holds your own events is safe.
 *
 * When: shortly after the plan changes (also when Drive sync brings in a
 * change), when the app starts or comes back, on "Sync now" and when an
 * option changes. Never with the example data. The settings are per
 * device (calendar ids belong to the phone).
 */
import { App } from "@capacitor/app";
import { trainingState } from "../state.svelte";
import { isDemoMode } from "../storage/persistence";
import { getWeekIdRange, localIsoDate, toUtcDayIndex } from "../dateUtils";
import { DAY_MS, weekIdOfDayIndex } from "../planning/calendarEvents";
import { DeviceCalendar, deviceCalendarSupported, type NativeCalendar } from "../native/deviceCalendar";
import { hashOf } from "../sync/merge";
import {
  DEFAULT_SYNC_OPTIONS, desiredEvents, hasChanges, localMidnight, planSpan, reconcile, syncWindow,
  type CalendarSyncOptions, type DesiredEvent,
} from "./events";

const SETTINGS_KEY = "boulder_tracker_calendar_write";
/** How long after a change to the plan the calendar is written - a few edits in a row become one write. */
const AFTER_CHANGE_MS = 10_000;

interface Settings {
  enabled: boolean;
  calendarId: string | null;
  /** Kept to name the calendar when it is gone from the phone. */
  calendarName: string | null;
  options: CalendarSyncOptions;
}

const EMPTY: Settings = { enabled: false, calendarId: null, calendarName: null, options: { ...DEFAULT_SYNC_OPTIONS } };

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
  #again = false;
  /** The desired events last written, so a change that doesn't change them costs nothing. */
  #lastWritten: string | null = null;

  init(): void {
    if (!this.supported || this.#started) return;
    this.#started = true;
    const s = loadSettings();
    this.enabled = s.enabled;
    this.calendarId = s.calendarId;
    this.calendarName = s.calendarName;
    this.options = s.options;

    // Any change to what should be in the calendar (a session moved in the app, a change from Drive sync) schedules a write.
    $effect.root(() => {
      $effect(() => {
        if (!this.enabled || !this.calendarId || !this.#dataReady()) return;
        const key = hashOf(this.#desired().events);
        if (key !== this.#lastWritten) this.schedule(this.#lastWritten === null ? 0 : AFTER_CHANGE_MS);
      });
    });
    void App.addListener("resume", () => {
      // The day may have moved on, and the calendar may have been edited in the calendar app.
      if (this.enabled) this.schedule(0);
    });
  }

  /**
   * The plan is loaded and real: before the first load (or during an import) the sessions read as none, and writing
   * then would take every event out of the calendar.
   */
  #dataReady(): boolean {
    return !trainingState.isLoading && !trainingState.importProgress && !trainingState.demoActive && !isDemoMode();
  }

  /** The window around today and the events that should be in it. Reactive: reads the plan. */
  #desired(): { events: DesiredEvent[]; windowStart: number } {
    const today = toUtcDayIndex(localIsoDate());
    const { fromDay, toDay } = syncWindow(today, this.options, planSpan(trainingState.workouts, trainingState.trainingBlocks));
    const weeks = getWeekIdRange(weekIdOfDayIndex(fromDay), weekIdOfDayIndex(toDay));
    const events = desiredEvents({
      workouts: weeks.flatMap((w) => trainingState.getWorkoutsForWeek(w)),
      blocks: trainingState.trainingBlocks,
      exerciseTypes: trainingState.exerciseTypes,
      options: this.options,
      fromDay,
      toDay,
    });
    return { events, windowStart: localMidnight(fromDay) };
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
    this.schedule(0);
  }

  setOption<K extends keyof CalendarSyncOptions>(key: K, value: CalendarSyncOptions[K]): void {
    this.#save({ options: { ...this.options, [key]: value } });
    this.schedule(0);
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

  schedule(delayMs: number): void {
    this.#clearTimer();
    this.#timer = setTimeout(() => void this.syncNow(), delayMs);
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** Writes the differences now. */
  async syncNow(): Promise<void> {
    this.#clearTimer();
    if (!this.supported || !this.enabled || !this.calendarId || !this.#dataReady()) return;
    if (this.syncing) {
      this.#again = true;
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

      const { events: desired, windowStart } = this.#desired();
      // A day's margin before the window: all-day events sit on UTC midnights.
      const { events: existing } = await DeviceCalendar.listAppEvents({ calendarId, from: windowStart - DAY_MS });
      const changes = reconcile(desired, existing, windowStart);
      const result = hasChanges(changes)
        ? await DeviceCalendar.applyEventChanges({
            calendarId,
            inserts: changes.inserts.map(toInput),
            updates: changes.updates.map((u) => ({ ...toInput(u), eventId: u.eventId })),
            deletes: changes.deletes,
          })
        : { inserted: 0, updated: 0, deleted: 0 };
      this.lastResult = result;
      this.lastSyncAt = Date.now();
      if (result.failed) {
        // The rest was written; the next sync tries these again.
        this.#lastWritten = null;
        this.error = `${result.failed} change${result.failed === 1 ? "" : "s"} could not be written${result.error ? `: ${result.error}` : ""}. The next sync tries again.`;
      } else {
        this.#lastWritten = hashOf(desired);
        this.error = null;
      }
    } catch (err) {
      this.error = errorText(err);
    } finally {
      this.syncing = false;
      if (this.#again) {
        this.#again = false;
        this.schedule(0);
      }
    }
  }

  #save(patch: Partial<Settings>): void {
    const s: Settings = {
      enabled: this.enabled,
      calendarId: this.calendarId,
      calendarName: this.calendarName,
      options: this.options,
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
