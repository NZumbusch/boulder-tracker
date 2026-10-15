# UI fault log, round 2 (2026-10-15)

Seven packages worked through `docs/ui-fault-log.md`, one status file each (`a-live-session`, `b-logging`, `c-plan`, `d-home-history`, `e-analytics`, `f-settings`, `g-chrome`). Counted from the tables: about 480 rows, **322 fixed, 74 partly, 54 skipped, 31 not an issue or already fixed**. Everything was checked headless (phone portrait light for most, some dark and landscape; each status file says which); nothing has been tried on a phone.

## Open: decisions for Nathan (one line each; the full lists are in the status files)

- **Live session (A):** Pause and End to a bottom bar for one hand; "Start from a planned session" on an empty session; Move up/down buttons for reordering; an "As prescribed" button for the swipe-done path; one vocabulary (Finish & rate / End / Save).
- **Logging (B):** a way to log a session you already did (V-43); Plan B sessions in "Planned for this week"; warn before saving an empty session.
- **Plan (C):** week-cell colour-blind pattern and legend as filter; a 12-hour clock option; hide the Goals card in the calendar view; where the week-layout toggle lives.
- **Home and History (D):** the length of Home (collapsible cards or not); the phase as Home's title; four stacked banners; **History rows lost their fatigue letters (F7 A7 C6 S6) and nothing replaces them yet: a words line, a legend, or back as they were.**
- **Analytics (E):** hide-this-finding; planned load as outline bars (breaks the "never compare rated load with planned" rule); the dual-axis test chart; export button place.
- **Settings (F):** phases as one subpage each; per-page reset; split Timer; a switch for the fatigue-log reminder (new preference); AI-sharing default badges (descriptions and stored defaults disagree for Readiness and Pain issues); `navLabels` default.
- **Chrome (G):** one "+" per screen (V-3); wide layouts (V-66); an Undo that outlives its editor; merge two onboarding steps.

## Open: work left in files other agents did not own

- `state.svelte.ts`: pain check-in tap has no Undo; `clearWeek` confirm prints a raw week id; an in-app "Restore previous" after a backup restore.
- `public/img/intro-home.webp` shows the old Home header and needs regenerating.
- Home's fatigue colours (`FATIGUE_AXIS_COLORS` in `lib/constants.ts`) should be the Analytics series 3/5/4/6; Goal form and goals calendar should use the trophy for competitions; the Settings "History & Analytics" card names should match Analytics' new names (Training Days, Recovery Trends, Finger Load); a "Plan B" glossary term; a load bar on History rows (shared `ListRow`).
- `docs/qa-checklist.md` 18.2 names the old page for the flat-sections switch (now Look & feel).
- Not yet looked at on screen by anyone: Android-only settings pages, the AI coach modal, several sheets in landscape and on a laptop (see each status file).
