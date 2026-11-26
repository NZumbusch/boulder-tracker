# The log (2026-11-26)

One log for the whole app: what it did with the data, sync, sessions, screens, backups, the app's own life, and everything the console printed or threw. It replaced three that had grown side by side (an error log of errors and warnings, a console log of every console line, and the data log of 24 Nov) and overlapped: an error was in two of them, the data log kept its own errors, and each had its own screen and its own copy/share. Nathan asked for one, "a clean slate design for best practices".

## Model (`src/lib/log/entry.ts`, pure)

An entry: `at`, `level`, `area`, `msg`, and optionally `ops` (the operations running), `n` (repeats folded), `data` (kept whole), `stack`, `where`, `source`.

- **Levels**: `debug` routine (every storage read, every disk write; hidden unless asked for), `info` what happened, `warn` refused or failed and handled (a refused change, a missing sync ledger, a refused session start), `error` failed.
- **Areas**: `app` (start with build, background/foreground, closing, updates), `screen` (tabs, settings pages, session viewer, rating screen, live session window), `data` (loads, saves record by record, disk writes, refused changes), `sync` (Drive and calendar), `session` (live session, rating save, Quick log), `backup` (automatic, safety, pre-update, plan undo), `console` (console lines, uncaught errors, rejected promises, errors the app reported).
- **Folding**: the same entry within 5 s counts (`×12`) instead of taking a line.
- **Retention**: 20,000 entries; past that (+1,000 margin) the oldest `debug` lines go first, then `info`, and warnings/errors only when nothing else is left - problems outlive the routine around them.
- **Views** (`matchesFilter`): Problems (warn + error), Activity (what happened, plus every problem; no routine lines, saves or console), Data (the data's story, reads included), All.

## Keeping it (`src/lib/log/store.ts`)

Android: `boulder_tracker_log.jsonl` in the app's data folder, one entry per line, appended in batches (1.5 s, and at once when the app is hidden); a folded entry already written is re-added with `r` (replaces the line before); trimming rewrites the file. Web: IndexedDB key `app_log`. Apart from the database: nothing that rolls the data back takes the log with it; "Delete all data" leaves the Android file; backups and sync never carry it. Writing never throws; a log that can't be stored keeps working in memory.

**Moving in the old logs**: the first load reads `boulder_tracker_error_log` and `boulder_tracker_console_log` (localStorage) and the data log (`boulder_tracker_data_log.jsonl` / IndexedDB `data_log`), merges them by time (`migrateOldLogs`: the console log's copy of an error the error log has within a second is dropped; data-log kinds map to level/area), puts them in front, and deletes the old stores.

## Writing to it (`src/lib/log/index.ts`)

```ts
log.info("sync", "Drive sync done: ...")
log.warn("data", "Refused to ...", { data: { kept, attempted } })
await logOp("rate and save session", () => save())     // entries inside carry the label
export const storage = logCalls(storageFunctions, "data") // every call logged; changes run as operations
```

`installLogging` (main.ts) records "App started" with version/commit/data version, catches `console.*` (the console still prints), uncaught errors and rejected promises, and the app going to the background, coming back and closing. `reportError(err, where)` for errors a component caught. `setLogPaused` while the example data is open (`force` entries still go in: console lines, errors, a save that isn't written). Pop-ups: only for errors the error handling caught (console, uncaught, promise, reported), by the device setting Nothing / Errors / Warnings too (`boulder_tracker_error_alerts`, unchanged); a refused change and a failed save have their own messages.

## Screens

Settings → About & Help → **Log** (`LogCard.svelte`): what it is, how many entries since when, the three newest problems, Open the log / Problems only, the pop-up setting. **The log** (`LogView.svelte`, full screen): newest first under day headings, search (message, area, level, place, operation), the four views, tap an entry for its stack or data; Share as a file (all of it, .txt), Copy (the newest 500 shown), Clear. Feedback (Report a bug) can include the five newest problems.

## Judgment calls

- One store instead of "one screen over three stores" (which was offered first): simpler, one retention rule, and the store already survives a failing write.
- Default view Activity (not All): reads and console lines would drown what happened. A refused change still shows there.
- Console `log`/`info` lines are `info`, `debug` is `debug` - the app prints nothing on success, so they are rare and worth seeing.
- Not verified on a phone: the move of the old logs, the file and its trimming on Android, sharing the file.
