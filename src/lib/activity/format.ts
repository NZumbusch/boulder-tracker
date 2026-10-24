import type { ExternalActivity } from "../types";

/** "1 h 05 min" / "42 min" / "0:45" for under a minute. */
export function formatDuration(sec: number): string {
  if (!sec || sec < 1) return "–";
  if (sec < 60) return `0:${String(Math.round(sec)).padStart(2, "0")}`;
  const min = Math.round(sec / 60);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

const MI = 1609.344;

/** "10.5 km" (one decimal under 100, none above) or miles. */
export function formatDistance(m: number, miles = false): string {
  const v = miles ? m / MI : m / 1000;
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${miles ? "mi" : "km"}`;
}

/** Pace for foot activities ("5:12 /km"), speed for the rest ("24.3 km/h"); undefined when there is no distance or time. */
export function formatPaceOrSpeed(a: Pick<ExternalActivity, "type" | "distanceM" | "movingSec" | "durationSec">, miles = false): string | undefined {
  const sec = a.movingSec || a.durationSec;
  if (!a.distanceM || a.distanceM < 100 || !sec) return undefined;
  const unit = miles ? MI : 1000;
  if (/run|walk|hike/i.test(a.type)) {
    const per = sec / (a.distanceM / unit);
    const m = Math.floor(per / 60);
    const s = Math.round(per % 60);
    return `${s === 60 ? m + 1 : m}:${String(s === 60 ? 0 : s).padStart(2, "0")} /${miles ? "mi" : "km"}`;
  }
  const speed = a.distanceM / unit / (sec / 3600);
  return `${speed.toFixed(1)} ${miles ? "mph" : "km/h"}`;
}

/** The one-line summary of an activity: type, time, distance, pace. */
export function summaryLine(a: ExternalActivity, miles = false): string {
  return [a.type, a.durationSec ? formatDuration(a.durationSec) : "", a.distanceM ? formatDistance(a.distanceM, miles) : "", formatPaceOrSpeed(a, miles) ?? ""].filter(Boolean).join(" · ");
}

/** "07:42" in the device's time zone. */
export function startClock(a: Pick<ExternalActivity, "start">): string {
  const d = new Date(a.start);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const SOURCE_LABELS: Record<ExternalActivity["source"], string> = { strava: "Strava", garmin: "Garmin", file: "File" };
