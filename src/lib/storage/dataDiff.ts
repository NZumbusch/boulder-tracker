import { hashOf, tableToMap } from "../sync/merge";

/**
 * What a save changed, and the guard for logged sessions - the pure part of
 * `dataWatch.ts`, which runs both on every save and writes the result to the
 * log (lib/log).
 */

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
