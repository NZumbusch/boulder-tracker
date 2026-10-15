# UI audit: plan

Run: `node scripts/audit/run.mjs --area=plan --out=<dir> --port=9503 --app=http://localhost:5303/` with `HEADLESS_OUT=<dir>/plan/shots` (create the folder first). 54 screens x 5 sizes x 2 themes = 540 captures. Headless Chrome only; nothing was tried on a real phone. The phone calendar is not available in a browser, so its events are put straight into the store (`deviceCalendar`) by the screens; the AI key and the plan-change history are written the same way.

## Screens covered (ids in `scripts/audit/screens/plan.mjs`)

Components of the area, each with the screens that show it:

- TrainingPlan: `plan-weeks`, `plan-weeks-empty`, `plan-weeks-nothing`, `plan-week-actions`, `plan-week-note`, `plan-goals`, `plan-planb-week`, `plan-planb-new`
- WeekCalendar (week grid in the Weeks view): `plan-weeks`, `plan-weeks-empty`, `plan-weeks-nothing`
- PlanCalendar: `plan-cal-week-grid`, `plan-cal-week-list`, `plan-cal-week-list-exercises`, `plan-cal-day`, `plan-cal-month`, `plan-cal-year`, `plan-cal-*-empty`, `plan-cal-*-nothing`, `plan-cal-*-events`, `plan-cal-contrast`, `plan-cal-contrast-month`, `plan-cal-edges`, `plan-cal-phases-off`
- CalendarTimeGrid: `plan-cal-week-grid`, `plan-cal-day`, `plan-cal-week-events`, `plan-cal-day-events`, `plan-cal-contrast`, `plan-cal-edges`, `plan-cal-phases-off`
- CalendarMonth: `plan-cal-month`, `plan-cal-month-events`, `plan-cal-month-empty`, `plan-cal-month-nothing`, `plan-cal-contrast-month`, `plan-cal-year` (mini months), `plan-cal-year-empty`
- CalendarAgenda: `plan-cal-week-list`, `plan-cal-week-list-exercises`, `plan-cal-list-events`, `plan-cal-week-list-empty`
- CalendarChips: `plan-cal-week-events`, `plan-cal-list-events`, `plan-cal-day-events`, `plan-cal-month-events`, `plan-cal-contrast`, `plan-cal-edges` (two phone calendars)
- PhaseStrip: `plan-cal-week-grid`, `plan-cal-day`, `plan-cal-edges` (with names), `plan-cal-phases-off` (strip off)
- GoalsCalendar: `plan-goals`, `plan-goals-empty`
- GoalForm: `plan-goal-form-new`, `plan-goal-form-trip`, `plan-goal-form-edit`
- SessionPreviewSheet: `plan-session-preview`
- EventSheet: `plan-event-sheet`
- BlockManager: `plan-block-manager`, `plan-block-manager-empty`
- BlockBrowser: `plan-block-browser`
- AICoachModal: `plan-ai-coach`, `plan-ai-coach-empty`, `plan-ai-analyze`, `plan-ai-context`, `plan-ai-organise`, `plan-ai-paste`, `plan-ai-direct`
- AiSendSheet: `plan-ai-send`, `plan-ask-direct`
- PlanHistorySheet: `plan-ai-history`
- AskAboutSheet: `plan-ask-session`, `plan-ask-block`, `plan-ask-insights`, `plan-ask-direct`
- PlanBSheet: `plan-planb-sheet`
- PlanBStretch: `plan-planb-editing`, `plan-planb-week`, `plan-planb-new`
- WeekShareImage: `plan-week-share`

Calendar look options (Settings > Plan calendar): higher contrast (`plan-cal-contrast`, `-month`), edges on events and phase names and category colours (`plan-cal-edges`), phases off (`plan-cal-phases-off`), week as a list, exercises as a list. All seen in light and dark.

## Findings

After the fixes the automatic checks flag 90 of 540 captures, all of them known and accepted (see below); no overflow, clipping, off-screen elements, unlabelled buttons or console errors anywhere.

Fixed:
1. WeekCalendar week cells (30 px): `tap` area to 36 px, the most the 6 px gaps allow, no visual change.
2. Calendar Day/Week/Month/Year buttons were 32 px tall: touch area 40 px (up and down only). Padding is 8 px instead of 12 px below 400 px width so "Add session" no longer wraps to two lines in Week view on a phone.
3. PhaseStrip, "Edit the Power phase" (Weeks view), year-view month titles, agenda event rows, ListRow body button (shared file, one class: goal rows were 38 px), week-action rows (copy, Plan B, share, repeat): `tap` hit areas.
4. AI coach footer buttons were 38 px: `min-h-10`.
5. GoalForm: the "To" date field stuck out of the card on a phone (flex children without `min-w-0`).
6. CalendarTimeGrid: a short phone-calendar event (30 minutes) showed its time line cut in half; the time is only drawn when the block is at least 44 px tall (the aria-label still has it).
7. TrainingPlan week actions: "week" no longer wraps alone next to the Replace button.
8. `askAbout.svelte.ts` (and AskAboutSheet): assignments as the value of an arrow function raised a Svelte `assignment_value_stale` console warning; now plain statements.
9. Harness (`scripts/audit/lib.mjs`): `scrollTo` now looks only inside the topmost dialog when one is open (it used to scroll the page behind a sheet, so the lower pages of sheet screens were copies of the first page).

Shared files touched (tiny, safe): `src/components/common/ListRow.svelte` (added `tap`), `scripts/audit/lib.mjs` (scroll, above).

Accepted, flagged by the harness: hour-grid blocks (sessions, events) under 40 px tall or 44 px wide on a phone, year-view day cells (23 to 34 px), the share-image preview (10 px, it is a picture), phase names in the strip (9 px, listed in `typeFloor.test.ts`). See `questions.md` (plan).

Note: with no sessions in storage the app projects the phase template (sessions "not saved yet"), so `-empty` screens still show planned sessions; `-nothing` screens also remove the phase blocks.

## Dead code / handoffs

None found. Handoff: none.

## Shots looked at

phone-p of nearly every screen at some point (weeks, calendar week list and grid, events, goal forms, sheets, AI coach in all modes, Plan B, week actions, share, history, ask), contact sheets for plan-weeks, plan-cal-week-list, plan-cal-week-events (light), plan-cal-contrast (dark), plan-cal-month-events (light), plan-cal-year (dark), plan-ai-send (light). Not looked at one by one: most dark variants, most tablet and landscape sheets, plan-block-browser, plan-ask-*, plan-cal-day-events.
