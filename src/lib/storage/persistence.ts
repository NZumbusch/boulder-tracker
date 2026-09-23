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

export let _dbState: any = null;

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

  if (usingNative) {
    try {
      const res = await Filesystem.readFile({
        path: "boulder_tracker_db.json",
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      rawData = JSON.parse(res.data as string);
    } catch (e) {
      // File doesn't exist yet
    }
  }

  if (!rawData) {
    rawData = {
      workouts: await localforage.getItem("workouts"),
      trainingBlocks: await localforage.getItem("trainingBlocks"),
      weekOverrides: await localforage.getItem("weekOverrides"),
      weekNotes: await localforage.getItem("weekNotes"),
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
      outdoorAscents: await localforage.getItem("outdoorAscents"),
      exportVersion: await localforage.getItem("database_version"),
    };
  }

  _dbState = {
    workouts: rawData.workouts || [],
    trainingBlocks: rawData.trainingBlocks || [],
    weekOverrides: rawData.weekOverrides || [],
    weekNotes: rawData.weekNotes || [],
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
    outdoorAscents: rawData.outdoorAscents || [],
    exportVersion: resolveInitialExportVersion(rawData),
  };
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
    await Filesystem.writeFile({
      path: "boulder_tracker_db.json",
      data: JSON.stringify(_dbState),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
  } catch (err) {
    console.error("Failed to write to native Filesystem", err);
  } finally {
    nativeWriting = null;
  }
}

/** Every table stored under its own localforage key on the web. */
const TABLES = [
  "workouts", "trainingBlocks", "weekOverrides", "weekNotes", "goals", "templates", "phaseDefs",
  "exerciseTypes", "benchmarks", "benchmarkTypes", "analyticsCategories", "metricDefs",
  "dailyMetrics", "painLogs", "outdoorAscents",
] as const;
export type TableName = (typeof TABLES)[number];

/**
 * Persists the in-memory database. On native it's one JSON file, so the
 * whole thing is written (see `writeNativeFile`). On the web each table is its own IndexedDB key:
 * pass `tables` to write only what changed - a workout save then writes
 * one key instead of all sixteen, each a structured clone of the table.
 * Without `tables` (migrations, imports, bulk plan writes) everything is.
 */
export async function flushDB(tables?: TableName[]) {
  if (!_dbState) return;

  if (Capacitor.isNativePlatform()) {
    await writeNativeFile();
    return;
  }

  for (const table of tables ?? TABLES) {
    await localforage.setItem(table, _dbState[table]);
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

// --- Undo for the last AI plan change (see storage.applyPlanWrites) ---
// Kept beside the database, not in it: it's a safety net, not data, and a
// backup export shouldn't carry it.
const AI_UNDO_KEY = "ai_undo";
const AI_UNDO_FILE = "boulder_tracker_ai_undo.json";

export async function writeAiUndo(record: unknown | null): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      if (record === null) await Filesystem.deleteFile({ path: AI_UNDO_FILE, directory: Directory.Data }).catch(() => {});
      else await Filesystem.writeFile({ path: AI_UNDO_FILE, data: JSON.stringify(record), directory: Directory.Data, encoding: Encoding.UTF8 });
    } else if (record === null) {
      await localforage.removeItem(AI_UNDO_KEY);
    } else {
      await localforage.setItem(AI_UNDO_KEY, record);
    }
  } catch (err) {
    console.error("Failed to write the AI undo snapshot", err);
  }
}

export async function readAiUndo<T>(): Promise<T | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await Filesystem.readFile({ path: AI_UNDO_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(res.data as string) as T;
    }
    return ((await localforage.getItem(AI_UNDO_KEY)) as T) ?? null;
  } catch {
    return null;
  }
}
