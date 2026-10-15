import type { GoalEvent } from "../types";
import type { DeviceEvent } from "../calendar/deviceEvents";
import { goalEnd } from "../goals/goals";
import { toUtcDayIndex } from "../dateUtils";

/*
 * The bars above the hour grid, like Samsung Calendar's: trips and
 * competitions, and the phone calendar's all-day and multi-day events, each one
 * bar across the days it covers instead of a piece in every day's column.
 */

const HOUR_MS = 3_600_000;

/** Events this long or longer (or all-day) are drawn as a bar; shorter ones stay on the hour grid, split at midnight. */
export const BAR_MIN_LENGTH_MS = 12 * HOUR_MS;

/** Whether the phone's event is a bar in the header: all-day, or at least twelve hours long. */
export function isBarEvent(e: Pick<DeviceEvent, "allDay" | "begin" | "end">): boolean {
  return e.allDay || e.end - e.begin >= BAR_MIN_LENGTH_MS;
}

interface Geometry {
  /** Index into the days shown where the bar starts, and how many days it covers. */
  from: number;
  span: number;
  /** The row: bars that overlap in time sit on different rows. */
  lane: number;
  /** It began before the first day shown / goes on after the last one. */
  startsBefore: boolean;
  endsAfter: boolean;
}

export type HeaderBar = Geometry & ({ kind: "goal"; goal: GoalEvent } | { kind: "event"; event: DeviceEvent });

/** A phone event once, however many days it was cut into (a repeating event has one id and a different start each time). */
export function barEvents(events: readonly DeviceEvent[]): DeviceEvent[] {
  const seen = new Map<string, DeviceEvent>();
  for (const e of events) if (isBarEvent(e)) seen.set(`${e.id}:${e.begin}`, e);
  return [...seen.values()];
}

/**
 * The bars for `days` (consecutive day indexes), clipped to what is shown, each on the first row where it fits.
 * Your trips and competitions come first so they keep the top rows; then events, earliest and longest first.
 */
export function headerBars(goals: readonly GoalEvent[], events: readonly DeviceEvent[], days: number[]): HeaderBar[] {
  if (days.length === 0) return [];
  const [first, last] = [days[0], days[days.length - 1]];
  type Raw = { start: number; end: number; rank: number; make: (g: Geometry) => HeaderBar };
  const raw: Raw[] = [
    ...goals.map((goal): Raw => ({
      start: toUtcDayIndex(goal.date),
      end: toUtcDayIndex(goalEnd(goal)),
      rank: 0,
      make: (g) => ({ ...g, kind: "goal", goal }),
    })),
    ...barEvents(events).map((event): Raw => ({
      start: event.firstDay,
      end: event.lastDay,
      rank: 1,
      make: (g) => ({ ...g, kind: "event", event }),
    })),
  ].filter((r) => r.end >= first && r.start <= last);
  raw.sort((a, b) => a.rank - b.rank || a.start - b.start || b.end - a.end);

  const bars: HeaderBar[] = [];
  const laneEnds: number[] = []; // the first day index (relative) each row is free from
  for (const r of raw) {
    const from = Math.max(r.start, first) - first;
    const to = Math.min(r.end, last) - first;
    let lane = laneEnds.findIndex((until) => until <= from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = to + 1;
    bars.push(r.make({ from, span: to - from + 1, lane, startsBefore: r.start < first, endsAfter: r.end > last }));
  }
  return bars;
}

export interface CappedBars {
  bars: HeaderBar[];
  /** How many bars each day (index into the days shown) has that are not drawn - the "+N" under it. All zero when nothing is cut. */
  hidden: number[];
  /** Rows the bars take, plus the "+N" row when there is one. */
  rows: number;
}

/**
 * At most `maxRows` rows: when there are more, the last row becomes the "+N" row and the bars on it and below are
 * left out. `maxRows` of 0 or less shows everything.
 */
export function capBars(bars: HeaderBar[], dayCount: number, maxRows: number): CappedBars {
  const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
  const hidden = Array.from({ length: dayCount }, () => 0);
  if (maxRows <= 0 || lanes <= maxRows) return { bars, hidden, rows: lanes };
  const keep = Math.max(0, maxRows - 1);
  for (const b of bars) {
    if (b.lane < keep) continue;
    for (let i = b.from; i < b.from + b.span; i++) hidden[i]++;
  }
  return { bars: bars.filter((b) => b.lane < keep), hidden, rows: keep + 1 };
}
