/**
 * What the home-screen widgets show, as one small JSON the app hands to
 * Android (`plugins/home-widget`). The widgets draw from it without the app
 * running, so it carries the next week of days rather than just today -
 * after midnight the widget moves on to the next day by itself - and a
 * running session's start, so its clock keeps ticking.
 *
 * Pure: the app's state in, the snapshot out.
 */
import type { ExerciseTypeDef, Workout } from "../types";
import type { ReadinessResult } from "../analytics/readiness";
import { summarizeSession } from "../planning/sessionSummary";

export const WIDGET_DAYS = 7;

export interface WidgetSession {
  name: string;
  /** "HH:mm", if planned for a time. */
  time?: string;
  minutes: number;
  exercises: number;
}

export interface WidgetDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  planned: WidgetSession[];
  /** Sessions completed that day. */
  done: number;
}

export interface WidgetSnapshot {
  v: 1;
  updatedAt: number;
  /** Today's readiness; the widget shows it only on the day it was worked out. */
  readiness: { date: string; score: number | null; status: ReadinessResult["status"] };
  days: WidgetDay[];
  active: {
    name: string;
    settled: number;
    total: number;
    paused: boolean;
    /** Running time when the snapshot was taken; the widget adds the time since if not paused. */
    elapsedMs: number;
  } | null;
}

/** YYYY-MM-DD in the phone's own time zone (what the widget compares against). */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const sessionName = (w: Pick<Workout, "notes">) => w.notes?.trim() || "Session";

export function buildWidgetSnapshot(input: {
  now: Date;
  readiness: ReadinessResult | null;
  /** From today on: each day's planned (not yet done) sessions, in order, and how many were completed. */
  days: { date: string; planned: Workout[]; done: number }[];
  exerciseTypes: ExerciseTypeDef[];
  active: WidgetSnapshot["active"];
}): WidgetSnapshot {
  return {
    v: 1,
    updatedAt: input.now.getTime(),
    readiness: {
      date: localIsoDate(input.now),
      score: input.readiness?.score !== undefined ? Math.round(input.readiness.score) : null,
      status: input.readiness?.status ?? "neutral",
    },
    days: input.days.map((day) => ({
      date: day.date,
      done: day.done,
      planned: day.planned.map((w) => {
        const summary = summarizeSession(w, input.exerciseTypes);
        return {
          name: sessionName(w),
          ...(summary.startTime ? { time: summary.startTime } : {}),
          minutes: summary.minutes,
          exercises: w.exercises.length,
        };
      }),
    })),
    active: input.active,
  };
}
