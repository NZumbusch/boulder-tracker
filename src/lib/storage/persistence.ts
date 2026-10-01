import localforage from "localforage";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import {
  DEFAULT_TEMPLATES,
  DEFAULT_EXERCISE_TYPES,
  DEFAULT_BENCHMARK_TYPES,
  DEFAULT_ANALYTICS_CATEGORIES,
  DEFAULT_PHASE_DEFS,
  DEFAULT_METRIC_DEFS,
  DEFAULT_VALUE_DEFS,
  DATA_EXPORT_VERSION,
} from "../constants";

/**
 * Decides what `exportVersion` a freshly-loaded `_dbState` should carry.
 *
 * Bug fix (found 2026-09-16, reported by the user as duplicate/gray
 * "phase-..." entries surviving a storage wipe): a **true fresh install**
 * (no `workouts` ever persisted - the one field every real install always
 * has, even as `[]`) populates every other field straight from the
 * `DEFAULT_*` constants, which are already in the *current* schema shape by
 * construction. Defaulting `exportVersion` to `"1.0"` in that case (the old
 * behavior) made `runStartupMigrations` run the *entire* migration chain
 * over already-current-shape data - most historical steps happen to be
 * defensive/idempotent against that, but not all of them (confirmed: the
 * PhaseDef templates-rekey step re-resolved already-correct phaseId keys as
 * if they were phase *names*, creating an archived placeholder PhaseDef
 * per phase, and the Exercise->ExerciseSlot restructure step
 * double-nested `prescribed` on already-slotted default-template
 * exercises). A real, pre-existing install (has persisted `workouts`, even
 * an empty array) still defaults to `"1.0"` exactly as before when its
 * `exportVersion` is missing - that's the genuine 1.0/2.0-era case
 * migrations exist to handle.
 */
export function resolveInitialExportVersion(rawData: { workouts?: unknown; exportVersion?: string }): string {
  const isFreshInstall = rawData.workouts == null;
  return isFreshInstall ? DATA_EXPORT_VERSION : (rawData.exportVersion || "1.0");
}

/**
 * Pure get/set of the raw DB blob - the localforage (web) / Capacitor
 * Filesystem (native) adapters, and the in-memory `_dbState` they populate.
 * No domain knowledge (migrations, CRUD semantics) lives here.
 */

localforage.config({
  name: "boulder-tracker",
  storeName: "training_data_v2",
});

/** The training data on Android: one JSON file in the app's private storage. */
const NATIVE_DB_FILE = "boulder_tracker_db.json";
/**
 * Where a save is written first. Only a complete write gets swapped in as
 * `NATIVE_DB_FILE`, so the app being killed mid-save (Android does that)
 * can't leave the real file half-written.
 */
const NATIVE_DB_TMP = "boulder_tracker_db.json.tmp";

/** The weekly automatic backups (`autoBackup.ts`) - also what a damaged database is restored from. */
export const AUTO_BACKUP_FOLDER = "BoulderTracker";
/**
 * Where backups went before the app was renamed (it was "Climbing
 * Tracker"). Nothing is written there any more, but a damaged database is
 * still restored from there if that's where the newest backup is.
 */
export const LEGACY_BACKUP_FOLDERS = ["ClimbingTracker"];
export const AUTO_BACKUP_PREFIX = "auto-backup-";

type NativeRead = { status: "missing" } | { status: "ok"; data: any } | { status: "damaged"; text: string };

async function readNativeJson(path: string, directory: Directory = Directory.Data): Promise<NativeRead> {
  let text: string;
  try {
    text = (await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 })).data as string;
  } catch {
    return { status: "missing" };
  }
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? { status: "ok", data } : { status: "damaged", text };
  } catch {
    return { status: "damaged", text };
  }
}

/** The newest automatic backup that reads cleanly, or the pre-migration backup - for restoring a damaged database. */
async function readNewestBackup(): Promise<{ data: any; label: string } | null> {
  // Every automatic backup in the current and the old folder, newest first
  // (the date is in the name).
  const candidates: { directory: Directory; folder: string; name: string }[] = [];
  for (const directory of [Directory.Documents, Directory.External]) {
    for (const folder of [AUTO_BACKUP_FOLDER, ...LEGACY_BACKUP_FOLDERS]) {
      try {
        const names = (await Filesystem.readdir({ path: folder, directory })).files.map((f) => (typeof f === "string" ? f : f.name));
        for (const name of names) if (name.startsWith(AUTO_BACKUP_PREFIX) && name.endsWith(".json")) candidates.push({ directory, folder, name });
      } catch {
        // No such folder.
      }
    }
  }
  candidates.sort((a, b) => b.name.localeCompare(a.name));
  for (const { directory, folder, name } of candidates) {
    const read = await readNativeJson(`${folder}/${name}`, directory);
    if (read.status === "ok" && Array.isArray(read.data.workouts)) {
      return { data: read.data, label: `the automatic backup of ${name.slice(AUTO_BACKUP_PREFIX.length, -".json".length)}` };
    }
  }
  const migration = await readNativeJson(MIGRATION_BACKUP_FILE);
  if (migration.status === "ok" && Array.isArray(migration.data?.data?.workouts)) {
    return { data: migration.data.data, label: `the backup taken before the ${migration.data.fromVersion ?? "last"} update (${String(migration.data.backedUpAt ?? "").slice(0, 10)})` };
  }
  return null;
}

/**
 * Set when loading found the database damaged, for a one-time message on
 * start (see `takeRecoveryNotice`).
 */
let recoveryNotice: string | null = null;
export function takeRecoveryNotice(): string | null {
  const notice = recoveryNotice;
  recoveryNotice = null;
  return notice;
}

export let _dbState: any = null;

/**
 * While the tour shows example data (`lib/tour`), `_dbState` holds that
 * data, and nothing may reach the disk, Drive, a backup, a reminder or the
 * widget. Everything that writes or exports checks this.
 */
let demoMode = false;
export function isDemoMode(): boolean {
  return demoMode;
}
export function setDemoMode(on: boolean): void {
  demoMode = on;
}

/**
 * Deep-copies a value into plain, structured-cloneable data.
 *
 * Everything written into `_dbState` goes through this, because `flushDB`
 * hands the blob to `localforage.setItem`, which structured-clones it - and
 * a structured clone of a **Svelte `$state` proxy throws**
 * ("Proxy object could not be cloned"). Callers reach storage from
 * components and stores holding reactive state, and a shallow spread at the
 * call site is not enough: the top level comes out plain while nested
 * values (an exercise's `prescribed`, a type's `parameters`) stay proxies.
 *
 * Worse, the failure is delayed and misattributed. The bad value lands in
 * the in-memory `_dbState` fine; the throw only happens on the *next* flush,
 * blamed on whichever unrelated write triggered it, and every write after
 * that keeps failing while the UI still shows the in-memory state as if it
 * had saved. So this is enforced at the boundary rather than trusted to
 * each caller (found 2026-09-21 via `materializeWeek` writing projected
 * sessions built from reactive templates).
 *
 * JSON round-trip rather than `structuredClone`: it is the one deep copy
 * that reads *through* a proxy instead of rejecting it. Every persisted
 * shape is plain JSON data (no Date/Map/Set), so nothing is lost; keys
 * explicitly set to `undefined` are dropped, which is what storage means by
 * absent anyway.
 */
export function toPlain<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

export async function initDB() {
  if (_dbState) return;

  let rawData: any = null;
  let usingNative = Capacitor.isNativePlatform();
  /** What was loaded isn't what's on disk as the database - write it out once loaded. */
  let rewrite = false;

  if (usingNative) {
    const main = await readNativeJson(NATIVE_DB_FILE);
    if (main.status === "ok") {
      rawData = main.data;
    } else {
      // A complete save that was about to be swapped in when the app died.
      const tmp = await readNativeJson(NATIVE_DB_TMP);
      if (tmp.status === "ok") {
        rawData = tmp.data;
        rewrite = true;
      } else if (main.status === "damaged" || tmp.status === "damaged") {
        // A database exists but can't be read. Never start empty over it:
        // that used to happen, and the next save then overwrote the damaged
        // file - which may still have been recoverable - for good. Keep its
        // bytes, and restore the newest backup.
        const damaged = main.status === "damaged" ? main.text : (tmp as { text: string }).text;
        const kept = `boulder_tracker_db.damaged-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        try {
          await Filesystem.writeFile({ path: kept, data: damaged, directory: Directory.Data, encoding: Encoding.UTF8 });
        } catch (err) {
          console.error("Could not keep a copy of the damaged database", err);
        }
        const backup = await readNewestBackup();
        if (backup) {
          rawData = backup.data;
          recoveryNotice = `Your training data file was damaged (most likely the app was closed in the middle of saving), so it was restored from ${backup.label}. Anything logged after that backup is missing. A copy of the damaged file was kept in the app's storage (${kept}).`;
        } else {
          // Current version: the defaults are current-shape, and a missing
          // version would run the whole migration chain over them (see
          // `resolveInitialExportVersion`).
          rawData = { workouts: [], exportVersion: DATA_EXPORT_VERSION };
          recoveryNotice = `Your training data file was damaged (most likely the app was closed in the middle of saving) and no automatic backup was found to restore. A copy of the damaged file was kept in the app's storage (${kept}). If you have an exported backup, import it in Settings → Data.`;
        }
        rewrite = true;
      }
    }
  }

  if (!rawData) {
    rawData = {
      workouts: await localforage.getItem("workouts"),
      trainingBlocks: await localforage.getItem("trainingBlocks"),
      weekOverrides: await localforage.getItem("weekOverrides"),
      weekNotes: await localforage.getItem("weekNotes"),
      planAlternatives: await localforage.getItem("planAlternatives"),
      athleteProfile: await localforage.getItem("athleteProfile"),
      coachNotes: await localforage.getItem("coachNotes"),
      circuits: await localforage.getItem("circuits"),
      // Pre-3.29 key, read so the startup migration can move it into `goals`.
      competitionEvents: await localforage.getItem("competitionEvents"),
      goals: await localforage.getItem("goals"),
      templates: await localforage.getItem("templates"),
      phaseDefs: await localforage.getItem("phaseDefs"),
      exerciseTypes: await localforage.getItem("exerciseTypes"),
      benchmarks: await localforage.getItem("benchmarks"),
      benchmarkTypes: await localforage.getItem("benchmarkTypes"),
      analyticsCategories: await localforage.getItem("analyticsCategories"),
      metricDefs: await localforage.getItem("metricDefs"),
      dailyMetrics: await localforage.getItem("dailyMetrics"),
      painLogs: await localforage.getItem("painLogs"),
      painIssues: await localforage.getItem("painIssues"),
      outdoorAscents: await localforage.getItem("outdoorAscents"),
      settings: await localforage.getItem("settings"),
      valueDefs: await localforage.getItem("valueDefs"),
      exportVersion: await localforage.getItem("database_version"),
    };
  }

  _dbState = {
    workouts: rawData.workouts || [],
    trainingBlocks: rawData.trainingBlocks || [],
    weekOverrides: rawData.weekOverrides || [],
    weekNotes: rawData.weekNotes || [],
    planAlternatives: rawData.planAlternatives || [],
    athleteProfile: rawData.athleteProfile || [],
    coachNotes: rawData.coachNotes || [],
    circuits: rawData.circuits || [],
    ...(rawData.competitionEvents ? { competitionEvents: rawData.competitionEvents } : {}),
    goals: rawData.goals || [],
    templates: rawData.templates || DEFAULT_TEMPLATES,
    phaseDefs: rawData.phaseDefs || DEFAULT_PHASE_DEFS,
    exerciseTypes: rawData.exerciseTypes || DEFAULT_EXERCISE_TYPES,
    benchmarks: rawData.benchmarks || [],
    benchmarkTypes: rawData.benchmarkTypes || DEFAULT_BENCHMARK_TYPES,
    analyticsCategories: rawData.analyticsCategories || DEFAULT_ANALYTICS_CATEGORIES,
    // See constants.ts's DEFAULT_METRIC_DEFS doc comment: fixes a
    // pre-existing gap where a fresh install got zero built-in MetricDefs.
    metricDefs: rawData.metricDefs || DEFAULT_METRIC_DEFS,
    dailyMetrics: rawData.dailyMetrics || [],
    painLogs: rawData.painLogs || [],
    // No `|| []` here: a missing table is how the 3.33 migration knows to
    // build issues from the entries (an empty one would say "already done").
    ...(rawData.painIssues ? { painIssues: rawData.painIssues } : resolveInitialExportVersion(rawData) === DATA_EXPORT_VERSION ? { painIssues: [] } : {}),
    outdoorAscents: rawData.outdoorAscents || [],
    settings: rawData.settings || [],
    valueDefs: rawData.valueDefs || structuredClone(DEFAULT_VALUE_DEFS),
    exportVersion: resolveInitialExportVersion(rawData),
  };
  if (rewrite && !demoMode) await writeNativeFile();
}

export function setDbState(next: any) {
  _dbState = next;
}

let legacyEventsKeyCleared = false;

let nativeWriting: Promise<void> | null = null;
let nativeFollowUp: Promise<void> | null = null;

/**
 * On Android the whole database is one JSON file. Two writes must never
 * run at once - they could finish in either order and leave the older data
 * on disk. So a write that's asked for while one is running waits for it,
 * and every request made in the meantime shares that one follow-up write,
 * which serialises the database as it is when it starts (so it includes
 * all of them). Each caller resolves once its data is on disk.
 */
function writeNativeFile(): Promise<void> {
  if (nativeFollowUp) return nativeFollowUp;
  if (!nativeWriting) return (nativeWriting = startNativeWrite());
  nativeFollowUp = nativeWriting.then(() => {
    nativeFollowUp = null;
    return (nativeWriting = startNativeWrite());
  });
  return nativeFollowUp;
}

async function startNativeWrite(): Promise<void> {
  try {
    // Write the whole file aside, then swap it in: at every moment either
    // the old or the new database is complete on disk (and `initDB` knows
    // to look at the temporary one if the swap didn't finish).
    const data = JSON.stringify(_dbState);
    await Filesystem.writeFile({ path: NATIVE_DB_TMP, data, directory: Directory.Data, encoding: Encoding.UTF8 });
    try {
      await Filesystem.deleteFile({ path: NATIVE_DB_FILE, directory: Directory.Data });
    } catch {
      // Not there yet (first save) - nothing to replace.
    }
    try {
      await Filesystem.rename({ from: NATIVE_DB_TMP, to: NATIVE_DB_FILE, directory: Directory.Data, toDirectory: Directory.Data });
    } catch (err) {
      // The swap failed: write the real file directly rather than leave the
      // save only in the temporary one.
      console.error("Swapping in the saved database failed - writing it directly", err);
      await Filesystem.writeFile({ path: NATIVE_DB_FILE, data, directory: Directory.Data, encoding: Encoding.UTF8 });
    }
  } catch (err) {
    console.error("Failed to write to native Filesystem", err);
    saveErrorListener?.(err);
  } finally {
    nativeWriting = null;
  }
}

/** Every table stored under its own localforage key on the web. */
export const TABLES = [
  "workouts", "trainingBlocks", "weekOverrides", "weekNotes", "planAlternatives", "athleteProfile", "coachNotes", "circuits", "goals", "templates", "phaseDefs",
  "exerciseTypes", "benchmarks", "benchmarkTypes", "analyticsCategories", "metricDefs",
  "dailyMetrics", "painLogs", "painIssues", "outdoorAscents", "settings", "valueDefs",
] as const;
export type TableName = (typeof TABLES)[number];

/**
 * Persists the in-memory database. On native it's one JSON file, so the
 * whole thing is written (see `writeNativeFile`). On the web each table is its own IndexedDB key:
 * pass `tables` to write only what changed - a workout save then writes
 * one key instead of all sixteen, each a structured clone of the table.
 * Without `tables` (migrations, imports, bulk plan writes) everything is.
 */
/**
 * Told about every save, before it's written, with the tables it covers -
 * how sync (`lib/sync/driveSync`) notices local changes without every
 * write path knowing about it. Runs synchronously, so a change is seen the
 * moment it's saved.
 */
let flushListener: ((tables: readonly TableName[]) => void) | null = null;

/**
 * Told when a save didn't reach the disk (full storage, a revoked
 * permission...). Saves used to fail silently - only the console knew,
 * and the screen kept showing data that was never stored. The app shows a
 * message (see main.ts).
 */
let saveErrorListener: ((err: unknown) => void) | null = null;
export function setSaveErrorListener(listener: ((err: unknown) => void) | null) {
  saveErrorListener = listener;
}
export function setFlushListener(listener: ((tables: readonly TableName[]) => void) | null) {
  flushListener = listener;
}

export async function flushDB(tables?: TableName[]) {
  if (!_dbState || demoMode) return;
  flushListener?.(tables ?? TABLES);

  if (Capacitor.isNativePlatform()) {
    await writeNativeFile();
    return;
  }

  try {
    for (const table of tables ?? TABLES) {
      await localforage.setItem(table, _dbState[table]);
    }
  } catch (err) {
    console.error("Failed to save to browser storage", err);
    saveErrorListener?.(err);
    return;
  }
  if (tables) return;
  // The pre-3.29 key: once its events live in `goals` it would only be a
  // stale copy, so it's dropped - once per app run is enough.
  if (!legacyEventsKeyCleared && typeof localforage.removeItem === "function") {
    await localforage.removeItem("competitionEvents");
    legacyEventsKeyCleared = true;
  }
  await localforage.setItem("database_version", _dbState.exportVersion);
}

// Single fixed key/filename so a new backup always overwrites the previous
// one rather than accumulating - the version the backup was taken from is
// stored inside the payload itself instead of the key name.
const MIGRATION_BACKUP_KEY = "backup_pre_migration";
const MIGRATION_BACKUP_FILE = "boulder_tracker_db.backup.json";

export async function writeMigrationBackup(fromVersion: string, data: any): Promise<void> {
  if (demoMode) return;
  const payload = { fromVersion, backedUpAt: new Date().toISOString(), data };
  try {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        path: MIGRATION_BACKUP_FILE,
        data: JSON.stringify(payload),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
    } else {
      await localforage.setItem(MIGRATION_BACKUP_KEY, payload);
    }
  } catch (err) {
    // A failed backup write shouldn't block migration from running - it's a
    // safety net, not a hard dependency - but it should be visible in logs.
    console.error("Failed to write pre-migration backup", err);
  }
}

// --- Undo for the last bulk plan change (see storage.applyPlanWrites) ---
// Kept beside the database, not in it: it's a safety net, not data, and a
// backup export shouldn't carry it.
const PLAN_UNDO_KEY = "plan_undo";
const PLAN_UNDO_FILE = "boulder_tracker_plan_undo.json";

export async function writePlanUndo(record: unknown | null): Promise<void> {
  if (demoMode) return;
  try {
    if (Capacitor.isNativePlatform()) {
      if (record === null) await Filesystem.deleteFile({ path: PLAN_UNDO_FILE, directory: Directory.Data }).catch(() => {});
      else await Filesystem.writeFile({ path: PLAN_UNDO_FILE, data: JSON.stringify(record), directory: Directory.Data, encoding: Encoding.UTF8 });
    } else if (record === null) {
      await localforage.removeItem(PLAN_UNDO_KEY);
    } else {
      await localforage.setItem(PLAN_UNDO_KEY, record);
    }
  } catch (err) {
    console.error("Failed to write the plan undo snapshot", err);
  }
}

export async function readPlanUndo<T>(): Promise<T | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await Filesystem.readFile({ path: PLAN_UNDO_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(res.data as string) as T;
    }
    return ((await localforage.getItem(PLAN_UNDO_KEY)) as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * "Delete all data": everything this app keeps on the device - the
 * training data, its migration backup and plan undo, sync bookkeeping and
 * every preference - so the next start is a fresh install. The caller
 * saves a backup first and reloads afterwards. The weekly auto-backups in
 * Documents/ are left alone: they're the user's files, and the safety net.
 */
export async function wipeAllLocalData(): Promise<void> {
  // First, so a write still queued from before can't recreate the file.
  _dbState = null;
  if (Capacitor.isNativePlatform()) {
    for (const path of [NATIVE_DB_FILE, MIGRATION_BACKUP_FILE, PLAN_UNDO_FILE]) {
      await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});
    }
  }
  await localforage.clear();
  localStorage.clear();
}
