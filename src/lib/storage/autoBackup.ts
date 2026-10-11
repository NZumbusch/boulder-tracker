import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { localIsoDate } from "../dateUtils";
import { initDB, _dbState, AUTO_BACKUP_FOLDER, AUTO_BACKUP_PREFIX } from "./persistence";
import { DATA_EXPORT_VERSION } from "../constants";

/**
 * Android's automatic weekly backup. The database lives in the app's
 * private storage; a manual export has to be remembered. This writes the
 * same JSON a manual export does into Documents/BoulderTracker - outside
 * the app, so it survives an uninstall and shows up in the phone's file
 * manager - once a week, keeping the newest few. If Android won't let the
 * app write there, it uses the app's own external storage instead.
 */

const FOLDER = AUTO_BACKUP_FOLDER;
const PREFIX = AUTO_BACKUP_PREFIX;
export const AUTO_BACKUP_KEEP = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** No automatic backup yet, or the last one is a week old. */
export function autoBackupDue(lastAt: string | undefined, now: Date): boolean {
  return !lastAt || now.getTime() - new Date(lastAt).getTime() >= WEEK_MS;
}

/** Of a folder's file names, the automatic backups beyond the newest `keep`. */
export function backupsToPrune(names: string[], keep: number): string[] {
  const backups = names.filter((n) => n.startsWith(PREFIX) && n.endsWith(".json")).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}

/** Writes today's backup and prunes old ones. Returns where it went, for display. */
export async function writeAutoBackup(now: Date = new Date()): Promise<string> {
  await initDB();
  const data = JSON.stringify({ ..._dbState, exportVersion: DATA_EXPORT_VERSION });
  const name = `${PREFIX}${localIsoDate(now)}.json`;
  const targets = [
    { directory: Directory.Documents, label: `Documents/${FOLDER}` },
    { directory: Directory.External, label: "app storage" },
  ];
  let lastError: unknown;
  for (const { directory, label } of targets) {
    try {
      await Filesystem.writeFile({ path: `${FOLDER}/${name}`, data, directory, encoding: Encoding.UTF8, recursive: true });
      try {
        const { files } = await Filesystem.readdir({ path: FOLDER, directory });
        for (const old of backupsToPrune(files.map((f) => f.name), AUTO_BACKUP_KEEP)) {
          await Filesystem.deleteFile({ path: `${FOLDER}/${old}`, directory });
        }
      } catch (err) {
        // Pruning is housekeeping - a failure here doesn't undo the backup.
        console.error("Failed to prune old automatic backups", err);
      }
      return label;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
