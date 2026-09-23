# Climbing Tracker

A training planner and log for bouldering and climbing, built with Svelte 5 and Vite. It runs in the browser and as an Android app (Capacitor). All data stays on the device.

## What it does

- **Plan**: phases with a typical week each, training blocks that assign phases to weeks, and per-week edits on top. Goals (competitions and outdoor trips, with projects) sit on the same calendar.
- **Train**: a live session with a timer, interval and set runs, logging each exercise against its target. Any session opens in one full-screen view: start it, edit it in place, or log it as planned.
- **Home**: readiness (fatigue, load ratio, sleep, HRV), today's sessions, the week so far, the current block, the next goal, weather and rock conditions at home and your crags, alerts, and progress. Every card can be reordered or hidden.
- **History and sends**: completed sessions and outdoor sends (8a.nu CSV import) with shared filters, and a grade chart.
- **Analytics**: rolling load with the acute:chronic ratio, training mix, fatigue, adherence, recovery warnings, outdoor grades, bodyweight and benchmarks.
- **AI coach**: builds a prompt with your plan and history to paste into any AI chat (ChatGPT, Claude, Gemini…), then imports its reply as a reviewable list of changes. The same flow fills or logs a single session.
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

## Deployment

Pushing to `main` builds the app and deploys it to GitHub Pages (`.github/workflows/deploy.yml`). The build uses a relative base path, so the same `dist/` works on Pages and inside the Android app.

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
