import type { NativeEvent } from "../native/deviceCalendar";
import { DAY_MS } from "../planning/calendarEvents";

/** An event from the device calendar, as the Plan calendar draws it - one per day it touches. */
export interface DeviceEvent {
  id: string;
  title: string;
  calendarId: string;
  /** Calendar day, as whole days since the epoch (same as `CalendarSession.day`). */
  day: number;
  /** Minutes after midnight; absent for an all-day event. */
  startMin?: number;
  /** Length on this day. */
  minutes: number;
  allDay: boolean;
  /** The event as the calendar holds it (epoch ms; an all-day event's are UTC midnights, end exclusive) - the detail sheet shows the whole of it, not this day's share. */
  begin: number;
  end: number;
  /** The first and last calendar day the whole event touches (day indexes) - `day` is only this piece's. */
  firstDay: number;
  lastDay: number;
  /** The event's own colour (its calendar's, unless it has one). */
  color?: string;
  location?: string;
  /** Its notes, as plain text. */
  notes?: string;
}

/** An invitation's description as plain text: tags and character references of the simple kind removed, lines kept. */
export function plainNotes(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const plain = text
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return plain || undefined;
}

const dayIndexOfLocal = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);

/**
 * Turns what the calendar provider returned into per-day events.
 *
 * An all-day event is a date, not a moment: the provider stores it as UTC
 * midnights, so it is read in UTC (read locally it slips a day west of
 * Greenwich). A timed event is a moment, read in local time, and split at
 * midnight so a late one shows on both days.
 */
export function toDeviceEvents(events: NativeEvent[]): DeviceEvent[] {
  const out: DeviceEvent[] = [];
  for (const e of events) {
    const title = e.title?.trim() || "(No title)";
    const span = e.allDay
      ? { firstDay: Math.floor(e.begin / DAY_MS), lastDay: Math.max(Math.floor(e.begin / DAY_MS), Math.floor((e.end - 1) / DAY_MS)) }
      : { firstDay: dayIndexOfLocal(new Date(e.begin)), lastDay: dayIndexOfLocal(new Date(Math.max(e.end, e.begin + 60_000) - 1)) };
    const more = {
      begin: e.begin,
      end: e.end,
      ...span,
      ...(e.color ? { color: e.color } : {}),
      ...(e.location?.trim() ? { location: e.location.trim() } : {}),
      ...(plainNotes(e.description) ? { notes: plainNotes(e.description) } : {}),
    };
    if (e.allDay) {
      const first = Math.floor(e.begin / DAY_MS);
      const last = Math.max(first, Math.floor((e.end - 1) / DAY_MS));
      for (let day = first; day <= last && day - first < 366; day++) {
        out.push({ id: e.id, title, calendarId: e.calendarId, day, minutes: 1440, allDay: true, ...more });
      }
      continue;
    }
    let from = new Date(e.begin);
    const end = Math.max(e.end, e.begin + 60_000);
    for (let i = 0; i < 366 && from.getTime() < end; i++) {
      const midnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const nextMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
      const to = Math.min(end, nextMidnight.getTime());
      out.push({
        id: e.id,
        title,
        calendarId: e.calendarId,
        day: dayIndexOfLocal(from),
        startMin: Math.round((from.getTime() - midnight.getTime()) / 60_000),
        minutes: Math.max(1, Math.round((to - from.getTime()) / 60_000)),
        allDay: false,
        ...more,
      });
      from = nextMidnight;
    }
  }
  return out;
}

/** Events on each day, all-day first then by time. */
export function eventsByDay(events: DeviceEvent[]): Map<number, DeviceEvent[]> {
  const byDay = new Map<number, DeviceEvent[]>();
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1) || a.title.localeCompare(b.title));
  }
  return byDay;
}
