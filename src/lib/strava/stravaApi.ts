/**
 * Strava's API, the pure parts: the login link, the answer it comes back
 * with, and an API activity turned into an `ExternalActivity`.
 *
 * Strava only completes a login with the app's client secret, and anything
 * shipped in the app is public, so each person brings their own free Strava
 * API app (Client ID and secret, kept on this device only). No server is
 * involved: Strava redirects to a static page of the app's site
 * (`public/strava-callback.html`), which hands the answer to the app through
 * a `bouldertracker://strava` link.
 */
import type { ExternalActivity } from "../types";
import { localIsoDate } from "../dateUtils";
import { decodeTrack, routeOf } from "../activity/track";
import { APP_INFO } from "../appInfo";

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/mobile/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_API_URL = "https://www.strava.com/api/v3";

/** Where Strava sends the person back to: a static page of the app's site. */
export const STRAVA_REDIRECT_URI = `${APP_INFO.siteUrl}strava-callback.html`;
/** What goes in the Strava API app's "Authorization Callback Domain" field. */
export const STRAVA_CALLBACK_DOMAIN = new URL(APP_INFO.siteUrl).host;

export interface StravaCredentials {
  clientId: string;
  clientSecret: string;
}

export function authorizeUrl(clientId: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: STRAVA_REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  });
  return `${STRAVA_AUTHORIZE_URL}?${q}`;
}

export interface StravaCallback {
  code?: string;
  state?: string;
  /** Strava's `error` (usually "access_denied") when the person said no. */
  error?: string;
  /** The scopes the person actually allowed (they can untick the activity one). */
  scope?: string;
}

/** Reads `bouldertracker://strava?code=...&state=...`; null for any other link. */
export function parseStravaCallback(url: string | null | undefined): StravaCallback | null {
  const match = url?.match(/^bouldertracker:\/\/strava\/?\?([^#]*)/i);
  if (!match) return null;
  const q = new URLSearchParams(match[1]);
  const out: StravaCallback = {};
  for (const key of ["code", "state", "error", "scope"] as const) {
    const v = q.get(key);
    if (v) out[key] = v;
  }
  return out;
}

/** A login needs the activity scope; Strava lets the person untick it on its consent screen. */
export const hasActivityScope = (scope: string | undefined) => !!scope && scope.split(",").includes("activity:read_all");

/** One activity as the list endpoint returns it (only the fields used). */
export interface StravaSummary {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
  map?: { summary_polyline?: string | null };
}

const whole = (n: unknown): number | undefined => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined);

/**
 * An API activity as the archive import would have made it (same `strava-<id>`,
 * same type names), so one synced after an archive import is recognised as
 * the same activity. `null` when it has no usable start.
 */
export function activityFromStrava(s: StravaSummary): ExternalActivity | null {
  const startMs = Date.parse(s.start_date ?? "");
  if (!Number.isFinite(startMs) || !Number.isFinite(s.id)) return null;
  // `sport_type` is the finer label ("TrailRun", "MountainBikeRide"); the CSV archive says "Run" or "Ride" for those, so prefer `type`.
  const type = s.type || s.sport_type || "Activity";
  const a: ExternalActivity = {
    id: `strava-${s.id}`,
    source: "strava",
    sourceId: String(s.id),
    date: localIsoDate(new Date(startMs)),
    start: new Date(startMs).toISOString(),
    name: (s.name ?? "").trim() || type,
    type,
    durationSec: whole(s.elapsed_time) ?? whole(s.moving_time) ?? 0,
  };
  const moving = whole(s.moving_time);
  if (moving) a.movingSec = moving;
  const distance = whole(s.distance);
  if (distance) a.distanceM = distance;
  const elevation = whole(s.total_elevation_gain);
  if (elevation) a.elevationM = elevation;
  const avgHr = whole(s.average_heartrate);
  if (avgHr) a.avgHr = avgHr;
  const maxHr = whole(s.max_heartrate);
  if (maxHr) a.maxHr = maxHr;
  const calories = whole(s.calories);
  if (calories) a.calories = calories;
  const polyline = s.map?.summary_polyline;
  if (polyline) {
    const route = routeOf(decodeTrack(polyline).map(([lat, lon]) => ({ lat, lon })));
    if (route) a.track = route;
  }
  return a;
}
