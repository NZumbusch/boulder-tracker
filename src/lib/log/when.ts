import { formatDay, localIsoDate } from "../dateUtils";

/** The local day an entry is from ("2026-11-24"). */
export const dayOf = (at: string): string => localIsoDate(new Date(at));

/** A day as the log heads it: "Today", "Yesterday", else "Mon, Nov 23" (with the year when it isn't this one). */
export function dayHeading(day: string, now: Date = new Date()): string {
  if (day === localIsoDate(now)) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (day === localIsoDate(y)) return "Yesterday";
  return formatDay(day, { weekday: "short", now });
}
