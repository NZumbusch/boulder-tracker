/**
 * The app's one log - the pure part: what an entry is, how entries are
 * added, folded, trimmed, filtered and written out, and how the three logs
 * that came before it (error log, console log, data log) read into it.
 * Keeping and capturing are in `store.ts` and `index.ts`; the why is in
 * docs/logging.md.
 */

/** How much it matters. `debug` is routine (every read, every disk write) and hidden unless asked for. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** What part of the app it is about. */
export type LogArea =
  /** The app itself: started (which build), background/foreground, updates, crashes the app caught. */
  | "app"
  /** What was on screen: tabs, the session viewer, the rating screen. */
  | "screen"
  /** The stored data: loads, saves and what they changed, disk writes, refused changes. */
  | "data"
  /** Drive sync and calendar sync. */
  | "sync"
  /** The live session and logging a session. */
  | "session"
  /** Automatic, safety and pre-update backups. */
  | "backup"
  /** What the console printed (the app's own, Svelte's, a library's), uncaught errors and rejected promises. */
  | "console";

/** Where an error came from, for one that was caught by the app's error handling (and may pop up). */
export type ErrorSource = "uncaught" | "promise" | "console" | "caught";

export interface LogEntry {
  /** ISO time of the (last) occurrence. */
  at: string;
  level: LogLevel;
  area: LogArea;
  msg: string;
  /** The operations running when it happened ("rate and save session", "saveWorkout"), outermost first. */
  ops?: string[];
  /** Repeats folded into this entry. */
  n?: number;
  /** Details kept whole (a session that was refused or deleted, so it can be put back by hand). */
  data?: unknown;
  /** For an error: its stack, and where it was thrown or caught. */
  stack?: string;
  where?: string;
  source?: ErrorSource;
}

export const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];
export const AREAS: readonly LogArea[] = ["app", "screen", "data", "sync", "session", "backup", "console"];

/** Entries kept; past this (plus a margin, so trimming isn't on every entry) the routine ones go first. */
export const LOG_MAX = 20_000;
export const TRIM_MARGIN = 1_000;
/** Identical entries this close together are one entry with a count. */
export const COALESCE_MS = 5_000;
const MSG_MAX = 2_000;
const STACK_MAX = 2_000;

export const isProblem = (e: Pick<LogEntry, "level">) => e.level === "warn" || e.level === "error";

const sameOps = (a?: string[], b?: string[]) => (a ?? []).join("\u0001") === (b ?? []).join("\u0001");

/** An entry made safe to keep: bounded text, plain data. */
export function cleanEntry(e: LogEntry): LogEntry {
  const out: LogEntry = { at: e.at, level: e.level, area: e.area, msg: (e.msg || "(no message)").slice(0, MSG_MAX) };
  if (e.ops?.length) out.ops = e.ops;
  if (e.n && e.n > 1) out.n = e.n;
  if (e.stack) out.stack = e.stack.slice(0, STACK_MAX);
  if (e.where) out.where = e.where;
  if (e.source) out.source = e.source;
  if (e.data !== undefined) {
    try {
      out.data = JSON.parse(JSON.stringify(e.data));
    } catch {
      out.data = String(e.data);
    }
  }
  return out;
}

/**
 * Adds `entry` at the end (oldest first, like a console). A repeat of the
 * last entry - same level, area, message, place and operations, no data,
 * within `COALESCE_MS` - counts on that entry instead. Returns whether it
 * was folded (so a store can rewrite that line instead of adding one).
 */
export function appendEntry(log: LogEntry[], entry: LogEntry): "added" | "folded" {
  const last = log[log.length - 1];
  if (
    last &&
    last.level === entry.level &&
    last.area === entry.area &&
    last.msg === entry.msg &&
    last.where === entry.where &&
    last.data === undefined &&
    entry.data === undefined &&
    sameOps(last.ops, entry.ops) &&
    Date.parse(entry.at) - Date.parse(last.at) <= COALESCE_MS
  ) {
    last.n = (last.n ?? 1) + 1;
    last.at = entry.at;
    return "folded";
  }
  log.push(entry);
  return "added";
}

/**
 * Cuts the log to `max` entries once it is `margin` past it: the oldest
 * debug lines go first, then the oldest info, and warnings and errors only
 * when nothing else is left - so a problem outlives the routine around it.
 * Order is kept. Returns the new list, or the same one when nothing had to go.
 */
export function trimLog(log: LogEntry[], max = LOG_MAX, margin = TRIM_MARGIN): LogEntry[] {
  if (log.length <= max + margin) return log;
  let excess = log.length - max;
  const drop = new Set<number>();
  for (const level of LEVELS) {
    for (let i = 0; i < log.length && excess > 0; i++) {
      if (log[i].level === level) {
        drop.add(i);
        excess--;
      }
    }
    if (excess === 0) break;
  }
  return log.filter((_, i) => !drop.has(i));
}

// --- Reading -------------------------------------------------------------------

export type LogFilter = "problems" | "activity" | "data" | "everything";

/**
 * Which entries a view shows. `problems`: warnings and errors. `activity`:
 * what happened (app, screens, sessions, sync, backups) without routine
 * lines, and every problem. `data`: the stored data's story (loads, saves, disk, guards), reads
 * included. `everything`: all of it, console and routine lines too.
 */
export function matchesFilter(e: LogEntry, filter: LogFilter): boolean {
  switch (filter) {
    case "problems":
      return isProblem(e);
    case "activity":
      return isProblem(e) || (e.level !== "debug" && e.area !== "data" && e.area !== "console");
    case "data":
      return e.area === "data";
    case "everything":
      return true;
  }
}

export function matchesQuery(e: LogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [e.msg, e.area, e.level, e.where, ...(e.ops ?? [])].some((s) => s?.toLowerCase().includes(q));
}

const TAG: Record<LogLevel, string> = { debug: "DBG", info: "INF", warn: "WRN", error: "ERR" };

/** One entry as text: "2026-11-24T18:31:02.120Z WRN data ×2 [rate and save session > saveWorkout] message", details indented below. */
export function formatEntry(e: LogEntry): string {
  const head = [e.at, TAG[e.level], e.area, e.n && e.n > 1 ? `×${e.n}` : "", e.ops?.length ? `[${e.ops.join(" > ")}]` : "", e.where ? `(${e.where})` : ""].filter(Boolean).join(" ");
  const lines = [`${head} ${e.msg}`];
  if (e.stack) lines.push(...e.stack.split("\n").map((l) => `    ${l.trim()}`));
  if (e.data !== undefined) lines.push(`    ${JSON.stringify(e.data)}`);
  return lines.join("\n");
}

// --- Describing values -------------------------------------------------------

/** Any value in a few words: an Error's message, a string as is, the rest as JSON. */
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

/** A console call's arguments as one line, the way the console prints them (`%s`-style placeholders filled, `%c` dropped). */
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

/** A record in a few words: id, status, week, day, date, exercise count - never its content. */
function describeRecord(o: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof o.id === "string" || typeof o.id === "number") parts.push(`id=${o.id}`);
  if (typeof o.status === "string") parts.push(o.status);
  if (typeof o.weekId === "string") parts.push(o.weekId);
  if (typeof o.dayOfWeek === "string") parts.push(o.dayOfWeek.slice(0, 3));
  if (typeof o.date === "string") parts.push(o.date.slice(0, 10));
  if (Array.isArray(o.exercises)) parts.push(`${o.exercises.length} ex`);
  if (parts.length > 0) return `{${parts.join(" ")}}`;
  const keys = Object.keys(o);
  return `{${keys.slice(0, 6).join(",")}${keys.length > 6 ? ",…" : ""}}`;
}

/** A function call's arguments, short: ids and statuses, list lengths, short strings. */
export function describeArgs(args: readonly unknown[]): string {
  return args
    .map((a) => {
      if (a === undefined) return "undefined";
      if (a === null) return "null";
      if (typeof a === "string") return a.length > 60 ? JSON.stringify(`${a.slice(0, 57)}…`) : JSON.stringify(a);
      if (typeof a === "number" || typeof a === "boolean") return String(a);
      if (typeof a === "function") return "fn";
      if (Array.isArray(a)) {
        const records = a.filter((x) => x && typeof x === "object" && "id" in x) as Record<string, unknown>[];
        if (records.length > 0 && records.length <= 3) return `[${records.map(describeRecord).join(", ")}]`;
        return `[${a.length}]`;
      }
      if (typeof a === "object") return describeRecord(a as Record<string, unknown>);
      return typeof a;
    })
    .join(", ")
    .slice(0, 360);
}

// --- The logs before this one --------------------------------------------------

/** An entry of the old error log (localStorage "boulder_tracker_error_log", newest first). */
interface OldError { at: string; level?: "error" | "warning"; source?: ErrorSource; where?: string; message: string; stack?: string; count?: number }
/** A line of the old console log (localStorage "boulder_tracker_console_log"). */
interface OldLine { at: string; level: "debug" | "log" | "info" | "warning" | "error"; message: string }
/** An entry of the old data log (file "boulder_tracker_data_log.jsonl" / IndexedDB "data_log"). */
interface OldData { at: string; kind: string; msg: string; ops?: string[]; n?: number; data?: unknown }

const valid = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { at?: unknown }).at === "string";

/**
 * The three old logs as one, oldest first. Errors and warnings were in both
 * the error log and the console log: the console log's copy is dropped
 * where the error log has the same message within a second.
 */
export function migrateOldLogs(errors: unknown, lines: unknown, data: unknown): LogEntry[] {
  const out: LogEntry[] = [];
  const errs = (Array.isArray(errors) ? errors : []).filter(valid) as unknown as OldError[];
  for (const e of errs) {
    if (typeof e.message !== "string") continue;
    out.push(cleanEntry({ at: e.at, level: e.level === "warning" ? "warn" : "error", area: "console", msg: e.message, ...(e.count && e.count > 1 ? { n: e.count } : {}), ...(e.stack ? { stack: e.stack } : {}), ...(e.where ? { where: e.where } : {}), ...(e.source ? { source: e.source } : {}) }));
  }
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 1000;
  for (const l of (Array.isArray(lines) ? lines : []).filter(valid) as unknown as OldLine[]) {
    if (typeof l.message !== "string") continue;
    const level: LogLevel = l.level === "error" ? "error" : l.level === "warning" ? "warn" : l.level === "debug" ? "debug" : "info";
    if (isProblem({ level }) && errs.some((e) => (e.message === l.message || l.message.endsWith(`: ${e.message}`)) && near(e.at, l.at))) continue;
    out.push(cleanEntry({ at: l.at, level, area: "console", msg: l.message }));
  }
  const KIND: Record<string, { level: LogLevel; area: LogArea }> = {
    load: { level: "info", area: "data" },
    call: { level: "debug", area: "data" },
    write: { level: "info", area: "data" },
    disk: { level: "debug", area: "data" },
    guard: { level: "warn", area: "data" },
    backup: { level: "info", area: "backup" },
    sync: { level: "info", area: "sync" },
    session: { level: "info", area: "session" },
    app: { level: "info", area: "app" },
    error: { level: "error", area: "data" },
  };
  for (const d of (Array.isArray(data) ? data : []).filter(valid) as unknown as OldData[]) {
    if (typeof d.msg !== "string") continue;
    const k = KIND[d.kind] ?? { level: "info", area: "data" };
    const area: LogArea = d.kind === "app" && /^(Screen:|Session (viewer|editor)|Rating screen|Live session (opened|minimised))/.test(d.msg) ? "screen" : k.area;
    out.push(cleanEntry({ at: d.at, level: k.level, area, msg: d.msg, ...(d.ops ? { ops: d.ops } : {}), ...(d.n ? { n: d.n } : {}), ...(d.data !== undefined ? { data: d.data } : {}) }));
  }
  // A stable sort by time keeps each old log's own order for entries of the same moment.
  return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i).map((x) => x.e);
}

// --- Pop-ups -----------------------------------------------------------------------

export type AlertLevel = "off" | "errors" | "all";

/** Whether an error the app caught pops up, by the device setting. */
export function shouldAlert(level: LogLevel, setting: AlertLevel): boolean {
  return setting === "all" ? isProblem({ level }) : setting === "errors" && level === "error";
}
