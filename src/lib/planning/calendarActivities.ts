import type { ExternalActivity, Workout } from "../types";
import { weekIdOfIso, toUtcDayIndex } from "../dateUtils";
import { findOverlaps, daysAround } from "../activity/overlap";
import { EXTERNAL_WORKOUT_PREFIX } from "../activity/externalLoad";
import { toCalendarSession, type CalendarSession } from "./calendarEvents";

/**
 * Imported activities (runs, rides, walks, workouts from Strava, Garmin or
 * files) on the Plan calendar, drawn like logged sessions - and, as in
 * History's Activities, taking the place of the planned session they were:
 * an activity that overlaps a planned session by time, or is the same kind
 * on the same day ("Easy run" and a Run), hides that plan from the calendar
 * (the plan itself is untouched). An activity that overlaps a session you
 * logged at the same time is not drawn twice, and neither is one imported
 * from two sources. Pure.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** An activity as the session the calendar draws: done, on its day and start time, as long as it took. */
export function activityWorkout(a: ExternalActivity): Workout {
  const start = new Date(a.start);
  const minutes = Math.max(1, Math.round((a.durationSec || a.movingSec || 0) / 60));
  return {
    id: `${EXTERNAL_WORKOUT_PREFIX}${a.id}`,
    status: "completed",
    date: a.date,
    weekId: weekIdOfIso(a.date),
    notes: a.name,
    startTime: Number.isNaN(start.getTime()) ? undefined : `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    actualDuration: minutes,
    loadFactor: 0,
    exercises: [],
  } as unknown as Workout;
}

/** How much a copy of the same activity knows: the one with the most is the one that is drawn. */
function richness(a: ExternalActivity): number {
  return (a.stats ? 4 : 0) + (a.track ? 2 : 0) + (a.avgHr ? 1 : 0) + (a.source === "garmin" ? 0.5 : 0);
}

export interface ImportedOnCalendar {
  sessions: CalendarSession[];
  /** Planned sessions an activity took the place of (their ids); the calendar leaves them out. */
  replaced: Set<string>;
}

export interface ImportedInput {
  /** Every imported activity (the others are what duplicates are looked for among). */
  activities: ExternalActivity[];
  /** First and last day shown, as whole days since the epoch. */
  from: number;
  to: number;
  /** The sessions on these days (YYYY-MM-DD), done and planned, as their weeks show them. */
  workoutsOnDays: (days: string[]) => Workout[];
  label: (w: Workout) => string;
  text: (w: Workout) => string;
}

export function importedOnCalendar(input: ImportedInput): ImportedOnCalendar {
  const { activities, from, to } = input;
  const out: ImportedOnCalendar = { sessions: [], replaced: new Set() };
  const cache = new Map<string, Workout[]>();
  const around = (days: string[]) => {
    const key = days.join();
    if (!cache.has(key)) cache.set(key, input.workoutsOnDays(days));
    return cache.get(key)!;
  };
  for (const a of activities) {
    const day = toUtcDayIndex(a.date);
    if (day < from || day > to) continue;
    const found = findOverlaps(a, { activities, workouts: around(daysAround(a)), label: input.label, text: input.text });
    // The same activity from another source: only the fuller copy is drawn (the first by id when equal).
    const twin = found.find((o) => o.kind === "activity" && o.how === "time");
    if (twin) {
      const other = activities.find((x) => x.id === twin.id);
      if (other && (richness(other) > richness(a) || (richness(other) === richness(a) && other.id < a.id))) continue;
    }
    // A session you logged at that time is the same thing.
    if (found.some((o) => o.kind === "logged" && o.how === "time")) continue;
    for (const o of found) if (o.kind === "planned") out.replaced.add(o.id);
    const session = toCalendarSession(activityWorkout(a));
    if (session) out.sessions.push({ ...session, activity: a });
  }
  return out;
}
