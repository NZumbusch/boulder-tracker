import { toast } from "./toast.svelte";
import { setSaveErrorListener } from "./storage/persistence";

/**
 * Makes failures visible, and traceable afterwards.
 *
 * Everything the browser console would show as an error or a warning is
 * caught here: uncaught errors, rejected promises, and whatever the app
 * or a library writes with `console.error` / `console.warn` (Svelte's own
 * runtime warnings included). Each goes into a log kept on the device -
 * Settings -> About & Help -> Errors & warnings - because by the time a
 * button that "did nothing" on the phone gets looked at, the console is
 * long gone.
 *
 * Whether one also pops up as it happens is a device setting (off /
 * errors / errors and warnings; errors by default). Popups are rate
 * limited - at most one per second, never the same one twice within a few
 * seconds - so a failure in a loop can't flood the screen. A save that
 * didn't reach the disk always says so.
 */

export type LogLevel = "error" | "warning";
export type LogSource = "uncaught" | "promise" | "console" | "caught";

export interface LoggedError {
  at: string;
  level?: LogLevel; // absent on entries from before warnings were logged: an error
  source?: LogSource;
  where?: string;
  message: string;
  stack?: string;
  /** How many times in a row this same entry happened (1 when absent). */
  count?: number;
}

export type AlertLevel = "off" | "errors" | "all";

export const ERROR_LOG_KEY = "boulder_tracker_error_log";
export const ALERT_LEVEL_KEY = "boulder_tracker_error_alerts";
export const LOG_CHANGED_EVENT = "boulder-tracker:error-log";
const ERROR_LOG_MAX = 100;
const MESSAGE_MAX = 500;
const STACK_MAX = 1500;
const QUIET_MS = 5000;

// --- Pure helpers (tested) ------------------------------------------------

export function describe(value: unknown): string {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

/** A console call's arguments as one line, the way the console prints them (`%s`-style placeholders dropped). */
export function formatConsoleArgs(args: unknown[]): string {
  const [first, ...rest] = args;
  if (typeof first === "string" && /%[sdifoOc]/.test(first)) {
    let i = 0;
    const text = first.replace(/%[sdifoOc]/g, (m) => (m === "%c" ? (i++, "") : i < rest.length ? describe(rest[i++]) : m));
    return [text, ...rest.slice(i).map(describe)].join(" ").trim();
  }
  return args.map(describe).join(" ").trim();
}

/** The first Error among a console call's arguments, for its stack. */
export function firstError(args: unknown[]): Error | undefined {
  return args.find((a): a is Error => a instanceof Error);
}

/** Adds an entry newest-first; a repeat of the newest one bumps its count instead of taking a row. */
export function addEntry(log: LoggedError[], entry: LoggedError, max = ERROR_LOG_MAX): LoggedError[] {
  const top = log[0];
  if (top && top.message === entry.message && (top.level ?? "error") === (entry.level ?? "error") && top.where === entry.where) {
    return [{ ...top, at: entry.at, count: (top.count ?? 1) + 1 }, ...log.slice(1)];
  }
  return [entry, ...log].slice(0, max);
}

export function shouldAlert(level: LogLevel, setting: AlertLevel): boolean {
  return setting === "all" || (setting === "errors" && level === "error");
}

// --- The device log -------------------------------------------------------

let memory: LoggedError[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

export function readErrorLog(): LoggedError[] {
  if (memory) return memory;
  try {
    const parsed = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) ?? "[]");
    memory = Array.isArray(parsed) ? parsed : [];
  } catch {
    memory = [];
  }
  return memory;
}

export function clearErrorLog() {
  memory = [];
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
  } catch {
    // Nothing to clear.
  }
  announce();
}

/**
 * Tells an open log view there's something new - at most every 250 ms, so
 * a chatty console can't keep it redrawing (or loop, if a redraw logged).
 */
let announceTimer: ReturnType<typeof setTimeout> | undefined;
function announce() {
  if (typeof window === "undefined" || announceTimer) return;
  announceTimer = setTimeout(() => {
    announceTimer = undefined;
    window.dispatchEvent(new Event(LOG_CHANGED_EVENT));
  }, 250);
}

/** Written shortly after, not on every entry - a warning in a render loop mustn't hammer storage. */
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    try {
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(memory ?? []));
    } catch {
      // A full or unavailable localStorage must not turn one error into two.
    }
  }, 500);
}

function flushNow() {
  if (fullFlushTimer) {
    clearTimeout(fullFlushTimer);
    fullFlushTimer = undefined;
    writeFull();
  }
  if (!flushTimer) return;
  clearTimeout(flushTimer);
  flushTimer = undefined;
  try {
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(memory ?? []));
  } catch {
    // As above.
  }
}

export function readAlertLevel(): AlertLevel {
  try {
    const v = localStorage.getItem(ALERT_LEVEL_KEY);
    return v === "off" || v === "all" ? v : "errors";
  } catch {
    return "errors";
  }
}

export function setAlertLevel(level: AlertLevel) {
  try {
    localStorage.setItem(ALERT_LEVEL_KEY, level);
  } catch {
    // Stays at the default.
  }
}

// --- The full console log -----------------------------------------------
//
// Every line the console gets (log, info, debug, warnings, errors) and
// every uncaught error, in order - the last FULL_LOG_MAX of them, kept on
// the device like the error log, for reading the whole story around a
// problem (Settings -> About & Help -> Errors & warnings -> Full log).

export type ConsoleLevel = "debug" | "log" | "info" | "warning" | "error";
export interface ConsoleLine {
  at: string;
  level: ConsoleLevel;
  message: string;
}
export const FULL_LOG_KEY = "boulder_tracker_console_log";
const FULL_LOG_MAX = 500;
const LINE_MAX = 1000;

let fullMemory: ConsoleLine[] | null = null;
let fullFlushTimer: ReturnType<typeof setTimeout> | undefined;

export function readFullLog(): ConsoleLine[] {
  if (fullMemory) return fullMemory;
  try {
    const parsed = JSON.parse(localStorage.getItem(FULL_LOG_KEY) ?? "[]");
    fullMemory = Array.isArray(parsed) ? parsed : [];
  } catch {
    fullMemory = [];
  }
  return fullMemory;
}

export function clearFullLog() {
  fullMemory = [];
  try {
    localStorage.removeItem(FULL_LOG_KEY);
  } catch {
    // Nothing to clear.
  }
  announce();
}

/** Oldest first, newest last - the order a console reads in. */
export function appendLine(log: ConsoleLine[], line: ConsoleLine, max = FULL_LOG_MAX): ConsoleLine[] {
  const next = log.length >= max ? log.slice(log.length - max + 1) : log.slice();
  next.push(line);
  return next;
}

function writeFull() {
  try {
    localStorage.setItem(FULL_LOG_KEY, JSON.stringify(fullMemory ?? []));
  } catch {
    // A full localStorage: the in-memory log still works.
  }
}

function line(level: ConsoleLevel, message: string) {
  fullMemory = appendLine(readFullLog(), { at: new Date().toISOString(), level, message: message.slice(0, LINE_MAX) });
  if (!fullFlushTimer) {
    fullFlushTimer = setTimeout(() => {
      fullFlushTimer = undefined;
      writeFull();
    }, 1000);
  }
}

// --- Recording ------------------------------------------------------------

let lastShownAt = 0;
let lastMessage = "";
/** Set while this module is itself writing, so nothing it does is caught again. */
let recording = false;

function record(level: LogLevel, source: LogSource, message: string, stack?: string, where?: string) {
  if (recording) return;
  recording = true;
  try {
    const entry: LoggedError = {
      at: new Date().toISOString(),
      level,
      source,
      ...(where ? { where } : {}),
      message: message.slice(0, MESSAGE_MAX) || "(no message)",
      ...(stack ? { stack: stack.slice(0, STACK_MAX) } : {}),
    };
    memory = addEntry(readErrorLog(), entry);
    // Console lines were added to the full log by the console hook itself.
    if (source !== "console") line(level, where ? `${where}: ${entry.message}` : entry.message);
    scheduleFlush();
    announce();
    if (shouldAlert(level, readAlertLevel())) popup(level, entry.message);
  } catch {
    // Reporting must never be the thing that breaks.
  } finally {
    recording = false;
  }
}

function popup(level: LogLevel, message: string) {
  const short = message.slice(0, 140);
  const now = Date.now();
  if (now - lastShownAt < QUIET_MS && (short === lastMessage || now - lastShownAt < 1000)) return;
  lastShownAt = now;
  lastMessage = short;
  toast.show(level === "error" ? `Something went wrong: ${short}` : `Warning: ${short}`);
}

/** Shows and logs an error something caught itself (an error boundary, a fallback path). */
export function reportError(err: unknown, where?: string) {
  record("error", "caught", describe(err), err instanceof Error ? err.stack : undefined, where);
}

let installed = false;

export function installErrorReporting() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  setSaveErrorListener((err) => {
    toast.show(`Couldn't save your last change (${describe(err).slice(0, 80)}). If your phone's storage is full, free some up; export a backup to be safe.`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    record("error", "promise", describe(e.reason), e.reason instanceof Error ? e.reason.stack : undefined);
  });
  window.addEventListener("error", (e) => {
    // Resource load errors (an image, an icon) aren't failures of the app.
    if (!(e.error instanceof Error) && !e.message) return;
    const where = e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : undefined;
    record("error", "uncaught", describe(e.error ?? e.message), e.error instanceof Error ? e.error.stack : undefined, where);
  });
  // The console itself: still prints as before, and is logged too -
  // every level into the full log, errors and warnings also into the
  // error log (and maybe a popup).
  for (const [method, level] of [["error", "error"], ["warn", "warning"], ["log", "log"], ["info", "info"], ["debug", "debug"]] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      if (recording) return;
      const text = formatConsoleArgs(args);
      try {
        line(level, text);
      } catch {
        // Never break the caller's console call.
      }
      if (level === "error" || level === "warning") record(level, "console", text, firstError(args)?.stack);
      else announce();
    };
  }
  // The app going away (killed, backgrounded) writes what's pending.
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
}
