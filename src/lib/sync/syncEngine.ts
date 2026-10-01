/**
 * One sync run: read the other devices' docs from Drive, merge them into
 * the local data, upload this device's doc. Storage and Drive come in as
 * ports, so the whole round trip is testable with a fake Drive and two
 * fake devices (`syncEngine.test.ts`).
 *
 * Every device writes only its own file (`device-<id>.json`), so two
 * devices syncing at the same moment can't overwrite each other's upload -
 * no locking, no server. See `merge.ts` for how records are merged.
 */
import {
  buildDoc, compareVersions, hashOf, mapToTable, mergeDoc, tableToMap,
  SYNC_DOC_FORMAT, type Ledger, type SyncConflict, type SyncDoc,
} from "./merge";

export interface DriveFile {
  id: string;
  name: string;
}

/** The app's private Drive folder (appDataFolder). */
export interface SyncTransport {
  list(): Promise<DriveFile[]>;
  read(fileId: string): Promise<string>;
  /** Creates the file, or overwrites `fileId`. */
  write(name: string, content: string, fileId?: string): Promise<DriveFile>;
}

/** This device's data, as the engine needs it. */
export interface LocalPort {
  /** The tables as they are now (the engine copies them). */
  tables(): Record<string, unknown>;
  ledger(): Ledger;
  exportVersion(): string;
  /** Bumped by every local change; a sync that saw it move starts over rather than overwrite the change. */
  generation(): number;
  /**
   * Stores the merged result: the ledger, and the tables named in
   * `changed`. Must take the new state synchronously before its first
   * await, so no edit can slip in between the engine's generation check
   * and the write.
   */
  apply(tables: Record<string, unknown>, changed: string[], ledger: Ledger): Promise<void>;
  /** Brings a database object from an older app version up to date (runDataMigrations). */
  migrate(db: Record<string, unknown>): void;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  writtenAt: number;
}

export interface SyncOutcome {
  /** When this run started - the next run's "last synced". */
  syncedAt: number;
  conflicts: SyncConflict[];
  changedTables: string[];
  /** The other devices, as of their last upload. */
  devices: DeviceInfo[];
}

/** Another device runs a newer version of the app; syncing would feed this one data it can't read. */
export class SyncVersionError extends Error {
  constructor(readonly remoteVersion: string, readonly device: string) {
    super(`${device} uses a newer version of the app (data ${remoteVersion}). Update the app here to sync.`);
  }
}

export const docFileName = (deviceId: string) => `device-${deviceId}.json`;
const isDocFile = (name: string) => /^device-.+\.json$/.test(name);

/** Rewrites a doc from an older app version into the current format (values migrated, hashes redone). */
export function upgradeDoc(doc: SyncDoc, tableNames: readonly string[], migrate: (db: Record<string, unknown>) => void, targetVersion: string): SyncDoc {
  const db: Record<string, unknown> = { exportVersion: doc.exportVersion };
  for (const table of tableNames) {
    const live = new Map<string, unknown>();
    for (const [key, e] of Object.entries(doc.tables[table] ?? {})) if (!e.del) live.set(key, e.v);
    db[table] = mapToTable(table, live, undefined);
  }
  migrate(db);
  const tables: SyncDoc["tables"] = {};
  for (const table of tableNames) {
    const migrated = tableToMap(table, db[table]);
    const out: SyncDoc["tables"][string] = {};
    for (const [key, e] of Object.entries(doc.tables[table] ?? {})) {
      if (e.del) out[key] = e;
      else if (migrated.has(key)) out[key] = { ...e, v: migrated.get(key), h: hashOf(migrated.get(key)) };
    }
    // Records a migration created (e.g. moved from an old table) - their age is unknown.
    for (const [key, v] of migrated) if (!out[key]) out[key] = { h: hashOf(v), t: 0, o: doc.deviceId, v };
    tables[table] = out;
  }
  return { ...doc, exportVersion: targetVersion, tables };
}

/** This device's own last upload, brought to the current data version - or null if it can't be read. */
async function readOwnDoc(transport: SyncTransport, file: DriveFile, tableNames: readonly string[], local: LocalPort): Promise<SyncDoc | null> {
  try {
    const doc: SyncDoc = JSON.parse(await transport.read(file.id));
    if (doc.format !== SYNC_DOC_FORMAT || !doc.tables) return null;
    const cmp = compareVersions(doc.exportVersion, local.exportVersion());
    if (cmp > 0) return null;
    return cmp < 0 ? upgradeDoc(doc, tableNames, local.migrate, local.exportVersion()) : doc;
  } catch {
    return null;
  }
}

export async function runSync(opts: {
  transport: SyncTransport;
  local: LocalPort;
  identity: { deviceId: string; deviceName: string };
  /** When this device last synced; null = never (its first sync adopts what's on Drive). */
  lastSyncAt: number | null;
  tableNames: readonly string[];
  now?: () => number;
  labelOf?: (table: string, value: unknown) => string;
}): Promise<SyncOutcome> {
  const now = opts.now ?? Date.now;
  const { transport, local, identity, tableNames } = opts;
  const myName = docFileName(identity.deviceId);

  for (let attempt = 0; attempt < 3; attempt++) {
    const startedAt = now();
    const generation = local.generation();
    const files = await transport.list();
    const mine = files.find((f) => f.name === myName);

    const docs: SyncDoc[] = [];
    for (const file of files) {
      if (file === mine || !isDocFile(file.name)) continue;
      let doc: SyncDoc;
      try {
        doc = JSON.parse(await transport.read(file.id));
      } catch {
        continue; // A half-written or foreign file: skip it rather than stop syncing.
      }
      if (doc.format !== SYNC_DOC_FORMAT || !doc.tables) continue;
      const cmp = compareVersions(doc.exportVersion, local.exportVersion());
      if (cmp > 0) throw new SyncVersionError(doc.exportVersion, doc.deviceName || "Another device");
      docs.push(cmp < 0 ? upgradeDoc(doc, tableNames, local.migrate, local.exportVersion()) : doc);
    }

    /** Merges every other device's doc into fresh copies of this device's data. */
    const mergeAll = (baseOf?: (table: string, key: string) => unknown) => {
      const merged = { tables: structuredClone(local.tables()), ledger: structuredClone(local.ledger()), conflicts: [] as SyncConflict[], changed: new Set<string>() };
      for (const doc of docs) {
        const result = mergeDoc(merged.tables, merged.ledger, doc, tableNames, {
          lastSyncAt: opts.lastSyncAt ?? 0,
          firstSync: opts.lastSyncAt === null,
          now: startedAt,
          deviceId: identity.deviceId,
          baseOf,
          labelOf: opts.labelOf,
        });
        result.changedTables.forEach((t) => merged.changed.add(t));
        merged.conflicts.push(...result.conflicts);
      }
      return merged;
    };

    let merged = mergeAll();
    // A record both devices edited: join the two versions field by field, against what this device
    // last uploaded (the state both had then). Read only when there is something to join, and only
    // if this device has synced before.
    if (merged.conflicts.length > 0 && mine && opts.lastSyncAt !== null) {
      const base = await readOwnDoc(transport, mine, tableNames, local);
      if (base) merged = mergeAll((table, key) => (base.tables[table]?.[key]?.del ? undefined : base.tables[table]?.[key]?.v));
    }
    const { tables, ledger, conflicts, changed } = merged;

    // Edited while we were downloading: merge again from the new state.
    if (local.generation() !== generation) continue;
    await local.apply(tables, [...changed], ledger);

    const doc = buildDoc(tables, ledger, tableNames, {
      deviceId: identity.deviceId,
      deviceName: identity.deviceName,
      writtenAt: now(),
      exportVersion: local.exportVersion(),
    });
    await transport.write(myName, JSON.stringify(doc), mine?.id);

    return {
      syncedAt: startedAt,
      conflicts,
      changedTables: [...changed],
      devices: docs.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName, writtenAt: d.writtenAt })),
    };
  }
  throw new Error("The data kept changing while syncing - try again in a moment.");
}
