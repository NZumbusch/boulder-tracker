/**
 * Talking to Strava: the token exchange and refresh, and reading activities
 * since a date. Pure of the app (the HTTP call and the clock are passed in)
 * so it is tested without a network; `stravaSync.svelte.ts` wires it up.
 */
import type { ExternalActivity } from "../types";
import {
  STRAVA_API_URL,
  STRAVA_REDIRECT_URI,
  STRAVA_TOKEN_URL,
  activityFromStrava,
  type StravaCredentials,
  type StravaSummary,
} from "./stravaApi";

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** Form fields, sent as application/x-www-form-urlencoded. */
  form?: Record<string, string>;
}
export interface HttpResponse {
  status: number;
  data: unknown;
}
export type Http = (request: HttpRequest) => Promise<HttpResponse>;

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
}

/** What went wrong, in the terms the person can act on. */
export type StravaErrorCode = "bad-credentials" | "reconnect" | "rate-limited" | "network" | "http";
export class StravaError extends Error {
  constructor(readonly code: StravaErrorCode, message: string) {
    super(message);
  }
}

const PAGE_SIZE = 100;
/** A safety stop: 30 pages = 3000 activities per sync, well inside Strava's 100 calls per 15 minutes. */
const MAX_PAGES = 30;
/** Renew this long before the token runs out. */
const EXPIRY_MARGIN_S = 120;

interface TokenAnswer {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: { firstname?: string; lastname?: string };
}

function tokensFrom(res: HttpResponse, what: "login" | "refresh"): { tokens: StravaTokens; athlete?: string } {
  if (res.status === 429) throw new StravaError("rate-limited", "Strava says too many requests - try again in 15 minutes.");
  const d = (res.data ?? {}) as TokenAnswer;
  if (res.status >= 400 || !d.access_token || !d.refresh_token || typeof d.expires_at !== "number") {
    // 400/401 on a login means the Client ID or secret (or the code) is wrong; on a refresh, the grant is gone.
    if (res.status === 400 || res.status === 401) {
      throw what === "login"
        ? new StravaError("bad-credentials", "Strava refused the login - check the Client ID and Client Secret.")
        : new StravaError("reconnect", "Strava no longer accepts this connection - connect again.");
    }
    throw new StravaError("http", `Strava answered ${res.status}.`);
  }
  const name = [d.athlete?.firstname, d.athlete?.lastname].filter(Boolean).join(" ");
  return { tokens: { accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: d.expires_at }, athlete: name || undefined };
}

async function call(http: Http, request: HttpRequest): Promise<HttpResponse> {
  try {
    return await http(request);
  } catch (err) {
    throw new StravaError("network", `Could not reach Strava (${(err as Error).message}).`);
  }
}

/** Swaps the one-time code from the login for tokens. */
export async function exchangeCode(http: Http, cred: StravaCredentials, code: string) {
  const res = await call(http, {
    url: STRAVA_TOKEN_URL,
    method: "POST",
    form: { client_id: cred.clientId.trim(), client_secret: cred.clientSecret.trim(), code, grant_type: "authorization_code", redirect_uri: STRAVA_REDIRECT_URI },
  });
  return tokensFrom(res, "login");
}

/** Strava rotates the refresh token on use: always keep the returned one. */
export async function refreshTokens(http: Http, cred: StravaCredentials, refreshToken: string): Promise<StravaTokens> {
  const res = await call(http, {
    url: STRAVA_TOKEN_URL,
    method: "POST",
    form: { client_id: cred.clientId.trim(), client_secret: cred.clientSecret.trim(), refresh_token: refreshToken, grant_type: "refresh_token" },
  });
  return tokensFrom(res, "refresh").tokens;
}

export interface FetchedActivities {
  activities: ExternalActivity[];
  /** The tokens to keep: renewed ones when the old ones had run out, else the same. */
  tokens: StravaTokens;
  /** Activities in the answer that could not be read (no start time). */
  unreadable: number;
}

/**
 * Every activity that started after `afterEpoch` (seconds; 0 = all of them),
 * oldest first. Renews the token first when it is about to run out.
 */
export async function fetchActivities(
  http: Http,
  cred: StravaCredentials,
  tokens: StravaTokens,
  afterEpoch: number,
  nowEpoch: number,
): Promise<FetchedActivities> {
  let current = tokens;
  if (current.expiresAt - EXPIRY_MARGIN_S <= nowEpoch) current = await refreshTokens(http, cred, current.refreshToken);

  const activities: ExternalActivity[] = [];
  let unreadable = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = new URLSearchParams({ after: String(Math.max(0, Math.floor(afterEpoch))), per_page: String(PAGE_SIZE), page: String(page) });
    const res = await call(http, { url: `${STRAVA_API_URL}/athlete/activities?${q}`, headers: { Authorization: `Bearer ${current.accessToken}` } });
    if (res.status === 401) throw new StravaError("reconnect", "Strava no longer accepts this connection - connect again.");
    if (res.status === 429) throw new StravaError("rate-limited", "Strava says too many requests - try again in 15 minutes.");
    if (res.status >= 400 || !Array.isArray(res.data)) throw new StravaError("http", `Strava answered ${res.status}.`);
    for (const s of res.data as StravaSummary[]) {
      const a = activityFromStrava(s);
      if (a) activities.push(a);
      else unreadable++;
    }
    if (res.data.length < PAGE_SIZE) break;
  }
  activities.sort((a, b) => a.start.localeCompare(b.start));
  return { activities, tokens: current, unreadable };
}
