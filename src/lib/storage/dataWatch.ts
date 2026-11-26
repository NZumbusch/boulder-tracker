import { describeDiff, diffTable, guardWorkouts, isEmptyDiff, snapshotTable, type TableSnapshot } from "./dataDiff";
import { log, unlogAllowed } from "../log";

/**
 * Runs on every save, just before the data goes to disk (`flushDB`):
 * compares each saved table with how it was last stored, logs what changed
 * record by record, and refuses to let a logged session become a planned
 * one (`guardWorkouts`). Being at the last step, it sees every writer -
 * a screen, Drive sync, calendar sync, the AI, undo, a migration - not
 * only the ones that remember to log.
 */

interface SessionRow {
  id: string;
  status?: string;
  date?: string | null;
  weekId?: string;
  dayOfWeek?: string;
  notes?: string;
}

export interface GuardEvent {
  id: string;
  /** For people: "Mon 23 Nov · Heavy Day". */
  label: string;
}

/** Tables only counted, not hashed record by record: big, and only ever written by an import that logs itself. */
const KEYS_ONLY = new Set(["garminArchive"]);

let snapshots = new Map<string, TableSnapshot>();
let logged = new Map<string, SessionRow>();
let guardListener: ((events: GuardEvent[]) => void) | null = null;

/** The app reacts to a refused change (reloads the sessions, says so). */
export function setGuardListener(fn: ((events: GuardEvent[]) => void) | null): void {
  guardListener = fn;
}

function snap(table: string, value: unknown): TableSnapshot {
  if (!KEYS_ONLY.has(table)) return snapshotTable(table, value);
  const out: TableSnapshot = new Map();
  for (const r of Array.isArray(value) ? value : []) {
    const key = (r as { id?: unknown })?.id;
    if (typeof key === "string") out.set(key, { h: "" });
  }
  return out;
}

const countOf = (value: unknown) => (Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : 0);

function rememberLogged(workouts: unknown) {
  logged = new Map();
  for (const w of Array.isArray(workouts) ? (workouts as SessionRow[]) : []) if (w?.status === "completed" && typeof w.id === "string") logged.set(w.id, w);
}

export function sessionLabel(w: SessionRow | undefined): string {
  if (!w) return "a session";
  const day = w.date ? new Date(w.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : [w.weekId, w.dayOfWeek?.slice(0, 3)].filter(Boolean).join(" ");
  return [day, w.notes].filter(Boolean).join(" · ") || w.id;
}

/** The database as it was read from disk (or replaced in memory): what the next save is compared with. */
export function watchLoaded(db: Record<string, unknown>, tables: readonly string[], source: string): void {
  try {
    snapshots = new Map(tables.map((t) => [t, snap(t, db[t])]));
    rememberLogged(db.workouts);
    const workouts = Array.isArray(db.workouts) ? (db.workouts as SessionRow[]) : [];
    log.info("data", `${source}: data ${String(db.exportVersion ?? "?")}, ${workouts.length} sessions (${logged.size} logged), ${tables.filter((t) => countOf(db[t]) > 0).map((t) => `${t} ${countOf(db[t])}`).join(", ")}`);
  } catch (err) {
    log.error("data", `Could not read the loaded data for the log: ${String(err)}`);
  }
}

/**
 * Called by `flushDB` with the tables it is about to write. Guards the
 * sessions (repairing `db.workouts` in place), then logs each table's
 * changes and takes them as the new state.
 */
export function beforeFlush(db: Record<string, unknown>, tables: readonly string[]): void {
  try {
    if (tables.includes("workouts") && Array.isArray(db.workouts)) {
      const { workouts, blocked } = guardWorkouts(logged, db.workouts as SessionRow[], unlogAllowed());
      if (blocked.length > 0) {
        db.workouts = workouts;
        for (const b of blocked) {
          log.warn("data", `Refused to turn logged session ${b.id} (${sessionLabel(b.kept)}) back into a planned one; the logged version was kept`, { data: { kept: b.kept, attempted: b.attempted } });
        }
        const seen = new Set<string>();
        const events = blocked.filter((b) => !seen.has(b.id) && seen.add(b.id)).map((b) => ({ id: b.id, label: sessionLabel(b.kept) }));
        queueMicrotask(() => guardListener?.(events));
      }
    }
    for (const table of tables) {
      const value = db[table];
      const before = snapshots.get(table) ?? new Map();
      const after = snap(table, value);
      const diff = diffTable(before, after);
      snapshots.set(table, after);
      if (isEmptyDiff(diff)) continue;
      log.info("data", describeDiff(table, diff, countOf(value)));
      if (table === "workouts") {
        for (const id of diff.removed) {
          const was = logged.get(id);
          if (was) log.info("data", `Logged session ${id} (${sessionLabel(was)}) was deleted; kept here in full`, { data: was });
        }
      }
    }
    if (tables.includes("workouts")) rememberLogged(db.workouts);
  } catch (err) {
    log.error("data", `The save check failed: ${String(err)}`);
  }
}

/** Tests only. */
export function resetDataWatchForTests(): void {
  snapshots = new Map();
  logged = new Map();
  guardListener = null;
}
