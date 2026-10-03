/**
 * Telling a restored copy of the app from the install that made the backup.
 *
 * Android's Auto Backup copies the app's data - including the sync settings
 * with this device's id - to a new phone or after a reinstall. Two devices
 * with one id write the same Drive file and each skips that file when
 * reading, so neither ever sees the other's changes and nothing says so
 * (docs/android-backup-audit.md). The plugin keeps a random marker in a
 * folder Android never backs up; if the marker saved in the settings isn't
 * the one on this install, the settings were restored from somewhere else.
 */

export type InstallVerdict = "same" | "restored" | "adopt" | "unknown";

/**
 * `saved` is the marker stored with the sync settings, `current` the one the
 * plugin reports (null when it couldn't be read).
 */
export function installVerdict(saved: string | undefined, current: string | null): InstallVerdict {
  if (!current) return "unknown";
  if (!saved) return "adopt";
  return saved === current ? "same" : "restored";
}

/** Shown in Settings → Sync (and logged) until dismissed. */
export const RESTORED_NOTICE =
  "This copy of the app was restored from a backup (a new phone or a reinstall), so it was given its own sync identity. Otherwise it would have shared one with your other phone, and neither would have received the other's changes. It has now merged with what's on Google Drive.";

/** The fields of the sync settings that identify this device and its sync history. */
export interface IdentitySettings {
  deviceId: string;
  lastSyncAt: number | null;
  devices: unknown[];
  installMarker?: string;
  notice?: string;
}

/** The settings of a restored copy, with a fresh id and a first sync that adopts Drive's data. */
export function restoredSettings<T extends IdentitySettings>(settings: T, newDeviceId: string, marker: string): T & { notice: string } {
  return { ...settings, deviceId: newDeviceId, installMarker: marker, lastSyncAt: null, devices: [], notice: RESTORED_NOTICE };
}
