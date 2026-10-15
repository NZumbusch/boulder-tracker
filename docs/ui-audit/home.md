# UI audit: home

Run: `node scripts/audit/run.mjs --area=home --out=<dir> --port=9502 --app=http://localhost:5302/` with `HEADLESS_OUT=<dir>/shots` for the raw page shots. 31 screens x 5 sizes x 2 themes = 310 captures. Headless Chrome only; nothing was tried on a real phone.

## Screens covered (ids in `scripts/audit/screens/home.mjs`)

- Home with data: `home-full` (4 pages on a phone: Readiness, Alerts, Today, Metrics, Fatigue, This Week, Week recap, Training block, Next goal, Recent activity, Weather, Crags), `home-details-off` (every card's optional parts switched off), `home-customised` (re-ordered, four cards hidden, timers), `home-weather`, `home-next-goal`.
- Home states: `home-empty` (Checklist card, readiness with no data), `home-empty-simple` ("Simple Home until I have data"), `home-example-data` (banner and cards), `home-weekly-checkin` (CheckinCard), `home-android-card`, `home-android-steps` (AndroidAppCard), `home-pain-due`, `home-pain-stale` (PainCheckInCard, PainCheckInButtons), `pain-heads-up` (PainHeadsUp chip in the Today card).
- Timers: `home-timers` (TimerCard with five saved timers, one with a long name), `home-timer-sheet` (the quick timer sheet it opens).
- Sheets: `acwr-sheet`, `acwr-sheet-sparse` (AcwrSheet, with and without enough history), `taper-sheet` (TaperSheet).
- Quick log (QuickLogSheet): `quicklog-menu`, `quicklog-pain-issues`, `quicklog-pain-none` (PainIssues), `quicklog-bodyweight`, `quicklog-bodyweight-empty` (BodyweightLog), `quicklog-send`, `quicklog-test`.
- Pain screens (PainScreens): `pain-report-new`, `pain-report-filled` (PainReportSheet), `pain-issue-open`, `pain-issue-resolved`, `pain-issue-edit` (PainIssueSheet).

## Components

dashboard: Home, AndroidAppCard, QuickLogSheet. dashboard/home: AcwrSheet, AlertsCard, CheckinCard, ChecklistCard, CragsCard, FatigueCard, FrictionMark, MetricsCard, NextGoalCard, PainCheckInCard, ProgressCard, ReadinessCard, RecentActivityCard, SectionHeader, TaperSheet, ThisWeekCard, TimerCard, TodayCard, TrainingBlockCard, WeatherCard, WeekRecapCard. health: BodyweightLog, PainCheckInButtons, PainHeadsUp, PainIssueSheet, PainIssues, PainReportSheet, PainScreens.

FrictionMark (a small mark in the Crags and Weather cards) shows up only with real weather data; headless has none, so it was not seen. Weather and Crags show their "unavailable" states.

## Findings

Automatic checks: after the fixes below, 0 flagged in 308 of the 310 captures (no overflow, clipping, tiny text, missing labels or console errors). The two exceptions are `quicklog-bodyweight` and `quicklog-bodyweight-empty` (bar chart, see questions).

Fixed:
1. TrainingBlockCard: the week bars were 36 px tall buttons; the container is now 40 px (the padding on top became a margin).
2. ReadinessCard: the "Load ratio" row in the score breakdown was 36 px high, now 40.
3. PainCheckInCard: the issue name row was 21 px high; gets the shared `tap` hit area (no visual change).
4. BodyweightLog: the gaps between bars are now part of the bars' hit area (no visual change); still under 40 px, see questions.

Skipped (taste, see `questions.md`): bodyweight chart density and baseline, wide-screen column width.

Setup notes (harness): a screen that saves timers or changes Home sections must undo it, because preferences persist in the browser profile between screens (`resetPrefs`); the quick-log menu buttons are clicked inside the dialog, otherwise the Home card behind with the same name is hit.

## Shots looked at

Contact sheets: home-full (light, plus the four phone pages), home-pain-due (dark), home-empty (light), home-example-data (light), home-weekly-checkin (dark), home-timers (dark), home-android-steps (light, before the fix to the click), acwr-sheet (light), taper-sheet (dark), pain-issue-open (light), pain-report-filled (light), quicklog-bodyweight (light), quicklog-pain-issues (dark), quicklog-send (light), quicklog-menu (dark), pain-heads-up (light). Not looked at one by one: the dark variants of most, home-details-off, home-customised, home-weather, home-next-goal, home-pain-stale, quicklog-test, quicklog-bodyweight-empty, pain-issue-resolved, pain-issue-edit, home-timer-sheet.
