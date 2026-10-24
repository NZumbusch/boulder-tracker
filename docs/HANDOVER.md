# Handover

For whoever (a person, or another Claude session) picks this project up. Written 2026-10-14 at the end of a long session; read this first, then the plan docs it links. The repo is the source of truth - the previous assistant also kept private notes outside the repo, and everything that matters from them is here.

## What this is

**Boulder Tracker**: a training planner and log for bouldering/climbing. Svelte 5 (runes) + Vite + Tailwind v4, TypeScript, local-first (IndexedDB via localforage on the web, one JSON file on Android), installable PWA, and a native Android app (Capacitor 8) with local plugins in `plugins/`. One athlete (Nathan, the owner) uses and maintains it; there is no server. User docs: `README.md`. Site and APK: https://bouldertracker.nathanzumbusch.de/.

```
src/lib/           logic (pure where possible, tested)   src/components/   Svelte screens and widgets
  planning/ phases, projection, calendar helpers          nav/    AppBar, NavDrawer, NavRail, Fab
  storage/  persistence, migrations, import/export        plan/   Plan screen, calendar views, Phases page
  stores/   reactive stores (state.svelte.ts composes)    dashboard/ Home   history/   analytics/   settings/
  ai/       AI coach: prompts, change-set schema, planner workout/ live session, workout modal
  sync/     Google Drive sync (per-device docs, merge)
  navigation/ nav items, layout mode, back stack, drawer
docs/    plans, QA checklist, audits        plugins/  native Capacitor plugins (Java/Kotlin)
scripts/ build helpers; scripts/headless/ browser checking (below)    android/  tracked native project
stuff/   Nathan's private files - GIT-IGNORED, never commit or publish anything from it
```

## Working agreements (how Nathan wants this done)

- **Tests first, one commit per concern.** `npm test` (vitest, node environment: logic is unit-tested, components are not) and `npm run check` (svelte-check) must pass before every commit; `npm run build` before pushing. After using a new icon run `npm run icons` (icons are bundled for offline use; a test fails otherwise).
- **Survey Nathan for decisions.** Design and judgment calls go to him as a short multiple-choice question (with a recommended option), not decided silently. For genuinely taste-based UI choices he wants **both behind a setting** with a stated default (he has asked for this repeatedly). For data-model/correctness questions he wants one decided answer. Flag ambiguities and log judgment calls in the relevant plan doc.
- **Be honest about what was not verified.** Nothing from the last sessions has run on a real phone. Say so; do not claim device behaviour you only saw in headless Chrome.
- **Light look (2026-10-29, from Nathan's old welcome screenshots):** raised cards (`ui.raisedCards`, `data-cards="raised"`), soft pill `btn-secondary`, a dot under the active bottom-bar tab, the soft rounded week grid (`plan.weekGridClear` off). High contrast is the `contrast` theme and always keeps outlines/numbers. The welcome slides (`public/img/intro-*.webp`) still show the older version of this look.
- **Minimalist, modern, sleek**: the model is Samsung Calendar plus the app's own nicest screens (Analytics, the live session): no heavy borders or glows, colour only for data and status, quiet segmented controls, one primary action per context. Screens that shipped a "card with border" look were rejected for the calendar; see `docs/navigation-plan.md` and the calendar notes below.
- **Never publish private data.** `stuff/` holds a real backup and screenshots. `src/**/*.private.test.ts` is git-ignored on purpose (`src/lib/storage/realBackup.private.test.ts` runs migration, projection, the AI planner and ICS export over the backup if it is present).
- **Pushing to `main` ships to Testing devices** (below). Don't push half-done work.
- Commit messages feed the in-app "What's new" (header = subject up to the first colon or " - "; add a `Changelog:` line to word it for users, or `Changelog: -` to hide). Release notes for the post-update sheet are hand-written in `src/lib/releaseNotes.ts` (add one at the top when behaviour changes; ids only ever grow).

## Releasing

- `.github/workflows/deploy.yml`: every push to `main` builds the web app and a signed Android APK and deploys one Pages site: `/` web app, `/android/` **Testing** channel (every push), `/android/stable/` **Stable** (promote by hand: Actions → this workflow → mode "promote"; copies the live test APK byte-for-byte).
- The APK is signed with Nathan's own key from repo secrets - **never switch keys** (a different key = Android sees a different app = uninstall = data loss; also the Drive OAuth client's SHA-1). `versionCode` = `git rev-list --count HEAD`; never change that. See `docs/signing.md`, `scripts/app-version.mjs`.
- The in-app updater (`plugins/app-updater`, `src/lib/update/`) installs APKs after checking SHA-256 and writing a safety backup.
- Data version `DATA_EXPORT_VERSION` is **3.38** (`src/lib/constants.ts`). A bump means every device must update before Drive sync resumes (devices on an older version refuse to merge with a newer one - `SyncVersionError`; older docs are upgraded forward through the same migrations).

## Data model facts you will trip over

- **Migrations** (`src/lib/storage/migrations.ts`): a registry of steps `from → to`; each runs on the whole database object; `assertMigrationInvariants` checks counts/references and a failure restores the pre-migration copy (a backup is also written first). Test every step (`migrations.*.test.ts`), including from old fixtures in `src/lib/storage/__fixtures__/`. Sync upgrades older device docs through the same steps and hands them tables that no longer exist (`upgradeDoc`), so a step may read a table it then drops.
- **Phases are ranges of days** (`TrainingBlock.startDate/endDate`, inclusive "YYYY-MM-DD"; data 3.35). Week helpers live in `planning/trainingBlocks.ts` (`phaseOnDay`, `phasesInWeek`, `winningPhaseOfWeek`, `blockWeekIds` ...); `normalizeBlock(s)` reads the pre-3.35 whole-week shape wherever it can still appear. Full story and decisions: `docs/phase-days-plan.md`.
- **Sessions are saved one by one** (data 3.36). A phase's sessions are *projected* at read time (`planning/weekProjection.ts`); a projected session has id `prov:{weekId}:{templateId}` and becomes a stored row only when logged, changed, moved or deleted. A stored session with that id stands in for its template; `dismissedSessions` (`{id, weekId}`, synced) remembers deletions; `prov:{weekId}:*` dismisses a whole week (cleared, planned by AI/by hand, or - from the 3.36 migration - every week that was saved before). Past days' projected sessions are saved on app load. **Read a week with `trainingState.getWorkoutsForWeek(weekId)`, never by filtering `workouts`.** `Workout.provisional` is transient (stripped by `toStoredWorkout`).
- **Plan B** (`planning/planB.ts`): a rule applied on read, never written into weeks; `getWorkoutsForWeek` returns the side that counts, `getWeekPlanView` both.
- **Live session**: at most one, its own deep copy of the workout, persisted in localStorage (not the DB), pure logic in `session/activeSession.ts`; durations through `planning/sessionDuration.ts` only.
- **Load**: "load" alone is the rated `loadFactor`; plan comparisons use `planProgress()` ("% of the plan"); never divide rated load by the planned estimate.
- **Settings architecture**: thresholds → `preferences/tunables.ts` registry; per-card Home options → `preferences/homeDetails.ts`; ordered/hideable lists → `validateOrderedToggles`; units are canonical in storage (°C, kg, km/h, Font grades) and converted at the edges. Preferences are in localStorage (`preferences/migrate.ts` validates); `preferences/portable.ts` lists the ones that sync - new settings are device-local unless added there (`navStyle` is deliberately device-local).
- **Back navigation**: every sheet/modal/sub-page calls `backWhile(() => open, close)` (`navigation/backStack.svelte.ts`); the Android back key closes the top entry, and from any tab goes Home. `lib/ui/dialogLayer.ts` makes any `fixed inset-0 z-[100+]` overlay a dialog (page behind inert, Escape closes).
- **AI coach** (`src/lib/ai`): copy-paste prompt → JSON change set (`changeSet.ts` validates, `changePlanner.ts` plans, a tickable review applies, plan undo restores). The contract is documented *to the model* in `changeSetPrompt.ts` - keep it in step with the validator (a test checks the field lists). Phases for exact days: `fromDate`/`toDate` week entries.
- **Calendar** (Plan → the calendar icon in the top bar): `components/plan/PlanCalendar.svelte` and friends; pure logic in `planning/calendarEvents.ts`, `sessionColors.ts` (one session colour; category colours behind `plan.calendarCategoryColors`), `calendarZoom.ts` (pinch / ctrl+wheel), `calendarDrag.ts` (hold-and-drag reschedule), `headerBars.ts` (trips, competitions and all-day / multi-day / 12 h+ phone events as bars above the grid, `capBars` for the "+N" row), `goalBars.ts` (`goalsByDay`), `phaseStrip.ts`; `calendar/eventColor.ts` (event colours turned away from the session green, your own pick used as chosen). Android phone-calendar overlay: `plugins/device-calendar`, `lib/calendar/`.
- **Navigation** (new): `AppBar` at the top of every screen (must be the screen root's first child), side drawer on phones, rail on wide/landscape, floating + (`Fab.svelte`), bottom bar kept as a per-device setting (`navStyle`). Plan and decisions: `docs/navigation-plan.md`.

## Where things stand (end of 2026-10-14)

Everything below is on `main`, pushed to Testing, **not yet tried on a real device**:

| Area | State | Doc |
| --- | --- | --- |
| Plan calendar (Day/Week/Month/Year), phone-calendar overlay, ICS export fix | built, flat Samsung-style look, category colours, pinch zoom, drag to reschedule, trip/competition bars, phase strip | QA §11, §12.16-12.17 |
| Phases as date ranges, sessions saved one by one (data 3.35/3.36) | built; verified against Nathan's real 2026-10-11 backup (migrates, every week shows what it did) | `phase-days-plan.md`, QA §12 |
| Phases page (the only place phases are edited; was the Block manager) | built | `phase-days-plan.md` |
| AI coach on the new model (+ exact-day phases) | built | `changeSetPrompt.ts` |
| Navigation drawer / rail / floating + | built; drawer is the default | `navigation-plan.md`, QA §13 |

**Run `docs/qa-checklist.md` sections 11-13 on a real phone and a tablet first** (12.1 and 12.15, the update/import of existing data, matter most), then the rest of the checklist. Expect small polish items from that run.

### Known gaps and ideas, roughly by value

1. Real-device checks never done: Android back key and gesture navigation with the drawer, haptics on drag, safe areas, the update path over an existing install, Drive sync across two devices on 3.36.
2. ~~The floating + covers content~~ - done 2026-10-15: it hides while scrolling down and returns on scrolling up (`lib/navigation/scrollHide.ts`).
3. Wide-screen layouts for Home, History and Analytics (two columns of cards, master-detail like Samsung Calendar's Day + event pane) - they are a centred ~640 px column on tablets/laptops. Listed under "Later" in `navigation-plan.md`.
4. ~~Week view on a portrait phone~~ - done 2026-10-15: the list is the default on a portrait phone (setting `plan.weekListOnPhone`).
5. ~~The welcome slides and README screenshots show the old UI~~ - regenerated 2026-10-29 from the example data (`public/img/intro-*.webp` are 780x1560 crops, the example-data banner cut off; `og.jpg` is the three of them composed). Regenerate again when the look changes; the recipe is in the 2026-10-29 note below.
6. Search in the top bar, long-press on the + for a speed dial (quick timer), a mark per week in the Year view for phases was replaced by lines (done) - nothing else open there.
7. The Goals card under the calendar is still a bordered card.
8. Older plan/QA/audit docs (`pre-release-evaluation.md`, `android-backup-audit.md`) are historical; `qa-checklist.md` is the living one.

### Session of 2026-10-15 (live-session fixes and a UI/UX pass)

Nathan's list from using the app, all built on branch `claude/ui-ux-issues-navigation-4jj8ji` (see QA section 14): skipping inside a circuit asks (`ChoiceSheet`, `session/circuitFlow.ts`, setting `circuit.askSkip`); a circuit run covers only members still to do; stopping a session with a circuit open logs its sets and ends it (`settleCircuit` in `circuitHud.svelte.ts`); Start circuit is never silently disabled; a planned weight the type doesn't track is editable (`exercise/valueParams.ts`, "Add weight"); "Hold" vs "Hang" (`defaultRepLabel`); Done and Skip buttons in the timer notification (`liveButtons` in `circuitRun.ts`, Java `TimerForegroundService`). Found on the way: the migration invariant rejected any database with a benchmark test slot (typeId "test") - a real backup would have been rolled back; five layout settings (plan calendar, "New day starts at") had no Settings page (a test now guards this). Decisions from Nathan: ask on a circuit skip; hide the + on scroll; week list on narrow phones.

- Later the same day (after Nathan tried it): navigation is `auto` (bottom bar on a compact phone, drawer + rail when wide; `navMode` replaced `navStyle`, so the old default was dropped), the top bar hid on scroll (superseded: since 2026-10-18 `AppBar` is plain, non-sticky page content and the setting is gone; `scrollChrome` only drives the floating +), the week list merges phone events by start time (`dayAgenda`), the block button shows in the calendar view, calendar blocks are roomier and rounder (`plan.exerciseList` swaps the pills for a dotted list). QA section 15.
- 2026-10-16: week layout toggle, event details sheet (device-calendar plugin reads location + description), **Places** (`lib/places`, preference `places` replacing `homeLocation`/`crags`, device-local; `Workout.location` / `WorkoutTemplate.location` by name; `renamePlace` renames on sessions), session preview sheet on a calendar tap, AI sees places and sets a session's `place`. Google Places lookups (needs a paid key). QA section 16. `Place` is by name, no id - see the doc comment in `places.ts`.
- 2026-10-17: **places moved into the database** (table `places`, export version 3.37; synced by `name`; in `PLAN_TABLE_NAMES`, so the plan undo restores them). The device preference `places` is now only the legacy source: `trainingState.adoptDevicePlaces()` moves it over once on the first start and empties it. `homeLocation`/`crags` are derived from the list in `state.svelte.ts`. AI: a `places` section in the change set (`CSPlaceChange` add/edit/remove by name; `changeSet.ts`, planner block `place-N`, `PlanWrites.places` + `placeRenames`, prompt `AI_PLACES_INSTRUCTIONS`) and an Organise area `places` (edit/remove only, no coordinates in the prompt). A rename in a change set renames the sessions and phase templates in the same write (`storage.applyPlanWrites`), and an undo reverses it for the logged sessions via `PlanUndoRecord.placeRenames`. Coordinates from the AI are accepted but flagged "check on a map". QA 16.7-16.10. Nothing here tried on a phone.
- 2026-10-18 (Samsung-style calendar, from Nathan's screenshots; his answers: one session colour, phases as strip + faint day tint, events in their own calendar colour kept clear of the session green, a colour picker per calendar, filter chips, \"+N\" header, today tint + slimmer gutter): multi-day / all-day / 12 h+ phone events are bars in the header (`headerBars`), not a piece per day; `DeviceEvent` has `firstDay`/`lastDay`; per-calendar colours live in the device-calendar settings (`colors`, localStorage); two new Plan calendar settings (`plan.calendarPhaseTint` default on, `plan.calendarCategoryColors` default off). QA 17. Judgment calls: the 12-hour rule for what counts as a bar (an evening that runs past midnight stays on the grid); the picker is a swatch row plus `<input type=color>` - whether the system colour picker opens in the Android WebView is untested; filter chips toggle the same per-device choice as the Settings checkboxes (no chip for your own sessions). Only checked in headless Chrome with injected events, not on a phone.

- 2026-10-19: **Analytics rebuilt by question** (`Analytics.svelte`): tabs Overview / Training / Recovery / Progress (was Insights / Training / Body / Progress). Insights became `FindingsPanel` (a list it is given); `insights.ts` has `findingTab` (the tab of the chart a finding points at) and `topFindings` (Overview: urgent first, the load verdict always, two good); link tabs are `AnalyticsTab`. Section registry unchanged (`TAB_OF` maps cards to tabs; `MORE_OF` folds strain and finger load under "More charts"; fatigue moved to Recovery, the calendar heatmap to Overview). `LoadPanel` has the bars and, in a pane of its own, the ratio (no dual axis). Axis labels thin from the measured screen width. QA 17. Headless only; seeding in the sandbox: build a backup from `buildDemoData()` and use `seedBackup` + `STATE_EXPR` from `scripts/headless/lib.mjs` (a plain-path import of the state can be a second copy after hot reload).
- 2026-10-21: **AI sees the phone calendar (opt-in)**: `aiSharing.phoneCalendar` (off unless `true`; shown only where `deviceCalendar.supported`), `deviceCalendar.eventsBetween` (reads without touching the Plan calendar's events), `lib/calendar/aiCalendar.ts` (`buildCalendarContext`: title + time only, one entry per event, max 80), `calendar` option of `buildCoachPromptFor`, read in `AICoachModal` for the target weeks in generate/analyze. `public/privacy.html` brought up to date (places, phone calendar, direct AI connection, sharing switches). There is no separate terms-of-service file; the privacy policy is the only legal page. Keep the policy in step when a feature starts reading, sending or storing something new.
- Not verified on a device: the notification buttons (Java was written, **not compiled** - no Android SDK in the cloud session; the page side is tested headless and by unit tests), Android back with the new sheets, haptics.
- The cloud sandbox blocks `api.iconify.design`, so `npm test` reports one unhandled error from `offlineIcons.test.ts` (the icon generator can't fetch); all tests pass. No new icons were added.
- Still open from the audit: the year grid's week cells are 26 px; the Plan session section's own + duplicates the floating one; History/Analytics wide layouts.

### Session of 2026-10-29 (Phases page, light look, calmer Plan; all on `main`, none tried on a phone)

- **Phases page** (`PhasePlanner.svelte` + `PhaseTimeline.svelte`, pure ops in `planning/phaseTimeline.ts`) replaced the Block manager: timeline, drag/snap, split, move (+ everything after), repeat, cycle presets, gaps from today on (ignorable, `plan.ignoredGaps` in localStorage), "how it went", Ask the AI. Log in `phase-days-plan.md` (stage 5).
- **Plan calendar**: one **View** button (`CalendarOptions.svelte`: week layout, Focus on sessions - now on by default, phone calendars), the Weeks/Calendar switch is a top-bar icon, `planFocus` (`lib/plan/planFocus.ts`) hands the day/session between the two views (scrolls and flashes it).
- **Light look** (from Nathan's old screenshots): `ui.raisedCards` (default on), soft `btn-secondary` pill, dot under the active bottom-bar tab, soft week grid (`plan.weekGridClear` off). Card edge: a thin tint of the text colour plus a firmer shadow; `contrast` theme keeps outlines.
- **Declutter**: the Weeks legend is one scrolling row; Analytics range + arrows share a row; Log a past session lives on the Log screen (Past session tile).
- **Docs/screenshots** brought up to date this day: tour (`steps.ts`: Phases, a Weeks/Calendar step; the tour forces the Weeks view), glossary, README, `public/about.html`, `public/privacy.html` (paths renamed to "Data & connections", date bumped), settings hints and search, QA section 25.
- **Regenerating the screenshots**: `npx vite --port 5199`, then a headless script (see `scripts/headless/`): start the example data (`tour.startExample()`), `welcomeDone = true`, 390x841 at scale 2, light theme, navigate Home / Plan (Weeks view) / Analytics, crop the top 122 px (the example banner) and keep 780x1560, save as webp (quality ~82). Traps found: **kill leftover `chrome` processes first** (`pkill -x chrome`) - a stale one still on port 9333 answers instead of the new one and every screenshot is the same old page; and after files were edited the page's modules are served as `...ts?t=<stamp>`, so take both `state.svelte.ts` and `tour.svelte.ts` URLs from `performance.getEntriesByType('resource')` (last match) rather than importing by plain path.

### Imported activities (2026-10-31)

Strava/Garmin/FIT/GPX/TCX import into `externalActivities` (data 3.38), History → Activities, route drawing, overlap check: see README "Importing activities". **Private data rule**: the real Strava archive Nathan supplied lives only outside the repo; `src/lib/**/*.private.test.ts` (git-ignored) read it through `PRIVATE_ZIP` / `PRIVATE_FIT_DIR` and write aggregates only. Never commit, print or screenshot it into the repo. Garmin export (daily wellness + FIT recordings + summaries) is read too - see README. Open: imported activities and wellness extras (steps, stress, Body Battery, VO2max, breathing) are stored but not yet charted or used by load, readiness, insights or the AI coach; activities do not appear in Analytics or the Home recent list. Garmin account data here starts Dec 2024 (all the export holds).

### Derived data: the daily models (`src/lib/analytics/daily/`, 2026-11-03)

Anything that takes real work **per day** for a chart (readiness by day, each recovery metric's reading + 7-day average + 28-day normal range) comes from an immutable **model**, not from a function that recomputes on every render:

```
stores  ->  models (immutable snapshot, one per input set)  ->  panels (slice a window)
             ^ rebuilt by $derived in state.svelte.ts            ^ never recompute to change period/range
             ^ filled in idle slices by startWarming() in App.svelte
```

- `ReadingsModel(entries)`: the daily values indexed by metric and day, plus `recovery(spec)` series. `ReadinessModel(readings, {workouts, pain, config, halfLife})`: `score(day)` / `range(a, b)`. Both copy what they need when built (no reactive proxies, nothing can change under them) and fill a `DaySeries` one day at a time; a day never depends on the window.
- **Invalidation is replacement, with carry-over**: `trainingState.readingsModel` / `.readinessModel` are `$derived`, so a changed input builds a new model; the new one is handed the previous model and **adopts every cached day the change cannot affect** (`DaySeries.adopt`), so only the affected days are recomputed. The previous model is never touched. This is the only mechanism: there is no from-scratch path to keep in sync. Dependency windows: a reading on day d affects that metric's days d..d+`BREAK_LOOKBACK_DAYS`; sleep/nap on day d affects day d; an HRV reading affects d..d+365 (baseline); a session or pain change affects its day and every day after; a settings change adopts nothing. Per-day compute only looks at recent sessions (14 half-lives, at least 28 days) plus the first session and latest session per rating axis, which is what makes those windows true. This holds because the stores replace their arrays on every load (`dailyMetrics` is `$state.raw` and is copied on load); keep it that way, or a model will not notice an in-place edit.
- **The gate is `incremental.test.ts`**: random data plus random edit sequences, each carried-over model compared for exact equality with a fresh build, and `carriedDays` must stay high (so it cannot pass by carrying nothing). It was mutation-checked (shrinking any window, ignoring removed sessions or pain, carrying across a settings change each make it fail). If you add a series or widen what a day reads, widen its window in `#affectedSince` / the readings carry-over and run it. Small differences from the textbook full calculation (the recent-sessions cut-off) are accepted at the ~0.001 level.
- **Warming** (`warmer.ts`) is an accelerator only: idle slices of about 8 ms, newest days first, one model per turn, restarted from the new models after any change. A chart opened first computes what it needs itself. Not a worker (copying the data in and the results out costs about what it saves).
- **Adding a series**: give a model a `DaySeries` (and a line in its `warm`). Never memoise inside a pure function. The pure maths stays pure and uncached (`recoveryDay`, `buildRecoverySeries`, `computeReadiness`...), so tests can call it directly.
- Measured on the real data (4x CPU throttle, production build): readiness for a year went from ~190 ms per open to 0.1-0.8 ms once warm. What remains when opening Recovery (about 290 ms first open, 150-210 ms stepping a period) is Svelte building and tearing down the tab's cards, not computation. Ideas if it is still too slow: keep visited tabs mounted, or draw the charts as a single canvas/path instead of many reactive elements.

## Checking a change in a browser (no extra tooling)

`scripts/headless/lib.mjs` drives headless Chrome over the DevTools protocol (needs `google-chrome`; Node 22). `scripts/headless/example.mjs` is a ready-made run: `npx vite --port 5199 &` then `node scripts/headless/example.mjs [backup.json]`; screenshots land in a temp folder it prints. `seedBackup()` writes a backup into the app's storage and reloads, so the **real startup migration runs** - the most faithful test of an update. Emulate touch with `Input.dispatchTouchEvent` (the pinch and drag were tested that way), sizes with `resize()` (phone 400×860, landscape 850×390, tablet 820×1180, laptop 1366×768), themes with `document.documentElement.dataset.theme = 'dark' | 'light'`.

Traps learned the hard way:
- Importing `/src/lib/state.svelte.ts` from the page after a hot reload gives a **second** `TrainingState` (the app loads `…?t=<timestamp>`); take the URL from `performance.getEntriesByType('resource')` (`STATE_EXPR` in the lib) or reactivity looks broken when it isn't.
- Actions that call `showConfirm` (reset week, delete block) wait for a click on a dialog and will hang a script - call the store/storage method instead.
- Don't `pkill -f` a pattern that appears in your own command line (it kills the shell: exit 144); find the pid with `pgrep -a` and kill that.
- Touches must start inside the viewport (a finger at y = window height hits nothing).
- Observing an element's own size with `bind:clientWidth` while its height depends on the width trips ResizeObserver's loop guard (the app shows it as an error toast) - measure with a zero-height probe element, as `CalendarTimeGrid` does.
- Android: emulator `Pixel_8_Pro` (`~/Android/Sdk/emulator/emulator -avd Pixel_8_Pro -no-window -no-audio`), build with `JAVA_HOME=/opt/android-studio/jbr ./gradlew --offline :app:assembleDebug` in `android/`, app id `com.example.bouldertracker`, WebView DevTools via `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`.

## Other docs

- `docs/phase-days-plan.md` - phases as dates, sessions one by one: design, stages, judgment calls, progress log.
- `docs/navigation-plan.md` - drawer/rail/floating +: anatomy, stages, decisions, progress.
- `docs/qa-checklist.md` - the on-device test list (sections 1-13); results columns are for Nathan to fill.
- `docs/signing.md`, `README.md` (install, verify the APK, Drive sync one-time setup, Health Connect).
