import type { AnalyticsCategory, DayOfWeek, ExerciseTypeDef, OutdoorAscent, PainLog, Workout } from "../types";
import { decrementWeekId, getWeekDates, getWeekId } from "../dateUtils";
import { buildWeeklyHistory } from "../analytics/weekSummary";
import { isSkippedWorkout, missedWorkouts } from "./weekStatus";
import { parseFontGrade } from "../analytics/grades";
import { workoutPlannedLoad, slotActualLoad } from "../analytics/load";

const DAY_NAMES: DayOfWeek[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The week Home's recap is about: always the last finished week. The
 * running week is Home's This Week card - showing it in both (as the recap
 * used to at the weekend) put two different-looking week summaries side
 * by side.
 */
export function recapWeekId(asOf: Date): string {
  return decrementWeekId(getWeekId(asOf));
}

/**
 * How much of a week's planned work is done, 0-1+ (above 1 = more than
 * planned). Both sides use the exercise-based estimate (duration x planned
 * intensity): what the completed sessions logged, against what every
 * session of the week planned - so it's a fair comparison, unlike the
 * rated session load, which comes from after-session ratings. `undefined`
 * when nothing is planned.
 */
export function planProgress(workouts: Workout[]): number | undefined {
  const planned = workouts.reduce((sum, w) => sum + workoutPlannedLoad(w.exercises), 0);
  if (planned <= 0) return undefined;
  const done = workouts
    .filter((w) => w.status === "completed")
    .reduce((sum, w) => sum + w.exercises.reduce((s, e) => s + slotActualLoad(e), 0), 0);
  return done / planned;
}

export interface WeekRecap {
  weekId: string;
  /** The week is still running (the weekend recap), so "missed" only counts days already past. */
  isCurrentWeek: boolean;
  done: number;
  /** Every session the week had: done, still planned, missed or skipped. */
  planned: number;
  missed: number;
  skipped: number;
  minutes: number;
  load: number;
  /** The week before's load, to compare against. */
  prevLoad: number;
  /** Logged minutes per category, most first. */
  mix: { name: string; minutes: number }[];
  sends: OutdoorAscent[];
  hardest?: OutdoorAscent;
  painEntries: number;
}

export function buildWeekRecap(input: {
  weekId: string;
  /** The week's sessions (via getWorkoutsForWeek), planned and completed. */
  workouts: Workout[];
  prevWorkouts: Workout[];
  ascents: OutdoorAscent[];
  painLogs: PainLog[];
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  asOf: Date;
}): WeekRecap {
  const { weekId, workouts, prevWorkouts, ascents, painLogs, exerciseTypes, analyticsCategories, asOf } = input;
  const [summary] = buildWeeklyHistory(workouts, exerciseTypes, analyticsCategories, [weekId]);
  const [prev] = buildWeeklyHistory(prevWorkouts, exerciseTypes, analyticsCategories, [decrementWeekId(weekId)]);
  const isCurrentWeek = getWeekId(asOf) === weekId;

  const stillPlanned = workouts.filter((w) => w.status === "planned");
  const skipped = stillPlanned.filter(isSkippedWorkout).length;
  // A finished week's leftover sessions were all missed; a running week's
  // only the ones on days already past.
  const missed = isCurrentWeek
    ? missedWorkouts(workouts, DAY_NAMES[asOf.getDay()]).length
    : stillPlanned.length - skipped;

  const dates = getWeekDates(weekId);
  const from = dates?.start.toISOString().slice(0, 10) ?? "";
  const to = dates?.end.toISOString().slice(0, 10) ?? "";
  const sends = ascents.filter((a) => a.date >= from && a.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  let hardest: OutdoorAscent | undefined;
  for (const s of sends) {
    const rank = parseFontGrade(s.grade);
    if (rank !== undefined && (hardest === undefined || rank > (parseFontGrade(hardest.grade) ?? -Infinity))) hardest = s;
  }

  return {
    weekId,
    isCurrentWeek,
    done: summary.sessions,
    planned: workouts.length,
    missed,
    skipped,
    minutes: summary.minutes ?? 0,
    load: summary.load ?? 0,
    prevLoad: prev.load ?? 0,
    mix: Object.entries(summary.minutesByCategory ?? {})
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    sends,
    hardest,
    painEntries: painLogs.filter((p) => p.weekId === weekId).length,
  };
}
