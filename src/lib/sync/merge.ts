/**
 * Record-level sync between devices - the pure part (no storage, no Drive).
 *
 * Each device keeps a **ledger**: for every record of every table, a hash
 * of its content, when it last changed, on which device, and whether it
 * was deleted. The ledger is updated from the tables themselves whenever
 * they're saved (`trackTable`), so nothing that edits data has to know
 * about sync.
 *
 * Each device uploads a **doc**: its whole database as ledger entries with
 * their values (`buildDoc`). Syncing merges every other device's doc into
 * the local tables (`mergeDoc`), record by record:
 *
 * - only one side has the record, or both have the same content: nothing
 *   to decide;
 * - otherwise the newer change wins (a deletion is a change too, so a
 *   delete after an edit deletes, an edit after a delete brings it back);
 * - when *both* sides changed it since this device last synced, that's a
 *   conflict: the newer still wins, and the other version is returned so
 *   the app can say so and keep it restorable.
 *
 * Time 0 marks data that existed before sync was switched on (its real age
 * is unknown). Between two such versions the first sync of a device takes
 * Drive's - joining an existing setup adopts it - and after that a device
 * keeps its own, so two devices never swap back and forth.
 */

export interface LedgerEntry {
  /** Content hash ("" for a deletion). */
  h: string;
  /** When it last changed (epoch ms; 0 = before sync was on). */
  t: number;
  /** The device that made that change. */
  o: string;
  del?: true;
}
export type Ledger = Record<string, Record<string, LedgerEntry>>;

export interface DocEntry extends LedgerEntry {
  /** The record itself (absent for a deletion). */
  v?: unknown;
}

export const SYNC_DOC_FORMAT = 1;

export interface SyncDoc {
  format: number;
  deviceId: string;
  deviceName: string;
  writtenAt: number;
  exportVersion: string;
  tables: Record<string, Record<string, DocEntry>>;
}

export interface SyncConflict {
  table: string;
  key: string;
  /** What the record is, for people ("Session · 12 Sep"). */
  label: string;
  /** When the conflict was found. */
  at: number;
  kept: { device: string; t: number };
  /** The version that lost - restorable. `deleted` if the losing change was a delete. */
  lost: { device: string; t: number; deleted: boolean; value?: unknown };
}

/** Tables keyed by something other than `id`. */
const KEY_FIELD: Record<string, string> = { weekOverrides: "weekId", weekNotes: "weekId" };
/** Tables that are an object of arrays rather than an array: each property is one record. */
const OBJECT_TABLES = new Set(["templates"]);

// --- Hashing ---------------------------------------------------------------

/** JSON with sorted keys, so the same content always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** cyrb53 - a fast 53-bit string hash; plenty to tell edits apart. */
export function hashOf(value: unknown): string {
  const str = stableStringify(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// --- Tables as keyed records ------------------------------------------------

/** A table's records by key, in their stored order. */
export function tableToMap(table: string, value: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (OBJECT_TABLES.has(table)) {
    for (const [k, v] of Object.entries((value as Record<string, unknown>) ?? {})) map.set(k, v);
    return map;
  }
  const field = KEY_FIELD[table] ?? "id";
  for (const record of Array.isArray(value) ? value : []) {
    const raw = (record as Record<string, unknown> | null)?.[field];
    // A record without a key can't be matched across devices; it's keyed by its content instead.
    const key = typeof raw === "string" || typeof raw === "number" ? String(raw) : `#${hashOf(record)}`;
    map.set(key, record);
  }
  return map;
}

/** Back to the stored shape: records keep the order `previous` had, new ones follow. */
export function mapToTable(table: string, map: Map<string, unknown>, previous: unknown): unknown {
  if (OBJECT_TABLES.has(table)) return Object.fromEntries(map);
  const order = [...tableToMap(table, previous).keys()].filter((k) => map.has(k));
  const seen = new Set(order);
  for (const k of map.keys()) if (!seen.has(k)) order.push(k);
  return order.map((k) => map.get(k));
}

// --- Merging one record field by field ---------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const same = (a: unknown, b: unknown) => a === b || stableStringify(a) === stableStringify(b);

/** An array whose items are all objects with a distinct string `id`: its items can be merged one by one. */
function byId(list: unknown): Map<string, Record<string, unknown>> | null {
  if (!Array.isArray(list)) return null;
  const map = new Map<string, Record<string, unknown>>();
  for (const item of list) {
    if (!isObj(item) || typeof item.id !== "string" || map.has(item.id)) return null;
    map.set(item.id, item);
  }
  return map;
}

/**
 * A three-way merge, the way git does it. `base` is what both sides started
 * from; a side that didn't touch a field takes the other's change, and
 * objects and id-keyed lists are merged piece by piece. Only a field both
 * sides changed differently (or a delete against an edit) is a collision:
 * `prefer` decides it ("local" or "remote", normally the newer edit) and
 * `collided` says it happened.
 */
export function mergeValues(base: unknown, local: unknown, remote: unknown, prefer: "local" | "remote"): { value: unknown; collided: boolean } {
  if (same(local, remote)) return { value: local, collided: false };
  if (same(base, local)) return { value: remote, collided: false };
  if (same(base, remote)) return { value: local, collided: false };
  const pick = (): { value: unknown; collided: boolean } => ({ value: prefer === "local" ? local : remote, collided: true });

  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, unknown> = {};
    let collided = false;
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const r = mergeValues(b[key], local[key], remote[key], prefer);
      if (r.collided) collided = true;
      if (r.value !== undefined) out[key] = r.value;
    }
    return { value: out, collided };
  }

  const l = byId(local);
  const r = byId(remote);
  if (l && r) {
    const b = byId(base) ?? new Map<string, Record<string, unknown>>();
    const merged = new Map<string, unknown>();
    let collided = false;
    for (const id of new Set([...l.keys(), ...r.keys()])) {
      const [li, ri, bi] = [l.get(id), r.get(id), b.get(id)];
      if (li && ri) {
        const m = mergeValues(bi, li, ri, prefer);
        if (m.collided) collided = true;
        merged.set(id, m.value);
      } else if (!bi) {
        merged.set(id, li ?? ri); // added on one side only
      } else {
        // Gone on one side. Untouched on the other: it stays gone. Edited there: the delete wins, and that is reported.
        const kept = (li ?? ri)!;
        if (!same(bi, kept)) collided = true;
      }
    }
    // Order: the side that reordered wins; with no reordering (or both), the local one, then new remote items.
    const order = (list: Map<string, unknown>) => [...list.keys()].filter((id) => merged.has(id));
    const baseIds = [...b.keys()];
    const localIds = order(l);
    const remoteIds = order(r);
    const kept = (ids: string[]) => ids.filter((id) => b.has(id));
    const localMoved = !same(kept(localIds), baseIds.filter((id) => l.has(id)));
    const remoteMoved = !same(kept(remoteIds), baseIds.filter((id) => r.has(id)));
    const first = remoteMoved && !localMoved ? remoteIds : localIds;
    const second = first === remoteIds ? localIds : remoteIds;
    const ids = [...new Set([...first, ...second])];
    return { value: ids.map((id) => merged.get(id)), collided };
  }
  return pick();
}

// --- Tracking local changes -------------------------------------------------

/**
 * Brings the ledger up to date with a table as it now is: new or changed
 * records get `now`, records that are gone become deletions. Returns
 * whether anything changed (i.e. whether there's something to upload).
 */
export function trackTable(ledger: Ledger, table: string, value: unknown, now: number, deviceId: string): boolean {
  const entries = (ledger[table] ??= {});
  let changed = false;
  const seen = new Set<string>();
  for (const [key, record] of tableToMap(table, value)) {
    seen.add(key);
    const h = hashOf(record);
    const entry = entries[key];
    if (!entry || entry.del || entry.h !== h) {
      entries[key] = { h, t: now, o: deviceId };
      changed = true;
    }
  }
  for (const [key, entry] of Object.entries(entries)) {
    if (!seen.has(key) && !entry.del) {
      entries[key] = { h: "", t: now, o: deviceId, del: true };
      changed = true;
    }
  }
  return changed;
}

/** A ledger for data that existed before sync was switched on: everything at time 0. */
export function initLedger(tables: Record<string, unknown>, tableNames: readonly string[], deviceId: string): Ledger {
  const ledger: Ledger = {};
  for (const table of tableNames) trackTable(ledger, table, tables[table], 0, deviceId);
  return ledger;
}

// --- Docs -------------------------------------------------------------------

export function buildDoc(
  tables: Record<string, unknown>,
  ledger: Ledger,
  tableNames: readonly string[],
  meta: { deviceId: string; deviceName: string; writtenAt: number; exportVersion: string },
): SyncDoc {
  const docTables: SyncDoc["tables"] = {};
  for (const table of tableNames) {
    const values = tableToMap(table, tables[table]);
    const out: Record<string, DocEntry> = {};
    for (const [key, entry] of Object.entries(ledger[table] ?? {})) {
      if (entry.del) out[key] = { ...entry };
      else if (values.has(key)) out[key] = { ...entry, v: values.get(key) };
    }
    docTables[table] = out;
  }
  return { format: SYNC_DOC_FORMAT, ...meta, tables: docTables };
}

// --- Merging ----------------------------------------------------------------

export interface MergeContext {
  /** When this device last finished a sync (0 = never). */
  lastSyncAt: number;
  /** This device's first sync: between two pre-sync versions, take the other device's. */
  firstSync: boolean;
  now: number;
  /** This device's id, stamped on the records it merges. */
  deviceId?: string;
  /**
   * The record as both devices last agreed on it - this device's own last
   * upload - or undefined when there isn't one. With it, a record both sides
   * changed is merged field by field; without it, the newer edit wins whole.
   */
  baseOf?: (table: string, key: string) => unknown;
  /** Names a record for the conflict list. */
  labelOf?: (table: string, value: unknown) => string;
}

/** Which side wins between two different versions of one record. */
function remoteWins(local: LedgerEntry, remote: LedgerEntry, firstSync: boolean): boolean {
  if (local.t === 0 && remote.t === 0) return firstSync;
  if (remote.t !== local.t) return remote.t > local.t;
  // Same instant on two devices: any fixed rule works, as long as both devices apply the same one.
  return remote.o > local.o;
}

/**
 * Merges one other device's doc into `tables` and `ledger` (both mutated).
 * Returns the tables whose content changed and any conflicts.
 */
export function mergeDoc(
  tables: Record<string, unknown>,
  ledger: Ledger,
  doc: SyncDoc,
  tableNames: readonly string[],
  ctx: MergeContext,
): { changedTables: string[]; conflicts: SyncConflict[] } {
  const changedTables: string[] = [];
  const conflicts: SyncConflict[] = [];
  const label = ctx.labelOf ?? defaultLabel;

  for (const table of tableNames) {
    const remote = doc.tables[table];
    if (!remote) continue;
    const entries = (ledger[table] ??= {});
    const map = tableToMap(table, tables[table]);
    let changed = false;

    for (const [key, r] of Object.entries(remote)) {
      const l = entries[key];
      const remoteEntry: LedgerEntry = r.del ? { h: "", t: r.t, o: r.o, del: true } : { h: r.h, t: r.t, o: r.o };
      if (!l) {
        entries[key] = remoteEntry;
        if (!r.del) {
          map.set(key, r.v);
          changed = true;
        }
        continue;
      }
      const same = (l.del && r.del) || (!l.del && !r.del && l.h === r.h);
      if (same) continue;

      const takeRemote = remoteWins(l, r, ctx.firstSync);
      const bothChanged = l.t > ctx.lastSyncAt && r.t > ctx.lastSyncAt && l.o !== r.o;
      const localValue = map.get(key);

      // Both devices edited it: try to join the two versions instead of picking one.
      const base = bothChanged && !l.del && !r.del ? ctx.baseOf?.(table, key) : undefined;
      if (base !== undefined) {
        const joined = mergeValues(base, localValue, r.v, takeRemote ? "remote" : "local");
        // A new version of the record that contains both edits; it is newer than either, so every device converges on it.
        // Only fields both sides changed differently go to the newer edit - and are reported, with the other whole version restorable.
        if (joined.collided) {
          const winner = takeRemote ? r : l;
          const loser = takeRemote ? l : r;
          conflicts.push({
            table,
            key,
            label: label(table, localValue ?? r.v),
            at: ctx.now,
            kept: { device: winner.o, t: winner.t },
            lost: { device: loser.o, t: loser.t, deleted: false, value: takeRemote ? localValue : r.v },
          });
        }
        map.set(key, joined.value);
        entries[key] = { h: hashOf(joined.value), t: ctx.now, o: ctx.deviceId ?? l.o };
        changed = true;
        continue;
      }
      if (bothChanged) {
        const winner = takeRemote ? r : l;
        const loser = takeRemote ? l : r;
        conflicts.push({
          table,
          key,
          label: label(table, localValue ?? r.v),
          at: ctx.now,
          kept: { device: winner.o, t: winner.t },
          lost: { device: loser.o, t: loser.t, deleted: !!loser.del, value: loser.del ? undefined : takeRemote ? localValue : r.v },
        });
      }
      if (!takeRemote) continue;
      entries[key] = remoteEntry;
      if (r.del) map.delete(key);
      else map.set(key, r.v);
      changed = true;
    }

    if (changed) {
      tables[table] = mapToTable(table, map, tables[table]);
      changedTables.push(table);
    }
  }
  return { changedTables, conflicts };
}

const TABLE_NOUN: Record<string, string> = {
  workouts: "Session",
  trainingBlocks: "Training block",
  weekOverrides: "Week plan",
  weekNotes: "Week note",
  planAlternatives: "Plan B",
  athleteProfile: "About me",
  coachNotes: "Coach note",
  circuits: "Circuit",
  goals: "Goal",
  templates: "Phase templates",
  phaseDefs: "Phase",
  exerciseTypes: "Exercise",
  benchmarks: "Benchmark result",
  benchmarkTypes: "Benchmark",
  analyticsCategories: "Category",
  metricDefs: "Metric",
  dailyMetrics: "Daily metric",
  painLogs: "Pain entry",
  painIssues: "Pain issue",
  outdoorAscents: "Send",
  settings: "Settings group",
  valueDefs: "Value type",
};

/** "Session · Board session · 2026-09-12" - the table's noun, then a name and a date if the record has them. */
export function defaultLabel(table: string, value: unknown): string {
  const noun = TABLE_NOUN[table] ?? table;
  if (!value || typeof value !== "object") return noun;
  const v = value as Record<string, unknown>;
  const name = [v.name, v.notes, v.title, v.metricId, v.bodyPart, v.weekId].find((x) => typeof x === "string" && x.trim());
  const date = typeof v.date === "string" ? v.date.slice(0, 10) : undefined;
  return [noun, name as string | undefined, date].filter(Boolean).join(" · ");
}

/** "3.29" vs "3.4": numeric per part. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
