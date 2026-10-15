# Handover

For whoever (a person, or another Claude session) picks this project up. Written 2026-10-14 at the end of a long session; read this first, then the plan docs it links. The repo is the source of truth - the previous assistant also kept private notes outside the repo, and everything that matters from them is here.

## What this is

**Boulder Tracker**: a training planner and log for bouldering/climbing. Svelte 5 (runes) + Vite + Tailwind v4, TypeScript, local-first (IndexedDB via localforage on the web, one JSON file on Android), installable PWA, and a native Android app (Capacitor 8) with local plugins in `plugins/`. One athlete (Nathan, the owner) uses and maintains it; there is no server. User docs: `README.md`. Site and APK: https://bouldertracker.nathanzumbusch.de/.

```
src/lib/           logic (pure where possible, tested)   src/components/   Svelte screens and widgets
  planning/ phases, projection, calendar helpers          nav/    AppBar, NavDrawer, NavRail, Fab
  storage/  persistence, migrations, import/export        plan/   Plan screen, calendar views, Block manager
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
- **Minimalist, modern, sleek**: the model is Samsung Calendar plus the app's own nicest screens (Analytics, the live session): no heavy borders or glows, colour only for data and status, quiet segmented controls, one primary action per context. Screens that shipped a "card with border" look were rejected for the calendar; see `docs/navigation-plan.md` and the calendar notes below.
- **Never publish private data.** `stuff/` holds a real backup and screenshots. `src/**/*.private.test.ts` is git-ignored on purpose (`src/lib/storage/realBackup.private.test.ts` runs migration, projection, the AI planner and ICS export over the backup if it is present).
- **Pushing to `main` ships to Testing devices** (below). Don't push half-done work.
- Commit messages feed the in-app "What's new" (header = subject up to the first colon or " - "; add a `Changelog:` line to word it for users, or `Changelog: -` to hide). Release notes for the post-update sheet are hand-written in `src/lib/releaseNotes.ts` (add one at the top when behaviour changes; ids only ever grow).

## Releasing

- `.github/workflows/deploy.yml`: every push to `main` builds the web app and a signed Android APK and deploys one Pages site: `/` web app, `/android/` **Testing** channel (every push), `/android/stable/` **Stable** (promote by hand: Actions → this workflow → mode "promote"; copies the live test APK byte-for-byte).
- The APK is signed with Nathan's own key from repo secrets - **never switch keys** (a different key = Android sees a different app = uninstall = data loss; also the Drive OAuth client's SHA-1). `versionCode` = `git rev-list --count HEAD`; never change that. See `docs/signing.md`, `scripts/app-version.mjs`.
- The in-app updater (`plugins/app-updater`, `src/lib/update/`) installs APKs after checking SHA-256 and writing a safety backup.
- Data version `DATA_EXPORT_VERSION` is **3.36** (`src/lib/constants.ts`). A bump means every device must update before Drive sync resumes (devices on an older version refuse to merge with a newer one - `SyncVersionError`; older docs are upgraded forward through the same migrations).

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
- **Calendar** (Plan → calendar icon): `components/plan/PlanCalendar.svelte` and friends; pure logic in `planning/calendarEvents.ts`, `sessionColors.ts` (category colours), `calendarZoom.ts` (pinch / ctrl+wheel), `calendarDrag.ts` (hold-and-drag reschedule), `goalBars.ts`, `phaseStrip.ts`. Android phone-calendar overlay: `plugins/device-calendar`, `lib/calendar/`.
- **Navigation** (new): `AppBar` at the top of every screen (must be the screen root's first child), side drawer on phones, rail on wide/landscape, floating + (`Fab.svelte`), bottom bar kept as a per-device setting (`navStyle`). Plan and decisions: `docs/navigation-plan.md`.

## Where things stand (end of 2026-10-14)

Everything below is on `main`, pushed to Testing, **not yet tried on a real device**:

| Area | State | Doc |
| --- | --- | --- |
| Plan calendar (Day/Week/Month/Year), phone-calendar overlay, ICS export fix | built, flat Samsung-style look, category colours, pinch zoom, drag to reschedule, trip/competition bars, phase strip | QA §11, §12.16-12.17 |
| Phases as date ranges, sessions saved one by one (data 3.35/3.36) | built; verified against Nathan's real 2026-10-11 backup (migrates, every week shows what it did) | `phase-days-plan.md`, QA §12 |
| Block manager (the only place phases are edited) | built | `phase-days-plan.md` |
| AI coach on the new model (+ exact-day phases) | built | `changeSetPrompt.ts` |
| Navigation drawer / rail / floating + | built; drawer is the default | `navigation-plan.md`, QA §13 |

**Run `docs/qa-checklist.md` sections 11-13 on a real phone and a tablet first** (12.1 and 12.15, the update/import of existing data, matter most), then the rest of the checklist. Expect small polish items from that run.

### Known gaps and ideas, roughly by value

1. Real-device checks never done: Android back key and gesture navigation with the drawer, haptics on drag, safe areas, the update path over an existing install, Drive sync across two devices on 3.36.
2. ~~The floating + covers content~~ - done 2026-10-15: it hides while scrolling down and returns on scrolling up (`lib/navigation/scrollHide.ts`).
3. Wide-screen layouts for Home, History and Analytics (two columns of cards, master-detail like Samsung Calendar's Day + event pane) - they are a centred ~640 px column on tablets/laptops. Listed under "Later" in `navigation-plan.md`.
4. ~~Week view on a portrait phone~~ - done 2026-10-15: the list is the default on a portrait phone (setting `plan.weekListOnPhone`).
5. The welcome slides and README screenshots (`public/img/intro-*.webp`, `og.jpg`) show the old bottom-bar UI - regenerate when the look settles.
6. Search in the top bar, long-press on the + for a speed dial (quick timer), a mark per week in the Year view for phases was replaced by lines (done) - nothing else open there.
7. The Goals card under the calendar is still a bordered card.
8. Older plan/QA/audit docs (`pre-release-evaluation.md`, `android-backup-audit.md`) are historical; `qa-checklist.md` is the living one.

### Session of 2026-10-15 (live-session fixes and a UI/UX pass)

Nathan's list from using the app, all built on branch `claude/ui-ux-issues-navigation-4jj8ji` (see QA section 14): skipping inside a circuit asks (`ChoiceSheet`, `session/circuitFlow.ts`, setting `circuit.askSkip`); a circuit run covers only members still to do; stopping a session with a circuit open logs its sets and ends it (`settleCircuit` in `circuitHud.svelte.ts`); Start circuit is never silently disabled; a planned weight the type doesn't track is editable (`exercise/valueParams.ts`, "Add weight"); "Hold" vs "Hang" (`defaultRepLabel`); Done and Skip buttons in the timer notification (`liveButtons` in `circuitRun.ts`, Java `TimerForegroundService`). Found on the way: the migration invariant rejected any database with a benchmark test slot (typeId "test") - a real backup would have been rolled back; five layout settings (plan calendar, "New day starts at") had no Settings page (a test now guards this). Decisions from Nathan: ask on a circuit skip; hide the + on scroll; week list on narrow phones.

- Later the same day (after Nathan tried it): navigation is `auto` (bottom bar on a compact phone, drawer + rail when wide; `navMode` replaced `navStyle`, so the old default was dropped), the top bar hid on scroll (superseded: since 2026-10-18 `AppBar` is plain, non-sticky page content and the setting is gone; `scrollChrome` only drives the floating +), the week list merges phone events by start time (`dayAgenda`), the block button shows in the calendar view, calendar blocks are roomier and rounder (`plan.exerciseList` swaps the pills for a dotted list). QA section 15.
- 2026-10-16: week layout toggle, event details sheet (device-calendar plugin reads location + description), **Places** (`lib/places`, preference `places` replacing `homeLocation`/`crags`, device-local; `Workout.location` / `WorkoutTemplate.location` by name; `renamePlace` renames on sessions), session preview sheet on a calendar tap, AI sees places and sets a session's `place`. Google Places lookups (needs a paid key). QA section 16. `Place` is by name, no id - see the doc comment in `places.ts`.
- 2026-10-17: **places moved into the database** (table `places`, export version 3.37; synced by `name`; in `PLAN_TABLE_NAMES`, so the plan undo restores them). The device preference `places` is now only the legacy source: `trainingState.adoptDevicePlaces()` moves it over once on the first start and empties it. `homeLocation`/`crags` are derived from the list in `state.svelte.ts`. AI: a `places` section in the change set (`CSPlaceChange` add/edit/remove by name; `changeSet.ts`, planner block `place-N`, `PlanWrites.places` + `placeRenames`, prompt `AI_PLACES_INSTRUCTIONS`) and an Organise area `places` (edit/remove only, no coordinates in the prompt). A rename in a change set renames the sessions and phase templates in the same write (`storage.applyPlanWrites`), and an undo reverses it for the logged sessions via `PlanUndoRecord.placeRenames`. Coordinates from the AI are accepted but flagged "check on a map". QA 16.7-16.10. Nothing here tried on a phone.
- 2026-10-19: **Analytics rebuilt by question** (`Analytics.svelte`): tabs Overview / Training / Recovery / Progress (was Insights / Training / Body / Progress). Insights became `FindingsPanel` (a list it is given); `insights.ts` has `findingTab` (the tab of the chart a finding points at) and `topFindings` (Overview: urgent first, the load verdict always, two good); link tabs are `AnalyticsTab`. Section registry unchanged (`TAB_OF` maps cards to tabs; `MORE_OF` folds strain and finger load under "More charts"; fatigue moved to Recovery, the calendar heatmap to Overview). `LoadPanel` has the bars and, in a pane of its own, the ratio (no dual axis). Axis labels thin from the measured screen width. QA 17. Headless only; seeding in the sandbox: build a backup from `buildDemoData()` and use `seedBackup` + `STATE_EXPR` from `scripts/headless/lib.mjs` (a plain-path import of the state can be a second copy after hot reload).
- Not verified on a device: the notification buttons (Java was written, **not compiled** - no Android SDK in the cloud session; the page side is tested headless and by unit tests), Android back with the new sheets, haptics.
- The cloud sandbox blocks `api.iconify.design`, so `npm test` reports one unhandled error from `offlineIcons.test.ts` (the icon generator can't fetch); all tests pass. No new icons were added.
- Still open from the audit: the year grid's week cells are 26 px; the Plan session section's own + duplicates the floating one; History/Analytics wide layouts.

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
