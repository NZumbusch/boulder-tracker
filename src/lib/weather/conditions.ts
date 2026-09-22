import { rateFriction } from "./friction";

/** One hour of Open-Meteo's hourly data, local time "YYYY-MM-DDTHH:MM". */
export interface HourlyPoint {
  time: string;
  tempC: number;
  dewPointC?: number;
  humidityPercent?: number;
  precipitationMm?: number;
  precipitationChance?: number;
  windKmh?: number;
}

export interface RecentRain {
  last24hMm: number;
  last72hMm: number;
  /** Hours since the last hour with measurable rain, or undefined if none in the window. */
  hoursSinceRain?: number;
}

/** Rain below this (mm in an hour) is drizzle noise, not "it rained". */
const MEASURABLE_RAIN_MM = 0.1;

/** Rain totals and time since the last rain, from the hours before now (oldest first). */
export function summarizeRecentRain(pastHours: HourlyPoint[]): RecentRain {
  const n = pastHours.length;
  let last24hMm = 0;
  let last72hMm = 0;
  let hoursSinceRain: number | undefined;
  pastHours.forEach((h, i) => {
    const mm = h.precipitationMm ?? 0;
    const hoursAgo = n - i;
    if (hoursAgo <= 72) last72hMm += mm;
    if (hoursAgo <= 24) last24hMm += mm;
    if (mm >= MEASURABLE_RAIN_MM) hoursSinceRain = hoursAgo;
  });
  return { last24hMm: Math.round(last24hMm * 10) / 10, last72hMm: Math.round(last72hMm * 10) / 10, hoursSinceRain };
}

export interface ClimbingWindow {
  /** "HH:MM" local. */
  start: string;
  /** "HH:MM" local, the end of the last hour in the window. */
  end: string;
  avgTempC: number;
  avgScore: number;
}

/** Hours with at least this chance of rain don't count as dry. */
const WINDOW_MAX_RAIN_CHANCE = 30;
/** How many consecutive hours make a "window". */
export const WINDOW_HOURS = 3;

function addHour(hhmm: string): string {
  const h = (parseInt(hhmm.slice(0, 2), 10) + 1) % 24;
  return `${String(h).padStart(2, "0")}:${hhmm.slice(3, 5)}`;
}

/**
 * The best `WINDOW_HOURS`-hour dry stretch still to come today - highest
 * average friction score - from `upcomingHours` (from now, oldest first),
 * ending by `until` ("YYYY-MM-DDTHH:MM", e.g. today's sunset) or the end
 * of `today`. Equal scores go to the cooler stretch. `recentRainMm` is
 * carried into each hour's rating so a wet morning drags the whole day.
 * Undefined if no such stretch exists.
 */
export function bestWindow(
  upcomingHours: HourlyPoint[],
  today: string,
  until?: string,
  recentRainMm?: number,
): ClimbingWindow | undefined {
  // An hour counts only if it is over by `until` - a window must not run past sunset.
  const hourEnd = (h: HourlyPoint) => {
    const end = addHour(h.time.slice(11, 16));
    return `${today}T${end === "00:00" ? "24:00" : end}`;
  };
  const hours = upcomingHours.filter((h) => h.time.startsWith(today) && (!until || hourEnd(h) <= until));
  let best: ClimbingWindow | undefined;
  for (let i = 0; i + WINDOW_HOURS <= hours.length; i++) {
    const run = hours.slice(i, i + WINDOW_HOURS);
    const dry = run.every((h) => (h.precipitationMm ?? 0) === 0 && (h.precipitationChance ?? 0) < WINDOW_MAX_RAIN_CHANCE);
    if (!dry) continue;
    const scores = run.map((h) =>
      rateFriction({ tempC: h.tempC, humidityPercent: h.humidityPercent, dewPointC: h.dewPointC, windKmh: h.windKmh, recentRainMm }).score,
    );
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgTempC = run.reduce((s, h) => s + h.tempC, 0) / run.length;
    const better = !best || avgScore > best.avgScore || (avgScore === best.avgScore && avgTempC < best.avgTempC);
    if (better) {
      best = {
        start: run[0].time.slice(11, 16),
        end: addHour(run[run.length - 1].time.slice(11, 16)),
        avgTempC,
        avgScore,
      };
    }
  }
  return best;
}
