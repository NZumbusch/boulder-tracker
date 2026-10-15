/**
 * The phone's own calendars (Android), read-only, shown beside the plan on
 * the Plan screen's calendar view - so a session can be planned around a
 * dentist appointment. Any account the calendar app syncs works (Google,
 * Samsung, Exchange); nothing is written back.
 *
 * What is read stays on this device: it is held in memory only, never
 * stored with the training data, backed up, synced or put in an AI prompt.
 * The settings (on or off, which calendars) are per device too.
 */
import { App } from "@capacitor/app";
import { trainingState } from "../state.svelte";
import { DeviceCalendar, deviceCalendarSupported, type NativeCalendar } from "../native/deviceCalendar";
import { DAY_MS } from "../planning/calendarEvents";
import { toDeviceEvents, type DeviceEvent } from "./deviceEvents";
import { eventColor, parseHex } from "./eventColor";

const SETTINGS_KEY = "boulder_tracker_device_calendar";

interface Settings {
  enabled: boolean;
  calendarIds: string[];
  /** A colour picked for a calendar, by its id - replaces the colour the phone gives it. */
  colors: Record<string, string>;
}

function loadSettings(): Settings {
  const empty: Settings = { enabled: false, calendarIds: [], colors: {} };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const colors: Record<string, string> = {};
      for (const [id, hex] of Object.entries(saved?.colors ?? {})) if (typeof hex === "string" && parseHex(hex)) colors[id] = hex;
      return { ...empty, ...saved, colors };
    }
  } catch { /* fall through */ }
  return empty;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
/** Local midnight at the start of a day index. */
function localMidnight(day: number): number {
  const d = new Date(day * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

class DeviceCalendarStore {
  supported = deviceCalendarSupported();
  enabled = $state(false);
  granted = $state(false);
  calendars = $state<NativeCalendar[]>([]);
  selected = $state<string[]>([]);
  /** The colours picked for calendars (`setColor`), by calendar id. */
  colors = $state<Record<string, string>>({});
  /** Events of the range last asked for (`load`), a day either side. */
  events = $state<DeviceEvent[]>([]);
  error = $state<string | null>(null);
  /** Bumped when the app comes back to the front, so a shown range reads again. */
  version = $state(0);

  #started = false;
  #token = 0;

  async init(): Promise<void> {
    if (!this.supported || this.#started) return;
    this.#started = true;
    const s = loadSettings();
    this.enabled = s.enabled;
    this.selected = s.calendarIds;
    this.colors = s.colors;
    if (this.enabled) await this.refreshStatus();
    void App.addListener("resume", () => {
      this.version++;
      if (this.enabled) void this.refreshStatus();
    });
  }

  /** Permission and the calendar list - both can change outside the app. */
  async refreshStatus(): Promise<void> {
    try {
      this.granted = (await DeviceCalendar.getCalendarPermission()).granted;
      this.calendars = this.granted ? (await DeviceCalendar.listCalendars()).calendars : [];
    } catch (err) {
      this.error = errorText(err);
    }
  }

  /** Asks for access, and on a yes switches on with the calendars the phone's own app shows. */
  async connect(): Promise<void> {
    this.error = null;
    try {
      this.granted = (await DeviceCalendar.requestCalendarPermission()).granted;
      if (!this.granted) {
        this.error = "Calendar access wasn't allowed. You can allow it in the phone's app settings.";
        return;
      }
      this.calendars = (await DeviceCalendar.listCalendars()).calendars;
      this.#save({ enabled: true, calendarIds: this.calendars.filter((c) => c.visible).map((c) => c.id), colors: this.colors });
      this.version++;
    } catch (err) {
      this.error = errorText(err);
    }
  }

  disconnect(): void {
    this.#save({ enabled: false, calendarIds: this.selected, colors: this.colors });
    this.events = [];
  }

  toggle(id: string): void {
    const calendarIds = this.selected.includes(id) ? this.selected.filter((x) => x !== id) : [...this.selected, id];
    this.#save({ enabled: this.enabled, calendarIds, colors: this.colors });
    this.version++;
  }

  /** Picks a colour for a calendar; `null` goes back to the phone's own. */
  setColor(id: string, hex: string | null): void {
    const colors = { ...this.colors };
    if (hex && parseHex(hex)) colors[id] = hex;
    else delete colors[id];
    this.#save({ enabled: this.enabled, calendarIds: this.selected, colors });
  }

  /** The colour a calendar is shown in: the one picked for it, else the phone's. */
  calendarColor(id: string): string | undefined {
    return this.colors[id] ?? this.calendars.find((c) => c.id === id)?.color;
  }

  /** The colour of an event on the calendar (picked for its calendar, else its own - kept clear of the session colour). */
  colorOf(event: DeviceEvent): string {
    return eventColor(event, this.colors, this.calendars.find((c) => c.id === event.calendarId)?.color);
  }

  /** Reads the events between two day indexes (inclusive) of the chosen calendars. */
  async load(fromDay: number, toDay: number): Promise<void> {
    const token = ++this.#token;
    if (!this.enabled || !this.granted || trainingState.demoActive) {
      this.events = [];
      return;
    }
    try {
      const ids = this.selected.filter((id) => this.calendars.some((c) => c.id === id));
      const { events } = await DeviceCalendar.listEvents({
        from: localMidnight(fromDay - 1),
        to: localMidnight(toDay + 2),
        calendarIds: ids,
      });
      if (token === this.#token) {
        // An event without a colour of its own takes its calendar's, as the phone's calendar app shows it.
        const colorOf = new Map(this.calendars.map((c) => [c.id, c.color]));
        this.events = toDeviceEvents(events).map((e) => (e.color || !colorOf.get(e.calendarId) ? e : { ...e, color: colorOf.get(e.calendarId) }));
        this.error = null;
      }
    } catch (err) {
      if (token === this.#token) {
        this.events = [];
        this.error = errorText(err);
      }
    }
  }

  #save(s: Settings): void {
    this.enabled = s.enabled;
    this.selected = s.calendarIds;
    this.colors = s.colors;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* the choice just won't be remembered */ }
  }
}

export const deviceCalendar = new DeviceCalendarStore();
