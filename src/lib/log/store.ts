import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import localforage from "localforage";
import { appendEntry, migrateOldLogs, trimLog, LOG_MAX, TRIM_MARGIN, type LogEntry } from "./entry";

/**
 * Keeps the log on the device, apart from the data: on Android a file of
 * its own with one JSON entry per line (added to, and only rewritten when
 * trimmed); on the web one IndexedDB key. Nothing that rolls the data back
 * takes the log with it, "Delete all data" leaves the Android file, and a
 * backup or sync never carries it.
 *
 * Entries are written a moment after they are made, in batches, and at once
 * when the app is hidden or closed. Writing never throws: a log that can't
 * be stored keeps working in memory.
 *
 * The first load moves the three logs that came before into this one
 * (`migrateOldLogs`) and deletes them.
 */

export const LOG_FILE = "boulder_tracker_log.jsonl";
const LOG_KEY = "app_log";
const WRITE_DELAY_MS = 1500;

// The logs before this one (docs/logging.md).
const OLD_ERROR_KEY = "boulder_tracker_error_log";
const OLD_CONSOLE_KEY = "boulder_tracker_console_log";
const OLD_DATA_FILE = "boulder_tracker_data_log.jsonl";
const OLD_DATA_KEY = "data_log";

let log: LogEntry[] = [];
/** What to add to the file: new entries, and entries already written that got a new count (`r`: replaces the line before). */
let pending: { entry: LogEntry; replace: boolean }[] = [];
let rewrite = false;
let linesOnDisk = 0;
let loaded: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

const native = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Adds a ready entry (see `index.ts` for making one). Never throws, never waits. */
export function addToLog(entry: LogEntry): void {
  try {
    const last = log[log.length - 1];
    if (appendEntry(log, entry) === "folded") {
      if (!pending.some((p) => p.entry === last)) pending.push({ entry: last, replace: true });
    } else {
      pending.push({ entry, replace: false });
    }
    const trimmed = trimLog(log);
    if (trimmed !== log) {
      log = trimmed;
      rewrite = true;
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
    void flushLog();
  }, WRITE_DELAY_MS);
}

/** Writes what's pending now. */
export function flushLog(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  writing = writing.then(writePending, writePending);
  return writing;
}

const toLines = (items: { entry: LogEntry; replace: boolean }[]) =>
  items.map(({ entry, replace }) => JSON.stringify(replace ? { ...entry, r: 1 } : entry)).join("\n") + (items.length ? "\n" : "");

async function writePending(): Promise<void> {
  await loadLog();
  if (pending.length === 0 && !rewrite) return;
  const batch = pending;
  const whole = rewrite || linesOnDisk + batch.length > LOG_MAX + TRIM_MARGIN * 2;
  pending = [];
  rewrite = false;
  try {
    if (native()) {
      if (whole) {
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
    // Kept for the next try.
    pending = [...batch, ...pending];
    if (whole) rewrite = true;
  }
}

/** The file's lines back into entries: a line with `r` replaces the one before it; a cut-off line is skipped. */
export function parseLogLines(text: string): LogEntry[] {
  const out: LogEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const { r, ...entry } = JSON.parse(line);
      if (typeof entry.at !== "string" || typeof entry.level !== "string" || typeof entry.area !== "string" || typeof entry.msg !== "string") continue;
      if (r && out.length) out[out.length - 1] = entry;
      else out.push(entry);
    } catch {
      // A line cut off when the app was killed mid-write.
    }
  }
  return out;
}

/** The old logs, if any are still on the device - read, then deleted (their entries go into this log). */
async function takeOldLogs(): Promise<LogEntry[]> {
  const json = (key: string) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      return null;
    }
  };
  let errors: unknown = null;
  let lines: unknown = null;
  let data: unknown = null;
  try {
    if (typeof localStorage !== "undefined") {
      errors = json(OLD_ERROR_KEY);
      lines = json(OLD_CONSOLE_KEY);
    }
    if (native()) {
      try {
        const res = await Filesystem.readFile({ path: OLD_DATA_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
        data = parseOldDataLines(typeof res.data === "string" ? res.data : "");
      } catch {
        data = null;
      }
    } else {
      data = await localforage.getItem(OLD_DATA_KEY);
    }
  } catch {
    return [];
  }
  if (errors === null && lines === null && data === null) return [];
  const moved = migrateOldLogs(errors, lines, data);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(OLD_ERROR_KEY);
      localStorage.removeItem(OLD_CONSOLE_KEY);
    }
    if (native()) await Filesystem.deleteFile({ path: OLD_DATA_FILE, directory: Directory.Data }).catch(() => {});
    else await localforage.removeItem(OLD_DATA_KEY);
  } catch {
    // Read twice at worst.
  }
  return moved;
}

/** The old data log's lines (`r` replaces the line before). */
function parseOldDataLines(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const { r, ...entry } = JSON.parse(line);
      if (r && out.length) out[out.length - 1] = entry;
      else out.push(entry);
    } catch {
      // Cut off.
    }
  }
  return out;
}

/** Loads what's on the device in front of what was recorded since start (and moves the old logs in). Once. */
export function loadLog(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    let stored: LogEntry[] = [];
    try {
      if (native()) {
        const res = await Filesystem.readFile({ path: LOG_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
        const text = typeof res.data === "string" ? res.data : "";
        stored = parseLogLines(text);
        linesOnDisk = text.split("\n").filter((l) => l.trim()).length;
      } else {
        const v = await localforage.getItem(LOG_KEY);
        stored = Array.isArray(v) ? (v as LogEntry[]) : [];
      }
    } catch {
      stored = [];
    }
    const moved = await takeOldLogs();
    if (moved.length) rewrite = true;
    log = trimLog([...moved, ...stored, ...log], LOG_MAX, 0);
    if (moved.length) schedule();
  })();
  return loaded;
}

/** The whole log, oldest first. */
export async function readLog(): Promise<LogEntry[]> {
  await loadLog();
  return log;
}

/** What is in memory now (before the device's part is loaded, only this run's entries). */
export function logSoFar(): readonly LogEntry[] {
  return log;
}

export async function clearLog(): Promise<void> {
  await loadLog();
  await writing;
  log = [];
  pending = [];
  rewrite = false;
  try {
    if (native()) await Filesystem.writeFile({ path: LOG_FILE, data: "", directory: Directory.Data, encoding: Encoding.UTF8 });
    else await localforage.removeItem(LOG_KEY);
    linesOnDisk = 0;
  } catch {
    // The next write starts the file again.
  }
  for (const l of listeners) l();
}

/** Called on every new entry. */
export function onLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tests only. */
export function resetLogStoreForTests(): void {
  log = [];
  pending = [];
  rewrite = false;
  linesOnDisk = 0;
  loaded = null;
  if (timer) clearTimeout(timer);
  timer = undefined;
  writing = Promise.resolve();
  listeners.clear();
}
