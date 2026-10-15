import type { DeviceEvent } from "../calendar/deviceEvents";
import type { DayOfWeek, ExerciseTypeDef, Workout } from "../types";
import { getWeekId, toUtcDayIndex } from "../dateUtils";
import { weekStartDay } from "../analytics/range";
import { estimateSessionDuration, sessionDuration } from "./sessionDuration";
import { DAY_ORDER } from "./sortWorkouts";
import { summarizeSession } from "./sessionSummary";

export const DAY_MS = 86_400_000;

/** The colour of a phone-calendar event that has none of its own (one place, so the views never differ). */
export const DEFAULT_EVENT_COLOR = "#71717a";

const DAY_NAMES: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** A session as the calendar draws it. */
export interface CalendarSession {
  workout: Workout;
  /** Calendar day, as whole days since the epoch (the same index `weekStartDay` uses). */
  day: number;
  /** Minutes after midnight; absent when the session has no planned time of day. */
  startMin?: number;
  /** Drawn length: what the session actually took when it did, otherwise what is planned. */
  minutes: number;
  /** Planned length, only when the session ran and took a different time - "95 min (60 planned)". */
  plannedMinutes?: number;
  done: boolean;
}

/** The day name of a day index. */
export function dayNameOf(day: number): DayOfWeek {
  return DAY_NAMES[(((day + 3) % 7) + 7) % 7];
}

/** The ISO week a day index falls in. */
export function weekIdOfDayIndex(day: number): string {
  const d = new Date(day * DAY_MS);
  // `getWeekId` reads local date parts; local noon of the same calendar day.
  return getWeekId(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
}

/** "HH:mm" to minutes after midnight; anything else is no time. */
export function parseStartTime(time: string | undefined): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : undefined;
}

/**
 * Where a session sits. A completed one is on the day it happened (its
 * `date`, local), a planned one on its week and day - its `date` is only
 * when it was created. Null for a planned session with no day.
 */
export function sessionDay(workout: Workout): number | null {
  if (workout.status === "completed" && workout.date) return toUtcDayIndex(workout.date);
  if (!workout.dayOfWeek) return null;
  const start = weekStartDay(workout.weekId);
  return start === undefined ? null : start + DAY_ORDER[workout.dayOfWeek];
}

/**
 * `runningMinutes`: how long a live session of this workout has run so far.
 * Once it passes the planned length the block grows with it.
 */
export function toCalendarSession(workout: Workout, runningMinutes?: number): CalendarSession | null {
  const day = sessionDay(workout);
  if (day === null) return null;
  const done = workout.status === "completed";
  const planned = Math.round(estimateSessionDuration(workout));
  const actual = done ? Math.round(sessionDuration(workout)) : undefined;
  const minutes = Math.max(actual ?? planned, runningMinutes ?? 0, 1);
  return {
    workout,
    day,
    startMin: parseStartTime(workout.startTime),
    minutes,
    plannedMinutes: done && actual !== planned && workout.plannedDuration ? planned : undefined,
    done,
  };
}

/** Sessions on each day, timed ones first in time order. */
export function sessionsByDay(sessions: CalendarSession[]): Map<number, CalendarSession[]> {
  const byDay = new Map<number, CalendarSession[]>();
  for (const s of sessions) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.startMin ?? 1e6) - (b.startMin ?? 1e6) || a.workout.id.localeCompare(b.workout.id));
  }
  return byDay;
}

// --- Time grid layout ---

export interface Positioned<T> {
  item: T;
  /** Minutes after midnight the block starts / is drawn to. */
  top: number;
  bottom: number;
  lane: number;
  lanes: number;
}

/**
 * Lays one day's timed blocks side by side where they overlap. A block is
 * drawn at least `minMinutes` tall so a short one stays tappable, and
 * clipped at midnight.
 */
export function layoutDay<T extends { startMin: number; minutes: number }>(items: T[], minMinutes = 30): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin);
  const out: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(0, ...cluster.map((p) => p.lane + 1));
    for (const p of cluster) p.lanes = lanes;
    out.push(...cluster);
    cluster = [];
  };
  for (const item of sorted) {
    const top = Math.min(item.startMin, 1440 - minMinutes);
    const bottom = Math.min(1440, top + Math.max(item.minutes, minMinutes));
    if (top >= clusterEnd) flush();
    const taken = new Set(cluster.filter((p) => p.bottom > top).map((p) => p.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ item, top, bottom, lane, lanes: 1 });
    clusterEnd = Math.max(top >= clusterEnd ? -1 : clusterEnd, bottom);
  }
  flush();
  return out;
}

/**
 * The hours a day/week grid shows: fitted to the sessions with an hour of air
 * either side (never fewer than `minSpan` hours), so they are in view without
 * scrolling; 08-20 when there is nothing to fit.
 */
export function visibleHours(blocks: { top: number; bottom: number }[], minSpan = 5): { from: number; to: number } {
  if (blocks.length === 0) return { from: 8, to: 20 };
  let from = Math.floor(Math.min(...blocks.map((b) => b.top)) / 60) - 1;
  let to = Math.ceil(Math.max(...blocks.map((b) => b.bottom)) / 60) + 1;
  from = Math.max(0, from);
  to = Math.min(24, to);
  while (to - from < minSpan) {
    if (from > 0) from--;
    if (to - from < minSpan && to < 24) to++;
  }
  return { from, to };
}

/** The exercises of a session as short lines ("Hangboard ×2"), the rest as a count. */
export function exerciseLines(workout: Workout, types: ExerciseTypeDef[], max: number): { names: string[]; more: number } {
  const s = summarizeSession(workout, types, max);
  return { names: s.exerciseNames, more: s.moreExercises };
}

/** One entry of a day's list: one of your sessions, or an event from the phone's calendar. */
export type AgendaItem =
  | { kind: "session"; session: CalendarSession }
  | { kind: "event"; event: DeviceEvent };

/**
 * A day's sessions and the phone's events as one list in the order the day happens: all-day events first, then
 * everything with a time by when it starts (a session before an event that starts at the same minute), and sessions
 * without a planned time last. The sort is stable, so equal entries keep their given order.
 */
export function dayAgenda(sessions: readonly CalendarSession[], events: readonly DeviceEvent[]): AgendaItem[] {
  const rank = (item: AgendaItem): [number, number, number] => {
    if (item.kind === "event") return item.event.allDay || item.event.startMin === undefined ? [0, 0, 1] : [1, item.event.startMin, 1];
    return item.session.startMin === undefined ? [2, 0, 0] : [1, item.session.startMin, 0];
  };
  const items: AgendaItem[] = [
    ...sessions.map((session) => ({ kind: "session" as const, session })),
    ...events.map((event) => ({ kind: "event" as const, event })),
  ];
  return items
    .map((item, index) => ({ item, index, key: rank(item) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.index - b.index)
    .map((x) => x.item);
}
