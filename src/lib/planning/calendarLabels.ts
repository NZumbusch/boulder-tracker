import { formatWeek } from "../dateUtils";

/**
 * The line under the calendar's title. Every view says the same two things in the same order - where it is (the week,
 * for Day and Week) and what is in it (done and planned sessions) - so the line no longer changes meaning from view to
 * view: "Week 42 · 3 done · 2 planned", "4 done · 5 planned", "Week 42 · nothing planned".
 */
export function calendarSublabel(opts: { mode: "day" | "week" | "month" | "year"; weekId: string; done: number; planned: number }): string {
  const counts = opts.done + opts.planned === 0 ? "nothing planned" : `${opts.done} done · ${opts.planned} planned`;
  const where = opts.mode === "day" || opts.mode === "week" ? `${formatWeek(opts.weekId, "long")} · ` : "";
  return opts.mode === "day" || opts.mode === "week" ? `${where}${counts}` : counts.charAt(0).toUpperCase() + counts.slice(1);
}
