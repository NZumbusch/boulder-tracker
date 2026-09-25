/**
 * The Analytics summary strip: what the visible window added up to, and
 * the same figures for the window before it.
 *
 * A window that contains today is only partly lived, so it is compared
 * with the same number of days at the start of the previous window - not
 * with the whole of it, which would make every current window look like
 * a slump.
 */
import type { DailyMetricEntry, OutdoorAscent, Workout } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { sessionDuration } from "../planning/sessionDuration";
import { loggedMetrics } from "./metricValues";

export interface WindowStats {
  sessions: number;
  minutes: number;
  load: number;
  /** Means of the real readings in the span; undefined with none. */
  hrv?: number;
  rhr?: number;
  sleep?: number;
  sends: number;
}

export interface DaySpan {
  startDay: number;
  endDay: number;
}

export function windowStats(
  { workouts, dailyMetrics, outdoorAscents }: { workouts: Workout[]; dailyMetrics: DailyMetricEntry[]; outdoorAscents: OutdoorAscent[] },
  { startDay, endDay }: DaySpan,
): WindowStats {
  const inSpan = (iso: string) => {
    const day = toUtcDayIndex(iso);
    return day >= startDay && day <= endDay;
  };

  const done = workouts.filter((w) => w.status === "completed" && w.date && inSpan(w.date));
  const readings = loggedMetrics(dailyMetrics).filter((m) => inSpan(m.date));
  const meanOf = (metricId: string) => {
    const values = readings.filter((m) => m.metricId === metricId).map((m) => m.value);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  };

  return {
    sessions: done.length,
    minutes: done.reduce((sum, w) => sum + sessionDuration(w), 0),
    load: done.reduce((sum, w) => sum + (w.loadFactor || 0), 0),
    hrv: meanOf("hrv"),
    rhr: meanOf("rhr"),
    sleep: meanOf("sleep-score"),
    sends: outdoorAscents.filter((a) => inSpan(a.date)).length,
  };
}

/**
 * The two spans to compare. `current`'s part after today is dropped, and
 * `previous` is cut to the same length. A window entirely in the future
 * has nothing to compare - undefined.
 */
export function comparisonSpans(current: DaySpan, previous: DaySpan, today: number): { current: DaySpan; previous: DaySpan } | undefined {
  if (today < current.startDay) return undefined;
  if (today >= current.endDay) return { current, previous };
  const elapsed = today - current.startDay;
  return {
    current: { startDay: current.startDay, endDay: today },
    previous: { startDay: previous.startDay, endDay: Math.min(previous.startDay + elapsed, previous.endDay) },
  };
}

/** Relative change, or undefined when there is nothing to compare against. */
export function percentChange(now: number | undefined, before: number | undefined): number | undefined {
  if (now === undefined || before === undefined || before === 0) return undefined;
  return ((now - before) / before) * 100;
}
