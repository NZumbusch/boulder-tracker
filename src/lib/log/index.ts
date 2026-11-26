import { toast } from "../toast.svelte";
import { cleanEntry, describe, describeArgs, firstError, formatConsoleArgs, isProblem, shouldAlert, type AlertLevel, type ErrorSource, type LogArea, type LogEntry, type LogLevel } from "./entry";
import { addToLog, flushLog, loadLog, logSoFar } from "./store";

/**
 * The app's one log (docs/logging.md). Everything that is worth knowing
 * afterwards goes here: what the app did with your data, sync, sessions,
 * screens, backups, the app's own life, and everything the console printed
 * or threw. Settings → About & Help → Log shows it, and shares it as a file.
 *
 *   log.info("sync", "Drive sync done: ...")
 *   log.warn("data", "Refused to ...", { data: { kept, attempted } })
 *   await logOp("rate and save session", () => save())   // entries inside carry the label
 *
 * Levels: `debug` routine (every read and disk write; hidden unless asked
 * for), `info` what happened, `warn` something was refused or went wrong
 * and was handled, `error` something failed.
 */

export type { LogEntry, LogLevel, LogArea, LogFilter, AlertLevel } from "./entry";
export { readLog, clearLog, onLog, flushLog, loadLog } from "./store";
export { describe, formatEntry, matchesFilter, matchesQuery, isProblem } from "./entry";

export interface LogOptions {
  /** Details kept whole (a refused session, so it can be put back). */
  data?: unknown;
  /** Not part of whatever operation is running (the app's own life). */
  bare?: boolean;
  /** Recorded even while the example data is open. */
  force?: boolean;
  stack?: string;
  where?: string;
  source?: ErrorSource;
}

let paused = false;

function write(level: LogLevel, area: LogArea, msg: string, opts: LogOptions = {}): void {
  if (paused && !opts.force) return;
  try {
    const ops = opts.bare ? [] : currentOps();
    addToLog(cleanEntry({ at: new Date().toISOString(), level, area, msg, ...(ops.length ? { ops } : {}), ...(opts.data !== undefined ? { data: opts.data } : {}), ...(opts.stack ? { stack: opts.stack } : {}), ...(opts.where ? { where: opts.where } : {}), ...(opts.source ? { source: opts.source } : {}) }));
  } catch {
    // Logging must never be what breaks.
  }
}

export const log = {
  debug: (area: LogArea, msg: string, opts?: LogOptions) => write("debug", area, msg, opts),
  info: (area: LogArea, msg: string, opts?: LogOptions) => write("info", area, msg, opts),
  warn: (area: LogArea, msg: string, opts?: LogOptions) => write("warn", area, msg, opts),
  error: (area: LogArea, msg: string, opts?: LogOptions) => write("error", area, msg, opts),
};

/** While the example data is open nothing is logged (what's done to it isn't your data's story) - except `force`d entries. */
export function setLogPaused(value: boolean): void {
  paused = value;
}

// --- Operations ----------------------------------------------------------------

interface Op {
  label: string;
  allowUnlog?: boolean;
}
const active: Op[] = [];

/**
 * Runs `fn` as a named operation: entries made meanwhile carry its label.
 * `allowUnlog` lets a save inside it turn logged sessions back into planned
 * ones (restoring a backup does that on purpose; see storage/dataWatch).
 * Overlapping operations (two awaits in flight) can mix labels; the order of
 * entries is always exact.
 */
export async function logOp<T>(label: string, fn: () => Promise<T> | T, opts: { allowUnlog?: boolean } = {}): Promise<T> {
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

/** Functions that only read, by name. */
export const isRead = (name: string): boolean => /^(get|read|list|has|is|plan[A-Z])/.test(name);

/**
 * `target` with every call of its functions logged (`area`, debug): name and a
 * short form of the arguments. One that changes data also runs as an
 * operation of that name, so its saves are attributed to it; a read is only
 * logged (reads run many at once, and their labels would pile up). Names
 * starting with "_" are the object's own plumbing and are left out.
 */
export function logCalls<T extends object>(target: T, area: LogArea): T {
  const wrapped = new WeakMap<Function, Function>();
  return new Proxy(target, {
    get(obj, key, receiver) {
      const value = Reflect.get(obj, key, receiver);
      if (typeof value !== "function" || typeof key !== "string" || key.startsWith("_")) return value;
      let w = wrapped.get(value);
      if (!w) {
        w = function (this: unknown, ...args: unknown[]) {
          log.debug(area, `${key}(${describeArgs(args)})`);
          const run = isRead(key) ? async () => value.apply(this, args) : () => logOp(key, () => value.apply(this, args));
          return run().catch((err: unknown) => {
            log.error(area, `${key} failed: ${describe(err).slice(0, 300)}`, { stack: err instanceof Error ? err.stack : undefined });
            throw err;
          });
        };
        wrapped.set(value, w);
      }
      return w;
    },
  });
}

// --- Errors the app catches, and pop-ups ---------------------------------------------

export const ALERT_LEVEL_KEY = "boulder_tracker_error_alerts";

export function readAlertLevel(): AlertLevel {
  try {
    const v = localStorage.getItem(ALERT_LEVEL_KEY);
    return v === "off" || v === "all" ? v : "errors";
  } catch {
    return "errors";
  }
}

export function setAlertLevel(level: AlertLevel): void {
  try {
    localStorage.setItem(ALERT_LEVEL_KEY, level);
  } catch {
    // Stays at the default.
  }
}

const QUIET_MS = 5000;
let lastShownAt = 0;
let lastShown = "";

/** Pops up an error or warning as a message, by the setting - at most one a second, never the same one twice in a few seconds. */
function popup(level: LogLevel, message: string): void {
  if (!shouldAlert(level, readAlertLevel())) return;
  const short = message.slice(0, 140);
  const now = Date.now();
  if (now - lastShownAt < QUIET_MS && (short === lastShown || now - lastShownAt < 1000)) return;
  lastShownAt = now;
  lastShown = short;
  toast.show(level === "error" ? `Something went wrong: ${short}` : `Warning: ${short}`);
}

/** Set while the console hook is itself recording, so nothing it does is caught again. */
let capturing = false;

/** An error the app's error handling caught (thrown, rejected, printed): logged, and maybe popped up. */
function caught(level: "warn" | "error", source: ErrorSource, message: string, stack?: string, where?: string): void {
  if (capturing) return;
  capturing = true;
  try {
    log[level]("console", message, { stack, where, source, force: true });
    popup(level, message);
  } finally {
    capturing = false;
  }
}

/** Logs and shows an error something caught itself (an error boundary, a fallback path). */
export function reportError(err: unknown, where?: string): void {
  caught("error", "caught", describe(err), err instanceof Error ? err.stack : undefined, where);
}

/** The newest problems (warnings and errors), newest first - for a bug report. */
export async function recentProblems(max = 5): Promise<LogEntry[]> {
  await loadLog();
  return [...logSoFar()].filter(isProblem).slice(-max).reverse();
}

// --- Capture -----------------------------------------------------------------------

let installed = false;

/**
 * Called once at start (main.ts): records which build started, catches
 * uncaught errors, rejected promises and every console line, and notes the
 * app going to the background, coming back and closing - so a gap between
 * two entries says whether the app was away or killed. The log is written
 * at once whenever the app is hidden.
 */
export function installLogging(info: { version: string; commit: string; dataVersion: string; native: boolean }): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  log.info("app", `App started: version ${info.version}${info.commit ? ` (${info.commit.slice(0, 7)})` : ""}, data ${info.dataVersion}, ${info.native ? "Android app" : "browser"}; ${navigator.userAgent.slice(0, 160)}`, { bare: true, force: true });
  void loadLog();

  window.addEventListener("unhandledrejection", (e) => {
    caught("error", "promise", describe(e.reason), e.reason instanceof Error ? e.reason.stack : undefined);
  });
  window.addEventListener("error", (e) => {
    // A resource that didn't load (an image, an icon) isn't a failure of the app.
    if (!(e.error instanceof Error) && !e.message) return;
    const where = e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : undefined;
    caught("error", "uncaught", describe(e.error ?? e.message), e.error instanceof Error ? e.error.stack : undefined, where);
  });

  // The console still prints as before, and every line is logged too; errors and warnings may pop up.
  for (const [method, level] of [["error", "error"], ["warn", "warn"], ["log", "info"], ["info", "info"], ["debug", "debug"]] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      if (capturing) return;
      const text = formatConsoleArgs(args);
      if (level === "error" || level === "warn") caught(level, "console", text, firstError(args)?.stack);
      else log[level]("console", text, { force: true });
    };
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      log.info("app", "App in the background", { bare: true, force: true });
      void flushLog();
    } else {
      log.info("app", "App back in front", { bare: true, force: true });
    }
  });
  window.addEventListener("pagehide", () => {
    log.info("app", "App closing", { bare: true, force: true });
    void flushLog();
  });
}

/** Tests only. */
export function resetLogForTests(): void {
  paused = false;
  active.length = 0;
  installed = false;
  lastShownAt = 0;
  lastShown = "";
}
