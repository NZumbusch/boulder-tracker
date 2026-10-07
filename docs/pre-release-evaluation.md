# Pre-release evaluation: build 1.7.28 (commit 843f93c)

Date: 2026-10-05. Method: production build in headless Chrome (portrait, landscape, 320/360/390 px, tablets, light and dark), the debug APK on the Pixel 8 Pro emulator, real sessions and circuits, junk imports, other timezones, a 700-session dataset, accessibility scans and exports.

## Verdict

Not ready to publish yet. The core is solid: 1,599 unit tests, svelte-check and the build are clean; offline, import safety, performance and the tour all held up. Five problems should be fixed first, the biggest being the landscape layout and a browser-history bug on the web build.

## Blockers

### 1. Landscape breaks the circuit runner and the active session
Confirmed in the browser and in the real Android app.

- **Circuit "GO" phase.** The dial gets about 0 px of height, but its text is absolutely positioned. "GO / reps / 0:00 / Weighted Pull-ups" pile onto the header and the "how to" row. Cause is in `CircuitRunner.svelte`: a `flex-1 min-h-0` dial between a header, an info block, a rep stepper, a big Done button and a footer with `pb-8`. Rest and switch phases fit; only the work phase breaks.
- **Session screen.** Header and footer use about half the height, leaving roughly 190 px. When an exercise opens, its Skip / Timer / Finish buttons are below the fold. The floating timer pill covers the next row.
- **Smaller landscape problems.** The interval timer's "GET READY" and "Set 1/3" text collides with the ring. The rating sheet, workout editor and AI coach are cramped (headers and footers take two-thirds of the height). Tour tooltips sometimes cover the element they highlight.
- **Suggested fix.** One rule for short viewports (`max-height ≈ 500px`): two columns for dial and controls, smaller paddings, hide the info chips, hide the bottom bar inside sessions and sheets.

### 2. Web/PWA: finishing a session navigates out of the app
- After "Finish & rate" then "Complete & Save", the tab went to `about:blank` (reproduced twice).
- `backStack.svelte.ts` closes the session and opens the rating sheet in the same tick. Browser history ends one entry too low (index 0 while the app believes the rating sheet is registered), so the final release calls `history.back()` past the app's first entry.
- Not affected on Android native (history is not used there). Needs a check on iPhone Safari and an installed PWA.
- Likely fix: queue releases and pushes so a new `pushState` waits for the previous `popstate`.
- The session itself saves correctly.

### 3. Weeks shown a day early west of UTC (the Americas)
- The welcome says "it starts on **Sunday**, October 4". The Plan header shows "Oct 4 – Oct 10" instead of 5–11.
- `getWeekDates()` returns UTC-midnight dates; `getWeekDateRange()` formats them with `toLocaleDateString()` in the local timezone. Fix: `timeZone: 'UTC'` in the format options.
- Verified wrong in LA, New York and São Paulo; correct in Berlin, London and Tokyo. Week ids and scheduling are unaffected; it is display only.
- Audit the other ~15 `getWeekDates` callers for local-time getters.

### 4. Calendar export (.ics) writes wrong end times
- Every event ends at a hard-coded 12:00. A planned 18:00 session ends at 12:00, before it starts; a 3-hour session spans 12+ hours.
- `src/lib/ics.ts`: `formatDateToICS(endObj)` is called without a time argument, so it falls back to 12:00. No test covers it.

### 5. Android timer notification says "Unknown" after a cold restore
- After force-stop and relaunch mid-circuit the notification read "Paused · Go · **Unknown** · 8 reps".
- `slotTypeName()` falls back to "Unknown" when exercise types are not loaded yet; the plan is published before they load and not refreshed until the next step.

## Should fix

- **Web: circuit keeps counting while the session is paused.** Android pill freezes correctly; the browser clock ran 1:34 → 1:38 while the header said PAUSED.
- **AI paste fails if the reply has text before the code fence.** Only a fence at the very start is stripped, so "Here's your plan! ```json…" fails with "Unexpected token 'H'". Extract the first `{…}` instead.
- **Large text (Android 130%).** "100" overflows the readiness ring; at 200% the Home header wraps with a dangling "·".
- **Contrast.** Light mode: success green 2.3–2.5:1 and orange 2.6–2.8:1 on small text ("GOOD", "SESSION RUNNING", "✓ Target"). Dark mode: captions 3.9:1, blue link text 3.6:1. All below WCAG AA 4.5:1.
- **Screen readers and keyboard.** 36 unnamed buttons in the Plan year calendar, plus the bodyweight "+" submit. Sheets lack `role="dialog"`/`aria-modal`; Tab walks through the page behind a sheet; Escape does not close sheets.
- **Restoring a backup makes no safety copy first.** "Delete all data" does. Importing a file with no workouts replaced 16 sessions with 0 (the confirm exists on the button).
- **PDF flattens circuits.** Members appear as plain numbered exercises with no group name, rounds or rests.

## Minor

- Session length has no sanity cap (3045 minutes saved).
- Bodyweight silently rejects bad values (−5, 9999) with no message.
- Importing a newer export version (v999) is accepted without a warning.
- AI errors show raw parser text ("Could not parse as JSON: …").
- Starter plan reads "Easy Climbing, Easy Climbing"; phase names truncate ("Power End…").
- `privacy.html` overflows by 3 px at 320 px wide (long URL in `<code>`).
- Reddit in-app banner overlaps the welcome title.
- Paused circuit pill shows pause bars rather than a play icon.

## What passed

- Build and tests all green. `npm audit`: one dev-only advisory (`devalue`), nothing shipped. No stray TODOs or console logs.
- No horizontal overflow on any tab or Settings page (~40 pages) in portrait or landscape, on tablets (1024×768, 768×1024) and 320 px phones.
- Welcome flow, iPhone install gate, in-app browser banner and Android card work. The tour completes all 25 stops in both orientations and restores your data.
- Full session loop saved the right load (207 vs 204 planned). Set timer is fine in landscape. Stop dialog, circuit rest phases and Android Back-key layering (circuit → session → Home → minimise) are correct.
- Android: a force-stopped session comes back paused; rotation mid-circuit keeps state; foreground notification and session pause-link work.
- Corrupt, empty, wrong-type and bad-date imports are rejected with data untouched.
- Offline reload works with all lazy screens. Manifest has 3 icons, 3 shortcuts, 3 screenshots.
- Pain flow works end to end; backup JSON exports; PDF renders.
- Performance with 711 sessions and 6,000 metrics: longest main-thread task 93 ms, heap 20 MB.
- Public pages: no broken links or images; external links use `noopener`.

## Not tested (needs a real device or accounts)

iPhone Safari and installed PWA (QA checklist items 1–3), spoken timer audio, Google Drive sync, Health Connect, home-screen widgets, the self-updater, the fresh-install notification-permission flow. Headless fade-ins stalled for about 7 s, so check on a real phone that the session screen does not look see-through when it opens.

## Estimated effort

| Item | Estimate |
| --- | --- |
| 1. Landscape (circuit, session, interval ring, sheets), verified on the emulator | 4–6 h |
| 2. History race | 1–2 h |
| 3. Week date display plus caller audit and tests | 1 h |
| 4. `.ics` end time plus test | 0.5 h |
| 5. "Unknown" notification name | 0.5–1 h |
| **Blockers total** | **about 7–10 h** |
| Should-fix list (AI fence 0.5, web circuit pause 1, large text 1, contrast 1–2, accessibility 2–3, safety backup 0.5, PDF circuits 1–2) | about 7–10 h |
| Minor list | 1–2 h |

Suggested order: 3 and 4 first (quick, fully testable here), then 5, then 2, then 1, which needs the most iteration. Everything except the real-device checks can be re-verified with the same headless and emulator scripts.
