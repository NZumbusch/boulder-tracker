import { hashOf, tableToMap } from "../sync/merge";

/**
 * The data log: a trail of everything that touches the stored data - every
 * storage call (reads too), every save with what it changed record by
 * record, every write to disk and whether it worked, the database being
 * loaded, sync merges, the live session, guards that refused a change and
 * safety backups. It exists so that "my session is gone" can be traced
 * afterwards (it couldn't be, once: docs/data-safety-plan.md).
 *
 * This file is the pure part (no storage, no clock): entries, coalescing,
 * describing arguments and diffs, and the guard that keeps a logged
 * session from being turned back into a planned one. `dataLogStore.ts`
 * keeps the log on the device; `dataWatch.ts` runs the diff and guard on
 * every save.
 */

export type DataLogKind =
  /** The database was read from disk at start. */
  | "load"
  /** A storage function was called (reads included). */
  | "call"
  /** A save: what changed, table by table. */
  | "write"
  /** The write to disk itself: done (size, time) or failed. */
  | "disk"
  /** A change was refused to protect logged data. */
  | "guard"
  /** A safety backup was written (or couldn't be). */
  | "backup"
  /** Drive sync or calendar sync. */
  | "sync"
  /** The live session: started, kept on the device, finished, discarded. */
  | "session"
  /** The app itself: started (which version), went to the background, came back, closed; the screen shown. */
  | "app"
  /** Something failed. */
  | "error";

export interface DataLogEntry {
  /** ISO time of the (last) occurrence. */
  at: string;
  kind: DataLogKind;
  msg: string;
  /** The operations running when it happened ("finish session", "sync"), outermost first. */
  ops?: string[];
  /** Repeats folded into this entry (see `appendEntry`). */
  n?: number;
  /** Details kept whole: a session that was refused or removed, so it can be put back by hand. */
  data?: unknown;
}

/** Entries kept on the device; the oldest go first. */
export const DATA_LOG_MAX = 20_000;
/** Identical entries this close together are folded into one with a count. */
export const COALESCE_MS = 5_000;

const sameOps = (a?: string[], b?: string[]) => (a ?? []).join("\u0001") === (b ?? []).join("\u0001");

/**
 * Adds `entry` to the end of `log` (mutated, and returned). A repeat of the
 * last entry - same kind, message and operations, no data, within
 * `COALESCE_MS` - bumps that entry's count instead, so a read done many
 * times in a row is one line. Beyond `max` the oldest entries go.
 */
export function appendEntry(log: DataLogEntry[], entry: DataLogEntry, max = DATA_LOG_MAX): DataLogEntry[] {
  const last = log[log.length - 1];
  if (
    last &&
    last.kind === entry.kind &&
    last.msg === entry.msg &&
    last.data === undefined &&
    entry.data === undefined &&
    sameOps(last.ops, entry.ops) &&
    Date.parse(entry.at) - Date.parse(last.at) <= COALESCE_MS
  ) {
    last.n = (last.n ?? 1) + 1;
    last.at = entry.at;
    return log;
  }
  log.push(entry);
  if (log.length > max) log.splice(0, log.length - max);
  return log;
}

/** One entry as a line of text, for copying and sharing. */
export function formatEntry(e: DataLogEntry): string {
  const count = e.n && e.n > 1 ? ` ×${e.n}` : "";
  const ops = e.ops?.length ? ` [${e.ops.join(" > ")}]` : "";
  const data = e.data === undefined ? "" : `\n    ${JSON.stringify(e.data)}`;
  return `${e.at} ${e.kind.toUpperCase()}${count}${ops} ${e.msg}${data}`;
}

// --- Describing what a storage call was given --------------------------------

const MAX_ARG = 120;

/** A session or other record in a few words: its id, and its status and day when it has them. */
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

/** A storage call's arguments, short: ids and statuses, list lengths, short strings - never whole records. */
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
    .slice(0, MAX_ARG * 3);
}

// --- What a save changed -----------------------------------------------------

/** What is remembered of a table between saves: each record's content hash (and a session's status). */
export type TableSnapshot = Map<string, { h: string; status?: string }>;

export function snapshotTable(table: string, value: unknown): TableSnapshot {
  const snap: TableSnapshot = new Map();
  for (const [key, record] of tableToMap(table, value)) {
    const status = (record as { status?: unknown } | null)?.status;
    snap.set(key, { h: hashOf(record), ...(typeof status === "string" ? { status } : {}) });
  }
  return snap;
}

export interface TableDiff {
  added: string[];
  changed: string[];
  removed: string[];
  /** Records whose `status` changed (a session logged, or turned back). */
  statusChanges: { key: string; from?: string; to?: string }[];
}

export function diffTable(before: TableSnapshot, after: TableSnapshot): TableDiff {
  const diff: TableDiff = { added: [], changed: [], removed: [], statusChanges: [] };
  for (const [key, now] of after) {
    const was = before.get(key);
    if (!was) {
      diff.added.push(key);
      continue;
    }
    if (was.h !== now.h) diff.changed.push(key);
    if (was.status !== now.status) diff.statusChanges.push({ key, from: was.status, to: now.status });
  }
  for (const key of before.keys()) if (!after.has(key)) diff.removed.push(key);
  return diff;
}

export const isEmptyDiff = (d: TableDiff) => d.added.length + d.changed.length + d.removed.length === 0;

/** Tables whose records are named one by one in the log; the big ones are only counted. */
const NAMED_TABLES = new Set(["workouts", "dismissedSessions", "trainingBlocks", "painLogs", "benchmarks", "outdoorAscents", "planAlternatives", "goals", "weekNotes", "coachNotes"]);
const NAMES_MAX = 25;

const names = (keys: string[]) => (keys.length > NAMES_MAX ? `${keys.slice(0, NAMES_MAX).join(", ")} …+${keys.length - NAMES_MAX}` : keys.join(", "));

/** A save of one table in a line: "+1 ~2 -0", the records by key where that's readable, and every status change. */
export function describeDiff(table: string, d: TableDiff, size: number): string {
  const head = `${table}: +${d.added.length} ~${d.changed.length} -${d.removed.length} (now ${size})`;
  const parts: string[] = [];
  if (NAMED_TABLES.has(table)) {
    if (d.added.length) parts.push(`added ${names(d.added)}`);
    const changedOnly = d.changed.filter((k) => !d.statusChanges.some((s) => s.key === k));
    if (changedOnly.length) parts.push(`changed ${names(changedOnly)}`);
    if (d.removed.length) parts.push(`removed ${names(d.removed)}`);
  }
  if (d.statusChanges.length) parts.push(`status ${d.statusChanges.map((s) => `${s.key} ${s.from ?? "-"}→${s.to ?? "-"}`).join(", ")}`);
  return parts.length ? `${head}; ${parts.join("; ")}` : head;
}

// --- The guard ---------------------------------------------------------------

interface SessionLike {
  id: string;
  status?: string;
}

export interface GuardResult<W extends SessionLike> {
  /** The sessions to store: what was given, with every refused change undone. */
  workouts: W[];
  /** What was refused: the session as it was kept, and the version that would have replaced it. */
  blocked: { id: string; kept: W; attempted: W }[];
}

/**
 * Nothing in the app turns a logged session back into a planned one: a
 * save that would is a bug somewhere (a stale copy written back, a merge
 * gone wrong), and it costs a session nobody can log again. So it is
 * refused here, at the last step before the disk, whatever made it.
 *
 * `logged` holds the completed sessions as last stored. A session in it
 * that comes back `planned` is put back as it was; a second row with a
 * logged session's id (a planned copy beside it) is dropped. A logged
 * session that is gone altogether is let through - deleting one is a real
 * action - and is the caller's to log. `allowUnlog` lets everything
 * through: restoring a backup replaces the data on purpose.
 */
export function guardWorkouts<W extends SessionLike>(logged: ReadonlyMap<string, W>, next: readonly W[], allowUnlog = false): GuardResult<W> {
  if (allowUnlog || logged.size === 0) return { workouts: [...next], blocked: [] };
  const blocked: GuardResult<W>["blocked"] = [];
  const completedIds = new Set(next.filter((w) => w.status === "completed").map((w) => w.id));
  const out: W[] = [];
  const restored = new Set<string>();
  for (const w of next) {
    const kept = logged.get(w.id);
    if (!kept || w.status === "completed") {
      out.push(w);
      continue;
    }
    blocked.push({ id: w.id, kept, attempted: w });
    // The logged version is already in the list, or was put back for an earlier copy: this copy just goes.
    if (completedIds.has(w.id) || restored.has(w.id)) continue;
    restored.add(w.id);
    out.push(kept);
  }
  return { workouts: out, blocked };
}
