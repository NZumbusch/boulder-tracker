import { toast } from "./toast.svelte";
import { setSaveErrorListener } from "./storage/persistence";

/**
 * Makes failures visible. Errors nobody caught used to vanish into the
 * console, so a broken button looked like one that "does nothing" (the
 * session viewer's Delete did exactly that for days). Now:
 *
 *  - a save that didn't reach the disk says so, every time;
 *  - any other uncaught error or rejected promise shows a short message -
 *    at most one per few seconds, and never the same one twice in a row
 *    within that time, so a failure in a loop can't flood the screen.
 */
const QUIET_MS = 5000;
let lastShownAt = 0;
let lastMessage = "";

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * The last few errors, kept on the device (Settings -> About & Help) so a
 * button that "did nothing" on the phone can be traced afterwards - the
 * console is gone by the time anyone looks.
 */
export const ERROR_LOG_KEY = "boulder_tracker_error_log";
const ERROR_LOG_MAX = 20;
export interface LoggedError {
  at: string;
  where?: string;
  message: string;
  stack?: string;
}

export function readErrorLog(): LoggedError[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearErrorLog() {
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
  } catch {
    // Nothing to clear.
  }
}

function logError(err: unknown, where?: string) {
  try {
    const entry: LoggedError = {
      at: new Date().toISOString(),
      ...(where ? { where } : {}),
      message: describe(err).slice(0, 300),
      ...(err instanceof Error && err.stack ? { stack: err.stack.slice(0, 1200) } : {}),
    };
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify([entry, ...readErrorLog()].slice(0, ERROR_LOG_MAX)));
  } catch {
    // A full or unavailable localStorage must not turn one error into two.
  }
}

/** Shows and logs an error something caught itself (an error boundary, a fallback path). */
export function reportError(err: unknown, where?: string) {
  report(err, where);
}

function report(err: unknown, where?: string) {
  logError(err, where);
  const message = describe(err).slice(0, 140);
  const now = Date.now();
  if (now - lastShownAt < QUIET_MS && (message === lastMessage || now - lastShownAt < 1000)) return;
  lastShownAt = now;
  lastMessage = message;
  toast.show(`Something went wrong: ${message}`);
}

export function installErrorReporting() {
  if (typeof window === "undefined") return;
  setSaveErrorListener((err) => {
    toast.show(`Couldn't save your last change (${describe(err).slice(0, 80)}). If your phone's storage is full, free some up; export a backup to be safe.`);
  });
  window.addEventListener("unhandledrejection", (e) => report(e.reason));
  window.addEventListener("error", (e) => {
    // Resource load errors (an image, an icon) aren't failures of the app.
    if (!(e.error instanceof Error) && !e.message) return;
    report(e.error ?? e.message);
  });
}
