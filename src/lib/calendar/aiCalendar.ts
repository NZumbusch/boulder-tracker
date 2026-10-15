import type { DeviceEvent } from "./deviceEvents";
import { WEEK_DAYS } from "../constants";

/**
 * The phone calendar as the AI coach sees it (an opt-in sharing switch, `aiSharing.phoneCalendar`): what else is on
 * in the weeks it plans, so a session is not set on top of a lecture or a flight. Only when, and the title - never
 * the place, the notes, the guests or which calendar it is in. One entry per event (an overnight one is not cut at
 * midnight), in the order they happen.
 */
export interface CalendarEntry {
  /** "Mon 2026-10-19" - the first day. */
  day: string;
  /** Only for one that spans days: "Wed 2026-10-21". */
  until?: string;
  /** "09:00-11:00" for a timed event on one day, "09:00" start for one across days; absent for all-day. */
  time?: string;
  allDay?: boolean;
  title: string;
}

const MAX_TITLE = 60;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayName = (d: Date) => WEEK_DAYS[(d.getDay() + 6) % 7].slice(0, 3);
const dayText = (d: Date) => `${dayName(d)} ${iso(d)}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** An all-day event is dates stored as UTC midnights, read as dates. */
const utcDay = (ms: number) => new Date(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate());

export function buildCalendarContext(events: readonly DeviceEvent[], max = 80): { entries: CalendarEntry[]; more: number } {
  const seen = new Set<string>();
  const ones: { at: number; entry: CalendarEntry }[] = [];
  for (const e of events) {
    const key = `${e.id}:${e.begin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = e.title.trim().slice(0, MAX_TITLE) || "(No title)";
    if (e.allDay) {
      const from = utcDay(e.begin);
      const last = utcDay(Math.max(e.begin, e.end - 1));
      ones.push({ at: from.getTime(), entry: { day: dayText(from), ...(last.getTime() > from.getTime() ? { until: dayText(last) } : {}), allDay: true, title } });
      continue;
    }
    const from = new Date(e.begin);
    const to = new Date(Math.max(e.end, e.begin));
    const sameDay = iso(from) === iso(to) || (to.getHours() === 0 && to.getMinutes() === 0 && to.getTime() - from.getTime() <= 86_400_000);
    ones.push({
      at: e.begin,
      entry: sameDay
        ? { day: dayText(from), time: `${hhmm(from)}-${hhmm(to)}`, title }
        : { day: dayText(from), until: dayText(to), time: `${hhmm(from)} to ${hhmm(to)}`, title },
    });
  }
  ones.sort((a, b) => a.at - b.at);
  return { entries: ones.slice(0, max).map((o) => o.entry), more: Math.max(0, ones.length - max) };
}
