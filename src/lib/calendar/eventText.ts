import type { DeviceEvent } from "./deviceEvents";
import { formatClockDate } from "../timeFormat";

/**
 * When an event happens, in words: "Wed, Oct 14 · 18:30 – 19:30", "Wed, Oct 14 · all day",
 * "Wed, Oct 14 – Fri, Oct 16 · all day", "Wed, Oct 14, 22:00 – Thu, Oct 15, 01:30". An all-day event is
 * a date range read in UTC (the provider stores midnights); a timed one is moments, read in local time.
 */
export function formatEventWhen(e: Pick<DeviceEvent, "begin" | "end" | "allDay">, locale?: string, clock12 = false): string {
  const hhmm = (d: Date) => formatClockDate(d, clock12);
  const day = (d: Date, utc: boolean) => d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", ...(utc ? { timeZone: "UTC" } : {}) });
  if (e.allDay) {
    const first = new Date(e.begin);
    const last = new Date(Math.max(e.begin, e.end - 1));
    const same = day(first, true) === day(last, true);
    return `${day(first, true)}${same ? "" : ` – ${day(last, true)}`} · all day`;
  }
  const start = new Date(e.begin);
  const end = new Date(Math.max(e.end, e.begin + 60_000));
  if (day(start, false) === day(end, false)) return `${day(start, false)} · ${hhmm(start)} – ${hhmm(end)}`;
  return `${day(start, false)}, ${hhmm(start)} – ${day(end, false)}, ${hhmm(end)}`;
}

/** A link that opens a place or address in the phone's maps app (or the browser's). */
export function mapsUrl(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
