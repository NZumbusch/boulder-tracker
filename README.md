# Boulder Tracker

A training planner and log for bouldering and climbing, built with Svelte 5 and Vite. It runs in the browser, installs as a web app (iPhone: Safari → Share → Add to Home Screen) and as an Android app (Capacitor). All data stays on the device.

## What it does

- **Plan**: phases with a typical week each, training blocks that assign phases to weeks, and per-week edits on top. Goals (competitions and outdoor trips, with projects) sit on the same calendar.
- **Train**: a live session with a timer, interval and set runs, logging each exercise against its target. Any session opens in one full-screen view: start it, edit it in place, or log it as planned.
- **Home**: readiness (fatigue, load ratio, sleep, HRV), today's sessions, the week so far, the current block, the next goal, weather and rock conditions at home and your crags, alerts, and progress. Every card can be reordered or hidden.
- **History and sends**: completed sessions and outdoor sends (8a.nu CSV import) with shared filters, and a grade chart.
- **Analytics**: rolling load with the acute:chronic ratio, training mix, fatigue, adherence, recovery warnings, outdoor grades, bodyweight and benchmarks.
- **AI coach**: builds a prompt with your plan and history to paste into any AI chat (ChatGPT, Claude, Gemini…), then imports its reply as a reviewable list of changes. The same flow fills or logs a single session.
- **First run**: a short welcome (training level, units, home location; on iPhone Safari the install steps first), then an optional tour of every screen on example data (`src/lib/tour/`, steps in `steps.ts`). Replay from Settings → About & Help.
- **Data**: JSON backup and restore, CSV / PDF / calendar export, and on Android local notifications (post-session rating, daily metrics).

## Development

```bash
npm install
npm run dev      # dev server
npm test         # vitest
npm run check    # svelte-check (types)
npm run build    # production build into dist/
npm run icons    # regenerate the offline icon bundle after using a new icon
```

Icons are bundled rather than fetched from the Iconify API, so the app works offline. A test fails if an icon is used but not bundled; `npm run icons` fixes it.

## Android

Needs Android Studio.

```bash
./setup-android.sh   # first time: installs, builds, adds the Android platform
./run_android.sh     # afterwards: builds, syncs and opens Android Studio
```

`android/` is tracked in git (manifest, `MainActivity`, launcher shortcuts in `res/xml/shortcuts.xml`, the widget); local Capacitor plugins live in `plugins/` (`timer-service`, `drive-sync`).

### Google Drive sync - one-time setup

Sync (Settings → Data & Exports → Sync) uses each user's own Google Drive app folder; there is no server. Google only hands out Drive access to apps registered in a Google Cloud project, so once:

1. [Google Cloud console](https://console.cloud.google.com) → create a project (e.g. "Boulder Tracker").
2. *APIs & Services → Library* → enable **Google Drive API**.
3. *Google Auth Platform* (OAuth consent screen) → set it up as **External**, with an app name and your email. Under *Audience*, either add your Google account as a test user (in *Testing*, Google asks you to sign in again every 7 days) or **publish** it - `drive.appdata` is a non-sensitive scope, so publishing needs no review.
4. *Clients* → create an **Android** OAuth client: package name `com.nzumbusch.bouldertracker`, and the SHA-1 of the key the APK is signed with. For debug builds from a machine: `keytool -list -v -keystore ~/.android/debug.keystore -storepass android -alias androiddebugkey`. Each signing key (another computer, a release key) needs its own Android client in the same project.

No client ID goes into the code - Play services matches the app by package name and signature. How sync works: `src/lib/sync/` (`merge.ts`, `syncEngine.ts`, `driveSync.svelte.ts`).

## Deployment

Pushing to `main` builds the app and deploys it to GitHub Pages (`.github/workflows/deploy.yml`), served at https://bouldertracker.nathanzumbusch.de/. The build uses a relative base path, so the same `dist/` works on Pages and inside the Android app.

### Web app (PWA)

`vite-plugin-pwa` (in `vite.config.js`) writes the manifest and a service worker that precaches the whole build, so the installed app opens offline. A new deploy shows a "Reload" toast rather than switching under a running session (`src/lib/pwa/pwa.ts`); the service worker is not registered inside the Android app. Home-screen icons are PNGs in `public/icons/`, rendered by `node scripts/generate-pwa-icons.mjs`.

What the web app can't do, on iOS in particular: scheduled reminders, timer beeps with the screen locked (keep the screen on - Settings → Sessions & Timer), Drive sync, widgets and shortcuts (Android only). On iPhone the Home Screen app has its own storage, separate from Safari's.

## Where things live

```
src/
  App.svelte              screen switch, bottom nav, app-wide modals
  components/
    dashboard/            Home, one component per card in home/
    plan/                 planner, blocks, goals, AI Coach
    workout/              the workout modal (view / edit), live session, timer, start screen
    history/, sends/      History tab: sessions and outdoor sends
    analytics/            Analytics screen and its panels
    settings/             Settings screens
    common/               shared sheets and modals
  lib/
    state.svelte.ts       trainingState: the app-wide facade over the stores
    stores/               reactive stores per domain (workouts, planning, catalog, …)
    storage/              persistence (IndexedDB on web, a JSON file on Android) and data migrations
    types.ts              the data model
    analytics/            load formulas, ACWR, readiness, progress
    planning/             week projection, schedule, durations, block outlook
    ai/                   prompts, reply validation, change planning
    session/              live-session logic
    preferences/          device settings, tunables, Home card options
    weather/, sends/, goals/, alerts/, notifications/, timer/, share/, …
```

Most logic is in plain TypeScript modules under `src/lib/` with tests next to them; components mostly render it.

### Data and migrations

Stored data carries a version (`DATA_EXPORT_VERSION` in `src/lib/constants.ts`). On startup, older data, including imported backups, is upgraded step by step by `src/lib/storage/migrations.ts`. A backup is kept, and the upgrade is rolled back if its safety checks fail. A shipped migration step is never changed afterwards; a new one is added instead.

Weeks that follow their phase aren't stored. They're projected from the phase's typical week until you edit them, and only then written out (see `src/lib/planning/weekProjection.ts`).
