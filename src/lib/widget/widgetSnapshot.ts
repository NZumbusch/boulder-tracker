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
import type { DayStatus } from "../planning/weekStatus";

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

/** What the week-strip and load widgets draw: this week as Home's "This Week" card shows it. */
export interface WidgetWeek {
  /** Monday to Sunday: done / missed / skipped / planned / rest. */
  strip: { status: DayStatus; today?: true }[];
  /** Rated load of the week so far (the number History and Analytics use). */
  load: number;
  done: number;
  /** Sessions the week had in all. */
  planned: number;
  /** Share of the plan's own load done, 0-1; null when nothing is planned. */
  progress: number | null;
  /** ACWR, or null while there is no baseline yet. */
  acwr: { ratio: number; zone: AcwrZoneName } | null;
}

export type AcwrZoneName = "low" | "sweet" | "caution" | "risk";

/** Where an ACWR ratio falls, by the athlete's own thresholds. */
export function acwrZoneOf(ratio: number, zones: { sweetMin: number; caution: number; highRisk: number }): AcwrZoneName {
  if (ratio > zones.highRisk) return "risk";
  if (ratio > zones.caution) return "caution";
  if (ratio >= zones.sweetMin) return "sweet";
  return "low";
}

/** A few labelled rows: the factors behind the score, or today's logged numbers. */
export interface ReadinessDetailRows {
  title: string;
  rows: { l: string; v: string }[];
}

/**
 * The factors that fed the score, each with the points it cost (0 = fine). Inputs with no data are left
 * out - a row of "n/a" says less than no row.
 */
export function readinessFactorRows(readiness: Pick<ReadinessResult, "penalties" | "inputsUsed">): { l: string; v: string }[] {
  const all: [string, number, boolean][] = [
    ["Fatigue", readiness.penalties.fatigue, readiness.inputsUsed.fatigue],
    ["Load", readiness.penalties.acwr, readiness.inputsUsed.acwr],
    ["Sleep", readiness.penalties.sleep, readiness.inputsUsed.sleep],
    ["HRV", readiness.penalties.hrv, readiness.inputsUsed.hrv],
    ["Pain", readiness.penalties.pain, readiness.inputsUsed.pain],
  ];
  return all.filter(([, , used]) => used).map(([l, p]) => ({ l, v: p > 0 ? `\u2212${Math.round(p)}` : "\u2713" }));
}

export interface WidgetSnapshot {
  v: 1;
  updatedAt: number;
  /** Today's readiness; the widget shows it only on the day it was worked out. */
  readiness: {
    date: string;
    score: number | null;
    status: ReadinessResult["status"];
    /** Shown under the ring when the widget is tall - absent for the clean look. */
    detail?: ReadinessDetailRows;
  };
  days: WidgetDay[];
  /** Absent when the app that wrote the snapshot predates the week widgets. */
  week?: WidgetWeek;
  /** The quick-log actions the athlete has switched on, in their order (`bodyweight`, `pain`, ...). */
  quickLog?: string[];
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
  week?: WidgetWeek;
  quickLog?: string[];
  /** Hide the readiness score (a privacy choice - the widget then shows no number). */
  hideReadiness?: boolean;
  /** What goes under the ring on a tall widget; none for the clean look. */
  readinessDetail?: ReadinessDetailRows;
}): WidgetSnapshot {
  return {
    v: 1,
    updatedAt: input.now.getTime(),
    readiness: {
      date: localIsoDate(input.now),
      score: !input.hideReadiness && input.readiness?.score !== undefined ? Math.round(input.readiness.score) : null,
      status: input.hideReadiness ? "neutral" : input.readiness?.status ?? "neutral",
      ...(!input.hideReadiness && input.readinessDetail && input.readinessDetail.rows.length ? { detail: input.readinessDetail } : {}),
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
    ...(input.week ? { week: input.week } : {}),
    ...(input.quickLog ? { quickLog: input.quickLog } : {}),
    active: input.active,
  };
}
