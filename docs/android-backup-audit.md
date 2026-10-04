# Android auto-backup and sync identity (audit, 2026-10-03)

Status: **fixed with option A (2026-10-03), needs the device test below.** `AndroidManifest.xml` has `android:allowBackup="true"` and no `dataExtractionRules` / `fullBackupContent`, so Android's Auto Backup (the Google backup in the phone's settings) copies the app's whole data directory, which includes the WebView's IndexedDB and localStorage: that is where all training data, the sync settings and the sync ledger live.

## The finding

Restoring that backup on another phone (or after a reinstall) brings back `boulder_tracker_sync`, which holds the **`deviceId`**, together with the ledger. Drive sync names each device's file `device-<deviceId>.json` and, when reading, skips the file with its own name (`syncEngine.ts`: `file === mine`).

If a restored copy runs **while the original phone keeps running** (a new phone being set up, the old one still in use), both write the same file and each skips it when reading. Neither ever receives the other's changes, each upload overwrites the other's, and nothing reports an error. A third device sees only whichever uploaded last.

With the original phone gone or reset, restoring is harmless, and is in fact useful: it brings the data back for people not using Drive sync.

## How likely is it?

It can't be told from the code. Auto Backup restores happen when an app is installed through Google Play or during phone setup from a Google backup. This app is **sideloaded**, and whether a sideloaded APK on a new phone gets its data restored is unclear (it depends on the Android version and the installer). Treat it as possible, unconfirmed.

## What a test needs (a phone with a Google account, USB debugging, `adb`)

1. Install the app on phone A, turn on Drive sync, log something. Note the device name in Settings → Data & connections → Sync & backup.
2. Force a backup: `adb shell bmgr enable true`, `adb shell bmgr backupnow com.nzumbusch.bouldertracker`.
3. On phone B (same Google account, backup enabled) install the same APK with `adb install`, then `adb shell bmgr restore com.nzumbusch.bouldertracker` (or `bmgr list transports` / `bmgr restore <token> <package>` if it asks for a token).
4. Open the app on B. Check Settings → Data & connections → Sync & backup: if B shows the same device name/ID as A, and A is not listed under "Devices", the identity was cloned. Edit something on each and sync both: with the bug, neither change arrives on the other.
5. For the "restore is harmless" case: reset phone A first, then repeat.

## What was built (option A)

- `DriveSyncPlugin.installMarker()` keeps a random id in `getNoBackupFilesDir()`, which Auto Backup never copies.
- The sync settings record that marker. On start, `installVerdict` (`src/lib/sync/identity.ts`) compares it with the install's own: **same** = nothing; **adopt** = settings from before markers, the marker is just recorded; **restored** = the settings came from another install's backup; **unknown** = the plugin couldn't read it, nothing changes.
- A restored copy gets a new `deviceId`, an empty device list, and `lastSyncAt = null`, so its first sync adopts what is on Drive (local records lose ties, like connecting with "Merge"). It tells you three ways: a 12-second toast, a `console.warn` (so it lands in Settings → About & Help → Errors & warnings), and a "Restored from a backup" note in Settings → Data & connections → Sync & backup until dismissed.
- Disconnecting and reconnecting on a restored copy no longer reuses the other install's id either.
- Tested with the plugin faked (`driveSync.restore.test.ts`, `identity.test.ts`); the Java compiles. **Not yet run on a device.** Existing installs have no marker, so they just record one on their next start: a restore from a backup made *before* that update is not detected.

With the test below, expect on phone B: the toast, the note in Settings → Data & connections → Sync & backup, a different device name/ID than A, and A listed under "Devices". Edits on each should now reach the other.

## Options considered

- **A. Guard the identity (chosen).** The plugin keeps a random install marker in `getNoBackupFilesDir()` (never backed up). Sync settings record the marker; on start, if it differs, this copy was restored from a backup, so it mints a new `deviceId`, discards the cloned ledger and does a first sync that adopts what's on Drive. A few dozen lines (Java plus TypeScript), unit-testable on the TypeScript side. Keeps automatic restore for people without sync.
- **B. Exclude WebView data from backup** (`dataExtractionRules`). Removes the clash entirely but also removes the automatic restore for non-sync users, who then depend on the weekly file in `Documents/BoulderTracker` and manual restore.
- **C. Keep and document.** Add a line to Settings → Data & connections → Sync & backup: "after restoring a phone from a backup, disconnect and reconnect sync". No code risk, but relies on people reading it.
