import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import localforage from "localforage";
import { appendEntry, describeArgs, formatEntry, DATA_LOG_MAX, type DataLogEntry, type DataLogKind } from "./dataLog";

/**
 * Keeps the data log (see `dataLog.ts`) on the device, apart from the
 * database: on Android a file of its own (one JSON entry per line, added
 * to rather than rewritten), on the web its own IndexedDB key. Nothing
 * that rolls the database back can take the log with it, "Delete all
 * data" leaves the Android file alone, and a backup never carries it.
 *
 * Also tracks which operations are running (`dataOp`), so every entry
 * says what it happened inside: "finish session > saveWorkout". Labels of
 * operations that overlap in time (two awaits in flight) can mix; the
 * order of entries is still exact.
 *
 * Recording never throws and never waits: entries are written in batches
 * a moment later, and at once when the app is hidden or closed.
 */

const LOG_FILE = "boulder_tracker_data_log.jsonl";
const LOG_KEY = "data_log";
const WRITE_DELAY_MS = 1500;
/** The file is rewritten (only the newest entries kept) once it holds this many more lines than the log keeps. */
const FILE_SLACK = 5_000;

let log: DataLogEntry[] = [];
/** Entries to add to the file; an entry already written that got a new count is re-added with `r` (replaces the line before). */
let pending: { entry: DataLogEntry; replace: boolean }[] = [];
let linesOnDisk = 0;
let loaded: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> = Promise.resolve();
let disabled = false;
const listeners = new Set<() => void>();

// --- Operations ----------------------------------------------------------------

interface Op {
  label: string;
  allowUnlog?: boolean;
}
const active: Op[] = [];

/**
 * Runs `fn` as a named operation: entries recorded meanwhile carry its
 * label. `allowUnlog` lets a save inside it turn logged sessions into
 * planned ones (restoring a backup does that on purpose).
 */
export async function dataOp<T>(label: string, fn: () => Promise<T> | T, opts: { allowUnlog?: boolean } = {}): Promise<T> {
  const op: Op = { label, ...opts };
  active.push(op);
  try {
    return await fn();
  } finally {
    const i = active.indexOf(op);
    if (i !== -1) active.splice(i, 1);
  }
}

export const currentOps = (): string[] => active.map((o) => o.label);
export const unlogAllowed = (): boolean => active.some((o) => o.allowUnlog);

// --- Recording -----------------------------------------------------------------

const native = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Adds an entry. Safe to call from anywhere, any time - before the log is loaded too. */
export function recordData(kind: DataLogKind, msg: string, data?: unknown, opts: { force?: boolean; bare?: boolean } = {}): void {
  // `force`: recorded even while the example data is open (a save of your own data lost meanwhile must show).
  if (disabled && !opts.force) return;
  try {
    // `bare`: not part of whatever operation happens to be running (the app's own life).
    const ops = opts.bare ? [] : currentOps();
    const entry: DataLogEntry = { at: new Date().toISOString(), kind, msg, ...(ops.length ? { ops } : {}), ...(data !== undefined ? { data: JSON.parse(JSON.stringify(data)) } : {}) };
    const last = log[log.length - 1];
    appendEntry(log, entry);
    if (log[log.length - 1] === last && last) {
      // Folded into the last entry: re-add it only if its line is already written.
      if (!pending.some((p) => p.entry === last)) pending.push({ entry: last, replace: true });
    } else {
      pending.push({ entry, replace: false });
    }
    schedule();
    for (const l of listeners) l();
  } catch {
    // The log must never break what it watches.
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flushDataLog();
  }, WRITE_DELAY_MS);
}

/** Writes what's pending now (also called when the app is hidden). */
export function flushDataLog(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  writing = writing.then(writePending, writePending);
  return writing;
}

async function writePending(): Promise<void> {
  if (disabled) return;
  await loadDataLog();
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  try {
    if (native()) {
      if (linesOnDisk + batch.length > DATA_LOG_MAX + FILE_SLACK) {
        await Filesystem.writeFile({ path: LOG_FILE, data: toLines(log.map((entry) => ({ entry, replace: false }))), directory: Directory.Data, encoding: Encoding.UTF8 });
        linesOnDisk = log.length;
      } else {
        await Filesystem.appendFile({ path: LOG_FILE, data: toLines(batch), directory: Directory.Data, encoding: Encoding.UTF8 });
        linesOnDisk += batch.length;
      }
    } else {
      await localforage.setItem(LOG_KEY, log);
    }
  } catch {
    // Kept for the next try; a log that can't be written must not become an error loop.
    pending = [...batch, ...pending];
  }
}

const toLines = (items: { entry: DataLogEntry; replace: boolean }[]) =>
  items.map(({ entry, replace }) => JSON.stringify(replace ? { ...entry, r: 1 } : entry)).join("\n") + "\n";

/** Reads the file's lines back into entries: a line with `r` replaces the one before it; broken lines are skipped. */
export function parseLogLines(text: string): DataLogEntry[] {
  const out: DataLogEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const { r, ...entry } = JSON.parse(line);
      if (typeof entry.at !== "string" || typeof entry.kind !== "string" || typeof entry.msg !== "string") continue;
      if (r && out.length) out[out.length - 1] = entry;
      else out.push(entry);
    } catch {
      // A line cut off when the app was killed mid-write.
    }
  }
  return out;
}

/** Loads what's on the device in front of what was recorded since the app started. Once. */
export function loadDataLog(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    let stored: DataLogEntry[] = [];
    try {
      if (native()) {
        const res = await Filesystem.readFile({ path: LOG_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
        const text = typeof res.data === "string" ? res.data : "";
        stored = parseLogLines(text);
        linesOnDisk = text.split("\n").filter((l) => l.trim()).length;
      } else {
        const v = await localforage.getItem(LOG_KEY);
        stored = Array.isArray(v) ? (v as DataLogEntry[]) : [];
      }
    } catch {
      stored = [];
    }
    log = [...stored, ...log];
    if (log.length > DATA_LOG_MAX) log.splice(0, log.length - DATA_LOG_MAX);
  })();
  return loaded;
}

/**
 * `target` with every call of its functions logged (name and a short form
 * of the arguments, reads too) and run as an operation of that name, so
 * the saves it makes are attributed to it. Functions whose name starts
 * with "_" are the object's own plumbing and are left out: the call that
 * used them is already in the log.
 */
/** Storage functions that only read, by name. */
export const isRead = (name: string): boolean => /^(get|read|list|has|is|plan[A-Z])/.test(name);

export function logCalls<T extends object>(target: T): T {
  const wrapped = new WeakMap<Function, Function>();
  return new Proxy(target, {
    get(obj, key, receiver) {
      const value = Reflect.get(obj, key, receiver);
      if (typeof value !== "function" || typeof key !== "string" || key.startsWith("_")) return value;
      let w = wrapped.get(value);
      if (!w) {
        w = function (this: unknown, ...args: unknown[]) {
          recordData("call", `${key}(${describeArgs(args)})`);
          // A read is just logged: reads run many at a time (the app loads every table at once), and as operations
          // their labels would pile up on each other's entries. Changes are operations: the saves they make carry the name.
          const run = isRead(key) ? async () => value.apply(this, args) : () => dataOp(key, () => value.apply(this, args));
          return run().catch((err: unknown) => {
            recordData("error", `${key} failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`);
            throw err;
          });
        };
        wrapped.set(value, w);
      }
      return w;
    },
  });
}

// --- The app's own life ------------------------------------------------------

let installed = false;

/**
 * Called once at start (main.ts): records which build is running, and from
 * then on the app going to the background, coming back and closing - so the
 * log shows when the app was away or killed between two entries. The log
 * is written at once whenever the app is hidden.
 */
export function installDataLog(info: { version: string; commit: string; dataVersion: string }): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const platform = native() ? `Android app` : "browser";
  recordData("app", `App started: version ${info.version}${info.commit ? ` (${info.commit.slice(0, 7)})` : ""}, data ${info.dataVersion}, ${platform}; ${navigator.userAgent.slice(0, 160)}`, undefined, { bare: true });
  void loadDataLog();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      recordData("app", "App in the background", undefined, { bare: true });
      void flushDataLog();
    } else {
      recordData("app", "App back in front", undefined, { bare: true });
    }
  });
  window.addEventListener("pagehide", () => {
    recordData("app", "App closing", undefined, { bare: true });
    void flushDataLog();
  });
}

// --- Reading -------------------------------------------------------------------

/** The whole log, oldest first. */
export async function readDataLog(): Promise<DataLogEntry[]> {
  await loadDataLog();
  return log;
}

/** The log as text, oldest first. */
export async function dataLogText(): Promise<string> {
  return (await readDataLog()).map(formatEntry).join("\n");
}

export async function clearDataLog(): Promise<void> {
  await loadDataLog();
  await writing;
  log = [];
  pending = [];
  try {
    if (native()) await Filesystem.writeFile({ path: LOG_FILE, data: "", directory: Directory.Data, encoding: Encoding.UTF8 });
    else await localforage.removeItem(LOG_KEY);
    linesOnDisk = 0;
  } catch {
    // Nothing to do: the next write starts the file again.
  }
  recordData("load", "Data log cleared");
}

/** Called on every new entry (the Settings card re-reads). */
export function onDataLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The example data and tests: nothing is recorded meanwhile. */
export function setDataLogDisabled(value: boolean): void {
  disabled = value;
}

/** Tests only: forget everything in memory. */
export function resetDataLogForTests(): void {
  log = [];
  pending = [];
  linesOnDisk = 0;
  loaded = null;
  disabled = false;
  installed = false;
  active.length = 0;
  if (timer) clearTimeout(timer);
  timer = undefined;
  writing = Promise.resolve();
}
