import type { AnalyticsCategory, ExerciseTypeDef, Workout } from "../types";
import { estimateSlotDuration, sessionDuration } from "../planning/sessionDuration";
import { RATING_AXES } from "../constants";

/**
 * What a week of training added up to - shared by the AI prompt's weekly
 * history and Home's week recap.
 */

export interface WeekHistorySummary {
  week: string;
  /** The week's phase, when training blocks are shared. */
  phase?: string;
  sessions: number;
  /** The rest is left out for a week with no sessions. */
  minutes?: number;
  /** Sum of the sessions' load scores. */
  load?: number;
  /** Logged exercise minutes per analytics category. */
  minutesByCategory?: Record<string, number>;
  /** Average of the post-session ratings (1-10) that were given, per axis. */
  avgRatings?: Partial<Record<"fingers" | "arms" | "core" | "systemic", number>>;
}

/**
 * One line per week for older history: what a week of training added up to,
 * without the session-by-session detail. A week with nothing logged still
 * gets a line - a rest or sick week is information too.
 */
export function buildWeeklyHistory(
  workouts: Workout[],
  exerciseTypes: ExerciseTypeDef[],
  analyticsCategories: AnalyticsCategory[],
  weekIds: string[],
  phaseOf?: (weekId: string) => string | undefined,
): WeekHistorySummary[] {
  const categoryName = (idOrName: string | undefined) =>
    analyticsCategories.find((c) => c.id === idOrName)?.name ?? idOrName ?? "Other";
  return weekIds.map((week) => {
    const done = workouts.filter((w) => w.status === "completed" && w.weekId === week);
    const minutesByCategory: Record<string, number> = {};
    for (const w of done) {
      for (const slot of w.exercises) {
        if (!slot.logged) continue;
        const mins = slot.logged.duration ?? estimateSlotDuration(slot);
        if (!mins) continue;
        const cat = categoryName(slot.categoryId ?? exerciseTypes.find((t) => t.id === slot.typeId)?.category);
        minutesByCategory[cat] = (minutesByCategory[cat] ?? 0) + Math.round(mins);
      }
    }
    const avgRatings: WeekHistorySummary["avgRatings"] = {};
    for (const { key: axis } of RATING_AXES) {
      const given = done.map((w) => w[axis]).filter((v): v is number => typeof v === "number");
      if (given.length) avgRatings[axis] = Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 10) / 10;
    }
    const phase = phaseOf?.(week);
    // An empty week is one short line - its zeros say nothing the count doesn't.
    if (done.length === 0) return phase ? { week, phase, sessions: 0 } : { week, sessions: 0 };
    const summary: WeekHistorySummary = {
      week,
      sessions: done.length,
      minutes: Math.round(done.reduce((sum, w) => sum + sessionDuration(w), 0)),
      load: Math.round(done.reduce((sum, w) => sum + (w.loadFactor || 0), 0)),
      minutesByCategory,
    };
    if (phase) summary.phase = phase;
    if (Object.keys(avgRatings).length) summary.avgRatings = avgRatings;
    return summary;
  });
}
