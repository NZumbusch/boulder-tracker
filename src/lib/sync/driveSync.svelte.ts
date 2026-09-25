/**
 * Google Drive sync, wired into the app: connect/disconnect, when to sync,
 * and what the Settings card shows. The sync itself is `syncEngine.ts`
 * (tested with a fake Drive); records merge per `merge.ts`.
 *
 * When it runs (only once connected, Android only):
 * - on app start and whenever the app comes back to the foreground,
 * - about 15 s after a change (a burst of edits becomes one upload),
 * - straight away when the app goes to the background with changes pending.
 *
 * Kept on this device only: the ledger (what changed when - `merge.ts`),
 * the conflict list, and the connection settings. None of it is in a
 * backup export; the data itself is what syncs.
 */
import localforage from "localforage";
import { trainingState } from "../state.svelte";
import { toast } from "../toast.svelte";
import { _dbState, flushDB, initDB, setFlushListener, TABLES, type TableName } from "../storage/persistence";
import { runDataMigrations } from "../storage/migrations";
import { writeAutoBackup } from "../storage/autoBackup";
import { DriveClient, driveErrorCode, driveSyncAvailable } from "../native/driveClient";
import { defaultLabel, initLedger, mapToTable, tableToMap, trackTable, type Ledger, type SyncConflict } from "./merge";
import { runSync, SyncVersionError, type DeviceInfo, type LocalPort } from "./syncEngine";

const SETTINGS_KEY = "boulder_tracker_sync";
const LEDGER_KEY = "sync_ledger";
const CONFLICTS_KEY = "sync_conflicts";
const MAX_CONFLICTS = 50;
const CHANGE_DELAY_MS = 15_000;
/** Coming back to the app syncs if the last sync is older than this. */
const RESUME_AFTER_MS = 60_000;

interface Settings {
  connected: boolean;
  deviceId: string;
  deviceName: string;
  account?: string;
  /** null until the first sync has run (it adopts what's already on Drive). */
  lastSyncAt: number | null;
  devices: DeviceInfo[];
}

export type SyncStatus = "off" | "idle" | "syncing" | "error";

function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Settings) : null;
  } catch {
    return null;
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function currentTables(): Record<string, unknown> {
  return Object.fromEntries(TABLES.map((t) => [t, _dbState[t]]));
}

/** Tables as they are when there's nothing in them - "replace this device's data" starts from here. */
function emptyTables(): Record<string, unknown> {
  return Object.fromEntries(TABLES.map((t) => [t, t === "templates" ? {} : []]));
}

/** Whether this device holds anything beyond the built-in defaults worth merging rather than replacing. */
function hasOwnData(): boolean {
  return ["workouts", "dailyMetrics", "benchmarks", "painLogs", "outdoorAscents", "goals", "trainingBlocks"].some(
    (t) => (_dbState[t] as unknown[] | undefined)?.length,
  );
}

class DriveSync {
  readonly available = driveSyncAvailable();
  status = $state<SyncStatus>("off");
  error = $state<string | null>(null);
  /** The error needs the user to sign in again (the grant was revoked or expired). */
  needsSignIn = $state(false);
  account = $state<string | undefined>(undefined);
  deviceName = $state("");
  lastSyncAt = $state<number | null>(null);
  devices = $state<DeviceInfo[]>([]);
  conflicts = $state<SyncConflict[]>([]);
  /** Set while connecting found data both here and on Drive: the Settings card asks merge or replace. */
  choosing = $state(false);

  get connected() {
    return this.status !== "off";
  }

  #settings: Settings | null = null;
  #client = new DriveClient();
  #ledger: Ledger = {};
  #generation = 0;
  #dirty = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running: Promise<void> | null = null;
  #again = false;
  #ledgerSave: ReturnType<typeof setTimeout> | undefined;
  #started = false;

  /** Called once at app start. */
  async init(): Promise<void> {
    if (!this.available || this.#started) return;
    this.#started = true;
    this.conflicts = ((await localforage.getItem(CONFLICTS_KEY)) as SyncConflict[] | null) ?? [];
    const settings = loadSettings();
    if (!settings?.connected) return;
    await initDB();
    this.#settings = settings;
    this.#client.email = settings.account;
    this.account = settings.account;
    this.deviceName = settings.deviceName;
    this.lastSyncAt = settings.lastSyncAt;
    this.devices = settings.devices ?? [];
    this.#ledger = ((await localforage.getItem(LEDGER_KEY)) as Ledger | null) ?? initLedger(currentTables(), TABLES, settings.deviceId);
    // Anything saved while the last ledger write was still pending (the app was killed) is picked up here.
    this.#track(TABLES);
    this.#start();
    this.schedule(0);
  }

  #start() {
    this.status = "idle";
    setFlushListener((tables) => this.#track(tables));
    document.addEventListener("visibilitychange", this.#onVisibility);
  }

  #onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (this.#dirty) this.schedule(0);
    } else if (!this.lastSyncAt || Date.now() - this.lastSyncAt > RESUME_AFTER_MS || this.#dirty) {
      this.schedule(0);
    }
  };

  #track(tables: readonly TableName[]) {
    const deviceId = this.#settings?.deviceId;
    if (!deviceId || !_dbState) return;
    let changed = false;
    const now = Date.now();
    for (const t of tables) if (trackTable(this.#ledger, t, _dbState[t], now, deviceId)) changed = true;
    if (!changed) return;
    this.#generation++;
    this.#dirty = true;
    this.#saveLedgerSoon();
    this.schedule(CHANGE_DELAY_MS);
  }

  #saveLedgerSoon() {
    clearTimeout(this.#ledgerSave);
    this.#ledgerSave = setTimeout(() => void localforage.setItem(LEDGER_KEY, this.#ledger), 500);
  }

  #saveSettings() {
    if (!this.#settings) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.#settings));
  }

  /** Syncs after `delayMs` (an earlier request wins over a later one). */
  schedule(delayMs: number) {
    if (!this.#settings?.connected) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.syncNow(), delayMs);
  }

  // --- Connecting ---------------------------------------------------------

  /** Signs in (Google's own screen) and, unless there's a choice to make, syncs. */
  async connect(): Promise<void> {
    if (!this.available) return;
    this.error = null;
    try {
      await initDB();
      const { email } = await this.#client.authorize(true);
      const deviceId = loadSettings()?.deviceId ?? randomId();
      this.#settings = { connected: false, deviceId, deviceName: await DriveClient.deviceName(), account: email, lastSyncAt: null, devices: [] };
      this.account = email;
      this.deviceName = this.#settings.deviceName;
      const others = (await this.#client.list()).filter((f) => f.name !== `device-${deviceId}.json`);
      if (others.length > 0 && hasOwnData()) {
        this.choosing = true; // SyncSettings asks; it calls finishConnect.
        return;
      }
      await this.finishConnect("merge");
    } catch (err) {
      this.#fail(err);
    }
  }

  /**
   * "merge": this device's data and Drive's come together (where the same
   * record differs, Drive's wins, once). "replace": this device takes
   * Drive's data as it is - after saving a backup of what was here.
   */
  async finishConnect(mode: "merge" | "replace"): Promise<void> {
    if (!this.#settings) return;
    this.choosing = false;
    const settings = this.#settings;
    if (mode === "replace") {
      try {
        await writeAutoBackup();
      } catch {
        // A backup is a safety net; Documents may be unavailable - replace goes ahead.
      }
      this.#ledger = {};
      Object.assign(_dbState, emptyTables());
      // On disk too (the flush listener isn't on yet, so this isn't tracked as deleting everything).
      await flushDB();
    } else {
      this.#ledger = initLedger(currentTables(), TABLES, settings.deviceId);
    }
    settings.connected = true;
    this.#saveSettings();
    await localforage.setItem(LEDGER_KEY, this.#ledger);
    this.#start();
    await this.syncNow();
    if (mode === "replace") await trainingState.refresh();
  }

  cancelConnect() {
    this.choosing = false;
    this.#settings = null;
    this.account = undefined;
  }

  async disconnect(): Promise<void> {
    clearTimeout(this.#timer);
    setFlushListener(null);
    document.removeEventListener("visibilitychange", this.#onVisibility);
    await this.#client.revoke().catch(() => {});
    const deviceId = this.#settings?.deviceId;
    this.#settings = null;
    // Keep the device id, so reconnecting later is recognised as this same device.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ connected: false, deviceId }));
    await localforage.removeItem(LEDGER_KEY);
    this.#ledger = {};
    this.status = "off";
    this.account = undefined;
    this.lastSyncAt = null;
    this.devices = [];
    this.error = null;
    this.needsSignIn = false;
  }

  /** After "sign in again": a fresh interactive grant, then sync. */
  async signInAgain(): Promise<void> {
    try {
      const { email } = await this.#client.authorize(true);
      if (this.#settings && email) this.#settings.account = email;
      this.account = email ?? this.account;
      this.needsSignIn = false;
      await this.syncNow();
    } catch (err) {
      this.#fail(err);
    }
  }

  // --- Syncing ------------------------------------------------------------

  /** Runs a sync now; if one is running, another follows it. */
  syncNow(): Promise<void> {
    if (!this.#settings?.connected) return Promise.resolve();
    clearTimeout(this.#timer);
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = this.#run().finally(() => {
      this.#running = null;
      if (this.#again) {
        this.#again = false;
        void this.syncNow();
      }
    });
    return this.#running;
  }

  async #run(): Promise<void> {
    const settings = this.#settings!;
    this.status = "syncing";
    this.error = null;
    const generationAtStart = this.#generation;
    const local: LocalPort = {
      tables: currentTables,
      ledger: () => this.#ledger,
      exportVersion: () => _dbState.exportVersion,
      generation: () => this.#generation,
      apply: async (tables, changed, ledger) => {
        // The ledger first: then the flush below finds nothing new to track.
        this.#ledger = ledger;
        for (const t of changed) _dbState[t] = tables[t];
        await localforage.setItem(LEDGER_KEY, ledger);
        if (changed.length) await flushDB(changed as TableName[]);
      },
      migrate: runDataMigrations,
    };
    try {
      const outcome = await runSync({
        transport: this.#client,
        local,
        identity: { deviceId: settings.deviceId, deviceName: settings.deviceName },
        lastSyncAt: settings.lastSyncAt,
        tableNames: TABLES,
        labelOf: defaultLabel,
      });
      settings.lastSyncAt = outcome.syncedAt;
      settings.devices = outcome.devices;
      this.#saveSettings();
      this.lastSyncAt = outcome.syncedAt;
      this.devices = outcome.devices;
      if (this.#generation === generationAtStart) this.#dirty = false;
      this.status = "idle";
      this.needsSignIn = false;
      if (outcome.changedTables.length) await trainingState.refresh();
      if (outcome.conflicts.length) await this.#reportConflicts(outcome.conflicts);
    } catch (err) {
      this.#fail(err);
    }
  }

  #fail(err: unknown) {
    const code = driveErrorCode(err);
    if (code === "cancelled") {
      this.error = null;
      if (!this.#settings?.connected) this.cancelConnect();
      return;
    }
    if (this.#settings?.connected) this.status = "error";
    this.needsSignIn = code === "consent-required";
    this.error =
      err instanceof SyncVersionError ? err.message
      : code === "consent-required" ? "Google needs you to sign in again."
      : code === "network" ? "No connection - will try again."
      : code === "http-403" ? "Drive refused access (is the Drive API enabled for this app?)."
      : `Sync failed: ${(err as Error)?.message ?? err}`;
    // Offline: try again in a while rather than waiting for the next change.
    if (code === "network") this.schedule(5 * 60_000);
  }

  // --- Conflicts ----------------------------------------------------------

  async #reportConflicts(found: SyncConflict[]) {
    this.conflicts = [...found, ...this.conflicts].slice(0, MAX_CONFLICTS);
    await localforage.setItem(CONFLICTS_KEY, $state.snapshot(this.conflicts));
    const other = found.length === 1 ? `"${found[0].label}"` : `${found.length} records`;
    toast.show(`Sync: ${other} changed on two devices - kept the newer edit. The other is under Settings → Data & Exports.`, { durationMs: 7000 });
  }

  /** Puts the losing version back (as a new edit, so it syncs out and wins everywhere). */
  async restoreConflict(conflict: SyncConflict): Promise<void> {
    await initDB();
    const table = conflict.table as TableName;
    const map = tableToMap(table, _dbState[table]);
    if (conflict.lost.deleted) map.delete(conflict.key);
    else map.set(conflict.key, conflict.lost.value);
    _dbState[table] = mapToTable(table, map, _dbState[table]);
    await flushDB([table]);
    await trainingState.refresh();
    await this.dismissConflict(conflict);
  }

  async dismissConflict(conflict: SyncConflict): Promise<void> {
    this.conflicts = this.conflicts.filter((c) => c !== conflict && !(c.key === conflict.key && c.at === conflict.at && c.table === conflict.table));
    await localforage.setItem(CONFLICTS_KEY, $state.snapshot(this.conflicts));
  }

  async clearConflicts(): Promise<void> {
    this.conflicts = [];
    await localforage.removeItem(CONFLICTS_KEY);
  }
}

export const driveSync = new DriveSync();
