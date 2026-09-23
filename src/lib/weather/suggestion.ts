import type { Workout } from "../types";
import type { DailyForecastDay } from "./api";
import { rateForecastDay, DEFAULT_FRICTION_CONFIG, type FrictionConfig } from "./friction";
import { isSkippedWorkout } from "../planning/weekStatus";

export interface CragForecast {
  name: string;
  days: DailyForecastDay[];
}

export interface OutdoorSuggestion {
  /** "YYYY-MM-DD" */
  date: string;
  cragName: string;
  /** The planned session that day - what could be swapped for an outdoor day. */
  sessionName: string;
}

/**
 * The first day from `todayIso` on where a saved crag rates Prime and a
 * session is planned - a nudge to consider going outside instead. On a tie
 * between crags the higher score wins. Undefined when there's nothing to
 * suggest. The app has no indoor/outdoor flag on sessions, so any planned
 * (not skipped) session counts.
 */
export function outdoorSuggestion(
  crags: CragForecast[],
  todayIso: string,
  plannedOn: (date: string) => Workout[],
  config: FrictionConfig = DEFAULT_FRICTION_CONFIG,
): OutdoorSuggestion | undefined {
  const dates = [...new Set(crags.flatMap((c) => c.days.map((d) => d.date)))].filter((d) => d >= todayIso).sort();
  for (const date of dates) {
    const prime = crags
      .map((c) => {
        const day = c.days.find((d) => d.date === date);
        return day ? { crag: c.name, friction: rateForecastDay(day, config) } : undefined;
      })
      .filter((x): x is { crag: string; friction: ReturnType<typeof rateForecastDay> } => !!x && x.friction.label === "Prime")
      .sort((a, b) => b.friction.score - a.friction.score);
    if (prime.length === 0) continue;
    const session = plannedOn(date).find((w) => w.status === "planned" && !isSkippedWorkout(w));
    if (session) return { date, cragName: prime[0].crag, sessionName: session.notes || "a session" };
  }
  return undefined;
}
