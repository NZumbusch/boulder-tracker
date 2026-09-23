import type { AnalyticsCategory, DayOfWeek, ExerciseTypeDef, OutdoorAscent, PainLog, Workout } from "../types";
import { decrementWeekId, getWeekDates, getWeekId } from "../dateUtils";
import { buildWeeklyHistory } from "../analytics/weekSummary";
import { isSkippedWorkout, missedWorkouts } from "./weekStatus";
import { parseFontGrade } from "../analytics/grades";

const DAY_NAMES: DayOfWeek[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The week Home's recap is about: at the weekend, the week that's ending;
 * on a weekday, the one that just ended - Monday morning is when you look
 * back, and by Friday it's still the most recent full week.
 */
export function recapWeekId(asOf: Date): string {
  const day = asOf.getDay();
  const thisWeek = getWeekId(asOf);
  return day === 0 || day === 6 ? thisWeek : decrementWeekId(thisWeek);
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
