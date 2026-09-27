import type { FrictionLabel, FrictionConfig } from "./friction";
import { rateForecastDay, DEFAULT_FRICTION_CONFIG } from "./friction";
import type { CragForecast } from "./suggestion";

/**
 * Conditions for a Plan B's outdoor days - the hint that helps decide
 * between the two plans. Uses the same friction rating as the crags card:
 * the best-rated saved crag that day, or the home forecast when no crag is
 * saved. Days beyond the forecast simply get no hint.
 */
export interface OutdoorDayHint {
  /** "YYYY-MM-DD" */
  date: string;
  where: string;
  label: FrictionLabel;
  score: number;
  rainChance?: number;
}

export function outdoorDayHints(dates: string[], places: CragForecast[], config: FrictionConfig = DEFAULT_FRICTION_CONFIG): OutdoorDayHint[] {
  const hints: OutdoorDayHint[] = [];
  for (const date of [...new Set(dates)].sort()) {
    let best: OutdoorDayHint | undefined;
    for (const place of places) {
      const day = place.days.find((d) => d.date === date);
      if (!day) continue;
      const f = rateForecastDay(day, config);
      if (!best || f.score > best.score) best = { date, where: place.name, label: f.label, score: f.score, rainChance: day.precipitationChance };
    }
    if (best) hints.push(best);
  }
  return hints;
}

const WORD: Record<FrictionLabel, string> = { Prime: "prime", Good: "good", OK: "OK", Greasy: "greasy", Wet: "wet" };

/** "Sat: prime at Frankenjura" / "Sun: wet at Home (80% rain)". */
export function hintText(hint: OutdoorDayHint): string {
  const day = new Date(`${hint.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const rain = hint.rainChance !== undefined && hint.rainChance >= 40 ? ` (${hint.rainChance}% rain)` : "";
  return `${day}: ${WORD[hint.label]} at ${hint.where}${rain}`;
}

/** Whether a day looks good enough to go out. */
export function looksGood(hint: OutdoorDayHint): boolean {
  return hint.label === "Prime" || hint.label === "Good";
}
