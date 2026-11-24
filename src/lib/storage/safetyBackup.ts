import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import localforage from "localforage";
import { DATA_EXPORT_VERSION } from "../constants";
import { hashOf, tableToMap } from "../sync/merge";
import { _dbState, AUTO_BACKUP_FOLDER, isDemoMode } from "./persistence";
import { recordData } from "./dataLogStore";

/**
 * Safety backups: the whole data, written just before a change that
 * rewrites a lot of it at once - a Drive sync merge that changes or deletes
 * logged sessions or deletes many records, an AI plan change or a copied
 * week, undoing a plan change, restoring a backup file, clearing a week
 * that has logged sessions. If such a change goes wrong, the data from
 * right before it is a file you can restore (Settings → Sync & backup →
 * Restore from a backup file).
 *
 * On Android they go to Documents/BoulderTracker/safety (outside the app,
 * so they survive an uninstall; the app's own storage if that can't be
 * written), on the web into the browser's storage. The newest
 * `SAFETY_KEEP` are kept. The kept Garmin data (`garminArchive`) is left
 * out - it is most of the size and comes back by importing the export
 * again - and restoring such a file keeps the Garmin data that is on the
 * device (`replaceDatabase`).
 */

export const SAFETY_FOLDER = `${AUTO_BACKUP_FOLDER}/safety`;
export const SAFETY_PREFIX = "safety-";
export const SAFETY_KEEP = 10;
const WEB_KEY = "safety_backups";
const WEB_KEEP = 3;
/** Tables left out of a safety backup (see above). */
export const SAFETY_EXCLUDED = ["garminArchive"] as const;

// --- Pure helpers ----------------------------------------------------------------

/** "safety-2026-11-24_13-05-09-before-a-sync-merge.json" */
export function safetyFileName(reason: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
  const slug = reason.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${SAFETY_PREFIX}${stamp}-${slug}.json`;
}

/** Of a folder's file names, the safety backups beyond the newest `keep` (names sort by time). */
export function safetyToPrune(names: string[], keep: number): string[] {
  const backups = names.filter((n) => n.startsWith(SAFETY_PREFIX) && n.endsWith(".json")).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}

/** A table loses this many records, or this share of them, in one merge: worth a backup first. */
const MANY_REMOVED = 20;
const SHARE_REMOVED = 0.25;

/**
 * Whether a sync merge about to replace `changed` tables of `current` with
 * `next` deserves a backup first: it changes or deletes a logged session,
 * or deletes many records of a table.
 */
export function syncNeedsBackup(current: Record<string, unknown> | null, next: Record<string, unknown>, changed: readonly string[]): boolean {
  if (!current) return false;
  for (const table of changed) {
    const before = tableToMap(table, current[table]);
    const after = tableToMap(table, next[table]);
    let removed = 0;
    for (const key of before.keys()) if (!after.has(key)) removed++;
    if (removed >= MANY_REMOVED || (before.size >= 4 && removed / before.size >= SHARE_REMOVED)) return true;
    if (table !== "workouts") continue;
    for (const [id, w] of before) {
      if ((w as { status?: string })?.status !== "completed") continue;
      const now = after.get(id);
      if (!now || hashOf(now) !== hashOf(w)) return true;
    }
  }
  return false;
}

// --- Writing --------------------------------------------------------------------

const lastByReason = new Map<string, number>();
/** One backup per reason in this time is enough (a burst of syncs, several AI changes in a row). */
const SAME_REASON_GAP_MS = 10 * 60 * 1000;

export interface CapturedBackup {
  /** Writes the copy taken at capture time. Never throws; the result is in the data log. */
  write(): Promise<void>;
}

/**
 * Takes the copy now (synchronously - the data may change right after) and
 * returns how to write it. Null when there is nothing to back up (example
 * data, nothing loaded) or a backup for the same reason was just written.
 */
export function captureSafetyBackup(reason: string, now: Date = new Date()): CapturedBackup | null {
  if (!_dbState || isDemoMode()) return null;
  const last = lastByReason.get(reason);
  if (last !== undefined && now.getTime() - last < SAME_REASON_GAP_MS) {
    recordData("backup", `Safety backup ${reason}: skipped, one was written ${Math.round((now.getTime() - last) / 60000)} min ago`);
    return null;
  }
  lastByReason.set(reason, now.getTime());
  let content: string;
  try {
    const data: Record<string, unknown> = { ..._dbState, exportVersion: DATA_EXPORT_VERSION, safetyBackup: { reason, at: now.toISOString(), excludedTables: [...SAFETY_EXCLUDED] } };
    for (const t of SAFETY_EXCLUDED) delete data[t];
    content = JSON.stringify(data);
  } catch (err) {
    recordData("error", `Safety backup ${reason} could not be taken: ${String(err)}`);
    return null;
  }
  const name = safetyFileName(reason, now);
  return { write: () => writeContent(name, reason, content) };
}

/** Takes and writes a safety backup now (before a change the caller is about to make). */
export async function writeSafetyBackup(reason: string): Promise<void> {
  await captureSafetyBackup(reason)?.write();
}

async function writeContent(name: string, reason: string, content: string): Promise<void> {
  const size = `${Math.round(content.length / 1024)} KB`;
  try {
    if (Capacitor.isNativePlatform()) {
      const targets = [
        { directory: Directory.Documents, label: `Documents/${SAFETY_FOLDER}` },
        { directory: Directory.External, label: `app storage/${SAFETY_FOLDER}` },
      ];
      let lastError: unknown;
      for (const { directory, label } of targets) {
        try {
          await Filesystem.writeFile({ path: `${SAFETY_FOLDER}/${name}`, data: content, directory, encoding: Encoding.UTF8, recursive: true });
          recordData("backup", `Safety backup ${reason}: ${label}/${name} (${size})`);
          try {
            const { files } = await Filesystem.readdir({ path: SAFETY_FOLDER, directory });
            for (const old of safetyToPrune(files.map((f) => f.name), SAFETY_KEEP)) {
              await Filesystem.deleteFile({ path: `${SAFETY_FOLDER}/${old}`, directory });
              recordData("backup", `Removed the old safety backup ${old} (the newest ${SAFETY_KEEP} are kept)`);
            }
          } catch {
            // Housekeeping only.
          }
          return;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    }
    const list = ((await localforage.getItem(WEB_KEY)) as { name: string; content: string }[] | null) ?? [];
    const next = [...list, { name, content }].slice(-WEB_KEEP);
    await localforage.setItem(WEB_KEY, next);
    recordData("backup", `Safety backup ${reason}: in this browser's storage as ${name} (${size}; the newest ${WEB_KEEP} are kept)`);
  } catch (err) {
    recordData("error", `Safety backup ${reason} FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The web's safety backups, newest last (Android's are files in Documents). */
export async function webSafetyBackups(): Promise<{ name: string; content: string }[]> {
  if (Capacitor.isNativePlatform()) return [];
  return ((await localforage.getItem(WEB_KEY)) as { name: string; content: string }[] | null) ?? [];
}

/** Tests only. */
export function resetSafetyBackupsForTests(): void {
  lastByReason.clear();
}
