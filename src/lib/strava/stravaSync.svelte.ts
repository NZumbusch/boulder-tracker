/**
 * Strava sync (Android): connect once with your own Strava API app, then new
 * activities are pulled in quietly on start and when the app comes back (at
 * most every RESUME_AFTER_MS), on pull-to-refresh and on "Sync now".
 *
 * The Client ID, the secret and the tokens live in this device's localStorage
 * only: they are not part of a backup, a settings file or Drive sync. The
 * activities themselves are ordinary imported activities (`ExternalActivity`,
 * ids `strava-<id>` like the archive import's), so Drive carries them to the
 * other devices and one already imported from an archive is never doubled.
 * The talking to Strava is in `stravaClient.ts`.
 */
import { App } from "@capacitor/app";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { trainingState } from "../state.svelte";
import { isDemoMode } from "../storage/persistence";
import { DEFAULT_IMPORT_OPTIONS, planImport } from "../activity/overlap";
import { authorizeUrl, hasActivityScope, type StravaCallback, type StravaCredentials } from "./stravaApi";
import { StravaError, exchangeCode, fetchActivities, type Http, type StravaTokens } from "./stravaClient";

const STORE_KEY = "boulder_tracker_strava";
const RESUME_AFTER_MS = 30 * 60_000;
/** The first sync reads this far back (a longer history is one tap away). */
export const FIRST_SYNC_DAYS = 90;
/** Later syncs re-read this far back: an activity can reach Strava a day late (a watch that synced late). */
const OVERLAP_S = 2 * 86_400;

interface Stored {
  credentials: StravaCredentials | null;
  tokens: StravaTokens | null;
  athlete?: string;
  /** A login in progress: the `state` the callback has to bring back. */
  pending?: string;
  /** Epoch ms of the last successful sync. */
  lastSyncAt: number | null;
  /** Epoch seconds of the newest activity seen, where the next sync starts (minus the overlap). */
  newestStart: number | null;
}

const EMPTY: Stored = { credentials: null, tokens: null, lastSyncAt: null, newestStart: null };

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { ...EMPTY };
}

/** Native HTTP: Strava's token endpoint does not allow calls from a web page, a native one has no such rule. */
const nativeHttp: Http = async ({ url, method = "GET", headers = {}, form }) => {
  const res = await CapacitorHttp.request({
    url,
    method,
    headers: form ? { ...headers, "Content-Type": "application/x-www-form-urlencoded" } : headers,
    data: form,
    responseType: "json",
  });
  return { status: res.status, data: res.data };
};

export interface SyncResult {
  added: number;
  /** Left out because they match one of your own logged sessions or an activity from another source. */
  skipped: number;
}

class StravaSync {
  supported = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  credentials = $state<StravaCredentials | null>(null);
  connected = $state(false);
  athlete = $state<string | undefined>(undefined);
  lastSyncAt = $state<number | null>(null);
  syncing = $state(false);
  error = $state<string | null>(null);
  /** What the last sync did, for Settings. */
  lastResult = $state<SyncResult | null>(null);

  #stored: Stored = { ...EMPTY };
  #started = false;
  #http: Http = nativeHttp;

  async init(): Promise<void> {
    if (!this.supported || this.#started) return;
    this.#started = true;
    this.#adopt(load());
    if (this.connected) void this.syncNow({ quiet: true });
    void App.addListener("resume", () => {
      if (this.connected && (this.lastSyncAt === null || Date.now() - this.lastSyncAt > RESUME_AFTER_MS)) void this.syncNow({ quiet: true });
    });
  }

  /** Keeps the Client ID and secret (device only). Changing them signs out. */
  saveCredentials(cred: StravaCredentials): void {
    const next = { clientId: cred.clientId.trim(), clientSecret: cred.clientSecret.trim() };
    const same = this.#stored.credentials?.clientId === next.clientId && this.#stored.credentials?.clientSecret === next.clientSecret;
    this.#save(same ? { ...this.#stored, credentials: next } : { ...EMPTY, credentials: next });
  }

  /** Opens Strava's consent screen; the answer comes back through `handleCallback`. */
  async startLogin(): Promise<void> {
    const cred = this.#stored.credentials;
    if (!cred?.clientId || !cred.clientSecret) {
      this.error = "Enter the Client ID and Client Secret of your Strava API app first.";
      return;
    }
    this.error = null;
    const state = crypto.randomUUID();
    this.#save({ ...this.#stored, pending: state });
    // Like any external link in the app: Capacitor hands a page outside the app to the phone (the Strava app if installed, else the browser).
    window.open(authorizeUrl(cred.clientId, state), "_blank");
  }

  /** Finishes a login from the `bouldertracker://strava` link, then runs the first sync. */
  async handleCallback(cb: StravaCallback): Promise<void> {
    const pending = this.#stored.pending;
    this.#save({ ...this.#stored, pending: undefined });
    if (!pending || cb.state !== pending) {
      this.error = "That Strava login did not match one started here - try Connect again.";
      return;
    }
    if (cb.error || !cb.code) {
      this.error = cb.error === "access_denied" ? "You said no on Strava's screen. Connect again and allow access." : `Strava did not log you in (${cb.error ?? "no code"}).`;
      return;
    }
    if (cb.scope !== undefined && !hasActivityScope(cb.scope)) {
      this.error = "Strava needs 'View data about your private activities' ticked on its screen - connect again and leave it on.";
      return;
    }
    const cred = this.#stored.credentials;
    if (!cred) return;
    try {
      const { tokens, athlete } = await exchangeCode(this.#http, cred, cb.code);
      this.#save({ ...this.#stored, tokens, athlete });
      this.error = null;
    } catch (err) {
      this.error = this.#message(err);
      return;
    }
    await this.syncNow({ days: FIRST_SYNC_DAYS });
  }

  /** Signs out and forgets the tokens (the credentials stay for a quick reconnect). Imported activities stay. */
  disconnect(): void {
    this.#save({ ...EMPTY, credentials: this.#stored.credentials });
    this.lastResult = null;
    this.error = null;
  }

  /** Forgets the Client ID and secret too. */
  forgetCredentials(): void {
    this.#save({ ...EMPTY });
    this.lastResult = null;
    this.error = null;
  }

  /**
   * Pulls in what is new. `days` starts from that many days back instead of
   * where the last sync left off; `days: 0` reads the whole history.
   */
  async syncNow({ quiet = false, days }: { quiet?: boolean; days?: number } = {}): Promise<void> {
    const { credentials, tokens } = this.#stored;
    if (!credentials || !tokens || this.syncing || isDemoMode() || trainingState.demoActive) return;
    this.syncing = true;
    if (!quiet) this.error = null;
    const startedAt = Date.now();
    try {
      const after =
        days !== undefined ? (days === 0 ? 0 : Math.floor(startedAt / 1000) - days * 86_400)
        : this.#stored.newestStart !== null ? Math.max(0, this.#stored.newestStart - OVERLAP_S)
        : Math.floor(startedAt / 1000) - FIRST_SYNC_DAYS * 86_400;
      const got = await fetchActivities(this.#http, credentials, tokens, after, Math.floor(startedAt / 1000));
      // Keep the renewed tokens before anything else can fail: Strava has already retired the old refresh token.
      this.#save({ ...this.#stored, tokens: got.tokens });

      const plan = planImport(
        trainingState.externalActivities,
        got.activities,
        (d) => trainingState.workoutsOnDays(d),
        (w) => w.notes || "Session",
        DEFAULT_IMPORT_OPTIONS,
        (w) => trainingState.sessionText(w),
      );
      const added = plan.add.length ? await trainingState.addExternalActivities($state.snapshot(plan.add) as typeof plan.add) : 0;
      const newest = got.activities.length ? Math.floor(Date.parse(got.activities[got.activities.length - 1].start) / 1000) : this.#stored.newestStart;
      this.lastResult = { added, skipped: plan.duplicates.length + plan.logged.length };
      this.#save({ ...this.#stored, lastSyncAt: startedAt, newestStart: newest === null ? null : Math.max(newest, this.#stored.newestStart ?? 0) });
      this.error = null;
    } catch (err) {
      const message = this.#message(err);
      // A quiet background sync only complains about what needs the person (a dead login), not a missing network.
      if (!quiet || (err instanceof StravaError && err.code !== "network")) this.error = message;
    } finally {
      this.syncing = false;
    }
  }

  #message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  #adopt(s: Stored): void {
    this.#stored = s;
    this.credentials = s.credentials;
    this.connected = !!s.tokens;
    this.athlete = s.athlete;
    this.lastSyncAt = s.lastSyncAt;
  }

  #save(s: Stored): void {
    this.#adopt(s);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch { /* storage full or blocked: the session still works, it just will not be remembered */ }
  }
}

export const stravaSync = new StravaSync();
