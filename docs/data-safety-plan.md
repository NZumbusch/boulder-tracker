# Data safety: the data log, the guard, safety backups (2026-11-24)

## Why

On 23 Nov 2026 Nathan logged a session (Monday W48, "Hypertrophy A"), saw the rating screen and the saved session in its viewer, and the next day it was gone: the stored row was the planned version again (no date, load 0), so the app called it missed. The backup, the code and the logs could not say why:

- Ruled out from the code: the Garmin import (writes only `externalActivities`, `dailyMetrics`, `garminArchive`), AI plan changes and plan undo (keep completed sessions), Plan B routing (only planned sessions).
- Drive sync could not have brought the planned version back: no other device's doc held that session (it was planned on the phone on ~21 Nov; the tablet's doc was from October, the phone's old identity "Handy" from 16 Nov).
- Calendar sync did not move it: a taken move writes the event's start and length into the session, and the stored row still had its 18:30 / 190 min.
- The error log and the full console log had nothing: the app prints nothing on success, and no write failure ("Failed to write to native Filesystem") or sync warning was logged.

So the cause is still unknown. Nathan asked for: a log of everything that touches stored data ("even if it's dozens or hundreds of entries per session, that's the idea of a log"), and blocks and backups where they make sense.

## What was built

### The data log (`dataWatch.ts` on every save; since 26 Nov part of the one log - docs/logging.md)

Entry: `{ at, kind, msg, ops?, n?, data? }`. Kinds: `load` (the database read at start: which file, version, counts), `call` (every storage function, reads too, with ids/status/week of what it was given - never record content), `write` (each save, table by table: `+added ~changed -removed`, the record ids for small tables, every status change such as `mon planned→completed`), `disk` (the database file written: KB, sessions, ms - or FAILED), `guard`, `backup`, `sync` (Drive sync: which device docs were read and when they were uploaded, which tables changed, conflicts; a missing ledger; a restored identity. Calendar sync: counts, every move taken or refused), `session` (live session started / found at start / kept on the device after each change / finished / ended; the rating save and its result), `error`.

- **Where**: Android `boulder_tracker_data_log.jsonl` in the app's data folder, appended in batches (1.5 s, and at once when the app is hidden); web: IndexedDB key `data_log`. Apart from the database, so nothing that rolls the database back can take the log with it; never in a backup or sync; "Delete all data" leaves the Android file.
- **Size**: the newest 20,000 entries (`DATA_LOG_MAX`); the file is rewritten once it has 5,000 lines more. Repeats within 5 s fold into one entry with a count (`×12`).
- **Operations** (`dataOp`): every storage function that changes data runs as an operation, and the explicit ones `rate and save session`, `sync merge`, `calendar move`, `restore` wrap theirs; entries made meanwhile carry the labels (`rate and save session > saveWorkout`). Reads are logged but are not operations: the app reads every table at once on load, and their labels piled onto each other's entries.
- **Preferences**: every save of the preferences (localStorage) logs which settings changed (`changedPreferenceKeys`). Other localStorage keys (weather, map tiles, install prompt, release notes seen, UI state) are caches or screen state and are not logged.
- **UI** (replaced 26 Nov by the one log, docs/logging.md): Settings → About & Help → Data log (`DataLogCard.svelte`): newest first, filter All / Saves / Sessions / Safety, tap an entry for its data, Share as a file (all of it, .txt), Copy (newest 500), Clear. Searchable as "data log".
- **Cost**, measured on Nathan's real backup (desktop): the save check is 11 ms for a session save, 43 ms for a whole-database save. `garminArchive` is compared by key only (hashing it would add ~170 ms); it is only written by the import, which logs itself.

### Added the same day (Nathan: "add all you think useful")

- **The app's own life** (kind `app`): "App started" with version, commit, data version and platform (`installDataLog` in `main.ts`); "App in the background" / "back in front" / "closing" - so a gap between entries shows whether the app was away or killed. These lines never carry an operation label (`bare`).
- **Screens**: tab changes and settings pages (`uiStore.navigate`, `openSettingsPage`), the session viewer/editor opened, flipped, closed (`workoutModal`), the rating screen opened and closed (`openFatigueModal` / `closeFatigueModal`), the live session opened and minimised. Together with "Session saved as logged" this shows whether a rating was confirmed.
- **Saves that are not written** (`flushDB` returning early): before the data is loaded = `error`; while the example data is open = `disk` (usually the example's own edits). Recorded even while the example data is open (`force`) - a real save lost then must show.
- **Backups outside the safety ones**: the weekly automatic backup (also the one before an app update) written or failed; the plan undo history saved / cleared / failed; app updates (installing which version, the installer opened, failures).
- **Drive sync record by record** (`MergeContext.onDecision` → `SyncDecision` → `apply(..., decisions)` → `sync/syncLog.ts`): for sessions and other small tables one line per record the devices disagreed on - new here / took <device>'s version (both times) / deleted as on <device> / joined / kept ours; big tables as counts per device. Connect (merge or replace) and disconnect.
- **Calendar sync settings**: on (which calendar), off (events removed or not), each option change.
- Left out on purpose: weather, map tiles, install prompt, "what's new" seen, other screen state in localStorage - caches, not data.

### The guard (`guardWorkouts`, run by `dataWatch.beforeFlush` inside `flushDB`)

Nothing in the app turns a logged session back into a planned one (checked: no "un-log" action exists). So at the last step before the disk, whatever made the save, a session stored as `completed` that comes back `planned` is put back as it was, and a planned copy beside the logged row is dropped. The refused version and the kept one are both in the log (`guard`, with data), the app reloads the sessions and shows a toast naming the session. A logged session that is **deleted** is let through (a real action) and kept whole in the log. A backup restore (`replaceDatabase`) runs with `allowUnlog`.

Drive sync: the guard runs inside the merge's save; `apply` then copies the stored tables back into the merged ones, so the doc uploaded is what was stored (else Drive would get the planned version with the completed hash). The repaired row differs from the merge's ledger, so it is tracked as a new local change and the kept version wins on the other devices too.

Calendar sync: `#applyMove` now reads the session as it is at that moment (`getWorkoutById`), not the copy taken when the sync started, so a session logged during a sync can't be moved back to planned (the guard would catch it anyway).

### Safety backups (`lib/storage/safetyBackup.ts`)

The whole data except `garminArchive`, written just before: a Drive sync merge that changes or deletes a logged session or deletes ≥ 20 records / ≥ 25 % of a table (`syncNeedsBackup`; taken synchronously before the merge is applied, written after), an AI plan change or copied week, undoing a plan change, restoring a backup file or putting back the replaced data, clearing a week that has logged sessions. Android: `Documents/BoulderTracker/safety/safety-<date_time>-<reason>.json` (the app's external storage if Documents can't be written), the newest 10 kept; web: IndexedDB, the newest 3, downloadable from the Data log card. One per reason per 10 minutes. Restore one with Settings → Sync & backup → Restore from a backup file; restoring a file marked `safetyBackup.excludedTables: ["garminArchive"]` keeps the Garmin data on the device.

## Judgment calls (not asked; say if any should change)

1. **The guard always refuses** completed → planned and only tells you afterwards (toast + log), rather than asking. Nothing in the app does that on purpose, and a question in the middle of a sync can't be answered sensibly. Deleting a logged session is allowed.
2. **Reads are logged** as plain lines, folded when repeated; they are most of the entries. The Saves / Sessions / Safety filters hide them.
3. **Garmin data is left out of safety backups** (about three quarters of the size; re-importable from the Garmin export). A restore of such a file keeps the device's Garmin data rather than emptying it.
4. **Sizes**: 20,000 log entries (a few MB), 10 safety backups on Android (~3-4 MB each for Nathan's data), 3 in a browser.
5. Overlapping operations can mix their labels (they are a global stack, not async context); the order of entries is always exact.

## Not verified

Checked with unit tests and in headless Chrome (web storage): a session logged, then a stale planned copy written straight to storage - refused, kept on disk and on screen, toast shown, log correct; the Data log card renders. **Not run on a phone**: the Android log file (append, restart, trimming), safety backups in Documents, the Drive sync path with the guard, the cost on a phone.
