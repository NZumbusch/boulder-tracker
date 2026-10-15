# UI/UX fault log

Design audit of the whole app, screen by screen, written 2026-10-15 at the request of Nathan. This is a log, not a plan: nothing in the app was changed.

## 0. How this was made, and what it is not

- **Screens:** Home, Plan (blocks view; calendar Day / Week / Month / Year), Log a workout, the live session, History (Sessions, Sends), Analytics (all four tabs), Settings hub, Quick log, Training Blocks sheet and the AI coach sheet were opened in headless Chrome on the demo data (400×860 phone, 850×390 landscape, 1366×768 laptop; light and dark). Those are Part 2.
- **Code:** three read-only passes over every component folder (workout/live session and sends/health, plan/home/history/analytics, settings/onboarding/tour/common/nav) are Parts 3-5. They look for tap targets, contrast, missing labels, drift from the design tokens, copy and state handling.
- **Code audited:** branch `claude/chips-order-session-card` at `22a8ec2`. The designated branch `claude/ui-ux-issues-navigation-4jj8ji` has an unrelated history (no merge base; it is 449 commits behind), so some "borders on cards" findings may differ there; I did not audit it.
- **Honesty:** nothing here was tried on a phone or a tablet. Parts 3-5 come from reading code and from arithmetic on the colour tokens, not from rendering; the few I re-checked in the source myself are marked "(Confirmed in source)". Where a claim depends on runtime data it says "verify". The demo data is thin in places (two outdoor sends, rest days), which exaggerates some empty-looking charts.
- **Size:** about 600 findings (66 from screens, about 150 for the live session and logging flows, 290 for Plan/Home/History/Analytics, 147 for settings and chrome). Severity: **P1** data loss or a feature that can fail to work, **P2** major (a frequent flow is hard, or an accessibility failure), **P3** minor, **P4** polish.

## 0.1 Status after the first round of fixes (2026-10-15)

Not done. About 600 findings were logged; one round of fixes has landed, which covers some of the twelve "fix first" items and a fraction of the rest. Checked by reading the commits and the code, and a headless smoke run of every screen on example data (no errors); nothing has been tried on a phone.

| # in 1.1 | Item | State |
| --- | --- | --- |
| 1 | Deletes without confirm or undo | **Not started** (the Toast got a full-size, longer-lived Undo, which the fixes will need) |
| 2 | Session bubble covers lists | **Done**: the bubble is a button in the bottom bar or a strip along the bottom, never floating |
| 3 | Tap targets mid-workout | **Partly**: timer widget, set editor, run-adjust and session sheets reworked; circuit runner, steppers elsewhere not checked |
| 4 | Charts unreadable by touch | **Not started** (the ACWR zone helper and a series colour stylesheet are groundwork) |
| 5 | One colour, several meanings | **Partly**: a navigation accent and a series stylesheet; green/blue meanings in cards and charts not yet separated |
| 6 | Plan B explained nine times | **Not started** |
| 7 | Four different "+" | **Partly**: Home's header has a pencil for Quick log; Plan's + and the others unchanged |
| 8 | Accessibility baseline | **Partly**: a visible focus ring, dialogs named after their title; `role="dialog"`/`aria-pressed`/icon labels across the sheets not done |
| 9 | Date and week formats | **Done** (one way to write a day and a week; the day-early bug west of UTC fixed, and in the weather strips) |
| 10 | Bar-mode navigation hides Settings | **Partly**: bar, rail and drawer share an accent and a bottom bar component; Settings and sync status in bar mode to be re-checked |
| 11 | Jargon without help | **Partly**: glossary entries added; many terms still have no info button |
| 12 | Silent disabled buttons and validation | **Not started** |

Also landed: shared `Sheet`, `Segmented`, `Toggle`, button and field utilities (**built, not yet used by the 16 hand-copied sheets**), the Analytics windows no longer run two weeks into the future (V-52), identical exercise chips grouped in the week list (V-33), one trip/competition style in the calendar, units radio cards on the welcome screen. One helper (`lib/analytics/joinRuns.ts`, line-gap handling for charts) is written and tested but **not wired in yet**.

What a second round should do, in order: adopt the shared sheet and controls everywhere (removes most of the Part 3-5 items by itself), then 1, 12, 4, 6, then the Part 3-5 findings by severity.

## 1. Read this first

### 1.1 The twelve things I would fix first

1. **Deletes without confirm or undo, in a dozen-plus places, and eight different delete patterns.** A logged session (`WorkoutView.svelte:89-94`, `SessionActionsSheet`), a send (`SendForm.svelte:93`), a bodyweight entry (`BodyweightLog.svelte:138`, a 14 px target, confirmed), pain check-ins and a whole pain issue with its history (`PainIssueSheet`), clearing a week (sits beside "More"), a block, a goal, a test result, a Plan B, a phase-template session, a coach note, the AI key. Meanwhile other deletes have Undo (phases, categories, tests) and the app already has the toast-undo machinery. One rule, applied everywhere: reversible → Undo toast, irreversible → confirm. (Part 3 cross-cutting, Part 4 #6, Part 5 #88.)
2. **The session bubble hides the right-hand column of every list while a session runs** (V-7). Grades, load numbers and sparklines vanish under it on Home, History, Sends. Dock it into the bottom bar or pad the page.
3. **The tap targets of the controls used mid-workout are 14-36 px.** Timer widget "+30s / −30s" (about 16 px), mode toggles 28 px, Reset 32 px next to Play; circuit-runner correction ± 36 px; set-row steppers 32-36 px; "Add your first exercise" a 16 px link as the only way forward on an empty session. These are used with chalky, one-handed thumbs. (Part 3.)
4. **Charts cannot be read by touch or keyboard.** Values live in hover tooltips (`title`, `group-hover`), 8-9 px chart text ignores the Text-size setting, the load chart's tap opens a detail sheet instead of showing the value, ACWR dots are 8 px, the heat-map is 370 focusable 5-11 px buttons, and no plot has a keyboard route or a data table. (Part 4 cross-cutting #3, #5, #122-123, #135, #144.)
5. **One colour carries several meanings.** Green means "you are here" (bottom bar), "done", "good", "Technique Bouldering" and the plan-progress bar; blue means link, selected, HRV, load bars, trips, planned and rain; purple means strain, sleep, outdoor ascents and a phase; red means missed, delete, "now" and the pain scale; orange means finger load, RHR and caution. Add the two competing "accent" colours in navigation (V-1, V-5). Give data series their own palette and keep status colours for status. (V-1, Part 4 cross-cutting #2.)
6. **Plan B is explained nine times and controlled four ways in one card** (V-28, Part 4 #268-269). The control for "Saturday: board or outdoor?" is the biggest block of text on the Plan screen.
7. **The Plan screen has no unambiguous way to add, and four "+" mean four different things** (V-3, Part 4 cross-cutting #13). Same glyph: log, quick log, add session, add test, add goal.
8. **Accessibility baseline is missing:** no global `:focus-visible` style, no `role="dialog"`/`aria-modal` on most sheets, no `aria-pressed` on the segmented controls, icon-only buttons without labels (Block manager close/edit/delete), year-grid cells labelled with raw ids (`2026-W17`), a contrast theme in which elevated surfaces equal the background (Part 5 #44-45, #60, Part 3, Part 4).
9. **Date and week formats:** the same day is written "Oct 14, 2026", "Wed 14", "14 Oct", "2026-10-14"; the same week "W42", "Week 42", "2026 · week 42", "WK 42", "2026-W42" (V-24, Part 4 cross-cutting #1 and #9). **And** a real bug: the Home weather and crag strips parse date-only strings as UTC, so the weekday label is a day early west of UTC (`CragsCard.svelte:66`, `WeatherCard.svelte:120`; the neighbouring cards use `T12:00:00Z`; confirmed in source, not run in a US timezone).
10. **The bar-mode navigation locks you out of Settings and hides sync problems** (Part 5 #28-29). With the bottom bar (the default on a compact phone), Settings is reachable only from Home's gear, and a sync failure or running session has no surface at all (they are drawer rows).
11. **Jargon without help:** ACWR, load pts, ratio, monotony, strain, ramp rate, RHR, Plan A/B, "Uncertain days", tokens, "Analytics type", F7 A7 C6 S6. Ten different places show the term with no info button (Part 4 cross-cutting #10, Part 5 #70). The same quantity has two names (load vs planned load, Block vs Phase, Test vs Benchmark vs Folder vs Group).
12. **Silent disabled buttons and silent validation** across forms (Save disabled with no reason in the exercise form, send form, pain report, preset name, goal form, circuit editor, test editor), with number fields lacking `inputmode`, so Android shows the wrong keyboard (`ExerciseForm`, `BodyweightLog`, `LocationEditor` where a missing minus sign blocks negative coordinates).

Also notable but not on the top twelve: no way to log a past session (V-43); the toast truncates its own message and its Undo is 28 px and can be silently replaced (Part 5 #1-3); a failed lazy-chunk load leaves a blank screen with no retry (Part 5 #39, confirmed); "Fatigue Log Reminders" shows a green "On" that is not a control (Part 5 #85, confirmed); the 3M analytics window extends two weeks into the future (V-52); Home puts four unrequested banners above the cards you ordered (Part 4 #4).

### 1.2 Systemic causes (fix these and many items go away)

| Cause | Examples | Fix once |
| --- | --- | --- |
| No shared `Sheet`/`SheetHeader`; about 16 hand-copied sheets with different scrims (`bg-black/40/50/55/65`, `bg-app-bg/85/90`), radii (2xl/3xl), padding (p-5/p-6), z-indexes (100-200), heights (`vh`), and close buttons (20/28/36/44 px) | Part 3 cross-cutting, Part 4 cross-cutting #7, Part 5 #9-12 | One `Sheet` with `dvh`, safe area, drag, Escape, `role="dialog"`, 44 px close, z tokens |
| No `Segmented`, `Toggle`, `ActionRow`, `Button` components; classes duplicated | Part 5 #60-61, #74, #126; Part 3 button sizes | Four small components with 44 px minimum |
| Type-ramp floor (11 px) not enforced for charts, badges, nav labels | `text-[9px]` ×9, `text-[10px]` ×40 in `src`; PhaseBand, LoadPanel axes, week-grid year, "PLAN A" pills, the bottom-bar labels | Lint for `text-[Npx]`; a `--typescale-micro` that scales with Text size |
| Opacity modifiers on text tokens that were already tuned to about 4.6:1 (`/50`, `/60`, `/70`) | "Today" button, axis labels, hints | Remove modifiers; add a tested `content-faint` token |
| Hover-only affordances (`title`, `group-hover`, `hover:text-danger`) on a touch-first app | Weather friction dots, bar tooltips, "Delete this issue" link that looks neutral on touch | Inline text or tap-to-readout |
| Status colours used as data colours | Orange finger load, green readiness line, red triangles over bars | Categorical series palette |
| Per-screen formatters | Week id, dates, minutes (`1h 20m` vs `3h`), units (`pts`, `load`), `—`/` - `/`·` | `formatWeek`, `formatDay`, one minutes formatter, one separator rule |
| Flat/soft cards setting only partly honoured | ReadinessCard, SummaryStrip tiles, BlockReviewSheet, BenchmarkViewControls, QuickLogSheet, AICoach cards, send stat tiles, Planned-for-this-week row | `.card` or `.tile` that the setting flattens |

### 1.3 What is good (so the log is not only complaints)

The token system (`card`, `seg`, `chip`, type ramp, status tokens) is well built and most problems are drift from it. The Analytics rebuild by question (Overview/Training/Recovery/Progress) with plain-language findings, the readiness breakdown sheet, the swipe-to-complete live session, the circuit "ask on skip" sheet, the Block manager's range-of-days model, the AI coach's step indicator and review list, the 2-tap armed discard in the exit modal, Undo on settings import and on phase delete, the empty-state copy on Analytics, and the sr-only data table behind the grade chart are all things to copy elsewhere.

### 1.4 Contents

2. Findings from using the running app (V-1 to V-66)
3. Code audit: live session, workout editor, sends, pain and bodyweight
4. Code audit: Plan, Home, History, Analytics
5. Code audit: settings, onboarding, tour, update, common widgets, navigation chrome

---

## 2. Findings from using the running app (screenshots)

Seen in headless Chrome at 400×860 (phone), 850×390 (landscape) and 1366×768 (laptop), light and dark, on the demo data. Each item was looked at on screen; code references are given where I checked the source. Item ids `V-n` are mine; `W-`, `P-` and `S-` ids in Parts 3-5 come from the line-by-line code audits.

### 2.1 Navigation and app chrome

**V-1 (P2) Two accent colours say "you are here" and "you can tap".** The bottom bar marks the active tab green (`text-success`, `App.svelte:207`) while every link, selected chip, toggle and primary button is blue (`primary`). Green is also the status colour for "done / good". The result is that "Plan" lit up in green looks like a status. *Fix:* use one accent for selection and action (primary); keep green for status only.

**V-2 (P2) The bottom bar is icons only by default.** Labels exist (`navLabels`) but are off, and when on they are 10 px. Five icons, one of which (clipboard for History, a plain "+" for Log) is not a standard metaphor. A new user cannot tell "History" from "Plan" without tapping. *Fix:* labels on by default at 11-12 px; swap the clipboard for a history/clock icon.

**V-3 (P2) The centre "+" in the bottom bar is a destination, but looks like an action.** It opens the "Log a workout" screen (a menu of four choices), not a log form. On the Plan screen there is also a header "+" (add session) and, with the drawer, a floating "+" that adds to the plan. Four different "+" meanings (log, quick log on Home, add session, add goal/test/send) with the same glyph. *Fix:* one "+" per screen; give secondary adds a text label ("Add test"); use a different glyph for the Home quick log.

**V-4 (P3) The active "+" glows.** `shadow-[0_0_20px_var(--color-success)]` on the active Log button contradicts the handover's "no heavy borders or glows" rule. It is also the only glow in the app.

**V-5 (P2) The active-tab indicator is different in each navigation mode.** Bottom bar: a green dot under a green icon. Rail (wide / landscape): a blue tonal pill around the icon. Drawer: a tonal row. The same "you are here" has three visual languages.

**V-6 (P3) Rail and landscape lose every label.** On 850×390 and 1366×768 the rail is five bare icons plus a menu icon on top and a gear at the bottom, with no labels. The rail has the room for 11 px labels. In 850×390 landscape the Analytics screen shows two rows of tiles and the top of one card.

**V-7 (P2) The running-session bubble covers content and cannot be moved.** On Home, History and Sends it sits over the right side of the content and hid the "7A" grade of a send row and the resting-heart-rate sparkline (dark Home, History/Sends shots). It is `fixed` at the bottom right above the bar with no way to dismiss, drag or collapse it. Because it appears on every screen for the whole session, it permanently hides the right-hand value column of the lists (grades, load numbers). *Fix:* dock it into the bottom bar's centre (replace the "+" while a session runs), or give the page bottom padding equal to its height, or let it be dragged to either edge.

**V-8 (P3) The bubble reads "0/0" and "0/60 min" for a session with no exercises.** A freshly started empty session shows an empty progress ring and "0/60 min", where 60 is an invented default. *Fix:* show elapsed time only until there is a plan.

**V-9 (P3) Settings opened from Home shows a back arrow, from the drawer it does not.** Settings is both a root destination (drawer, rail) and a nested page (Home's gear), so its top-left control changes (menu or back). By the code (`appBarBack`, `AppBar.svelte`) a nested page gets the arrow and a root destination gets the menu, so Settings reached from the drawer or rail should look different from Settings reached through Home's gear. I only saw the Home-gear case (arrow); the drawer case is read from code, not seen. Same page, two top-left controls.

**V-10 (P3) The Home header carries three icons (blue "+", grey "?", grey gear) and the title is a phase name.** Home is titled "Power" (the current training block) with the date as subtitle; there is no word "Home" anywhere on the screen. The blue "+" is the Quick log, the "?" starts the tour (a feature used once, taking permanent header space), and Settings is already in the drawer / bar. *Fix:* move the tour into Settings → Help; keep "Home" as the title and show the phase as a chip.

### 2.2 Home

**V-11 (P2) The first thing under the readiness score is an alert about the same score's inputs, and a "no backup" alert.** The hero card (76, "GOOD, Acute load is well below your chronic baseline") says "good" and the next card (red dot) says "Load spiked 45% week-over-week while readiness declined". A "good" hero directly above a red alert contradicts itself without explanation. The "Alerts" card also mixes a health signal (red) with housekeeping (grey "No backup yet"). *Fix:* separate "signals" from "housekeeping"; reconcile the hero text with the alert, or say what each one measures.

**V-12 (P3) "Acute load is well below your chronic baseline" is called GOOD.** The same ratio (ACWR 0.48, "low") appears as a neutral grey pill on the This Week card and as green on the Analytics chart (`LoadPanel.svelte:14-18`). A quarter of the app's vocabulary (GOOD, low, sweet spot, caution) maps differently by screen.

**V-13 (P2) Home is a 4000 px column of 12 cards, none of them collapsible.** Metrics, Fatigue, This week, Week recap, Training block, Next goal, Progress, Recent activity each take 250-450 px and use the same "section label + big number" template, so nothing leads. There is no summary strip, no sticky "today" element, and Today ("Nothing planned for today.") is a thin card the size of a toast, directly under two alerts. On a training day, the one thing the user wants (start the session) is a 34 px text button at the right edge of that card. *Fix:* put today's session and its Start button first and large; collapse Week recap and Recent activity by default.

**V-14 (P2) Today card: the empty state is italic, the action is a text link, and neither explains rest.** "Nothing planned for today. Start a session" — on a planned rest day (as it is in the demo) it should say "Rest day" and surface tomorrow's session.

**V-15 (P3) Metrics card: four stacked rows each with a different information density.** Sleep Score has no comparison line, HRV has "−2% vs your baseline (63)", RHR has none, Bodyweight has "7-day avg 68.9 ↑ 0.2". Rows are different heights (the sparklines misalign by about 14 px), and the sparkline colours (purple/blue/orange/grey) are the same purple, blue and orange used for other meanings elsewhere (see cross-cutting colour finding).

**V-16 (P3) Fatigue card: "6.3 / 10" has no reference.** The bars use four unrelated colours (orange-red, purple, green, blue), none of which says "high". The Analytics fatigue chart has a shaded 7+ zone; Home's bars have no threshold tick. A user cannot tell whether 6.3 is a problem.

**V-17 (P3) This week card: two stacked progress bars with different meanings and no labels.** A dark green bar ("58% of the plan") sits above a bright green full-width bar (the training mix, "Technique Bouldering 1h"). Two greens, one card, neither labelled. The mix bar being 100% full reads as "100% complete".

**V-18 (P3) This week card: day circles are 24 px and the glyphs inside are a few px.** Done = pale green ring with a check; today = blue ring; Saturday (a planned session) = blue-filled dot; the other days are empty rings. The legend lives only behind the "?".

**V-19 (P3) Training block card: the progress bar is the same blue as links, with the weekly bars (outline vs fill) explained only in a caption.** The week bars are `Work vs plan each week: logged (filled), planned (outline)`: the first week's bar is a short solid blue bar topped by a dashed outline, which looks like a rendering glitch.

**V-20 (P3) "Next: Trip prep · Performance · in 18 days (2026-11-02)".** The only ISO date on Home, in a screen where everything else is "Nov 14 – 15". Also "Trip prep" (block name) and "Performance" (phase type) read as two separate things.

**V-21 (P3) Next goal: the countdown "30 DAYS" next to a bold name uses a different typographic scale than every other card (44 px display number).** It is the loudest element on Home, louder than the readiness score. Projects are "0/2" with empty circles (checkbox-like) that are not checkable here.

**V-22 (P3) Progress card is five unrelated things:** consistency ("13 of the last 14 sessions done", "8-week streak" in link blue but not a link), two test results, a last send, a hardest-this-season line. "Progress" is also an Analytics tab name with different content. The streak being link-blue implies it is tappable.

**V-23 (P3) Recent activity: "F7 A7 C6 S6".** Single-letter fatigue codes with no legend. They sit in the meta line at 11 px. The "562 load" in the right column has no bar or context, so a 562 and a 132 look equally "important".

**V-24 (P3) The year is repeated on every date on Home ("Oct 14, 2026") while History and Plan use "Wed 14" and "14 Oct".** The same day has four spellings (Oct 14, 2026 · Wed 14 · 14 Oct · 2026-10-14).

### 2.3 Plan

**V-25 (P2) The Plan header has three icon-only buttons that mean "something with weeks".** View toggle (grid / calendar icons), a "view-week" icon (three vertical bars: Manage training blocks) and a sparkles icon (AI Coach). The three-bar icon reads as a column chart or a "list view", not as "Blocks". In the screenshot nobody could say what it opens without tapping.

**V-26 (P2) The phase legend wraps to three rows and takes more room than the thing it describes.** Seven phase names (Capacity, Strength, Power, Power Endurance, Performance, Taper, Deload) in dots + words are laid out in a ragged flow above the 10-column week grid. It is 110 px tall, and the dots are not interactive.

**V-27 (P2) The week grid (blocks view) has no numbers, no month names, and shows an entire year as 50 coloured squares.** Only "2026" and "2027" appear, at 9 px in two cells. The current week is a thick-outlined cell with a black dot; every other week looks the same except for colour. The grey "Deload" and blank weeks are not distinguishable from "no phase". A colour-blind user cannot read it at all.

**V-28 (P2) The week card puts the Plan B control inside a nested grey panel inside the card.** "Outdoor if dry / Sat · undecided, counting Plan A / Edit B / tune icon / Plan B · Sat: Outdoor bouldering instead of Board Session / [Plan A | Plan B · outdoor] [Decide] / Undecided - the numbers count Plan A for now. It locks by itself when you log a session only one plan has, or tap Decide." That is nine separate pieces of text and four controls to express one choice, and it sits above the actual week. The "Plan B · outdoor" button wraps to two lines. *Fix:* one row: "Sat: Board session ⇄ Outdoor bouldering (undecided)" with a two-way switch; put the explanation behind an info button.

**V-29 (P3) The week header uses four icon-only buttons in a row:** note, restore/history, "delete-sweep" (clear week), and "more". Clear week is next to More and is not confirmed (see Part 4 #199). The icon for clear (trash with lines) is read as "delete" by most users.

**V-30 (P3) Heading hierarchy is inverted in the week card.** "THIS WEEK · Oct 12 – Oct 18" is small caps, while the phase name "Power" below it is a larger title, so the phase name looks like the card title.

**V-31 (P3) In the Sessions list the "Start" buttons appear for sessions in the past-or-future of the same week with the same weight.** "Wed 14 Dynamic Moves ✓ Done" and "Sat 17 Board Session [▶ Start]" and "Sat 17 Outdoor bouldering (PLAN B) [▶ Start]" — both Plan A and Plan B of the same Saturday have a Start button of equal weight, although only one counts.

**V-32 (P3) "PLAN A" / "PLAN B" badges are 10 px uppercase pills,** the A one grey, the B one blue. Grey for A makes A look disabled.

**V-33 (P2) Calendar, week list: exercise chips are category names, not exercises, so they repeat.** Saturday's Board Session card shows "Board Session", "Core Training", "Core Training", "Core Training" — three identical chips and one that repeats the title. Wednesday's "Dynamic Moves" shows a chip "Free Bouldering". The chips carry no information beyond what the title says and cost half the card's height. *Fix:* group and count ("Core Training ×3"), or hide when equal to the title.

**V-34 (P3) Week list: every row gets the same orange phase bar on its left edge, and empty days read "Free".** The Home screen calls the same days "rest", the Month view shows nothing for them. "Free" also reads as "available", which is the opposite of a rest day. The phase bar is repeated seven times for one phase; one bar spanning the week would say the same thing.

**V-35 (P3) The completed Wednesday card is the same pale green as the planned Saturday card.** The only difference is a small check mark before the title (and in the sheet, a "Done" text). Done and planned should differ at a glance (solid vs tint).

**V-36 (P3) Day view is a list with an empty heading and a lot of empty space.** The header "15 Thursday" repeats "Thu, Oct 15" two lines above, then an orange phase bar, then one italic line. There is no hour grid on the phone Day view. Because the page has no content, the "Goals" card (bordered/soft card from a different design era) dominates the screen.

**V-37 (P3) The Goals card appears under every calendar view (Day, Week, Month, Year) and is still a soft rounded card.** It also truncates its own subtitle ("Nov 14 – 15 · Fontainebleau, FR · 2 proje…").

**V-38 (P3) The Month view shows done sessions as 5 px pale-green dots (very low contrast on the white background) and planned as nothing.** The "4 done · 5 planned" subtitle says there are planned sessions, but the grid shows only dots for done ones. The phase colour lines between weeks (grey, pink, orange) have no legend and are easy to read as week dividers. The selected/today circle is blue; Year view uses a blue outline for today and pale-blue fills for session days — Month uses green dots for the same "session on this day" fact.

**V-39 (P3) Year view: 12 mini-months of 9-11 px numbers with underlines for phases.** Cells are about 25 px. Weeks in September run on two phases (green + pink) as two underlines that touch the numbers. It is a heat-map but needs a legend, and nothing in it is tappable-looking.

**V-40 (P3) "Today" is greyed in the top right of Plan (and Analytics) when you are already on today, but remains a button.** At about 40% opacity it reads as a disabled label (low contrast). It is also the same colour as the section subtitle, so it vanishes. *Fix:* hide it when not applicable.

**V-41 (P3) The calendar title changes semantics per view.** "Oct 12 – Oct 18 / 2026 · week 42" (week), "Thu, Oct 15 / 2026 · week 42" (day), "October 2026 / 4 done · 5 planned" (month), "2026 / 14 done · 10 planned" (year). The sublabel switches between a week number and a count.

### 2.4 Log a workout and the live session

**V-42 (P3) Title Case against sentence case on one screen.** "Start Now", "Plan a Session" against "Log a test", "Planned for this week". Separators: "Empty session — add exercises as you go" (em dash) and "Intervals, a pacer, countdown — no session needed" against " - " in other screens and "·" in lists.

**V-43 (P2) The Log screen has no way to log a session you already did (backfill).** The four options are Start now, Plan a session, Log a test, Timer. A person who climbed yesterday without the phone has to Plan a session for yesterday and then mark it done, or use a different flow. A "Log a past session" entry is the commonest missing feature of any training log.

**V-44 (P3) "Planned for this week" lists only Sat Board Session (Plan A), not Plan B, and has a bordered card style (white card with a 1 px border) that the other tiles on the same page (tonal grey) do not use.** Three card styles on a four-item screen (solid blue hero, tonal tiles, a bordered row).

**V-45 (P2) The empty live session offers two ways to add an exercise and neither is prominent.** "Add your first exercise" is a 16 px blue link in a dashed box; the footer has "Edit" (greyed) and "+ Add" as ghost buttons, and a round stopwatch FAB at the right. The header shows "of ~1h · 0/0 done" and a progress bar with nothing in it. *Fix:* when empty, one big primary button "Add an exercise" (opening the picker) and "Start from a planned session".

**V-46 (P3) "Stop" is red text in the top-right corner, "SESSION RUNNING" is green text, the timer is black, and Pause is a grey circle.** Four colours in the header of the screen in which the user is sweaty and one-handed. Pause/Stop are at the top, the farthest point from the thumb.

**V-47 (P3) The Quick log tiles misalign.** In the 2×2 grid the icons sit at different heights (Pain's icon top-left, Bodyweight's icon lower because its caption is one line, not two). Tiles are bordered while the Log screen's tiles are not.

### 2.5 History

**V-48 (P3) Session rows: "Wed 14 · 60 min · F7 A7 C6 S6" then the exercise category line, and "562 load" at right.** The rows have no icon, no colour for the phase, and the right-hand number ("562 load") is stacked as number plus the word "load" in two lines, so the row is 4 lines high for one session. "F7 A7 C6 S6" is undefined here (see V-23).

**V-49 (P3) The filter control is a single icon at top right, a three-line "filter" glyph, with no label and no summary of what is active once closed.** The Sessions/Sends switch, sitting under it, is a full-width segmented control that is different from the pill style used on Analytics (hugging left).

**V-50 (P3) Sends tab: the stat tiles are bordered boxes (the only bordered tiles besides Analytics), "Hardest flash" wraps onto two lines making the tile taller than its neighbours, and "Add send" / "Import 8a.nu" are small chips (about 28 px) as the primary actions.**

**V-51 (P3) Sends by grade: seven identical bars (each 1) spanning 6A to 7A, with an empty "5+" and "7A+" label at the edges.** With so few sends the chart says nothing; with many, the bars would be 20 px. The chart also shows counts above each bar and a hint below ("Tap a grade to show only those sends") that is 11 px grey.

### 2.6 Analytics

**V-52 (P2) The range (4W / 3M / 6M / 1Y) window reaches into the future.** "Aug 3 – Nov 1" while today is Oct 15: the 3M window is centred or padded forward so two weeks are empty on every chart (the x-axis runs to W44 while the data ends at W42). The plot area therefore always wastes 15-20% on blank space, and "3M" does not mean the last 3 months.

**V-53 (P2) Overview tiles show two different time bases without saying so.** "Sends 2 ▲100%" in a 3-month window while the Sends tab says "7 sends" (all time) and Home says "7 sends this season". "▲100%" next to a count of two is noise; "vs the same number of days of the 3 months before" is below, at 11 px.

**V-54 (P2) Tabs and range chips are about 30 px high and set tight to each other.** The two controls are stacked, with the range chips (4W/3M/6M/1Y) using a smaller pill style than the tabs; the date window is right-aligned in 11 px grey.

**V-55 (P3) "Worth a look" says "No Core work for 16 days" while the Training Mix shows Core at 8%, and the mix legend lists "Core 8%" as a category.** Not a contradiction, but nothing links the two cards. The finding rows end with a chevron but give no hint of where they go (a chart on another tab).

**V-56 (P3) Rolling load: orange/blue/purple/red all appear on one plot.** Blue bars; red warning triangles over bars (three in the demo, including the current week that is clearly below normal); green/orange/hollow dots in the ratio pane; a coloured phase band on top; and zone bands at 8% opacity that are almost invisible. The warning triangles sit on W38, W40 and W42 where the ratio dots are green: red triangle and green dot for the same week.

**V-57 (P3) ACWR pane: dots are about 8 px, the zone bands are invisible, and the dot for W42 is green while Home calls it "low".**

**V-58 (P3) Training calendar (heatmap): month labels at 9 px sit over the grid and drift out of alignment with the columns (Jun / Jul gap, Sep / Oct crowding).** Rows are Monday-first but have no weekday labels. The legend "Less ▫▫▫▫ More" has no numbers.

**V-59 (P3) Recovery tab: "Fatigue" and "Recovery" cards both lead with chips that look like filters and are tiny; the card named Recovery sits on the tab named Recovery.** The overlay chart needs a tap to show values at all; on first view there is no number anywhere on the Fatigue chart except the latest ("W42 3.4 3.3 2.8 2.9") and that line is colour-coded in four colours with no labels.

**V-60 (P3) Outdoor ascents with two sends draws a dashed "hardest" line that slopes down from 7A to 6C+ across a gap of several empty weeks.** A line through two points over a two-month gap suggests a decline in ability; the weeks in between simply had no outdoor sends. *Fix:* do not connect across gaps (or connect only adjacent weeks).

**V-61 (P3) The "Today" and download buttons crowd the title row.** Header: "Analytics ‹ Today › ⬇". The download icon is an unlabeled export (CSV) with no confirmation of what it exports.

### 2.7 Sheets and dialogs seen

**V-62 (P3) Training Blocks sheet:** the subtitle "Phases as ranges of days" is implementation language. Each row's name ("Base") is followed by the phase type ("Capacity") and dates in the form "24 Aug – 13 Sep" (day-month), which is a fifth date format. Three icon buttons per row (AI sparkles, pencil, trash), where the AI icon is missing on one row (Trip prep) without explanation. "Browse full timeline" is a low-contrast text button at the bottom. The word is "Blocks" in the sheet, "phases" in its subtitle, "Training Block" on Home and "Phase" in Settings.

**V-63 (P3) AI coach sheet:** the week selects truncate their own value ("Week 42 (2026) · this"), the "Uncertain days" label (the UI for Plan B) uses a term used nowhere else, and "Prompt size ~13k tokens" is jargon. The primary "Copy prompt" and the secondary "I have a reply" form a copy-paste workflow with no explanation that the user is expected to leave the app to run the prompt elsewhere (the first step label "Ask" suggests asking inside the app).

**V-64 (P3) Settings hub:** eight rows with a 14 px grey description, the search field uses a heavier border than any other input (it is the only bordered input on the screen), and "Model & health" truncates its own subtitle ("Readiness model, pain check-ins, weather and ou…"). The names "Model" and "Training setup" do not say where, for example, "units" or "theme" lives (App & display), nor "notifications" (Reminders & nudges), so search is the only reliable path.

### 2.8 Dark mode and wide screens

**V-65 (P3) Dark mode:** the app is consistent, but the blue "+" in the Home header and the "Start a session" link drop in contrast against the near-black cards, and the session bubble is a bright outlined pill that is the highest-contrast thing on the page, drawing the eye away from the readiness score. The alert dot colours (red, grey) have thin differentiation at 8 px.

**V-66 (P3) Wide screens:** Home, History, Analytics stay as a 512 px column in the middle of a 1366 px window, flanked by empty space; the Plan year view fills the width with four columns, so the page is two different layout systems depending on the tab. The rail's icons are 24 px in a 72 px rail with no hover tooltips visible.



## 3. Code audit: live session, workout editor, sends, pain and bodyweight

Read from code (nothing run). Severity: P1 blocker, P2 major, P3 minor, P4 polish. Paths relative to `src/components/`. Tap-target sizes are estimated from padding and icon classes. `text-label` is 12 px and `text-caption` 11-12 px (`app.css` ~188-195). Items here are bullets, not numbered: cite them by component and line.

### Cross-cutting (several files)

- **Sheet chrome is inconsistent across about 16 sheets.**
  - Some are fixed-position sheets with `pb-safe`, drag-to-close and a sticky header: PainReportSheet, PainIssueSheet, ExerciseLogSheet, SessionNotesSheet.
  - Others are bare: `workout/SetDetailSheet.svelte:52-53` has no `pb-safe`, no `sheetDrag` and no sticky header.
  - `workout/PresetNameSheet.svelte:22-24` has no `backWhile`, no drag, no safe area and no `keyboardAware`. It uses `bg-black/50` where the rest use `bg-app-bg/85-90 backdrop-blur`.
  - `workout/RunAdjustSheet.svelte:72-74` and `workout/CircuitRunner.svelte:955-957` use an `absolute` scrim with `bg-black/50`, `rounded-t-card`, `border-border-strong`, `pb-8` and `slide-in-from-bottom-10`.
  - The add-circuit pickers at `ActiveSessionModal.svelte:1243-1244`, `WorkoutEditor.svelte:561-562` and `WorkoutEditor.svelte:590-591` use `bg-black/40`, `rounded-t-card`, `p-4 pb-8` and no drag.
  - Severity: P2. Fix: extract one `<Sheet title onClose>` component. It would carry the scrim token, `rounded-t-2xl`, a drag handle, `pb-safe`, `sheetDrag`, `keyboardAware`, `role="dialog"` and a 44px close button. Migrate every sheet to it.
- **Header close button is sized three ways.** Some use `p-2 -mr-2` (about 36px). QuickTimerSheet, RunAdjustSheet and CircuitRunner infoMember use `tap p-1` (about 28px, with an 8px `::after` expansion, so about 44px effective). `QuickLogSheet.svelte:64`, `TestSheet.svelte:122` and `SetDetailSheet.svelte:59` use bare icons with no padding or `.tap`, about 20px. Severity: P2. Fix: one close-button class with `min-w-11 min-h-11 grid place-items-center`.
- **No sheet has `role="dialog"` or `aria-modal`** except TestSheet, SessionAIModal and WorkoutModal. Missing on ChoiceSheet, SessionExitModal, SessionNotesSheet, SetDetailSheet, ExerciseLogSheet, ExercisePicker, QuickTimerSheet, RunAdjustSheet, SessionActionsSheet, PainReportSheet, PainIssueSheet, QuickLogSheet and PresetNameSheet. Screen readers get no modal context and focus is not trapped. Severity: P2. Fix: add `role="dialog" aria-modal="true" aria-labelledby` and focus the first control on mount.
- **No Escape handling** on most sheets. Only QuickTimerSheet, QuickLogSheet and WorkoutModal handle it. Severity: P3 (matters for the web, PWA and keyboard users). Fix: a shared `<svelte:window onkeydown>` in the Sheet component.
- **Primary button size and typography vary.**
  - Text size: `text-sm` (`SendForm.svelte:91`, `SendImport.svelte:75,145`, `ExerciseForm.svelte:607`) versus `text-label` elsewhere.
  - Padding: `py-2.5`, `py-3`, `py-3.5` and `py-4` for the same role (compare `SetDetailSheet:74`, `TestSheet:186`, `QuickTimerSheet:156`, `ExerciseLogSheet:413`).
  - Shape: `px-5`/`px-6` content-width buttons next to full-width ones in the footers.
  - Primary hover: `SendForm:91` and `SendImport:75,145` have no hover or active state, unlike the others.
  - Severity: P3. Fix: add `.btn-primary`, `.btn-secondary` and `.btn-ghost` utilities with a 44px minimum height.
- **Cancel and secondary copy and style differ.**
  - Wording: "Cancel" (SendForm, SessionNotes, PainReportSheet), "Back" (SessionAI), "Keep going", "Close without logging", "Back to session", "Discard changes".
  - Style: filled grey (`bg-surface-elevated`) in some places, ghost text in others.
  - Placement: before the primary in SendImport (`:144`), after it in SendForm (`:95`).
  - Severity: P3. Fix: pick one convention (Cancel always after Save, ghost style) and one verb per intent.
- **Separator inconsistency.** Both " - " and "·" appear in running copy: `SendImport.svelte:111`, `PainHeadsUp.svelte:38`, `RunAdjustSheet.svelte:79`, `ExercisePicker.svelte:136`, `ExerciseLogSheet.svelte:296`. `&mdash;` is used in StartScreen (`:91,130`) and `SessionExitModal.svelte:96` ("Discard — log nothing"). A hyphen-minus in `-30s` (`TimerWidget.svelte:420`) should be a true minus. Severity: P4. Fix: "·" for metadata, an em dash (no spaces) only in prose, `−` for minus.
- **Casing inconsistency.**
  - Title Case: "Start Now", "Plan a Session" (`StartScreen:90,104`), "Min Grade", "Max Grade", "Climbing Style", "Board Type", "Hold Type", "Campus Style", "Exercise Notes", "Customize Tracked Fields", "Analytics Type", "Target Intensity / Load", "Update Exercise" and "Add Exercise" (`ExerciseForm:405-609`), "Discard Changes" (`WorkoutEditor:218`), "Empty File" (`SendImport:35`).
  - Sentence case: everything else ("Log a test", "Make a Plan B", "Add send").
  - Severity: P4. Fix: sentence case throughout.
- **Number inputs without `inputmode`** (decimal keyboard missing). `ExerciseForm.svelte:397,417,444-458` (duration, cadence, sets, reps, moves, time on/off, rest, hold size, weight, distance): about 12 inputs have `type="number"` and no `inputmode`. Also `BodyweightLog.svelte:106` (`step="0.1"`, no `inputmode="decimal"`). Severity: P2. Fix: `inputmode="decimal"` or `"numeric"` on every field. Add `enterkeyhint="next"` or `"done"` too.
- **Text-input focus states are inconsistent.** Some inputs have `focus:border-primary/50`. Others (`BodyweightLog:102,106`, `SendForm inputClass:96`, ExerciseForm inputs, `PainIssueSheet:114`, `ExerciseLogSheet:323`) rely on `outline-none` and a barely different border. Many buttons have no `focus-visible` style. `app.css` has no `focus-visible` rule. Severity: P2 for keyboard and a11y users. Fix: global `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px }` and drop bare `outline-none` on buttons.
- **Many icon-only controls are about 28-36px**: Timer widget (7-8px-radius buttons), SetRowsEditor, GroupSettings, the delete icons. See the per-component entries. Severity: P2 overall. Fix: `min-w-11 min-h-11` or `.tap`.
- **Hardcoded colors.**
  - `text-white` on `bg-primary`, `bg-success` and `bg-danger` appears in more than 60 places. Theme token `primary-text` exists but there is no `on-primary` token, so a light theme or a custom accent breaks contrast.
  - `text-app-bg` is used as foreground on `bg-success` (`TimerWidget.svelte:426`, `CircuitPill.svelte:40`, `ActiveSessionModal.svelte:703`). This is inconsistent with `text-white` on the same fill elsewhere.
  - `bg-black/40`, `bg-black/50` and `bg-black/70` scrims (see the sheet entry above).
  - `ExerciseForm.svelte:432,474,496` use `bg-primary-hover` as the selected fill, while everywhere else selected is `bg-primary`.
  - Severity: P3. Fix: add `--color-on-primary`, `--color-scrim` and a `.chip-on` class.
- **Destructive actions without confirm or undo** (details per component).
  - SendForm Delete, BodyweightLog delete, PainIssueSheet delete issue and delete check-in, SessionActionsSheet Delete, WorkoutView Delete, `ActiveSessionModal.dissolveCircuit`.
  - Severity: P1/P2. Fix: use the existing undo toast pattern from `removeWithUndo` (`ActiveSessionModal:576`) or the `showConfirm` pattern.

### workout/ActiveSessionModal.svelte

- `:661-668` Minimise chevron is `p-2` around a 24px icon, about 40px. Severity: P3. Fix: `min-w-11 min-h-11`.
- `:690-696` The "Stop" button is red text (`text-danger`) on the same row as Notes, in the top-right corner. It is destructive-adjacent, sits in the hardest-to-reach corner, and the only guard is the ExitModal. The red text on the dark header also reads as an error, not as the end-of-session action. Severity: P3. Fix: keep it, but rename to "End" (the sheet says "End this session?", so Stop/End/Discard are three words for one flow) and move Pause and End to a bottom bar for one-handed use.
- `:677,682-689` Notes affordance is duplicated: the description line is a button and the notes icon opens the same sheet. The sticky-note icon has no visible label. Severity: P4. Fix: drop one, or add the count of notes to the icon.
- `:703` The pause button is 44px, which is OK. But `ic:baseline-play-arrow` on `bg-success text-app-bg` has a different icon colour logic from every other success button. Severity: P4.
- `:713-715` Progress copy "of ~12 min · 3/8 done" at caption size is the only progress readout. Severity: P4. Fix: bump to `text-label`.
- `:733-741` Empty state: "Add your first exercise" is a plain underlined link, about 16px tall, in a dashed box. Severity: P2 (tap target well under 44px, and it is the only way forward on an empty session). Fix: a full-width primary button. Also offer "Start from a planned session".
- `:746-772` Circuit-pick mode: no validation message when fewer than 2 exercises are picked (the button enables at 1, and a one-exercise circuit makes little sense). Severity: P3. Fix: require 2 or show a hint.
- `:790-860` Edit mode row actions (`p-2` around `text-base` icons, about 32px) for add-to-circuit, leave-circuit and delete are packed together. Delete sits next to leave-circuit, so a mistap is likely, though undo exists. Severity: P2. Fix: 44px targets with gaps, and put delete behind a swipe or overflow menu.
- `:811-816` "Remove circuit" is a `px-2 py-0.5` pill, about 22px tall, at caption size, with a `hover:text-danger` style that touch devices never see. It is also confusingly named, because it ungroups and removes no exercises. Severity: P2. Fix: rename "Ungroup" (as GroupSettings does at `:63`), enlarge it, and add an undo toast.
- `:586-589` `dissolveCircuit` has no confirm and no undo, and it discards the rounds, rests and transition settings. Severity: P2. Fix: `showUndo` like `removeWithUndo`.
- `:827` Drag handle is a bare 20px icon with `cursor-grab`, not a button. There is no keyboard or tap alternative for reordering (no up/down buttons). Severity: P2. Fix: add "Move up/down" buttons or a long-press hint and `aria-label`.
- `:910-928` The numbered status pip is 32px (`w-8 h-8`) and is a separate button from the name button right beside it. Both do the same thing (`focusExercise`). Severity: P3. Fix: merge them into one 44px+ row target.
- `:951-962` The per-exercise clock chip is caption size and has `aria-label` only on the first variant. The `min` text variant at `:961` has no label. Severity: P4.
- `:964-973` The reopen/undo icon (`p-2` + `text-base`, about 32px) is the only way to correct a logged exercise. Severity: P3. Fix: 44px, and use the label "Edit" or "Reopen" visibly.
- `:981-1021` The action row mixes four buttons with different weights. "Skip" (shrink-0, grey), a timer button (grey), "Finish" (grey for circuit members) and "Finish exercise" (primary). In circuit members the primary becomes "Start circuit" and "Finish" is demoted, so the same position changes meaning between rows. "Skip" is a one-tap destructive-ish action next to the primary with only undo to catch it. Severity: P3. Fix: keep the primary in a fixed slot and move Skip to an overflow menu or swipe only.
- `:1028-1033` Swipe-to-complete and swipe-to-skip are the only fast paths for "done as prescribed", with no visible hint or button equivalent. The swipe is also a likely conflict with horizontal back gestures. Severity: P3. Fix: a first-use hint and a visible "As prescribed" button on the current row (the log sheet has one at `ExerciseLogSheet:404`).
- `:1043-1062` Footer "Edit" and "Add" are ghost buttons with `py-2.5` (about 40px) and no border. Reach is fine, but "Add" opens a full-screen overlay (`:1159`) rather than a sheet. Severity: P4.
- `:1078-1086` "Finish & rate" appears only when everything is settled. Before that there is no finish path other than Stop, which opens the End dialog with "Save what I did". Users commonly want "Finish" early. The wording is split into Stop, End, Save, Finish and Finish & rate. Severity: P3. Fix: one vocabulary, e.g. "Finish" (saves and rates) and "Discard".
- `:1102` Timer widget `bottomClass="bottom-[80px]"` hardcodes the footer height instead of using a CSS var (the session bubble uses `--chrome-b`). On taller footers (landscape, text scale) it overlaps. Severity: P3. Fix: derive from the footer's measured height.
- `:1159-1163` The full-screen "Add exercise" overlay has a plain "Back to session" text link at about 16px height. It is not a `p-2` button and has no `backWhile` visible in this file. Severity: P2 (hardware back may close the whole session modal instead). Fix: confirm `backWhile` wraps it, and use a 44px back button in a sticky header.
- `:1159` This overlay, like the editor's equivalent at `WorkoutEditor.svelte:532`, has no sticky header, so "Back" scrolls away on a long form and the Add button sits at the bottom of the form. Severity: P3.
- `:1184-1214` Two stacked segmented controls ("Already done / Still to do", then "Extra work / Part of the plan") with a changing paragraph between them. This is the densest decision UI in the app, with jargon ("counts as", "mirror"). Severity: P3. Fix: collapse the second control behind "Advanced" and default it by the first.
- `:1243-1266` The saved-circuit sheet is a custom `bg-black/40` sheet (see cross-cutting). Its title "Circuit" is the section style and not a title. Severity: P3.

### workout/CircuitRunner.svelte

- `:672,688,692,695` Header icon buttons are `p-2` + `text-xl/2xl`, about 36-40px. Restart (`:692`) sits next to End with no spacing and is one tap from losing progress (it has an inline confirm, which is good). Severity: P3. Fix: 44px each.
- `:695` The End button label is `px-3 py-2`, and its text is truncated in the source here, so I can't confirm the copy. It toggles a panel instead of ending, and the label stays the same. Severity: P4.
- `:706-726` The confirm panels (restart, end) render below the header and push the dial down mid-workout, which can shift the layout under the user's thumb. Severity: P3. Fix: overlay them as a sheet anchored at the bottom.
- `:709-710,720-723` Panel buttons are `px-2 py-1` (about 28px) for Cancel/Restart. Severity: P2. Fix: 44px.
- `:722` The red "Finish now" button changes style depending on `canEndAfterRound` (outlined red text versus solid red). The dangerous option becomes the visually primary one in one state. Severity: P3. Fix: keep one style.
- `:792,795` Dial digits use arbitrary `text-[length:min(...)]` sizing. That is fine for a timer, but the minimum is 17rem x 0.206, about 56px, OK. No finding there.
- `:793` The elapsed time under reps uses `text-label`, 12px, for essential info. Severity: P4.
- `:807,811-815` The "Next" and the exercise-note chip are `short:hidden` and duplicated in two blocks (`:805-842` and `:848-885`). Any fix has to be made twice, and the markup drifts (the second block's `correctable` row uses `justify-between`, the first `gap-3`). Severity: P4 (maintainability). Fix: one snippet.
- `:833,837,876,880` The correction +/- buttons are `w-9 h-9` (36px). Severity: P2 (these are mid-workout, sweaty-thumb controls). Fix: 44px.
- `:895-900` The reps +/- buttons are `w-10 h-10` (40px). Severity: P3. Fix: 44px or larger. They are the primary input here, so 56px would be better.
- `:911-915` "Set details" is a dashed full-width `py-2` button, about 36px, with a parenthetical list of fields at caption size. Severity: P3.
- `:919-934` The secondary row has four equal `flex-1 py-3` ghost buttons (Back, Pause/Resume, Done early, Skip set). All have the same weight, and all but Pause can destroy or skip data with no undo on skip. "Back" with `skip-previous` is ambiguous (previous step, or leave?). Severity: P3. Fix: label "Previous step", differentiate Skip, and add an undo toast.
- `:922` The expression `neverStarted ? 'Start'` inside `{#if !neverStarted}` is dead code. Severity: P4.
- `:908` "I'm ready" is the only lead-in action and uses `py-4` where the other primaries use `py-5`. Severity: P4.
- `:766-772` The summary has three stacked actions: "Log", "Save as preset" and "Close without logging". "Close without logging" discards the run with no confirm. Severity: P2. Fix: confirm if any sets were done, or offer undo.
- `:766` The summary "Log" button is `bg-success`, but the sheets elsewhere use `bg-primary` for Save. Severity: P4.
- `:955-957` The info sheet is the only place the exercise how-to is reachable during a run, behind a small chip. Severity: P4.

### workout/TimerWidget.svelte

- `:388,395,403` Mode toggles (stopwatch, countdown, intervals) are `w-7 h-7` (28px) with a `text-lg` icon, inside a `p-1` capsule. Severity: P2. Fix: 44px effective with `.tap`, or enlarge the capsule.
- `:419-420` "+30s" and "-30s" are `px-1` text buttons, about 14-16px tall, stacked with `gap-1`. They are the most-used controls when resting. Severity: P1 (hard to hit one-handed, and adjacent targets invite mistaps). Fix: 44px chips, or one long-press stepper. Use `−30s` with a true minus sign.
- `:419-420` Neither button has an `aria-label`. The text "-30s" reads poorly. Severity: P3. Fix: `aria-label="Subtract 30 seconds"`.
- `:432-438` Reset is `w-8 h-8` (32px) and sits right next to the 40px play/pause with `gap-1.5`. It is a destructive action with no undo. Severity: P2. Fix: move it away from Start, or require a long-press or confirm while running.
- `:440-447` Hide is `w-7 h-8` with `-ml-1`, about 28px wide, and overlaps its neighbour's hit area. Severity: P2.
- `:373-379` The preset chips ("Rest 1:30" etc.) are `px-1` text at label size, about 16px tall. Severity: P2. Fix: pill buttons with `py-2`.
- `:384` The pill uses `short:scale-90`, which shrinks all targets further in landscape (about 25px). Severity: P2. Fix: use a smaller layout instead of scaling.
- `:412-414` Time is `text-metric` with `min-w-14`. A very long time (over 1:00:00) may wrap. Severity: P4.
- `:355-362` The tucked-away button's icon has no state text unless running, so a paused timer with time left looks identical to an idle one. Severity: P3. Fix: show the time when paused and non-zero.
- `:369` The widget uses `pointer-events-none` on its wrapper and re-enables per child via `[&>*]:pointer-events-auto`. The scale-90 transform may leave dead zones. Severity: P4.
- No finding for dark mode contrast beyond `text-content-subtle` on `bg-surface/90` (translucent over arbitrary content): P4, use opaque backgrounds.

### workout/CircuitPill.svelte, SessionBubble.svelte

- `CircuitPill.svelte:40` The play/pause is 40px. `:47` The minimise is `w-7 h-8`, about 28px. Severity: P2.
- `SessionBubble.svelte:36` The bubble is positioned with `bottom-[calc(var(--chrome-b)+16px+env(...))]`, good, but it overlaps the Fab and nav on small screens, and has no way to dismiss or move. Severity: P4.
- `SessionBubble.svelte:76-77` "paused" is shown in lowercase caption, but the ring already carries a pause icon. Fine. Severity: P4: capitalise "Paused" as in the modal.

### workout/StartScreen.svelte

- `:90` The "Start Now" and "Plan a Session" Title Case clashes with "Log a test" at `:116`. Severity: P4.
- `:96-120` The two secondary cards use `p-3.5` with an icon above and a label. They are fine, but "Plan a Session" and "Log a test" show a subtitle that is truncated (`truncate`) at 360px, so essential info is cut. Severity: P3. Fix: allow two lines.
- `:157-159` The day badge is `w-9` at caption size (11px) with `text-primary-hover` on `bg-primary-hover/10`. Contrast of `#3b82f6` on dark is about 5:1, fine. Severity: P4.
- `:151-156` A blocked row is `disabled:opacity-40` with only a `title` as an explanation. On touch there is no tooltip, so the reason ("finish the running session first") is invisible. Severity: P2. Fix: visible helper text under the section when a session is running.
- `:176-180` The running badge says "Running" at caption size. OK.
- No empty state for "Planned for this week" when nothing is planned (the section just vanishes), with no pointer to Plan. Severity: P4. Fix: one line "Nothing planned this week" with a link.
- `:135-141` The inline BenchmarkForm opens below the fold, under three cards, so the user taps and sees nothing happen (no scroll-into-view). Severity: P2. Fix: `scrollIntoView` on open, or use a sheet.

### workout/WorkoutEditor.svelte

- `:241-243` Close and Back share the same `p-2` (36-40px) button. The label switches between "Close" and "Back to session" while the icon switches between X and arrow, but the action is the same cancel flow with a confirm. Severity: P4.
- `:248-252` The session-name input is a title-size borderless field with only a dashed underline. There is no visible label, only a placeholder, which disappears once typed. Severity: P3. Fix: `aria-label="Session name"`.
- `:257-267` The schedule chips are `px-2.5 py-1` at caption size, about 26px tall. Severity: P2. Fix: `min-h-9` minimum, ideally 44px.
- `:278-286,323` The day and place options are `px-2.5 py-1.5` at label size, about 30px. Severity: P3.
- `:290-296` The time input has no label and relies on the chip. Severity: P4.
- `:299-313` The duration input has a visible "min" suffix and a placeholder, but no `aria-label`. Severity: P3.
- `:295,313,338` "Clear" buttons are `px-3 py-2`, text-only, about 32px. Severity: P3.
- `:348-354` The notes textarea says "Session notes or goals..." with three ASCII dots, while the next field at `:360` uses a real ellipsis "…". Neither has a visible label (`:348` has no `aria-label`). Severity: P3.
- `:423-429` Remove exercise is a `p-2 -mr-1` X icon next to the card. It has undo, but the X is the same icon as Close elsewhere and sits adjacent to the leave-circuit button. Severity: P3. Fix: a trash icon, 44px.
- `:451` "Save as circuit" is `p-1` (about 28px). Severity: P3.
- `:470-485` The add area is a dashed box with one full button plus a 3-column row (Circuit, Test, Ask AI) at `py-3` and label size. The three are different concepts of different weight (a structure, a benchmark, an AI import) given equal weight in one row, with no explanation of "Test". Severity: P3.
- `:490-509` Footer: "Reorder" (swap icon) and "Circuit" are ghost buttons, and Save is on the right. In grouping mode the primary changes to "Make circuit" and Save disappears, which is correct but means the user cannot save from this mode without cancelling first. Severity: P4.
- `:520-526` Save is disabled only while `isSaving`. There is no validation (empty name, no exercises) and no feedback on failure (`save` has `try/finally` without `catch`, so an error would surface as an unhandled rejection with no message). Severity: P2. Fix: `catch` and show an error toast, and warn on empty sessions.
- `:218` "Discard Changes" dialog title is Title Case, and the confirm shape is a native-style `showConfirm`, while the session uses `ChoiceSheet` for richer confirms. Severity: P4.
- `:534-536` "Back to session" in the form overlay is not a sticky header (see ActiveSessionModal `:1159`). Severity: P3.
- `:561-597` Bottom sheets use `bg-black/40`, `p-4 pb-8` and no safe-area padding (`pb-8` is not `env(safe-area-inset-bottom)`). Severity: P2 on gesture-nav phones. Fix: use the shared Sheet.
- `:594` The label "Update {linked?.name}" will read "Update undefined" if `linked` is missing. Severity: P3. Fix: guard.
- No undo or autosave for a half-built new session if the app is killed. Severity: P3.

### workout/WorkoutView.svelte

- `:89-94` Delete (menu item) deletes the workout immediately, with no confirm and no undo, and closes the view first. For a completed session this loses logged data. Severity: P1. Fix: `showConfirm` with the session name, or an undo toast that restores it.
- `:148` The overflow button is `p-2` around a 24px icon, about 40px. Severity: P3.
- `:155-180` The menu items are `py-2.5` at label size (about 40px). The scrim `fixed inset-0 z-10` is outside the menu's stacking context but inside the header, so it may not cover the page. Severity: P3.
- `:143` "· swipe to flip through" hint is permanent. Severity: P4. Fix: show it once.
- `:136-141` The prev/next chevrons are `p-0.5` around `text-lg`, about 22px. Severity: P2. Fix: 44px.
- `:210-213` "Re-rate" is `px-2.5 py-1.5`, about 28px. Severity: P3.
- `:203-208` The rating axes show "—" for unrated, with no explanation of the scale (0-10?). Severity: P4.
- `:252-263` The footer has "Edit" and "Log as planned" as ghost buttons. "Log as planned" opens the rating flow without a confirm that nothing was actually done. Severity: P3. Fix: tooltip text is `title` only, which never shows on touch. Show the explanation in-line.
- `:269` Disabled Start explains itself only via `title`. Same issue as StartScreen. Severity: P2.

### workout/ExerciseLogSheet.svelte

- `:279` The close button's `aria-label` is "Cancel" but the visible icon is an X, and the sheet has an "Edit full details" link below. Severity: P4.
- `:276` The header eyebrow "What you did" is sentence case, but the eyebrow style elsewhere is "Notes", "New pain issue". Fine. P4.
- `:286-292` The "Last time ... Use" row is a full-width button at caption size. "Use" is a text-only affordance. Severity: P4.
- `:312-329` The +/- steppers are `w-10` (40px) wide. Severity: P3. Fix: 44px.
- `:316-324` Number inputs use `text-sm`, but the value is the primary content here. `px-3 py-2.5` gives about 40px. Severity: P3. Fix: a larger input font (16px) also avoids iOS zoom-on-focus below 16px (`text-sm` is 14px). Severity: P2 for iOS or PWA users.
- `:316-324` No min/max or validation feedback (negative reps, 0 sets), and no inline error. Severity: P3.
- `:336-346` The "Add weight" and "Per set" dashed buttons repeat the caption text in parentheses, and they are `py-2` (about 34px). Severity: P3.
- `:379-387` The difficulty slider shows "—" when untouched but defaults to 5 in the thumb, so a user who never touches it logs nothing, while the thumb suggests a value. Severity: P3. Fix: render the thumb in a muted state until touched.
- `:392-397` The textarea has `rows="2"` and `resize-none`, so long notes scroll in a tiny box. Severity: P4.
- `:401-427` The footer shows "As prescribed" (grey) + Save (primary) + "Edit full details" as a link. Three paths, and "As prescribed" saves immediately with no confirmation of what values were saved. Severity: P4.
- `:413` The Save label comes from `saveLabel`, and there is no disabled or saving state, so a double tap can double-submit. Severity: P3.

### workout/ExerciseForm.svelte

- `:397,455` Several inputs use `p-3.5` + `text-sm` (14px), below the 16px iOS zoom threshold. Severity: P2. Fix: `text-base` on inputs.
- `:398` Only `duration` shows a validation message (`text-label text-danger`). The other numeric fields set `validationErrors` styling but I found no per-field message beyond the red border. The Submit button disables silently with `disabled:opacity-50`, so the user cannot tell why. Severity: P1/P2 (silent disabled submit). Fix: show the first error next to the button, or let it submit and scroll to the first error.
- `:405-413` "Min Grade" and "Max Grade" are selects. There is no check that min is not above max visible here, and the labels are Title Case. Severity: P3.
- `:420-438,462-480,484-502` Multi-select chips are `px-3 py-1.5` (about 30px) with no `aria-pressed`. Selected state is colour only. Three near-identical `onclick` toggles are copy-pasted. Severity: P3. Fix: `aria-pressed` plus a check icon, and one `toggle()` helper.
- `:432,474,496` The selected chip uses `bg-primary-hover` where other selected chips use `bg-primary` (see `PainReportSheet`, `SessionAIModal`). Severity: P4.
- `:524-547` "Customize Tracked Fields" is hidden in a `<details>`, with checkbox-style buttons that lack `role="checkbox"` and `aria-checked`. Severity: P3. Also the heading uses `text-section uppercase` where its neighbours use label style.
- `:550-557` "Analytics Type" select: the term is internal jargon. Severity: P4. Fix: "Counts toward".
- `:577` The placeholder "Same as the circuit's switch time" is long and gets cut off in a narrow input. Severity: P4.
- `:585,588` The placeholder "Focus on footwork..." is reused for both notes fields. P4.
- `:592-600` The "Target Intensity / Load" label is green (`text-success`) while other labels are muted. It reads as a status, not a label. Severity: P4. Also the "/10" scale is unexplained (RPE?).
- `:604-609` Submit is `text-sm py-4 shadow-xl shadow-primary/20` where the handover says "no heavy glows". Severity: P4. The label is "Update Exercise" / "Add Exercise" (Title Case) while the same action is "Save" elsewhere in the same flow.
- The submit button is at the very bottom of a long scrolling form with no sticky footer, so users scroll past a lot to save. Severity: P3. Fix: a sticky footer with `keyboardAware`.
- `:370-385` The exercise picker trigger looks like a text input but opens a sheet, with "unfold-more" as the only cue. Fine. P4.

### workout/ExercisePicker.svelte

- `:109` The close button is `p-2` (about 40px). Severity: P3.
- `:115-120` The search input has no `aria-label` (placeholder only), and `type="search"` with `text-sm`. No autofocus on open (an extra tap before typing). Severity: P3.
- `:122` The clear button is `p-1` with a 16px icon, about 24px. Severity: P2 (the browser also draws its own clear on `type=search`, so you get two). Fix: hide the native one, enlarge this.
- `:132-146` Create and Restore rows appear above results. "Create “{typed}”" shows for any query, including a typo of an existing name (`exact` checks for a name match only), which invites duplicates. Severity: P3.
- `:129-179` There is no empty state when the library is empty and the query is blank. Severity: P3.
- `:164` The group headers are `py-3` rows, about 44px, good. Rows `py-2.5`, about 40px. P4.
- `:105` The sheet has a fixed `h-85vh` and a flex column. With the keyboard open, the list shrinks to almost nothing (no `keyboardAware` here). Severity: P2. Fix: use `dvh` and `keyboardAware`.
- `:97` Mixed separators in row meta: `exerciseGroup · description`. Fine.

### workout/SessionExitModal.svelte

- `:50` "End this session?" with the progress line in caption text. Fine.
- `:59-76` The primary choice is long, multi-clause, caption-size explanatory copy inside a blue button (`text-white/75` on `bg-primary` is about 3.3:1, below AA for small text). Severity: P2. Fix: `text-white/90` or solid white.
- `:78-87` "Keep going" is the second option at equal visual weight, but it is the safe default. Severity: P4.
- `:91-97` Discard uses a two-tap arming pattern ("Tap again to discard"), which is a good guard. However `armed` has no visible timeout reset in this view, and the label "Discard — log nothing" contains an em dash. The armed state has no `aria-live` announcement. Severity: P3.
- `:98-104` The helper text below is caption size, but it carries the consequences ("Throws away all N logged exercises"). Severity: P3. Fix: show it before arming, in `text-label`, and keep it visible in the armed state.
- No `role="dialog"` (see cross-cutting).

### workout/ChoiceSheet.svelte

- `:54` Choice buttons are `p-4`, large, good. The `description` uses `opacity-75` on `bg-primary`, about 3.3:1. Severity: P3.
- `:63` The cancel button is a text-only `py-3` ghost. OK. The tone `danger` is a red label on a grey card with the same weight as neutral. Severity: P4.
- Missing `role="dialog"`/`alertdialog`. Severity: P2.

### workout/SessionActionsSheet.svelte

- `:54` Rows are `py-3` (about 46px), good. No sheet title control (no close button, drag only). Severity: P3. Fix: add a close button for accessibility.
- `:77-86` The "Move to" day grid is 7 columns of `py-2` buttons (about 34px high, about 45px wide at 360px) labelled with two letters ("Mo", "Tu", "We", "Th"), which are ambiguous for screen readers (they do have `aria-label`). "Tu/Th" and "Sa/Su" are hard to scan. Severity: P3. Fix: `py-2.5`, single-letter plus the full name in `aria-label`, and highlight today.
- `:95` "Delete" is shown with `text-danger` in the same list as Open and Duplicate. There is no confirm and no undo here (see `remove` in `WorkoutView:89`, which this probably calls). Severity: P1/P2. Fix: confirm or undo, as above.
- `:92` "Make a Plan B" / "Edit Plan B" is jargon with no explanation. Severity: P4.
- `:89` "Ask the AI about it" here versus "Ask AI" at `WorkoutEditor:482` and "Ask the AI about it" in WorkoutView. Severity: P4: one phrase.

### workout/SessionNotesSheet.svelte

- `:51` The title falls back to "Session" and the eyebrow says "Notes", then the first section is also titled "Session". Redundant. Severity: P4.
- `:62-66` The edit button is label size with a 14px icon, about 24px tall. Severity: P2. Fix: 44px.
- `:69-74` The textarea has no `aria-label`, and `rows="6"` is fine. Save has no saving or empty feedback. Severity: P4.
- `:93-104` The "Exercises" section lists notes with "How it went:" in caption text. There is no empty state if every exercise has no notes. Fine.
- `:82` The empty state is an italic caption. P4: make it a tappable "Add a note".

### workout/SetDetailSheet.svelte

- `:52-53` No `pb-safe`, no drag (see cross-cutting). `:59` The close button has `aria-label="Cancel"`. Severity: P3.
- `:66,68` The +/- steppers are `w-10` (40px). The input has `px-1`, so a long weight value may clip. Severity: P3.
- `:74` The Save button is at the bottom of the sheet with no `keyboardAware`. When the keyboard opens, the Save button may sit behind it. Severity: P2. Fix: add `keyboardAware`.
- The sheet has `bw=2` (back handling) but no Escape handling. P4.

### workout/PresetNameSheet.svelte

- `:22-24` No `backWhile` (hardware back will close the whole session modal rather than this sheet), no drag, no `pb-safe` (it uses `pb-8`), no `keyboardAware`. `z-[120]` with `bg-black/50`. Severity: P1/P2. Fix: use the shared Sheet and add `backWhile`.
- `:27-28` `autofocus` opens the keyboard immediately, which may cover the Save button (no `keyboardAware`). Severity: P2.
- `:28` There is no validation feedback for a duplicate name, and `maxlength="40"` gives no counter or message. Severity: P4.
- `:30` The Save button is `disabled:opacity-40` with no hint why. Severity: P4.
- There is no heading or close button, only a label. Severity: P3.

### workout/RunAdjustSheet.svelte

- `:77` The close button is `tap p-1`. P4.
- `:84-85` Number inputs are `text-sm` (14px), and `min` is set but there is no max or visible error. Severity: P3.
- `:90` The "Get ready (s)" input has its own handler that silently coerces (it clamps negatives to 0 and rounds). Severity: P4.
- `:95-100` Three stacked buttons: "Apply" (disabled until changed), "Back to the plan's numbers" (ghost, appears conditionally) and "Save as preset". The ghost buttons are `py-2` (about 34px). Severity: P3.
- `:72-74` No drag, no `pb-safe`, no `keyboardAware`; the scrim is `absolute`, so it only covers the runner. Severity: P2 (keyboard may cover the inputs, and the sheet's `max-h-[85%]` is relative to the runner).
- `:79` "The plan itself isn't changed." is useful, but caption size. P4.

### workout/QuickTimerSheet.svelte, QuickTimerHost.svelte

- `:116` The "Edit/Done" toggle for presets is caption text, `text-primary`, with no padding, about 14px tall. Severity: P2. Fix: `.tap` or a 44px target.
- `:121,128` The preset row has two buttons with the same action (the name and a play icon), and the play icon is `p-2` + `text-2xl`, so about 40px. Severity: P4.
- `:126` Delete preset is `p-2` + `text-xl`, with no confirm and no undo. Severity: P2. Fix: undo toast.
- `:138-139` The kind chips are `px-3 py-1.5` (about 30px) with `role="tab"` but no `tabpanel` or arrow-key handling. Severity: P3.
- `:136-141` Wrapping chips (`flex-wrap`) cause a 2-row layout at narrow widths, jumping the form below. Severity: P4. Fix: horizontal scroll or a fixed grid.
- `:149-150` Inputs are `text-sm` and `py-2` (about 36px). Severity: P3. The unit appears in the label, and `min` is set, but invalid input has no message (it is clamped silently by `setField`). Severity: P3.
- `:156` The CTA is "Open timer", but it also starts the timer, per the hint. The label undersells the action, and "Open" in the same sheet as "Start {name}" is inconsistent. Severity: P3. Fix: "Start timer".
- `:109` The close button here is `tap p-1`, versus `p-2` in other sheets. See cross-cutting.

### workout/TestSheet.svelte

- `:122` The close button has no padding (`text-xl` icon only, about 20px) and `shrink-0`. Severity: P2.
- `:138` "There are no tests yet. Add one under Settings → Training setup → Tests." has no link or button, and is caption size. Severity: P3. Fix: a button that navigates, or "Create a test" inline.
- `:147-150` The "How to do it" toggle is a whole-row button with a caption-size label, about 20px tall, `aria-expanded` missing. Severity: P3.
- `:167` The result input is `type="text"` with `inputmode="decimal"`, so no browser validation, and the user can type letters. Severity: P3. Fix: validate, show an inline error and mark `aria-invalid`.
- `:159` The label combines name, "· planned" and a unit using `&nbsp;`, and `text-content-subtle/70` on a dark surface is below 4.5:1. Severity: P3.
- `:177` The textarea is `h-20` with no `focus:` style, unlike the other inputs. Severity: P4.
- `:181` The error text is caption size, `text-danger`, with no `role="alert"`. Severity: P3.
- `:183-189` The Save button is not sticky, and there is no `keyboardAware` here (`kb=0`), so the notes field and Save can be hidden by the keyboard. Severity: P2.
- Title "Plan a test" / "Edit the test" / "Record the result" with the buttons "Add to session", "Save", "Update the result", "Save the result". Four verbs for saving. Severity: P4.

### workout/GroupSettings.svelte

- `:72,76` The rounds +/- buttons are `px-2 py-1.5` around `text-base`, about 32x30px. Severity: P2. Fix: 44px.
- `:83-87,92-96` The inputs are `py-1.5` with `text-label` (12px), about 30px tall, and use `onchange` (so the value commits only on blur, and the Save in the parent can fire before the value is committed). Severity: P2. Fix: use `oninput` or blur on Enter.
- `:62-64` "Ungroup" is `px-2 py-1` caption text, about 24px tall, with only a `title`. It is destructive (it removes the circuit settings) with no undo here (the editor's `regroup` may support undo; the session's `dissolveCircuit` does not). Severity: P3.
- `:101` The helper paragraph is a dense sentence at caption size. Severity: P4.
- `:107,116-118` Warning states (`text-warning`) appear inline in caption text, and "stops after round N (its sets)" is cryptic. Severity: P4.
- The group name input has no visible label (placeholder only, dashed underline), and no `aria-label`. Severity: P3.

### workout/SetRowsEditor.svelte

- `:85,89` The steppers are `w-9` (36px), and `:116,120` are `w-8` (32px). Severity: P2. Fix: 44px.
- `:94,107` Remove set is `p-1` around a 14px icon (about 22px) with only `.tap` on one of the two variants (`:94` lacks it). Severity: P2. Fix: apply `.tap`, and use a larger icon. There is no undo for removing a set.
- `:75` The heading text at label size carries a long explanatory sentence ("a number typed in a set carries on to the later sets that had the same one"), which is unusual behaviour with no visual cue on the later rows. Severity: P3. Fix: visually ghost the inherited values.
- `:92` The unit column is `w-10 text-caption`, and long units such as "kg" are fine, but `lbs`, `mm` and `%` are tight. P4.
- `:118` The multi-field cards have inputs without `aria-label` (the visible label is in a wrapping `<label>`, which is fine).
- `:130` "Add a set" is a dashed `py-2` button (about 34px). Severity: P3.

### workout/ExerciseCard.svelte, ExerciseDetails.svelte, TargetHint.svelte, SessionReviewCard.svelte, GroupCard.svelte

- `TargetHint.svelte:150` The icon uses `text-[10px]`, and the whole hint is `font-mono` caption text carrying the prescribed target, which is essential info in the log sheet. Severity: P3. Fix: `text-label`, and drop the monospace.
- `TargetHint.svelte:149` The "at target / above / below" cue is conveyed by icon and by `text-status-good` only for "at". Above and below share the same grey colour, so the difference is carried by a 10px arrow alone. Severity: P3.
- `ExerciseDetails.svelte:206-211` The "How to" toggle is a full-width caption-size button with no `aria-expanded`. Severity: P3. The same pattern at `TestSheet:147`.
- `ExerciseDetails.svelte:200` The notes are italic caption text, and long plan notes are the instruction the user needs mid-exercise. Severity: P4. Fix: `text-label` or body.
- `ExerciseCard.svelte:58-60` The row is a button containing a chevron only when an `onclick` is provided; in view mode it is not interactive, which is fine.
- `ExerciseCard.svelte:48` The status pip is `w-8 h-8`, display only. Fine.

### workout/SessionAIModal.svelte

- `:166-176` The mode switch buttons have no `aria-pressed` or tab roles. Severity: P4.
- `:183-185` The close button here is a 24px icon in `p-2` (about 40px). The icon is X, but the modal is a three-step wizard, so closing after pasting a long reply discards it with no confirm. Severity: P2. Fix: confirm if `pasteText` is non-empty.
- `:197,200` The step indicator uses `w-5 h-5` circles at caption size, and the step labels truncate. Severity: P4.
- `:253` The paste area uses `text-xs` (12px) mono, so pasted JSON is hard to read, and `resize-y` is fine. Severity: P4.
- `:256-282` Validation errors are shown only in a group list with caption text, the copy-fix action is `text-label` text-only (about 20px tall). Severity: P3.
- `:263` "Copy fix request" is a text link-style button without padding. Severity: P3.
- `:350-376` The footer buttons are `px-5 py-2.5` and `px-3 py-2.5` in a row, with Back on the left, which is the opposite of the other flows, where the primary is on the right but Back is a ghost on the left. That is consistent, but the `Copy again` and `Back` ghost buttons are 40px tall. P4.
- `:213` The long instructional paragraph above the mode switch is `text-label` text-heavy. P4.
- The prompt is copied to the clipboard, and there is no feedback if `navigator.clipboard` is unavailable (no fallback is visible). Severity: P3.

### dashboard/QuickLogSheet.svelte

- `:64` The close button has no padding or `.tap` (bare 20px icon), while the back button at `:58` has `tap p-1`. Severity: P2. Fix: `tap p-2`.
- `:72-76` The four action tiles are `p-4`, good targets. Their hint text is caption size. P4.
- `:84` SendForm is embedded in the sheet with `onDone={onClose}`, so after saving the sheet closes silently with no success feedback (a toast would confirm). Severity: P3. The same applies to the other sub-forms.
- `:79-87` Switching `kind` replaces the content in place, so the sheet height jumps. Severity: P4.
- `:53` The scrim is `bg-app-bg/90` with a hidden `role="button"` overlay, while others use `onclick` on the container. Another variant of the scrim code. Severity: P4.
- `:54` The sheet is not `role="dialog"`. See cross-cutting.

### sends/SendForm.svelte

- `:75-89` There are no labels at all on any field, placeholders only ("Problem name (optional)", "Grade, e.g. V6"). Once a value is typed, the field has no accessible name. The date input in particular has no label or placeholder, so a date is shown with no title. Severity: P2. Fix: visible `<label>`s or at least `aria-label`s.
- `:77` The grade input has no `inputmode` or `autocapitalize`, and accepts anything, with no validation feedback (the Save button just disables without a reason when empty). Severity: P2. Fix: validate with `gradeFromInput` and show "Not a recognised grade" inline. Offer a grade picker (chips or a select) for one-handed logging.
- `:78-82` The style select is an `appearance-none` native select with no chevron, so it looks like a text input. Severity: P3. Fix: add a chevron, or use chips for Flash, Onsight and Redpoint (3 options do not need a select).
- `:84-87` The crag input uses `<datalist>`, which is poorly supported on Android WebView (no suggestions in many versions). Severity: P3. Fix: a chip list of recent crags.
- `:88` The date input is `type="date"` with the same `p-3` and no label. Severity: P3.
- `:91` The Save button is `text-sm font-bold py-3`, with no hover or active state, and `disabled:opacity-40` with no reason given. It is also not sticky, and the inline form in a card has no `keyboardAware`. Severity: P3.
- `:93` Delete is a grey button sitting beside Cancel and Save, in the same row, with no confirm and no undo. Severity: P1. Fix: confirm, or undo toast. Also move it away from Cancel and style it as destructive.
- `:95` The Cancel button is `px-4`, about 44px high. P4.
- `:96` `inputClass` has `focus:border-primary/60` only, with `outline-none`. Severity: P4.
- There is no "log another" after saving, so logging a session of several sends takes a reopen per send. Severity: P3 (missing feature). Fix: a "Save & add another" that keeps the crag and date.
- `:29-37` There is no tick for whether the send was a repeat, no attempts count, and no rating or comment on the grade (soft/hard). Severity: P4 (missing feature users might expect).

### sends/SendsLog.svelte

- `:70-75` The "Add send" and "Import 8a.nu" chips are `.chip` (`py-1`, caption), about 26px high. They are the primary actions on this tab, with Import given nearly the same weight as Add. Severity: P2. Fix: a 44px primary "Add send" and Import under an overflow menu.
- `:70,73` The labels "Add send" / "Import 8a.nu" toggle open and closed, with only a colour change as feedback. Severity: P4.
- `:62` The send row's star icon has `aria-label="Trip project"`, but Iconify's `Icon` may render an svg with `aria-hidden`, so the label may not reach assistive tech. Severity: P4. Fix: wrap in a `<span role="img" aria-label>` or add a visible text label.
- `:90-95` The four stat tiles are `grid-cols-4 gap-1.5` with `px-2.5`, so at 360px each is about 80px wide. "Hardest flash" will wrap or truncate at caption size. Severity: P3. Fix: a 2x2 grid below `sm`.
- `:91-94` The stat tiles use `bg-surface/50 border border-border`, i.e. bordered cards, which the handover says were rejected for the calendar ("no heavy borders"). Severity: P4.
- `:100` The "Clear" chip is `text-xs` icon + caption, about 26px. Severity: P3.
- `:114` The trip header packs the title, dates and counts into one truncated `uppercase` line. Severity: P4.
- `:128-130` The empty state is a single italic caption line, with no illustration or action (no "Add your first send" button) when there are no sends at all. Severity: P3.
- `:55-59` A row tap opens an inline edit form in place of the row, which pushes the content down, so the user loses their position. There is no delete on the row itself (it is hidden inside the edit form), and no swipe actions. Severity: P4.
- There is no search or filter by crag or style, and no sort order other than by month or trip. Severity: P4 (missing feature).

### sends/SendImport.svelte

- `:35` The "Empty File" alert title is Title Case. Parse failures from `file.text()` or a malformed CSV that throws are not caught: `handleFile` has no `try/catch`, so a thrown parse error leaves the UI unchanged with no message. Severity: P2. Fix: `try/catch` with a visible error.
- `:73` The instructions are caption size, with no link to 8a.nu's export page and no sample columns. Severity: P4.
- `:75-78` The buttons are `text-sm px-4 py-2.5` (about 40px) and centred. P4.
- `:80` The file input is hidden, and the label for the choose button is fine. After picking a file, the name is not shown. Severity: P4.
- `:99` The checkboxes are `w-4 h-4` (16px) with no larger hit area. The whole row is not clickable, only the box. Severity: P1/P2 (16px tap target for the primary selection control, repeated for every row, in a long list). Fix: make the row a `<label>` with a 44px target, and add "Select all/none".
- `:104-106` The edit button is `tap p-1.5` around a 14px icon, so about 26px plus the 8px `::after` expansion. Severity: P3.
- `:84-86` The summary line uses "·" separators, while the warning at `:111` uses " - ". Severity: P4.
- `:94` The list is `max-h-[50vh] overflow-y-auto`, a nested scroll region inside the page scroll, which is awkward on touch. Severity: P3.
- `:115-121` The edit fields are `cellInput` with placeholders only (Name, Grade, Style, Crag), no labels, and the grade has no validation (`gradeFromInput` coerces silently). Severity: P3.
- `:129-134` The label "already logged (discarded)" is confusing, since the user cannot restore them. Severity: P4. Fix: "N skipped as duplicates".
- `:143-148` There is no progress or result feedback after import (the sheet just closes: `onDone`). Severity: P3. Fix: a toast "Imported 12 sends".
- `:145` The label "Import 0" when nothing is selected. Severity: P4.

### sends/GradeChart.svelte

- `:88,102` Chart count and axis labels are `text-[10px]`, which is below the app's own 11px caption floor. The axis row is `aria-hidden`, so only the bars carry labels. Severity: P2. Fix: `text-caption`, and thin labels earlier rather than shrinking the font.
- `:80-97` The bars are `flex-1` full-height buttons, `min-w-0`. With 15+ grades at 360px each is about 20px wide, below 44px. Severity: P2. Fix: let the chart scroll horizontally with a minimum bar width of 32px, or provide a list alternative (the sr-only table exists, which is good).
- `:63-68` The period toggle ("All time" / "12 months") labels are fine. The `seg` control height is not visible here. P4.
- `:92` Bars have no value labels when `showCounts` is false, and the readout line is below, requiring a second glance. P4.
- `:117` The hint "Tap a grade to show only those sends" is caption text, and the active-state text swaps in the same slot (`h-4` fixed), so a long line may clip. Severity: P4.
- `:74` The empty state: "No Font-graded sends" is jargon, and the user in V-scale mode sees it. Severity: P3. Fix: "No sends with a recognised grade".

### health/BodyweightLog.svelte

- `:138-140` Delete entry has no padding (a bare 14px icon, about 14px target), no confirm and no undo. Severity: P1. Fix: 44px target and an undo toast.
- `:99` The form is `grid-cols-[1fr_1fr_auto]` with date, weight and a `p-3` add button (about 44px). At 360px the two inputs are about 120px each, so the date input is cramped. Severity: P3.
- `:101-102` The date input has no `max` (a future date is allowed). Severity: P3.
- `:106` The weight input has `step="0.1"` but no `inputmode="decimal"`, and the placeholder "70.5" is not unit-aware (lb users). Severity: P3.
- `:108` The add button is icon-only, with an `aria-label`, good, but `disabled:opacity-50 disabled:pointer-events-none` gives no reason, and it is a plus with no text. Severity: P4.
- `:112` The error text is caption size, with `role="alert"`, good.
- `:114-129` The chart has no axis, no min/max labels, and the bars' values show on hover only (`group-hover:opacity-100`), so on touch the values are never visible. Severity: P2. Fix: tap-to-show, and print the min and max values.
- `:115-128` The bars are not accessible (no labels or table). Severity: P3.
- `:133-142` The entry rows use `font-mono` for the weight, unlike elsewhere (`tabular-nums` only). Severity: P4.
- `:132` A nested scroll box `max-h-48` inside a card. Severity: P4.
- `:91` The empty state is "No entries yet" in the subtitle only. P4.
- `:94-96` A decorative icon tile with `bg-primary-hover/10` carries no function. Severity: P4 (the "minimalist" brief).

### health/PainReportSheet.svelte

- `:120` The close button is `p-2`, about 36-40px. P4.
- `:118` The title shows "Where does it hurt?" as the heading until a name is typed, which turns into the name, so the heading is a question and then a noun. Severity: P4.
- `:130,167,175,186` The chips are `.chip` (about 26px tall), with `aria-pressed` missing on all of them. They are the primary input of this form. Severity: P2. Fix: 36-44px, `aria-pressed`.
- `:135` The side buttons are `py-1.5` (about 30px). Severity: P3.
- `:138-141` The "Detail" and "Called" fields are two similar free-text inputs, and "Called" is auto-filled (`nameTouched`), so the user may not understand why both exist. Severity: P3. Fix: show one derived name with an edit pencil.
- `:140` The label "Called" is unclear. Severity: P4. Fix: "Name".
- `:148` The date input has `max=today`, good. The `Started` label is a bare noun. P4.
- `:160-161` The slider shows "{severity}/10" at label size and gives no anchor text (0 = none, 10 = worst). Severity: P3.
- `:179` The textarea has no `aria-label`, placeholder only. Severity: P4.
- `:186-189` The watch-category chips list all categories, with no "none" explanation. The helper is caption text. P4.
- `:193` The label's "(optional)" is at `text-content-subtle/70`, below AA contrast. Severity: P4.
- `:194-197` The select "Started during" uses `—` as its empty option, and the meaning ("what you were doing when it started") is only in the label. P4.
- `:205-210` The sticky footer with "Log it" and Cancel, with `group-data-[typing]:static` to handle the keyboard, which is thoughtful. The Save button is `disabled:opacity-40` with no explanation of what is missing (probably region or name). Severity: P2. Fix: a helper line "Choose where it hurts" next to the button.
- Copy: "Log it" vs "Save" for editing, and "Cancel" versus the sheet's drag-to-close, are fine.
- There is no confirm on closing a half-filled form via scrim tap (`onclick` on the backdrop closes immediately). Severity: P3. Fix: guard if the form is dirty.

### health/PainIssueSheet.svelte

- `:78` Close is `p-2`. P4.
- `:107` "Just a tap" / "Add a number / note" toggle is `text-caption` text with no padding, about 14px tall. Severity: P2.
- `:114` The note input is `py-2` with `text-sm` and no label. P4.
- `:116` The check-in buttons (PainCheckInButtons) are tapped to submit immediately, with no confirm or undo, so a mistap logs a wrong check-in. Check-ins can be deleted (`:143`), but see below. Severity: P3.
- `:143-145` Delete check-in is `p-1` around a 14px icon (about 22px), with no confirm and no undo. Severity: P1/P2. Fix: 44px and an undo toast.
- `:153,157,161` The action buttons are `py-2.5` (about 40px). The "It's gone" action closes the issue with no confirm (it can be reopened with "It's back", so this is reversible). Severity: P4.
- `:165` "Delete this issue and its check-ins" is a text-only link button at label size, with `hover:text-danger` (invisible on touch), so it looks neutral. It closes the sheet and deletes immediately with no confirm and no undo, and it destroys the whole health history. Severity: P1. Fix: `showConfirm` naming the issue and the check-in count, or an undo toast; always show it in `text-danger`.
- `:86-96` The severity chart `h-24` uses colours via `tone()`, with `r="3.5"` points that are not interactive, so no tap to see a point's date or value. Severity: P3.
- `:97-99` The chart axis text is caption size, and "severity 0–10" is the only y label. Severity: P4.
- `:135` The severity pill's colour mix is computed via inline `style`, with the contrast depending on `tone()`, so it is unverified in light theme. Severity: P4.
- `:124-128` Notes and "Warns before" are caption text. P4.
- `:75` The date line packs six facts at caption size with "·" and " – ". P4.

### health/PainIssues.svelte, PainHeadsUp.svelte, PainCheckInButtons.svelte, PainScreens.svelte

- `PainIssues.svelte:38-47` The open-issue rows are `py-2.5` full-width buttons (about 52px), good. The severity chip is colour-coded with `sevClass` only. P4.
- `PainIssues.svelte:43` "checked today" / "checked 3 d ago" abbreviates "d", while `PainIssueSheet:118` writes "3 days ago". Also `:68` uses "· 5 d ·" and "peak 7". Severity: P4. Fix: one duration formatter.
- `PainIssues.svelte:52-54` The "New pain issue" is the full-width primary inside a card that also has its own list, so the primary action sits below a variable-length list. With many open issues, it is pushed down. Severity: P4.
- `PainIssues.svelte:58` The Resolved toggle has no `aria-expanded`. Severity: P4.
- `PainIssues.svelte:77` The disclaimer is caption size and long. Severity: P4: fine, but not collapsible.
- `PainHeadsUp.svelte:30-31` The chip variant uses `text-[10px]` with an icon `text-[11px]`, in `status-caution` on `status-caution/15`, which is about 3:1 contrast for 10px text. Severity: P2. This is a safety-relevant warning rendered at the smallest size in the app. Fix: `text-caption`, at least 11px and a solid contrast colour.
- `PainHeadsUp.svelte:31` `touched[0].bodyPart.split(' - ')[0]` parses a display string with a " - " separator to shorten it, which is fragile if a body part contains " - " (and clashes with the separator cleanup). Severity: P4.
- `PainHeadsUp.svelte:30` The chip is conveyed by `title`, which never shows on touch. The chip is not a button, so it is not tappable, while the line variant is. Severity: P3. Fix: make the chip tappable (open the issue).
- `PainHeadsUp.svelte:38` The copy "Easy on your {part} (n/10) - this session has X." uses a hyphen as a dash. Severity: P4.
- `PainCheckInButtons.svelte:23-35` Four buttons in a 4-column grid with `py-2` and a `text-lg` icon above `text-label` text, about 56px tall, good. The `ring-2 ring-primary/60` for the chosen state is subtle. Severity: P4. There is no `role="group"` or label ("How is it today?"), so the four buttons are announced without context. Severity: P3.

### Missing features and states worth adding (summary)

- Undo toast for deletes in sends, bodyweight, pain check-ins, pain issue, session delete and set removal (P1/P2).
- Save feedback (toast) after SendForm, BodyweightLog and PainReport saves (P3).
- "Save & add another" for sends (P3). A grade picker (chips) for one-handed send logging (P3).
- A sticky primary footer in ExerciseForm and SendForm (P3).
- A visible reason for every disabled primary button (P2): ExerciseForm, SendForm, PainReportSheet, PresetNameSheet, WorkoutView and StartScreen (blocked).
- A first-use hint for swipe-to-complete and swipe-to-skip in the live session (P3).
- Dirty-form guards on scrim tap for PainReportSheet, TestSheet, SessionAIModal and the ExerciseLogSheet (P3).
- Loading and error states for async saves (`saveWorkout`, `addOutdoorAscents`, the CSV parse) beyond the `isSaving` flag (P2).


## 4. Code audit: Plan, Home, History, Analytics

Read from code (nothing run). Severity as above. Numbering is this part's own: cite as "Part 4 #n". Line numbers are against the audited files; "verify" marks runtime-dependent claims.

### Cross-cutting (new themes, with one file:line each)

1. **P2 - Week identifier shown in four formats.**
   - Formats in use: `W42` (ThisWeekCard.svelte:71, WeekRecapCard.svelte:36), `Week 42` (TrainingPlan.svelte:527), `2026 · week 42` (PlanCalendar.svelte:132), `WK<br>42` (CalendarTimeGrid.svelte:305), and the raw id `2026-W42` (ThisWeekCard.svelte:160, TrainingPlan.svelte:607, BlockBrowser.svelte:127).
   - Fix: add one `formatWeek(weekId, {long})` helper that returns "Week 42" in long form and "W42" in short form. Never print the raw id.
2. **P2 - Accent colours carry several meanings.**
   - Blue (`primary`) means: interactive/links, selected state, HRV, the Load bars, Trip, "Planned" and rain.
   - Purple (`tertiary`) means: Strain, Outdoor ascents, Sleep and a phase colour.
   - Orange (`warning`) means: Finger load, RHR, competitions and "stale".
   - Red (`danger`) means: Missed, the now-line, delete and the Pain scale.
   - Fix: reserve primary for action and selection only. Give data series a separate categorical palette such as `--series-1..6`. Leave status tokens for status only.
3. **P2 - Chart text below the 11px floor.** The ramp enforces `--typescale-caption` of at least 11px, but charts hardcode smaller sizes: LoadPanel.svelte:152 and 225 (`text-[9px]`), HeatmapPanel.svelte:74 (`text-[9px]`), BlockReviewSheet.svelte:66 (`text-[10px]`), PhaseBand.svelte:92 (`text-[9px]`), PhaseStrip.svelte:26 (`text-[9px]`), CalendarMonth.svelte:82 (`text-[10px]`) and 99 (`text-[9px]`), WeekCalendar.svelte:81 (`text-[9px]`). These also ignore the "Text size" setting. Fix: use `text-caption` everywhere, or add a `--typescale-micro` of 11px that scales with the setting.
4. **P2 - Many `text-content-subtle/70` and `/50` labels.** The token is already tuned to about 4.6:1 (app.css:92); applying opacity drops it below AA in dark and light themes. Examples: axis labels (LoadPanel.svelte:264, StrainPanel.svelte:113, MixPanel.svelte:155), the greyed "Today" button (Analytics.svelte:464, PlanCalendar.svelte:216, TrainingPlan.svelte:495, `/50`), and ChartEmpty hints. Fix: drop the opacity modifier on text and use the token as-is. Where a quieter tier is wanted, add a real `--color-content-faint` token that has been contrast-checked.
5. **P2 - Hover-only information.**
   - Tooltips driven by `title=` or `group-hover:` have no touch or keyboard path: WeekCalendar.svelte:88 (week tooltip), MixPanel.svelte:83 (segment `title`), TrainingBlockCard.svelte:47 (bar `title`), BlockReviewSheet.svelte:65.
   - The same applies to the weather and friction `title=` on weather chips (WeatherCard.svelte:37, CragsCard.svelte:70, NextGoalCard.svelte:81).
   - Fix: reuse the tap-to-readout pattern from `ChartTips` / `PhaseBand`, or print the information inline.
6. **P2 - Destructive actions with no confirm or undo.**
   - Block delete: BlockManager.svelte:222 and 108, BlockBrowser.svelte:138.
   - Goal delete: GoalsCalendar.svelte:52.
   - Test-result delete: TrainingPlan.svelte:827.
   - Clear week: TrainingPlan.svelte:577. This one is adjacent to the reset and more buttons and wipes logged data.
   - Plan B delete: PlanBSheet.svelte:145.
   - Fix: use one shared pattern: a 5-second undo toast, or a confirm for anything holding logged data.
7. **P3 - Sheet scaffolding is hand-copied and drifting.**
   - Scrim: `bg-app-bg/90 backdrop-blur` in most sheets versus `bg-black/40` in EventSheet.svelte:20 and SessionPreviewSheet.svelte:69.
   - Corner radius: `rounded-t-2xl` versus `rounded-t-3xl`.
   - Padding: `p-5` versus `p-6`.
   - z-index: 100, 110, 130, 150, 160 and 170 with no scale.
   - Most sheets lack `role="dialog"` and `aria-modal` (only AiSendSheet and AICoachModal have them). Some close buttons lack labels.
   - Fix: extract one `<Sheet>` component with z-index tokens.
8. **P3 - Hardcoded colours outside theme tokens.** Trip and competition use `bg-sky-500` and `bg-amber-500` (CalendarTimeGrid.svelte:336, CalendarAgenda.svelte:86). The week overlap dot is `bg-white` (WeekCalendar.svelte:83), which is invisible on light cell colours. The default event colour is `#71717a` (CalendarAgenda.svelte:33, CalendarMonth.svelte:26, CalendarTimeGrid.svelte:39). Fix: add `--color-goal-trip` and `--color-goal-competition` tokens and use them in all calendar views.
9. **P3 - Date formats are not unified.** Samples:
   - History rows show "Wed 14", the month card header shows "October 2026", Home shows `formatDate()` ("Oct 15"), and the charts use "Oct 15" or "Oct 15, 2026".
   - A bare "Wed 14" with no month appears in History (History.svelte:339), WeekDetailSheet.svelte:206 and the pain list.
   - Fix: one `formatDay(date, {withWeekday, withYear})` helper, with the year shown only when it differs from the current year.
10. **P3 - Jargon appears undefined in several places.** Terms: ACWR, "load pts", "ratio", "monotony", "strain", "ramp rate", "RHR", "Plan A/B", "sweet spot". Examples are listed per component below. Fix: put an InfoButton on every first mention per screen, and add an "ACWR" glossary shortcut to the `load` term.
11. **P3 - Wide-screen layout is mostly a phone column.**
    - Home, History, Analytics and the Plan blocks view are all `max-w-lg` (Home.svelte:99, History.svelte:188, Analytics.svelte:451). Only the calendar widens, to `max-w-5xl` (TrainingPlan.svelte:433).
    - On a tablet or desktop this leaves large empty margins.
    - Fix: at `min-[900px]` use a two-column card grid on Home and Analytics, or master-detail in History.
12. **P3 - The "Flat sections" setting is not fully honoured.**
    - Cards that ignore it:
      - ReadinessCard.svelte:94 uses a hand-made `rounded-card border p-5` panel.
      - SummaryStrip.svelte:62 tiles carry `border border-border`.
      - BlockReviewSheet.svelte:46 tiles carry `border border-border`.
      - BenchmarkViewControls.svelte:71 is a bordered box.
      - QuickLogSheet.svelte:72 uses bordered tiles.
      - AICoachModal.svelte:694 uses bordered cards.
    - Fix: use the `.card` utility, or add a `.tile` utility that flat mode flattens.
13. **P3 - Plus/add buttons repeat.**
    - Plan screen: the AppBar has no "+", but the Plan header can show a "+" (PlanCalendar.svelte:244, only with the bottom bar), a "+" next to Sessions (TrainingPlan.svelte:722), a "+" next to Tests (TrainingPlan.svelte:810), a "+" next to Goals (GoalsCalendar.svelte:68), a per-day "+" in the Agenda (CalendarAgenda.svelte:137), and the FAB when the drawer nav is used.
    - Home: the "+" in the AppBar (Home.svelte:110) is the Quick log.
    - Fix: keep one primary add (the FAB or the header "+"). Give secondary adds a text label ("Add test") instead of a bare "+". In Agenda, show the per-day "+" only on empty or focused days.


### Home (src/components/dashboard/Home.svelte)

1. **P3 - Home.svelte:100: the title is the phase name, with date and week in the subtitle.** "Home" vanishes from the screen. If no phase covers today, the title is "Home" and the layout shifts. Fix: keep a stable title and show the phase as a chip or subtitle, or say "No phase today".
2. **P3 - Home.svelte:103-111: the "+" for Quick log has no visible label and shares the "+" glyph with the Plan "+".** Its meaning (pain/bodyweight/send/test) is only in `aria-label`/`title`. Fix: use a distinct glyph such as `ic:baseline-edit-note`, or add a tour/label on first run.
3. **P3 - Home.svelte:115-129: help (tour) and settings buttons are only shown with the bottom-bar nav.** With the drawer nav, tour entry is hidden. That is fine, but the two icons have inconsistent colours (the "+" is blue, the others grey) and are crowded next to the "+". Fix: move the tour into Settings, or into an overflow menu.
4. **P2 - Home.svelte:137-141: four unconditional banners (Update, Android, Pain check-in, Weekly check-in) are rendered before the user-ordered cards.** On a bad day all four stack above the readiness hero, and they cannot be ordered via Settings. Fix: limit to one banner at a time (priority queue), or add them to `homeSections`.
5. **P3 - Home.svelte:144: each card is wrapped in `div.empty:hidden` and `space-y-4`.** If a card renders nothing (Alerts with 0 alerts), `empty:hidden` removes the gap, but hidden-while-new logic runs separately, so spacing is fine. Minor: the Crags, Alerts and Timer cards disappear silently, and there is no hint in Settings that they are conditional. Fix: add a "(only when relevant)" hint in the home-sections settings.
6. **P4 - Home.svelte:78: the pull-to-refresh toast says "Weather refreshed" when nothing else ran.** Fix: "Up to date" or "Nothing to sync".
7. **P3 - Home.svelte:133: PullToRefresh has no non-touch alternative.** On desktop or with a screen reader there is no way to trigger sync, weather or update checks. Fix: add a refresh action in the AppBar overflow, or in the Settings sync section.

#### SectionHeader.svelte

8. **P3 - SectionHeader.svelte:22: the section label is `text-section uppercase` at 12px/11px in `content-muted` with a trailing 20px InfoButton.** Cards that skip SectionHeader hand-write the header differently (CheckinCard.svelte:31 and PainCheckInCard.svelte:39 use `<h3>`, AndroidAppCard.svelte:23 uses a body-weight `<p>`, ChecklistCard.svelte:47 wraps SectionHeader in a flex row, and NextGoalCard has no subtitle). Fix: make SectionHeader accept an `action` snippet, and use it everywhere.
9. **P3 - SectionHeader.svelte:25-32: the note button is 14px (`text-sm`) with `p-1 -m-1`, `.tap` expands the hit area by 8px, so about 38px.** The icon-only filled/outline sticky note is hard to read as "note". Fix: bump the icon to `text-base` and `min-h-11`.
10. **P3 - Cards with no subtitle or info button at all:** Alerts, Progress, Crags, Timer, Weather, Recent Activity, Training Block, Next Goal, Week Recap (subtitle only). Inconsistent: Fatigue and This Week have info buttons, Readiness has none. Fix: decide a rule (every metric card gets an info button; list cards do not).

#### ReadinessCard

11. **P2 - ReadinessCard.svelte:93-95, 31-36: `STATUS_HERO_BG` maps all four statuses to the same value, and the comment above it (bold status-tinted gradient) is stale.** Dead variation, and the hero card is the only Home card with a hand-written border that ignores flat-cards. Fix: delete the map and use `.card`.
12. **P2 - ReadinessCard.svelte:124: the status label prints the raw enum ("good", "caution", "risk", "neutral").** "Risk" reads alarming, and "neutral" is meaningless to the user. Fix: friendlier wording ("Ready", "Take care", "Rest", "Not enough data"), keep the icon and colour, and add the word in addition to colour.
13. **P3 - ReadinessCard.svelte:99-102, 104: the ring is a button, and its only breakdown affordance is tapping it.** There is no chevron or "Why?" hint, so the breakdown is hard to discover. Fix: add a small "Why this score" text link under the advice.
14. **P3 - ReadinessCard.svelte:139-143: the row label column is `w-14` (56px) and the value column `w-12` with "no data" text at 12px.** The label "Fatigue" fits, but larger text scale truncates it or wraps "no data". Fix: use `min-w-14` and `whitespace-nowrap`.
15. **P3 - ReadinessCard.svelte:147-148: the "Load" row is a button but looks identical to the other rows (no chevron).** Fix: add a chevron and underline so it reads as tappable. The footer sentence "Tap Load to see..." (153) shows the discoverability problem.
16. **P3 - ReadinessCard.svelte:153: "Points taken off 100. Each bar is coloured by how much of its maximum it costs."** This is correct but wordy, and "Load" here means ACWR while the ThisWeek card's "load" means points. Fix: rename the row "Load ratio".

#### TodayCard

17. **P2 - TodayCard.svelte:96: "load 24 pts" in the meta line.** "load pts" is jargon, unexplained here, and it is the only place on the card with an unexplained unit (the same appears in ThisWeekCard.svelte:105, WeekRecapCard.svelte:53, History.svelte:328 and TrainingPlan.svelte:748). Fix: add an InfoButton ("load") to the Today header, and drop "pts" in favour of "load 24".
18. **P3 - TodayCard.svelte:114: Start button is `px-3.5 py-2 text-label`, so about 34px tall.** The primary action on Home is under 44px. Fix: `min-h-11`.
19. **P3 - TodayCard.svelte:123: "Start a session" link is bare `text-label` with no padding.** Tap target is about 16px high. Fix: pad it to 44px, or make it a full-width secondary button.
20. **P3 - TodayCard.svelte:141-142: "Open" and "Skip" buttons are `py-1` (about 26px).** They are next to each other with `gap-2`, so mis-taps are likely, and "Skip" has no confirm or undo. Fix: 44px height, and offer undo on Skip.
21. **P3 - TodayCard.svelte:129-132: the "Missed this week (n)" toggle is `text-label` with a tiny chevron, and it sits under the sessions with low prominence.** A missed session is quite important for the user. Fix: show a count badge in `status-caution` when n > 0.
22. **P4 - TodayCard.svelte:122: the empty state "Nothing planned for today." is italic `text-caption` and the link right of it is not a button.** Fix: make the empty state a quiet row with a clear secondary button, and mention rest days explicitly.

#### ThisWeekCard

23. **P2 - ThisWeekCard.svelte:51-57, 83: the day strip encodes done / missed / skipped / planned with colour plus a tiny glyph (icon `text-[8px]` for planned, `text-xs` otherwise) in a 24px circle.** The planned dot is 8px, and green vs red is the main cue (the icons differ, but they are very small). Each cell is 24px circle plus `py-1`, about 44px tall but under 44px wide on a narrow phone (7 columns). Fix: bigger glyphs (at least 12px), distinct shapes, and add a legend or the peek line (which exists, but only after a tap).
24. **P3 - ThisWeekCard.svelte:82: the day letters are single initials ("M T W T F S S").** Duplicated T and S are ambiguous, only distinguished by position. Fix: use two-letter names ("Mo Tu") or full names at wider widths.
25. **P3 - ThisWeekCard.svelte:104-105: "{n} load pts · 3h 20m" with a `text-metric` number and a 11px caption.** The InfoButton for "load" is in the card header, far from the number. Fix: put a "?" next to the unit.
26. **P2 - ThisWeekCard.svelte:107-113: the ACWR badge is "caution"/"high risk"/"sweet spot"/"low", shown as a pill.**
    - Contrast: it uses `text-status-caution` on `bg-status-caution/15`, which is about 2.5:1 in the light theme.
    - Word choice: "low" is neutral grey while the Analytics chart (LoadPanel.svelte:14-18) paints the same "low" zone green ("good").
    - Wording: the pill reads "ACWR 1.32" with no explanation of the term on this card.
    - Fix: one shared `acwrZone()` function for Home, charts and sheets, with an explicit "low" status, and the word "ACWR" accompanied by an InfoButton.
27. **P3 - ThisWeekCard.svelte:111-112: the ACWR placeholder text "ACWR from 4 weeks in" is `text-caption` grey with a chevron.** It is tappable but looks like plain text. Fix: style it as a link, and explain ("needs 4 weeks of history").
28. **P3 - ThisWeekCard.svelte:118-121: the weekly target line uses `status-caution` when above target.** Colour is the only above-target cue, and it is a flag icon (unrelated to being above). Fix: add the word "over" and a different icon.
29. **P3 - ThisWeekCard.svelte:126-129: the progress sentence joins "3 of 4 sessions done · 75% of the plan · 1 missed".** Two different percentages exist on one card (plan progress vs ACWR vs target), and the bar shows only one. Fix: label the bar ("plan") and move the target progress into the same bar section.
30. **P3 - ThisWeekCard.svelte:45: the mix bar's category colours fall back to `bg-primary` when a category has no colour.** Primary also means "selected", so an uncoloured category looks highlighted. Fix: use a neutral fallback.
31. **P3 - ThisWeekCard.svelte:145-152: the mix bar has no legend and only the top 3 categories are named in text.** Colour-only encoding for the others. Fix: show dots in the caption next to each named category.
32. **P4 - ThisWeekCard.svelte:160: the note sheet subtitle shows "This week · 2026-W42".** Use the shared formatter.
33. **P3 - ThisWeekCard.svelte:86-88: the trip icon is `text-[10px]`, placed under the day with `-mt-0.5`.** It is tiny and is decorative with an aria-label on an icon inside a button that already has a label. Fix: fold the trip name into the button's aria-label, and make it 14px.

#### MetricsCard

34. **P2 - MetricsCard.svelte:111-113: "+ Log today" is a text-only `text-label` button and the logged value is a plain button with no edit affordance.** Fix: use a pencil icon on logged values, and give both a 44px hit area.
35. **P3 - MetricsCard.svelte:106-108: the inline edit form has a 80px number input and 28px icon buttons (`p-1.5` plus `text-sm`).** `.tap` helps, but the check and close buttons have no `aria-label`. Fix: add labels "Save" and "Cancel", plus `inputmode="decimal"` and a unit label.
36. **P3 - MetricsCard.svelte:115-118: "+10% vs your baseline (52)" uses `text-status-caution` only if the dip exceeds a threshold, and a positive change gets no good colour.** The word "baseline" is not defined. Fix: say "14-day average", and add an InfoButton ("hrv").
37. **P3 - MetricsCard.svelte:124-132: bodyweight "7-day avg 72.4 ↑ 0.3" has no unit and the arrow has no colour or word.** Fix: add the unit and "up/down" text for screen readers.
38. **P3 - MetricsCard.svelte:138: sparklines are `aria-hidden` with no text alternative.** There is also no value labelling for min/max, and the colour mapping HRV=blue, sleep=purple, RHR=orange repeats Analytics (consistent, but see cross-cutting #2). Fix: add `<title>` text, and a text summary such as "7 days, trending down".
39. **P4 - MetricsCard.svelte:94: the subtitle "Sleep, HRV, resting heart rate, bodyweight" is a list of the contents, not a hint of what to do.** Fix: "Log how you slept and recovered".

#### Alerts, Progress

40. **P2 - AlertsCard.svelte:55,61,67 (ALERT_DOT): severity is conveyed only by the dot colour (`w-2 h-2`).** There is no text or icon for severity. Fix: an icon per severity, and `sr-only` text.
41. **P3 - AlertsCard.svelte:54-64: rows with an action use `group-hover:text-primary` and a chevron; rows without an action look the same but do nothing.** Fix: distinguish action rows more strongly, and give a 44px minimum height.
42. **P3 - AlertsCard.svelte:51: the Alerts header has no subtitle, no count and no way to dismiss or snooze an alert.** Fix: add a dismiss "x" per alert (with a 1-day snooze).
43. **P3 - ProgressCard.svelte:38-110: one card mixes five different things (consistency, benchmarks, tests due, sends and trips).** It is a long, dense card with no subtitle, and "Progress" is also an Analytics tab. Fix: split into "Consistency" and "Tests", or add subtitles per block.
44. **P3 - ProgressCard.svelte:41: the consistency sentence ("{done} of the last {due} sessions d...") is truncated in my view; the `weekStreak` text is `text-label text-primary`.** Primary used for a non-interactive statistic implies it is a link. Fix: use `text-content` or a success tone.
45. **P3 - ProgressCard.svelte:57: the benchmark change is coloured `status-good`/`status-caution` (the caution for "didn't improve"), with a plain `changeText`.** "Not improved" is shown with an alert colour, and "improved" in green only. Fix: use ▲/▼ glyphs and the word, and keep amber only for regressions.
46. **P3 - ProgressCard.svelte:73-78: "Planned Mon W42" pill and "Due" pill, `text-caption`, `px-1.5 py-px`.** About 16px high, not tappable, and the "W42" suffix is cryptic. Fix: show the date ("Planned Mon 19 Oct").
47. **P3 - ProgressCard.svelte:83: "Have the AI schedule them" is a bare caption-sized link with a sparkles icon.** Under 44px. Fix: make it a chip-size button.
48. **P3 - ProgressCard.svelte:91, 94, 103: long crag, trip or route names rely on `truncate`, but "Hardest this season: V6 (name) · date" is a single wrapping `<p>` with unbounded name text.** Overflow risk for long names. Fix: add `break-words` or `line-clamp-2`.

#### Fatigue, Week Recap, Training Block, Next Goal

49. **P2 - FatigueCard.svelte:14: the subtitle is "Now, per area · recent sessions added up, fading as you rest".** Wordy and still not explaining 0-10 or what "area" means. The InfoButton exists, but the bars have no scale, tick marks or colour thresholds (bars use per-axis colours, not status colours). The user cannot tell whether 6.2 is high. Fix: add a "high" marker line at the same `HIGH` threshold Analytics uses (FatiguePanel.svelte:100), and show it in text.
50. **P3 - FatigueCard.svelte:16: the radar chart is a separate component with its own accessibility.** Verify it has text alternatives (the bar list exists as the alternative, but only when the setting is bars). Fix: give the radar an `aria-label` that lists the four values.
51. **P3 - FatigueCard.svelte:34: "Arms rated on 3 of 7 sessions" at `text-content-subtle/70`.** It is low contrast and is the only warning that the data is thin. Fix: use the normal subtle colour.
52. **P3 - WeekRecapCard.svelte:36: the subtitle "Last week · W41" — title "Week Recap" duplicates ThisWeekCard's content (done/load/mix).** The two cards are visually near-identical, which makes the screen long. Fix: let the user merge them, or make Recap collapsed by default.
53. **P3 - WeekRecapCard.svelte:54-58: "↑ 12% vs the week before" is neutral grey (`content-muted`) with an arrow.** Good (no good/bad judgement), but it has no `aria-label` for the arrow direction. Fix: put the words "up" or "down" in `sr-only`.
54. **P3 - WeekRecapCard.svelte:86: the pain icon uses `status-caution` and the label "1 pain entry" has no link to the pain screen.** Fix: make it a button that opens the pain timeline.
55. **P3 - TrainingBlockCard.svelte:37-39: the week progress segments `h-1.5` are colour-only, with no labels and no current-week marker other than fill.** The text "Week 3 of 8" supplies the meaning, so this is acceptable, but a long block (20 weeks) yields hair-thin segments. Fix: switch to one continuous bar above about 12 segments.
56. **P2 - TrainingBlockCard.svelte:44-53: the "planned vs logged" bar chart has no axis, no values and no labels per bar; the only text is a caption explaining filled vs outline.** Bars `title="W42: 80 of 100"` are hover-only. Heights are relative to `blockTrendMax` with no scale. Dashed vs solid is the only encoding (good), but the values are not available on touch. Fix: tap to show a readout line, and label the current bar.
57. **P3 - TrainingBlockCard.svelte:32: the block name is `font-bold text-body`, unlike other cards' title style.** There is also no link to the block manager or review. Fix: make the title a button that opens the Block manager at today.
58. **P3 - TrainingBlockCard.svelte:62: "Next: block · 12 days" is `text-caption`; fine, but there is no way to jump to it.** Fix: make it a link.
59. **P3 - NextGoalCard.svelte:47-61: the countdown column uses `text-display` (44px) next to a bordered text block, so "days" at 11px sits below it.** For a goal that is `ongoing`, the number reads "3/5" with a "day" label, which is cryptic. Fix: "Day 3 of 5".
60. **P3 - NextGoalCard.svelte:72-87: the forecast strip day columns `w-11` repeat the weather-strip markup from CragsCard.svelte:61-75 and WeatherCard.svelte:115-140 with small differences (`pt-2`, `w-11` vs `w-12`, date parsing).** Fix: extract `<ForecastStrip>`.
61. **P2 - NextGoalCard.svelte:80-84 and the same in CragsCard.svelte:69-73, WeatherCard.svelte:132-136: friction is shown as a bare number (0-100?) with a colour, or as a 8px dot with only a `title`.** The meaning of "friction" and the scale is not explained on the card (the WeatherCard badge has `title="Climbing conditions - tap for why"`, but not the strips). A colour-only dot is not accessible. Fix: always show the word ("good/ok/poor") or an icon shape, and add an InfoButton ("friction").
62. **P3 - NextGoalCard.svelte:112-113: "Yes"/"No" buttons for project matching are `px-2 py-0.5`, about 22px tall, side by side.** A wrong tap records a wrong answer. Fix: 44px, with an undo.
63. **P3 - NextGoalCard.svelte:111: the candidate prompt reads `"Name V5" - counts for Project?` using quotes and a hyphen.** Fix: proper wording: "Does 'Name' count for 'Project'?"
64. **P3 - NextGoalCard.svelte:127: "See the taper against..." link is caption-sized.** Fix: pad it to 44px.
65. **P4 - NextGoalCard.svelte:130: the empty text says "Add one under Plan → Goals" without a link.** Fix: make it a button that goes to Plan.

#### Crags, Weather, Recent Activity, Timer, Checklist, banners

66. **P1 - CragsCard.svelte:66 and WeatherCard.svelte:120: `new Date(day.date).toLocaleDateString(..., {weekday:'short'})` parses a date-only string as UTC midnight.** In any timezone west of UTC the weekday label is one day early. NextGoalCard.svelte:77 and CragsCard.svelte:86 correctly use `T12:00:00Z`. This is a correctness bug in the user-visible weather forecast for users west of UTC (verify with a US timezone). Fix: share the `T12:00:00Z` helper.
67. **P3 - CragsCard.svelte:45-47 and WeatherCard.svelte:33-40: the friction pill uses a coloured badge with the word and/or number depending on two settings.** With both settings off, the pill is hidden and no conditions info remains. Fix: ensure at least the word shows when the card is visible.
68. **P3 - CragsCard.svelte:40: crag names truncate with `flex-1 truncate` next to 3 other items, so on a narrow phone and large text a long crag name collapses to a few letters.** Fix: allow two lines, or drop the temperature column below a width.
69. **P3 - CragsCard.svelte:50-52 and WeatherCard.svelte:147: "unavailable" and "loading…" are italic captions.** There is no retry button, and "loading…" can remain forever when offline. Fix: add a "Retry" action and a timeout.
70. **P3 - WeatherCard.svelte:29: `temperatureUnit(...).slice(1)` produces "°C" next to the number.** The unit handling is a string slice hack and `T()` presumably already formats a unit elsewhere, so the same quantity renders with and without a unit (strip: `{T(day.tempMaxC)}` with no unit). Fix: be consistent, one unit on the first number only, or all with the unit.
71. **P3 - WeatherCard.svelte:58-77: the details row mixes "Feels 12", "Dew 8", "UV 5" with no units (the numbers rely on `T()`).** "Dew" is jargon, as is "friction". Fix: "Dew point", and units for UV.
72. **P3 - RecentActivityCard.svelte:22, 28: the fatigue code shown as "F5 A3 C2 S4" in the meta line.** Single-letter codes are cryptic and nothing explains them. Fix: remove them or use the icons and a legend, or "Fingers 5".
73. **P3 - RecentActivityCard.svelte:30-31, 39-40: the right value is "load" for sessions (a number) and "send" (a grade) for ascents, in one column.** Two different units share one visual slot. Ascent rows have no `onclick`, so they look tappable (the same ListRow styling) but do nothing. Fix: link the ascent to Sends history.
74. **P3 - RecentActivityCard.svelte:44: the empty state "No completed sessions yet." with no CTA.** Fix: add "Log a session".
75. **P3 - TimerCard.svelte:17: each timer row is a full-row button with a 24px play icon, with no `aria-label` beyond the visible text.** Fine, but "All 6 timers…" (26) is a bare caption-size link. Fix: use 44px.
76. **P3 - ChecklistCard.svelte:49: the dismiss "x" is `tap p-1` with `text-lg`, labelled "Hide this card for good".** A permanent, irreversible-looking dismissal is one tap and is placed next to the header. Fix: confirm, or tell the user where to bring it back (Settings).
77. **P3 - ChecklistCard.svelte:57: the checkbox circle `w-5 h-5` uses `bg-success border-success text-app-bg` for done.** OK, but "optional" tag text is inline. Fix: no change except the dismiss confirm.
78. **P3 - CheckinCard.svelte:34 and PainCheckInCard.svelte:42: "Not this week" / "Not today" are `text-caption px-2 py-1`, about 26px.** Next to each other they are easy to mis-tap and these are dismissals with consequences (the check-in is skipped for the week). Fix: 44px, and "Snooze".
79. **P4 - CheckinCard.svelte:31 and PainCheckInCard.svelte:39: these cards write their own `<h3 class="text-section uppercase ...">` (see Home #8), and the weekly check-in's primary button is `bg-primary` full width while every other Home card has no primary CTA.** It competes with the Today Start button. Fix: demote to a secondary style, or show it only on the chosen check-in day.
80. **P3 - AndroidAppCard.svelte:23: "Get the Android app" is `font-semibold text-body`, not the section header style, and the card is `card` but its primary button is a full-width solid blue.** Same issue: two solid primary buttons on one screen. Fix: use the secondary style, and show only on the first few opens.

#### AcwrSheet / TaperSheet / QuickLogSheet

81. **P2 - AcwrSheet.svelte:44: the title "Load ratio (ACWR)" and line 60 "(last 7 days) ÷ (your usual week: t...)".** Good plain-language explanation here, but it is the only place the abbreviation is spelled out (the Home pill and chart say "ACWR" only). Fix: lead every ACWR mention with "Load ratio".
82. **P3 - AcwrSheet.svelte:39-41, 47, TaperSheet.svelte:32-40, BlockReviewSheet.svelte:34-42: these three sheets use `role="button"` on the scrim, or no role at all, no `role="dialog"`, and the close button is 20px (`text-xl` icon with no padding).** Fix: shared Sheet component (cross-cutting #7), 44px close.
83. **P3 - AcwrSheet.svelte:79, 80: block bars use `bg-primary` for this week and `bg-primary/40` for earlier ones, with no axis.** Acceptable. Minor: loads are not labelled as "points".
84. **P3 - TaperSheet.svelte:53, 56-57: the bar shows planned/done against a target tick (`w-0.5 bg-content`), with caution colour when "over".** The target tick has no legend. Fix: add a legend row ("| = target").
85. **P3 - QuickLogSheet.svelte:72: each action tile is a bordered `p-4` card with icon, label and hint.** Good size. But there are no "recent" or "favourite" shortcuts, and "Quick log" only offers four fixed actions (pain, bodyweight, send, test), with no way to log sleep/HRV here even though MetricsCard exists. Fix: add "Daily metrics" as a fifth tile.


### History (src/components/history/History.svelte)

86. **P2 - History.svelte:149, 154, 339: `new Date(w.date)` is used for month grouping, the month label and the weekday and day-of-month text.** If `w.date` is a date-only "YYYY-MM-DD" string (verify; elsewhere dates are sliced as day strings, e.g. :78), this parses as UTC and shows the previous day or month west of UTC. Fix: parse with a `T12:00` anchor, or use the shared date helper.
87. **P2 - History.svelte:339: the date column is "Wed 14" with no month, inside a month-grouped card.** Reasonable, but when filters span months the month card header is the only context, and across years the year appears only in the header. Fine, but the sort label is not stated. Fix: show "Wed 14 Oct" when a filter or search is active.
88. **P3 - History.svelte:193-202: the filter button is 44px (`w-11 h-11`) with a count badge `text-[10px]`.** The badge hides while the filters are open. `aria-label="Toggle Filters"` does not state the active count. Fix: "Filters (3 active)".
89. **P3 - History.svelte:206-214: the Sessions/Sends tab control is `py-1.5 text-label` (about 30px) with no `role="tablist"`.** It uses `aria-pressed` buttons instead of tabs. Fix: 44px, and proper tab roles.
90. **P3 - History.svelte:216-312: the filter panel is a long form (up to 9 fields) with labels like "Includes Analytics Type", "Min Duration (m)", "From Date".** Title Case labels differ from the sentence case elsewhere. Active filters are not summarised once the panel closes (just a count). Fix: show removable filter chips under the header, and sentence-case the labels.
91. **P3 - History.svelte:225, 230, 273: inputs use `p-3` plus `text-sm` (14px) and `appearance-none` on selects.** The selects lose their dropdown arrow (`appearance-none` with no replacement icon, see `text-sm ap...`). Verify whether a background caret is added; otherwise users cannot tell they are dropdowns. Fix: add a chevron icon.
92. **P3 - History.svelte:303, 307: duration filter inputs `type="number"` have no `inputmode` and no placeholder, units are in the label "(m)".** Fix: `inputmode="numeric"`, placeholder "min".
93. **P3 - History.svelte:328: the month header shows "5 sessions · 412 load pts" at 11px.** "load pts" jargon; no info button; the header `text-section uppercase` differs from other card headers (no InfoButton, `flex items-baseline justify-between`). Fix: use the shared header, and add the info.
94. **P3 - History.svelte:347-348: each row's right value is a bare number, hinted "load".** No colour or bar to compare sessions at a glance. Fix: a thin load bar scaled to the month's max.
95. **P3 - History.svelte:334, 341: the meta line "Wed 14 · 62 min · F5 A3 C2 S4" uses single-letter fatigue codes (same as RecentActivity).** Fix: legend or icons.
96. **P3 - History.svelte:344-346: the detail line (exercise names joined and block name) is `truncate` single line.** Long sessions lose the information. Acceptable, but the block name goes missing first. Fix: put the block name in the meta line.
97. **P3 - History.svelte:357: the empty state "No workout history yet." is shown even when the filter excludes everything.** Fix: "No sessions match these filters" with a "Clear filters" button.
98. **P3 - History.svelte:360-367: "Load More" adds 50 and scrolling position can jump with month grouping; there is no total or "showing 50 of 214".** Fix: add a count; consider infinite scroll.
99. **P3 - History.svelte:69-76: sorting copies and sorts on every filter change, with `.reverse()` after the sort.** Not UX but affects the long list. Fix: sort once in a derived value.
100. **P3 - Missing feature (History): no export of the filtered list, no sort options (date/load/duration), no bulk select/delete, no per-month collapse, and no jump-to-date.** Fix: add a sort control and "Export these as CSV".
101. **P4 - WorkoutShareImage.svelte:132, 147-148, 180-214 and WeekShareImage.svelte:110, 120-175: share images use hardcoded hex and 8-10px text (`text-[8px]`).** They are intentionally dark, fixed-theme export images, but 8px captions are unreadable when the image is shared at chat sizes. Fix: raise to at least 11px at the export scale, and keep the colours as image-only constants.


### Analytics (src/components/analytics)

#### Analytics.svelte (header and shell)

102. **P2 - Analytics.svelte:486-496, 501-512: tabs are `py-1.5 text-label` (about 30px) and range buttons are `px-2.5 py-1 text-caption` (about 26px); these are the two most-used controls on the screen.** Fix: at least 40-44px height.
103. **P3 - Analytics.svelte:486-496: `role="tablist"` and `role="tab"` are set, but there is no `role="tabpanel"`, no `aria-controls`, and no arrow-key handling.** Fix: add the panel role and roving tabindex.
104. **P3 - Analytics.svelte:455-482: header controls (prev, Today, next, CSV) crowd the AppBar.** Prev/next are `w-10 h-10` (40px), "Today" is `px-2 py-1 text-caption` with `text-content-subtle/50` when at the current window (below contrast and looks disabled but is still clickable), and "Export CSV" is an icon-only download button with a title. Fix: move export to an overflow menu; show Today only when the offset is not 0.
105. **P3 - Analytics.svelte:458, 471: "Earlier"/"Later" labels move the window by one range (4w → one 4-week window), but the user is not told the step size.** The date range text at :513 is `text-caption text-content-subtle/80`, right-aligned and small. Fix: make the date range the main subtitle in the AppBar.
106. **P3 - Analytics.svelte:513, 120: the window range formats as "Oct 5 – Nov 1" (en-US) or "5 Oct – 1 Nov"; the year appears only when the window crosses years or is not this year.** OK, but the Pain and Recovery axis labels use "Oct 15" and the Benchmark readout uses the year (BenchmarkPanel.svelte:305). Fix: see cross-cutting #9.
107. **P3 - Analytics.svelte:517-519: swipe paging on the whole panels region (`use:swipePaging`) conflicts with horizontal scrolling inside charts (chips rows use `data-no-swipe`), but the heatmap and charts with `cursor-crosshair` pointer-drag selection might also trigger a page swipe.** Verify on a device. Fix: mark every scrubbable plot `data-no-swipe`, or require an edge swipe.
108. **P3 - Analytics.svelte:602-610: the "More charts" fold hides Monotony & Strain and Filtered Load, the two specialist charts.** Good, but the button is `px-4 py-3` and its count text is `/70`. Findings can deep-link into the fold (line 170), which works. Minor: nothing tells a new user the fold exists unless they scroll to the bottom. Fine.
109. **P3 - Analytics.svelte:616-619: "Every card on this tab is hidden - turn them back on under {settingsPath('history')}" is plain text.** Fix: make it a button that opens that Settings section.
110. **P2 - Analytics.svelte:427-449: the empty state is good, but it only appears when nothing at all is logged; with one session logged, every chart renders with zero-height bars and some say "No ... in this window".** Fine in itself, but there is no "minimum data" hint per chart (for example the ACWR needs 28 days). The LoadPanel handles it with "building history" only in tooltips (LoadPanel.svelte:250). Fix: add an inline "ACWR needs 4 weeks of data (you have 1)" under the ratio pane.
111. **P4 - Analytics.svelte:221: `RANGE_WORDS['1y']` is "year" so the comparison text reads "vs the year before" while others read "vs the 4 weeks before".** Fix: "vs the previous 4 weeks / the previous year".

#### SummaryStrip

112. **P2 - SummaryStrip.svelte:62-72: tiles show a value and a "▲ 12%" delta, coloured by `deltaClass(tile)`.** Verify whether the delta colour is green/red; a bare percent arrow with colour alone encodes good/bad, and "down" is good for some metrics (RHR) but bad for others (HRV). The delta also has no unit context ("12% of what?") apart from the line below (`comparisonLabel`, `text-content-subtle/70`, caption). Fix: show the sign and word in text, and place the comparison label above the tiles.
113. **P3 - SummaryStrip.svelte:62: the tile grid is `grid-cols-3` and the last tile spans to fill, so with 4 or 5 tiles the last one is wider than the others.** Looks uneven. Fix: auto-fit grid or keep equal widths.
114. **P3 - SummaryStrip.svelte:63: tile labels are `text-caption leading-tight` and unabbreviated labels such as "Avg sleep" or "Resting HR" may wrap at large text sizes; the tiles are not tappable even though they look like cards.** Fix: link each tile to its chart (scroll to section).
115. **P3 - SummaryStrip.svelte:76: the comparison caption `min-h-[1.25rem]` reserves space, then displays a blank line when there is nothing to compare.** Fine for layout stability, but leaves an unexplained gap. Fix: show "Nothing to compare yet".

#### FindingsPanel

116. **P3 - FindingsPanel.svelte:54: severity dot `w-2 h-2` with `role="img"` and an `aria-label` (good), colour is the only visual cue.** Fix: add a tone icon or shape.
117. **P3 - FindingsPanel.svelte:43: the ask-AI button is icon-only (sparkles), `p-1.5` plus `text-lg`, about 34px, with a label in `aria-label`.** Visually ambiguous (sparkles = AI?), no text. Fix: "Ask AI" text button, 44px.
118. **P3 - FindingsPanel.svelte:41: the card title changes by tab ("Worth a look", "About your training"...), which breaks the all-caps section label convention of the rest of the cards by being longer and sentence-like.** Fine, but "Worth a look" is vague. Fix: "Findings".
119. **P3 - FindingsPanel.svelte:62-65: findings rows with a link show a chevron; rows without a link have a 20px spacer.** Good alignment. No dismiss or "not useful" action. Fix: add "Hide this finding" for the rule.

#### LoadPanel (Rolling Load)

120. **P2 - LoadPanel.svelte:134-135: the title "Rolling Load" and the "acute : chronic load" sub-label (203) are the two names for ACWR; the subtitle says "how it compares with your usual" but never the unit ("load" = points).** The y-axis ticks (152) are 9px with `/70` opacity and have no unit. Fix: add "pts" to the top tick label and use 11px text.
121. **P2 - LoadPanel.svelte:206-208: the ACWR zone bands are drawn at `opacity="0.08"`.** They are essentially invisible in dark mode and light themes, so the zones only exist as the labels `0.8` and `1.5` at the right. The "low" zone below `sweetMin` has no band at all, but its dots are green (`ratioStatus` returns 'good' for anything below caution, lines 14-18), contradicting Home, which labels it "low". Fix: raise the band opacity to about 0.15, add a low band, add a "low" neutral status, and print band names ("sweet", "caution", "high") at the right.
122. **P2 - LoadPanel.svelte:231-247: ACWR dots are `w-2 h-2` (8px) in `<button>` elements with no padding.** Targets are about 8px on touch, many in a row, hard to hit, and status is shown by colour only (green/amber/red dot, hollow for "insufficient"). Fix: give each button a 32-44px transparent hit area, and vary the dot shape per zone (circle, diamond, triangle).
123. **P3 - LoadPanel.svelte:157-162: each bar is a `<button>` with `aria-label="{week.label}: {load} load - details"`.** Bar width is `w-[62%] max-w-[16px]` so about 16px, and with 26 weeks the button is about 11px wide. The tap-to-open-detail and the `chart-tip` tooltip conflict: on touch, a tap opens the detail sheet immediately and the tooltip is never seen (it is hover only). Fix: first tap shows the readout, a second tap (or a "Details" link in the readout line) opens the sheet.
124. **P3 - LoadPanel.svelte:187: the spike icon is `text-xs` (12px) in a button positioned over the bar, `aria-label="Ramp-rate spike"` with no value.** "Ramp-rate" is jargon, never explained on the card. Fix: "Load jumped 38% vs last week" label, plus a legend.
125. **P3 - LoadPanel.svelte:167: the current week is `bg-primary`, the others `bg-primary/45`; "current" is communicated only by emphasis and by the blue axis label (264).** Fine, but planned future weeks show nothing. Fix: show planned load as an outline bar like the Training Block card does.
126. **P3 - LoadPanel.svelte:272-274: "Plan: 82% of the planned work done so far" sits below the chart, while the 'plan done' per-week values appear only in the tooltip (172), which is hover only.** Fix: surface them in the tapped-week readout.
127. **P3 - LoadPanel.svelte:277: "No completed sessions yet" is a separate paragraph, not a `ChartEmpty` overlay like the other charts.** Inconsistent empty-state pattern. Fix: use `ChartEmpty`.
128. **P3 - LoadPanel.svelte:139, 146: `pr-5`/`pr-7` padding to hold the right-hand labels is applied three times with different values (`pr-5` for the band, `pr-7` for the plot).** Verify alignment of the PhaseBand with the plot. Fix: one wrapper padding.

#### PhaseBand

129. **P3 - PhaseBand.svelte:91-92: block names appear only when the segment is wider than 16% and in 9px white text on a coloured background at `opacity-70`.** White on 70% blue/amber fails 4.5:1. Fix: use 11px text with a dark text colour on light phase colours, or move labels below the strip.
130. **P3 - PhaseBand.svelte:79-113: the band is `h-5` with 12px-high segments (`h-3`).** Segment hit area is 12px tall (smaller than the 24px goal target), tapping reveals a text line below it. The band is rendered on the Load and Recovery charts but not on Strain, Mix, etc. Fix: min 24px target, and show the band consistently or never.
131. **P3 - PhaseBand.svelte:111: goal icons are `text-sm text-content drop-shadow`; competition and trip use the trophy and terrain icons here, but GoalForm and GoalsCalendar use `ic:baseline-flag` for competitions (GoalForm.svelte:84, GoalsCalendar.svelte:46).** Same concept, two icons. Fix: pick one (trophy) and use it everywhere.

#### MixPanel

132. **P2 - MixPanel.svelte:67-75: two segmented controls on one line ("Share | Minutes" and "Done | + Planned"), each `px-2 py-0.5 text-caption`, so about 22px tall.** Both are tiny, and their meaning is not obvious without reading (Share = percent of the column?). Fix: 36-44px, and a caption under the controls.
133. **P2 - MixPanel.svelte:80-85, 98-102: the window bar and legend chips use category colours (`t.cat.color`) with no pattern or labels in the bar itself.** The colour-only encoding is partly mitigated by the legend showing names and percentages, but the stacked columns (142-144) have 2px minimum segments, so a small category is indistinguishable from none. Category colours also repeat Home's mix bars (fine). Fix: add a tap readout per column (it exists, line 108) and make it keyboard-reachable.
134. **P3 - MixPanel.svelte:92-99: legend chips double as filters (`aria-pressed`), but the hidden state is opacity-40 only.** Fix: add a strikethrough like CalendarChips (CalendarChips.svelte:28).
135. **P3 - MixPanel.svelte:125-133: the plot is a `role="presentation"` div with pointer handlers and no keyboard access, same for StrainPanel.svelte:84-91, FingerLoadPanel.svelte:103-110, FatiguePanel.svelte:133-141, OutdoorAscentsPanel.svelte:157-165, RecoveryTrendPanel.svelte:368-376.** Keyboard and screen-reader users cannot read any chart value. Fix: add a visually hidden data table (or `<details>` "Show as table") per chart, and arrow-key support.
136. **P3 - MixPanel.svelte:64: the subtitle "6h 40m in this window" vs the readout "· 3h" use the hours helper; elsewhere "formatMinutes" is used (ThisWeekCard.svelte:105 "3h 20m").** Same quantity, two formatters. Fix: use one.

#### StrainPanel / FingerLoadPanel

137. **P2 - StrainPanel.svelte:62-63, 67-68: "Monotony & Strain" is pure jargon: the subtitle "Too few easy days shows as monotony above 2.0" is the only explanation, and the header shows "latest monotony" as a bare number.** Bars are strain (purple) and the line is monotony, on the same plot with no second axis; the bars turn amber when monotony is high, so amber means "monotony high" here but "caution" elsewhere (fine) and bars lose their series colour. The legend has three entries for four visual states. Fix: explain in one sentence under the title, split into two small charts, and put a value axis.
138. **P3 - StrainPanel.svelte:97: bars are `bg-tertiary` (purple) for strain, which is the same purple as Sleep (RecoveryTrend) and Outdoor ascents.** See cross-cutting #2.
139. **P3 - StrainPanel.svelte:120-124 and OutdoorAscentsPanel.svelte:195-199: legends are `text-caption text-content-subtle` with 8px swatches, not interactive; the Mix, Fatigue and Recovery legends are interactive filters.** Same visual, different behaviour. Fix: make non-interactive legends look different (no border/pill), keep one pattern for filters.
140. **P3 - FingerLoadPanel.svelte:57: the title "Filtered Load" is internal jargon; the real meaning (finger-loading categories) is in the subtitle only when a share exists.** Fix: rename to "Finger load".
141. **P3 - FingerLoadPanel.svelte:115: the bars use `bg-warning` (orange), the same orange as RHR in Recovery and the "caution" family; the spike icon is `status-risk` red.** Orange = a data series, red = a warning, on the same chart; with orange bars the status colour no longer pops. Fix: use a series colour that is not in the status family.
142. **P3 - FingerLoadPanel.svelte:62-68: the "Categories" button is `px-2 py-1 text-caption`, about 26px; the settings panel chips `px-2 py-0.5` (about 22px).** Fix: 36-44px.
143. **P3 - FingerLoadPanel.svelte:98: "Tap a column for its values · ⚠ = more than 30% up on the column before" uses a literal ⚠ character while the chart uses an icon.** Fix: use the same icon in the hint.

#### HeatmapPanel

144. **P2 - HeatmapPanel.svelte:78-92: the heatmap is a grid of up to 53 columns by 7 rows of `<button>`s (up to about 370 focusable buttons), each with `aria-label="2026-10-15: load 80"`.** Cell width is about 5-11px, and `onpointerenter` selects on hover. On touch the cells are far below any usable target size, and keyboard users must tab through hundreds of buttons. Fix: make the grid one composite widget (roving tabindex, arrow keys), use `role="img"` with a summary, and let touch select by dragging across the grid.
145. **P3 - HeatmapPanel.svelte:61-62: title "Training Calendar" collides with the Plan "Calendar" and the `Calendar` view; the subtitle says "last 6 months" regardless of the Analytics range selection.** The panel ignores the 4W/3M/6M/1Y preset (it only uses `endDay`). Fix: rename to "Training days" and note that it ignores the range.
146. **P3 - HeatmapPanel.svelte:64-66: the 6 mo / Year toggle uses `bg-primary text-white` for the selected state, whereas other view toggles use the quiet `seg-on` style.** The app's own rule (app.css:261-266) reserves the filled style for settings. Fix: use `seg-on`.
147. **P3 - HeatmapPanel.svelte:74, 103-106: month labels `text-[9px]`; the legend "Less ▢▢▢▢ More" has swatches `w-2.5 h-2.5` and no number scale.** Fix: label what the levels mean (load per day thresholds).
148. **P3 - HeatmapPanel.svelte:96-101: the selected-day readout shows a date and joined session names with `truncate`, or "Rest".** Fine. But cells for future days in the last week are `opacity-0` and still take space. Fine.
149. **P3 - HeatmapPanel: the only chart with no empty state.** With zero history it renders an all-empty grid. Fix: add `ChartEmpty`.

#### FatiguePanel

150. **P2 - FatiguePanel.svelte:103-114: the comment says "each chip carries the latest value" but the chips only show the label.** The readout line at 117-125 shows values only after a tap or hover; on first view the user sees four lines and no numbers. Fix: show the latest value in each chip (as in the comment), and put the same on Home.
151. **P3 - FatiguePanel.svelte:100: "Decayed rating per area (0-10) · shaded: 7+" — "decayed rating" is jargon.** Fix: "Estimated fatigue now, per area (0-10). The shaded zone is high."
152. **P3 - FatiguePanel.svelte:142: the high band is `bg-status-caution/[0.06]`, practically invisible.** Fix: 0.12 and a text label "high".
153. **P3 - FatiguePanel.svelte:129-131: the y-axis labels "10 / 5 / 0" are `text-caption` and `/70`; the label column is `w-6`.** Fine, but they use `justify-between` against a `h-40` plot with no padding, so "10" and "0" sit slightly off the gridlines. Fix: align with the gridlines.
154. **P3 - FatiguePanel.svelte:145-150: four lines in four colours (from `FATIGUE_AXIS_COLORS`) with no markers or dash patterns to differentiate them.** Colour-only. Fix: add direct end-of-line labels (F, A, C, S) or different dash patterns.

#### PainTimelinePanel

155. **P2 - PainTimelinePanel.svelte:79, 87: the severity dots are sized `6 + severity` px (7-16px) and coloured with `severityColor(...)`, with `aria-label="{part}, severity N"`.** Size and colour encode the same thing (good), but small dots are about 7px targets and the ring for load spikes (86) is colour only (`ring-status-risk/60`). Fix: 24px hit areas, and a distinct symbol (e.g. a small triangle) for spike weeks, with a legend entry (the subtitle explains "ringed" in text, so only the visual is missing).
156. **P3 - PainTimelinePanel.svelte:69: the body part label is `w-20` (80px) with `truncate`, and the `title` shows the full name on hover only.** Long names ("Left ring finger A2 pulley") are cut. Fix: wrap to two lines.
157. **P3 - PainTimelinePanel.svelte:58: the subtitle is a long sentence (about 100 characters) in caption size.** Fix: shorten and move the "ringed" explanation to a legend line under the chart.
158. **P3 - PainTimelinePanel.svelte:64-66: the empty state "No pain logged in this window" is in a `h-6` row, and the chart below still draws.** Fine and consistent with the stated intent.
159. **P3 - PainTimelinePanel.svelte:75-76: an open issue fades out via mask and the estimated end has a dashed right border.** Both are subtle, with no legend. Fix: legend entries ("fading = still open", "dashed = estimated end").

#### RecoveryTrendPanel

160. **P2 - RecoveryTrendPanel.svelte:304, 306: the card title is "Recovery", the same name as its parent tab "Recovery" (Analytics.svelte:129).** Fix: "Recovery trends".
161. **P2 - RecoveryTrendPanel.svelte:48-53 (STYLE): "sleep-score" and "sleep-duration" share the same purple and the same label "Sleep".** Two different quantities (a 0-100 score and hours) are indistinguishable in the legend and the lanes, so a reader cannot tell which one a line is (verify whether both can appear together; the file maps both). Fix: label "Sleep score" and "Sleep (h)", with different dash styles.
162. **P2 - RecoveryTrendPanel.svelte:306, 380-382: overlay mode normalises every metric to "% vs your 28-day baseline" and the y-axis shows "+X% / 0 / −X%", subtitle "up is better".** But for resting heart rate, up is worse. If RHR is inverted to make "up is better" true, the legend does not say so. Verify. Fix: show "RHR (inverted)" in the legend, or leave RHR un-inverted and say "up = higher".
163. **P3 - RecoveryTrendPanel.svelte:309-326: the Overlay/Rows toggle uses titles for explanation (hover only).** Fix: put the explanation in the subtitle (it is already, partly), and drop the `title` reliance.
164. **P3 - RecoveryTrendPanel.svelte:379-383, 414, 439, 451, 469: left labels `w-8` (32px): "Ready", "Weight", "Load", "HRV", "Sleep" at caption size.** "Weight" and "Ready" at 11px fill the 32px column and clip at larger text scale. Fix: `w-10` and `truncate`.
165. **P3 - RecoveryTrendPanel.svelte:442: the readiness line is always `var(--color-status-good)` (green), regardless of the value.** Green is a status colour meaning "good", but this line spans good and bad days, so green here means "readiness series". Fix: use a neutral series colour.
166. **P3 - RecoveryTrendPanel.svelte:442, 458: 'Ready' and bodyweight rows have no y-scale or values until a tap, and there is no marker for today.** Fix: show the latest value at the right (as the weight row does).
167. **P3 - RecoveryTrendPanel.svelte:397-408: the notes "Not in % yet: HRV (5 readings) - a % needs 7 earlier readings..." and "After a break, % is against your readings from before it." are caption-size, indented with `ml-10` hardcoded to the axis column width.** Verify alignment at larger text sizes. Fix: align to the grid, not a magic margin.
168. **P3 - RecoveryTrendPanel.svelte:522: "(4 hard, 12 rest days, last 6 months)" is a fixed 6-month window regardless of the selected range.** Easy to miss and contradicts the controls. Fix: say "(over the last 6 months, independent of the range above)".
169. **P3 - RecoveryTrendPanel.svelte:500-502: the empty-state text "Log HRV, sleep score, resting HR or bodyweight on Home to see how you recover" is good, but it is a `ChartEmpty` (not interactive).** Fix: add a button to open the Quick log.

#### OutdoorAscentsPanel

170. **P2 - OutdoorAscentsPanel.svelte:170-177, 196-197: flash/onsight are filled dots, redpoint/other hollow dots (`stroke-width 8` plus a surface-coloured inner 4).** The shape difference is sound, but the dots are 8px, overlap when a week has several sends of similar grade, and only one colour (purple) is used, which shares the colour with Strain and Sleep (cross-cutting #2). Fix: jitter or stack overlapping dots, and increase the hit area.
171. **P3 - OutdoorAscentsPanel.svelte:185-190: this panel passes its own `labelStep` while others receive `axisStep` from Analytics.** Labels may thin differently from the neighbouring charts. Verify. Fix: use `axisStep`.
172. **P3 - OutdoorAscentsPanel.svelte:146-155: the grade gutter is `w-9` (36px); grades like "V10" or "7C+" fit, but a font-grade "8A+/8B" label, or a V-scale with a slash, may clip.** Fix: `min-w-9`, and test with the longest grade string.
173. **P3 - OutdoorAscentsPanel.svelte:198: legend entry "Hardest" is a dashed line with no hint that the line connects each column's hardest grade.** Fix: "Hardest each week".
174. **P3 - OutdoorAscentsPanel.svelte:131-136: the tapped-week readout lists all sends in one wrapping line with a `ml-2` spacing hack.** With many sends the line is long; there is no link to open a send. Fix: make each send tappable to its detail.

#### Benchmark panels

175. **P2 - BenchmarkPanel.svelte:232 and BenchmarkOverviewPanel.svelte:42: the cards are titled "Test progress" and "All tests" while the data are called "benchmarks" in code and "tests" in the Home Progress card ("Tests")** and elsewhere "test result". Mostly consistent in the UI, but the Analytics section ids (`benchmarks`) are visible in the Settings -> History & Analytics list (verify the label). Fix: align the labels.
176. **P3 - BenchmarkPanel.svelte:242-243: the header delta is `text-status-good` / `status-caution` / `text-content-subtle`, with a sign character.** Sign plus colour is fine, but "gain" for lower-is-better tests (time, for example) depends on `gain` (verify it is direction-aware). Fix: spell "improved/slower" in text.
177. **P3 - BenchmarkPanel.svelte:252-256 and 260-264: two rows of horizontally scrolling chips (tests, then views) plus an "Adjust" button, `-mx-1 px-1`.** The chips scroll off-screen with no scroll affordance (hidden scrollbar via `no-scrollbar`), so a user may not know more tests exist. Fix: add a fade edge or a chevron.
178. **P3 - BenchmarkPanel.svelte:265: the "Adjust · edited" button text states state with `&nbsp;·&nbsp;`; `text-caption` and `px-2 py-1`.** Fix: bigger target.
179. **P3 - BenchmarkPanel.svelte:273-286: the save/update/delete view buttons (`px-2.5 py-1`, caption) include a destructive "Delete view" (`text-danger`) next to "Save as a new view" with no confirm.** Fix: confirm or undo.
180. **P3 - BenchmarkPanel.svelte:293-299: the multi-line legend entries use `PALETTE[i % PALETTE.length]`, so with more lines than palette entries colours repeat.** Not actionable until seen; verify the palette length against the max number of split lines (for example one line per grip type). Fix: cap the lines or add dash patterns.
181. **P3 - BenchmarkPanel.svelte:316: the y-axis label colour is set inline for the dual-axis case (the second axis `COLOR_B`); the right-hand axis only appears with `paths2`.** Dual y-axes are an anti-pattern for comprehension, though the app colour-matches the axes. Fix: prefer small multiples, or require the user to opt in.
182. **P3 - BenchmarkPanel.svelte:340: the gradient id `benchmark-gradient` is global; if the component ever rendered twice, ids would clash.** Also contradicts the stated "flat, no gradient" direction in the Load panel comment (LoadPanel.svelte:164). Fix: remove the gradient or scope the id.
183. **P3 - BenchmarkViewControls.svelte:71: the controls live in a bordered `rounded-control border border-border p-3` box (flat-cards setting ignored), the selects/inputs are tiny caption-size elements, and the sentence-like layout ("Show [select] across [select] and [select]") wraps unpredictably on narrow screens.** Fix: a stacked form layout on mobile.
184. **P3 - BenchmarkOverviewPanel.svelte:47-57: legend chips that select a line have no padding (`text-caption` text only, about 16px high).** Fix: chip padding, 36-44px.
185. **P3 - BenchmarkOverviewPanel.svelte:61-66: the y-axis shows the signed percentage at hi, middle and lo, where the `0` baseline is a dashed line; labels are caption `/70`.** Fine; but the middle label is not 0, which is confusing next to the dashed 0 line. Fix: label the 0 line and use "nice" tick values.

#### Sheets in Analytics

186. **P3 - BlockReviewSheet.svelte:65, 66: weekly load bars have a `title` tooltip and 10px labels, with no values printed.** Fix: print the value above each bar, 11px+.
187. **P3 - BlockReviewSheet.svelte:55-56: "Load, first → last" shows a signed number, and "Load a week" an unlabelled number.** Units (pts, %) are missing. Fix: add units, and an InfoButton ("load").
188. **P3 - ExerciseProgressPanel.svelte:50-51: each exercise row has a sparkline and a change figure coloured good/caution (`text-status-good` / `status-caution`), `w-12` right-aligned.** Percent with no sign glyph/arrow, and "caution" amber for decreases (could simply be a deload). Fix: neutral colour for small declines, an explicit arrow.
189. **P3 - ExerciseProgressSheet.svelte:82-92: the SVG chart is `text-primary` with a `role="img"` aria-label but the interactive circles are `role="button" tabindex="-1"` (not focusable), and the axis labels are SVG text at `font-size="8"` in a 300-wide viewBox that scales up to full width (about 11-14px on phones, but it shrinks on narrow viewports).** Fix: set the font size in CSS pixels outside the viewBox scaling; make the points focusable.
190. **P3 - ExerciseProgressSheet.svelte:87-88: tapping targets are `r=10` in a 300-unit viewBox (about 12px on a 360px screen).** Fix: use r=16 or an overlay of nearest-point selection (as in the other charts).
191. **P3 - WeekDetailSheet.svelte:117-130: the stat tiles say "load · of plan" with a combined cell ("312 · 85%") and "hours" with a one-decimal value ("3.5").** Mixed units in one tile. Fix: split into two tiles.
192. **P3 - WeekDetailSheet.svelte:132-142: "ACWR 1.32 (building history)" plus "Load vs week before +38% ⚠" appear as small caption text, and the warning glyph is a character in a string.** Fix: use an icon and the explanation link ("What is ACWR?").
193. **P3 - WeekDetailSheet.svelte:163-175: the session rows are about 40px, the load number at the right has no label, and `disabled={w.provisional}` makes projected sessions silently untappable.** Fix: explain "planned, not saved yet".
194. **P3 - WeekDetailSheet.svelte:206: pain entries show "Wed 14" without a month, and the sheet is also used for months.** Fix: include the month when the bucket is a month.
195. **P3 - ChartEmpty.svelte:13-15: the overlay is `pointer-events-none` and centred, with the text `italic text-caption` on `bg-surface/80`.** Good, but the same string is not announced to screen readers (no `role="status"`). Fix: add `role="status"`.
196. **P3 - chartTips (all analytics panels): `chart-tip` hover tooltips are the only readout for LoadPanel bars (170-173).** The ChartTips tap path exists (Analytics.svelte:404-407), but LoadPanel's bar buttons call `onSelect` on click, so they open the sheet and the tooltip can't be pinned. See #123.


### Plan (src/components/plan)

#### TrainingPlan (blocks view)

197. **P2 - TrainingPlan.svelte:437-454: the Blocks/Calendar view toggle is two icon-only buttons (grid-view vs calendar-month icons) inside the AppBar actions, each `p-1.5` plus `text-base` (about 28px; `.tap` expands the hit area).** The two icons are ambiguous (a grid-view icon for "Blocks"), and the AppBar then also has a "Manage training blocks" icon (`view-week`, a third block-ish icon) and the AI sparkle. Three of four icons relate to blocks/weeks. Fix: replace the toggle with a labelled segmented control ("Weeks | Calendar") under the title, and use the view-week icon only in one place.
198. **P3 - TrainingPlan.svelte:456-464: the "Manage training blocks" button uses `ic:baseline-view-week` and the view toggle's "Blocks view" uses `grid-view`.** The names ("Blocks view" vs "Manage training blocks") and the icons mismatch what each opens: one is the weeks list, the other is the phase editor. Fix: call the first "Weeks" and the second "Phases" in labels and the title (the UI mixes "block", "phase", "week" and "training block").
199. **P2 - TrainingPlan.svelte:556-594: the week header packs four icon-only buttons (note, reset, clear, more) in a row, each `tap p-1.5 text-lg`.** "Clear week" (trash-sweep icon, hover-red) is directly next to the "More" button and is unconfirmed. Icons like `restore` and `delete-sweep` are ambiguous without labels. Fix: move reset, clear and copy into the "More" menu, with text labels, keep only the note button visible.
200. **P3 - TrainingPlan.svelte:527: the title row reads "This week" or "Week 42" in `text-section uppercase`, followed by a date range in a smaller normal-case span, then the phase names as `text-title` buttons.** The visual hierarchy is inverted: the phase name is bigger than the week it belongs to, and phase headings are tappable but unlabelled (only an aria-label). Fix: add an edit pencil next to the phase name.
201. **P3 - TrainingPlan.svelte:537-539: "No Phase" is shown as a `text-title` heading in the same style as a real phase.** Fix: render as a muted "No phase - tap to add".
202. **P3 - TrainingPlan.svelte:481-489: the phase colour legend (dots plus names, `text-caption`) sits above the week grid with the week pager aligned right.** Legend names are not interactive and there is no hint that the dots map to the week-grid cells. Fix: make the legend entries filters, or collapse it.
203. **P2 - WeekCalendar.svelte:61-72: the week grid is `grid-cols-10` of `aspect-square` buttons with `gap-1.5` (about 30px on a 360px phone), colour-coded by phase with the year printed at 9px and the selected state a `ring-2`.** The week number is not printed on the cell at all, and the only name for each cell is the hover tooltip (88) and the aria-label. Phase colours are the only way to read the grid, and colour-blind users cannot map cells to phases. Fix: print the week number (11px) in each cell, and pattern or letter-code the phases.
204. **P3 - WeekCalendar.svelte:83: the "overlap" marker is a 6px `bg-white` dot with only a `title`.** Invisible on light-coloured cells, hover-only meaning. Fix: use a themed token, and explain in the legend.
205. **P3 - WeekCalendar.svelte:64-68: the buttons use `aria-pressed` for the selected week, and `aria-label` carries `week.tooltip`.** Good. But the grid has no label, no `role="group"`, and the 10-column layout does not align to years or months. Fix: add a group label ("Weeks, 2026"), and month ticks.
206. **P3 - TrainingPlan.svelte:495-497: the "Today" button is greyed (`/50`) when at the current week yet still clickable (same pattern as Analytics and PlanCalendar).** Fix: hide it, or disable it with `aria-disabled`.
207. **P3 - TrainingPlan.svelte:684-701: the week strip is 7 columns of day buttons with date, a 6px dot cluster for sessions and a 2px "Plan B stretch" bar.** Dot styles mix solid green (completed), dashed outline (provisional) and solid outline (planned), with 1.5 (6px) dots; the information is tiny and duplicated by the session list directly below. Fix: drop the dots, or make them 8px with a legend.
208. **P3 - TrainingPlan.svelte:597-642: the "Copy, repeat or share this week" panel holds five different actions: copy last week, repeat, Plan B, share, and (from the AppBar) none of the others.** "Plan B for uncertain days" is a feature, not a copy action, and is hidden inside a "more" menu opened by an ellipsis icon with an unrelated aria-label ("Copy, repeat or share this week"). Fix: title the panel "Week actions", and surface Plan B through the Sessions header.
209. **P3 - TrainingPlan.svelte:613-616: "Repeat this week into the next [select] week(s) [Repeat]" is a sentence-form control with a native select (1-8).** Fine, but the destructive effect ("Replaces the planned sessions there", 623) is in grey caption text below. Fix: show the consequence in the button ("Replace 3 weeks").
210. **P3 - TrainingPlan.svelte:709: "3 of 4 done · planned load 240 pts · ..." (truncated in my view) is a caption.** "planned load ... pts" is jargon (see cross-cutting #10), and it is "planned load" here but "load" elsewhere, with different scales (plan estimate vs rated load, which the Load chart's comment explicitly distinguishes, LoadPanel.svelte:41-47). The two numbers will never match and the UI uses the same word. Fix: "planned effort" vs "load", or footnote it.
211. **P3 - TrainingPlan.svelte:714-720 and 722: the Sessions header has an "Arrange" chip (`chip`, 28px) and a "+" icon button.** The Arrange mode swaps rows' Start buttons for day selects. The label becomes "Done" while active, which is the same word as the status "Done" on completed rows (785). Fix: "Finish arranging".
212. **P3 - TrainingPlan.svelte:759-762: the "Missed" and Plan A/B badges are `text-[10px] uppercase` pills.** Below the 11px floor, and the Missed badge is red tint only (`bg-danger/10 text-danger`), which at 10px has weak contrast. Fix: 11px, and an icon.
213. **P3 - TrainingPlan.svelte:787-794: each planned row has a Start button `px-3 py-1.5 text-label` (about 30px).** The row's other tap area is the whole title. Fix: 40-44px.
214. **P3 - TrainingPlan.svelte:799: the "Drop here" placeholder is `text-content-subtle/60`.** Only visible in arrange mode, but it renders in empty day lists, where it might show outside arrange mode (verify: `{:else}` of each applies whenever a day's group is empty). Fix: render only when arranging.
215. **P3 - TrainingPlan.svelte:807-836: the Tests section has its own "+" and the BenchmarkForm opens inline above the list; "None this week" is `italic caption`.** Mixed with Sessions, the two "+" buttons stack. See cross-cutting #13.
216. **P3 - TrainingPlan.svelte:827: the delete icon (trash) on a test row is next to a clickable row (edit); one tap deletes immediately.** Fix: undo toast.
217. **P4 - TrainingPlan.svelte:840: the Goals card sits below the week card and is always visible even in the calendar view.** Acceptable; in calendar view it adds a separate card style to a flat layout. Fix: hide in calendar view, or add a Goals chip row inside the calendar.

#### PlanCalendar

218. **P2 - PlanCalendar.svelte:216: the "Today" button greys out via `text-content-subtle/50` when you are on today (`isHere`).** It remains a tap target, with contrast under 3:1. Fix: hide or disable.
219. **P3 - PlanCalendar.svelte:224-233: the Day/Week/Month/Year control is `px-2.5 py-1 text-caption` (about 26px) next to `tap` icon buttons.** Fix: bigger.
220. **P3 - PlanCalendar.svelte:238-239: the week layout toggle (hour columns vs list) is two icon-only buttons with titles and aria-labels.** The icons are not visible in my read (class truncated), and they sit in a second group beside the "+" (244), so the header can hold up to five controls on the right. Fix: move the layout choice into Settings, or an overflow menu.
221. **P3 - PlanCalendar.svelte:243-247: the "+" appears only with the bottom bar nav, and with the drawer nav the FAB takes over.** The two modes have different add affordances, so a user who switches nav style may think the feature is gone. Fix: a persistent "Add" in the same place for both.
222. **P3 - PlanCalendar.svelte:210: `h-4` fixed height for the sublabel: "2026 · week 42" (day/week) or "3 done · 5 planned" (month/year).** It truncates at large text sizes. Fix: allow `min-h`.
223. **P3 - PlanCalendar.svelte:277, 306: "N sessions this week with no day - set one in the block view." is an unlinked caption.** Fix: make "block view" a button that switches view and scrolls to those sessions.
224. **P3 - PlanCalendar.svelte:302-304: the empty state ("Nothing planned this week.") appears below a grid that is already empty (visible empty time grid).** Fix: show an overlay CTA in the grid ("Add a session").
225. **P3 - PlanCalendar.svelte:311-315: the year view is a 3-column grid of mini months with 9px date numbers (CalendarMonth.svelte:99), `aspect-square` cells of about 25px on a phone.** Taps hit tiny numbers. Fix: min 32px cells (2 columns on narrow phones), or make the month name the main target.

#### CalendarTimeGrid

226. **P2 - CalendarTimeGrid.svelte:386: the hour gutter shows bare 24-hour numbers ("14") while event ranges and the now label use `hhmm` (24h "14:30").** Users whose locale is 12-hour get a 24-hour calendar everywhere else in the app (verify `hhmm`), and bare numbers are unlabeled. Fix: format with the user's locale (or a 24h/12h setting) and add "h" or am/pm.
227. **P3 - CalendarTimeGrid.svelte:305: the week label at the top left is "WK<br>42" at 9px.** Cryptic, and tiny. Fix: "W42" at 11px.
228. **P3 - CalendarTimeGrid.svelte:312: day name `text-[11px]` with `colW >= 72 ? 3 : 1` letters (so single-letter names like "T"/"T", "S"/"S" in narrow week columns).** Ambiguous. Fix: two letters minimum.
229. **P3 - CalendarTimeGrid.svelte:336, 349 / CalendarMonth.svelte:112 / CalendarAgenda.svelte:86: trip and competition colours differ by view.** Time grid and Agenda: sky-500 for trips and amber-500 for competitions. Month: `bg-primary` for trips and `bg-warning` for competitions. Same event, two colours. Fix: one token pair, used everywhere (cross-cutting #8).
230. **P3 - CalendarTimeGrid.svelte:338, 343, 420, 442: compact mode event text is `text-[10px] leading-tight` or `text-[11px] leading-[14px] break-words`.** Below the 11px minimum at 10px, and events shorter than 14px (`heightPx` min 14) clip text. Fix: 11px minimum; show title only when it fits.
231. **P3 - CalendarTimeGrid.svelte:388-389: the now-line label (`text-danger`, a red time chip) and the line itself use the danger token.** Red means "missed" and "delete" elsewhere; the now indicator is the standard red in calendar apps but, with Missed badges also red, both read as problems. Fix: use primary for now, which matches Samsung/Google Calendar's own convention less but avoids the clash, or keep red and make Missed amber.
232. **P3 - CalendarTimeGrid.svelte:400-404: tapping empty day space adds a session (a `div` with `onclick`, and `svelte-ignore a11y` comments), so keyboard and screen-reader users have no equivalent in the grid (they have the "+" button).** Acceptable; but accidental taps while scrolling add sessions (verify the tap-vs-scroll discrimination on a device). Fix: require a long press, or confirm via a sheet (the app opens an add flow, so low harm).
233. **P3 - CalendarTimeGrid.svelte:383: double-click on the gutter resets zoom; touch users have pinch only, and there is no visible zoom control or hint.** Fix: add a "reset zoom" button when zoomed.
234. **P3 - CalendarTimeGrid.svelte:329-351: all-day bars are capped (`HEADER_ROWS`) with a "+N" overflow button `text-[10px]` and a "Show less" button `text-[10px]`.** Tiny targets (about 12px). Fix: 11px text, 32px+ target.

#### CalendarMonth / CalendarAgenda / CalendarChips

235. **P3 - CalendarMonth.svelte:82: weekday headers `text-[10px] uppercase` (single letters under 520px).** Fix: 11px.
236. **P3 - CalendarMonth.svelte:109: month cells are `h-14` (56px) with 6px session dots (`w-1.5 h-1.5`) and a "+" for overflow at 9px; the dot colours come from the category colour.** The dots are the only way to see what is planned, there is no count, and the "+" has no label. Fix: show a number badge from 4 sessions, and 8px dots.
237. **P3 - CalendarMonth.svelte:112: the top bar for goals is 4px (`h-1`) across the cell with colour only (competition vs trip) and no icon.** Fix: add an icon, or a text label in wide mode.
238. **P3 - CalendarMonth.svelte:96-104 (mini): mini-month date cells are 9px and `aspect-square` (about 14-22px).** Below touch target size, and the aria-label does not include the year. Fix: label with a full date.
239. **P3 - CalendarMonth.svelte:98, 108: `aria-label="15 October, 2 sessions"` omits the year.** Fix: full date.
240. **P3 - CalendarAgenda.svelte:77-139: the day row has a phase colour bar, a date column, content, and a per-day "+" with `p-1` (about 28px, `.tap` expands).** "Free" (134) is shown in `/60` text. Good scannability, but a week list always shows seven "+" icons. Fix: show "+" only on hover/focus or on empty days.
241. **P3 - CalendarAgenda.svelte:97-100: each session card uses `rounded-2xl` with a category colour fill (cal-fill) and `cal-ink` text colours, `text-body font-semibold`, plus `break-words`.** Corner radii (2xl, xl, md, lg) vary across the calendar views (agenda 2xl/xl, time grid lg/md, month md) and differ from the `--radius-card/control` tokens (app.css:53-54). Fix: use the two radii only.
242. **P3 - CalendarAgenda.svelte:118-120: exercise pills `text-[13px] leading-[26px]`.** A font size outside the type ramp. Fix: `text-label`.
243. **P3 - CalendarAgenda.svelte:129: event times show "09:00 – 10:30" in 24h, all-day events say "all day" (lowercase).** Fix: share the time formatter with the grid.
244. **P3 - CalendarChips.svelte:25: the phone calendar chips are `py-1 text-caption` (about 24px) in a scroll row (`no-scrollbar`) with off-state at `/70` plus a strikethrough (28).** Good state encoding (strikethrough) but small, and the label "Phone calendars" exists only as `aria-label`. Fix: 36px and a visible label or overflow indicator.

#### GoalsCalendar / GoalForm

245. **P3 - GoalsCalendar.svelte:61: title "Goals" with the subtitle showing the next goal headline or "Competitions and outdoor trips to peak for".** Fine, but the card is titled "Goals" while Home's card is "Next Goal" and the form says "New competition / outdoor trip". The kinds are called competition and trip in forms, "Comp" in places. Fine.
246. **P3 - GoalsCalendar.svelte:68, 75-80: add goal is "+" then a two-chip choice (Competition / Outdoor trip), then a form.** Two steps for one action, with the "+" ambiguous. Fix: two labelled buttons ("Add competition", "Add trip") or one sheet.
247. **P3 - GoalsCalendar.svelte:49-52: row actions are note and delete icons (`tap p-1.5`) with aria-labels; delete is immediate with no undo.** See cross-cutting #6.
248. **P3 - GoalsCalendar.svelte:46, GoalForm.svelte:84: competitions use `ic:baseline-flag` here and the trophy (`emoji-events`) in PhaseBand.svelte:69, CalendarTimeGrid.svelte:337, CalendarAgenda.svelte:87.** Fix: one icon.
249. **P3 - GoalForm.svelte:87-98: the form uses `inputClass` fields with placeholder-only labelling for the name field (no visible label), `type="date"` without labels in competition mode (145), and the To date label "To (same day for a day trip)" wraps.** Placeholders disappear on typing, and the unlabeled date input in competition mode has no accessible name. Fix: visible labels (and `aria-label` at minimum).
250. **P3 - GoalForm.svelte:128: the remove-project button is a bare 14px icon (`text-sm`) with no `.tap` or padding.** Tap target about 14px. Fix: `tap p-1.5`.
251. **P3 - GoalForm.svelte:134-136: project name, grade and add button are three inputs in a row (`flex-[2]`, `flex-1`, plus an icon button) on a 360px screen.** Cramped, the grade field placeholder "Grade, e.g. V6" is clipped. Fix: stack on narrow screens.
252. **P3 - GoalForm.svelte:149: Save is disabled until a name and date exist with no hint why.** Fix: inline validation text.
253. **P3 - GoalForm.svelte:96-98 and 93: date inputs for trips take `min={draft.date}`; `setStart` adjusts `endDate`, but invalid combinations are only prevented by the browser UI.** Fine.

#### BlockManager / BlockBrowser

254. **P2 - BlockManager.svelte:130: the sheet's close "x" has no `aria-label`; edit (221) and delete (222) icon buttons have none either (the review button at 219 has one).** Fix: labels "Close", "Edit block", "Delete block {name}".
255. **P2 - BlockManager.svelte:121-122: the sheet has no scrim click-to-close (the scrim div is the sheet's wrapper but there is no click handler) while other sheets close on scrim tap.** Escape handling is also absent (unlike PlanBSheet.svelte:75). Fix: add scrim close, and Escape.
256. **P3 - BlockManager.svelte:126-128: the subtitle toggles between "Current and upcoming" and "Phases as ranges of days" depending on the hidden count, which flips meaning without cause.** Fix: a stable subtitle, and a separate "Showing current and upcoming" note near the list.
257. **P3 - BlockManager.svelte:191: "Priority (higher wins on overlap)" number input is exposed in the main form with no explanation of when overlaps happen.** Fix: put under an "Advanced" fold.
258. **P3 - BlockManager.svelte:147: the phase picker in the focus panel uses `p-3 text-sm` select and a "Start" button; there is no cancel, and the placeholder option "Start a phase on 15 Oct…" is an unusual select-as-command pattern.** Fix: a button list of phases.
259. **P3 - BlockManager.svelte:206-223: the block row is `p-3.5 bg-surface-elevated/50 rounded-control` with a 10px colour dot (`rounded-control` makes it a rounded square).** The dot is the only colour cue, and the name `truncate`s while the metadata line `text-caption` wraps. Fine. Delete sits at 14px size next to edit with no spacing guard (`gap-1`).
260. **P3 - BlockBrowser.svelte:111-115: the current block is `bg-primary/5 border-primary/30`, other blocks `border-transparent`.** The row cards are bordered here and not in BlockManager (206, no border). Two list styles for the same data. Fix: one row component.
261. **P3 - BlockBrowser.svelte:127: "{phase} · 2026-W36 – 2026-W41 · priority 2" shows the raw week ids, then the date range on the next line.** Fix: show dates only; skip the week ids.
262. **P3 - BlockBrowser.svelte:98: "page 2 of 5" with Earlier / Today / Later buttons (`px-3 py-2`, about 36px).** Pagination for a short list of blocks is heavy. Fix: a single scroll list with sticky "current" anchor and month headers.
263. **P3 - BlockBrowser.svelte:93: this full-screen takeover uses `bg-app-bg` while BlockManager (which launches it) is a bottom sheet; the transition from sheet to full screen is abrupt and the back-gesture stack must handle two layers.** Verify `backWhile` ordering. Fix: render browse as an expanded state of the same sheet.

#### PlanBSheet / PlanBStretch

264. **P3 - PlanBSheet.svelte:109, 118: field labels include parenthesised captions: "Outdoor plan (weather hint, evening-before reminder)" and "Counts until you decide (load, week totals, reminders)".** Heavy for a settings sheet; the term "counts" is unclear. Fix: help text under each control, and plain wording ("Used for totals until you choose").
265. **P3 - PlanBSheet.svelte:112, 121: the selected seg item is `bg-primary text-white` (the "settings" style), consistent with the stated rule.** Fine.
266. **P3 - PlanBSheet.svelte:130: the repeat select has 26 options ("this week only", "2 weeks"... "26 weeks").** Fix: preset steps plus "until I stop".
267. **P3 - PlanBSheet.svelte:145: "Delete Plan B" is `chip text-danger` with no confirm.** See cross-cutting #6.
268. **P3 - PlanBStretch.svelte:40-131: the Plan B card is dense: label, repeat info, state text, edit chip, settings icon, A/B segmented control, Decide/Reopen chip, two paragraphs of explanation, weather hints and stale warnings.** The same state is described three times ("undecided, counting Plan A" at 50, the chip, and the paragraph at 111). Fix: show the state once, and put the explanation behind an info button.
269. **P3 - PlanBStretch.svelte:60: "Edit B" is a `chip` with an edit icon next to a settings icon (tune), `tap p-1`; two adjacent controls for "change Plan B".** Fix: merge into one "Edit" menu.
270. **P3 - PlanBStretch.svelte:120: weather hints colour "looks good" green (`status-good`) and others subtle, with icons for sun/water/cloud.** Colour plus icon, fine.

#### AICoachModal and AI sheets

271. **P2 - AICoachModal.svelte:383: `Escape` closes the modal (a `svelte:window` handler) even when the textarea has unsaved text or when the nested AiSendSheet or history sheet is open.** Fix: ignore Escape while a nested sheet is open, and confirm when the pasted reply is non-empty.
272. **P3 - AICoachModal.svelte:421-428: the mode switch (Generate/Analyze/Organise/Context, verify the `MODES` list) is a 4-way `bg-primary text-white` segmented control (settings style) in the header, `py-2 text-label`.** Four labels in a 360px header risk truncation at larger text sizes (no `truncate` on the button text). Fix: scrollable tabs, or a two-line layout.
273. **P3 - AICoachModal.svelte:393-403: the stepper steps are `text-caption truncate` with connecting lines, so labels can truncate to a few letters on a narrow screen (three or four steps).** Fix: show only the current step label.
274. **P3 - AICoachModal.svelte:507-514: the From/To week selects show week labels (verify format) with an arrow icon between; "From has to be before To." is displayed only after the selection is invalid.** Fix: auto-correct the other end.
275. **P3 - AICoachModal.svelte:523-532: the "Uncertain days" buttons show two-letter day names ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su") from `day.slice(0, 2)`.** Fine, but unlike every other day display in the app (one letter or three), and `py-2` is about 36px. Fix: three letters, `min-h-11`.
276. **P3 - AICoachModal.svelte:549-560: the prompt-size line "Prompt size 12.4k tokens" plus a tune icon (aria-labelled "Prompt settings") is jargon for most users ("tokens").** Fix: a size hint in words ("about 9 pages") with the token count in the info.
277. **P3 - AICoachModal.svelte:573: "Last AI change Wed, 14 Oct, 14:32" uses a 3rd date format with `hour: '2-digit'`, then History and Undo links as bare text buttons (574-575).** Undo is a destructive-looking action with a tiny hit area. Fix: 44px buttons, and a confirm that says what will be undone.
278. **P3 - AICoachModal.svelte:620: the paste textarea is `text-xs font-mono` (12px).** Below `text-body`, hard to read at large text sizes. Fine for pasted JSON, but the font size ignores the text scale setting if `text-xs` is a raw Tailwind size (verify). Fix: use a token.
279. **P3 - AICoachModal.svelte:623-644: the error panel lists problems (good) and offers "Copy fix request" as a small caption-sized link.** It is the key recovery action. Fix: make it a primary button inside the error panel.
280. **P3 - AICoachModal.svelte:695-704: the change cards use a checkbox `w-5 h-5` with the whole label tappable; the detail lines are monospace with colour by +/− prefix (green/red).** Colour plus a sign, fine, but the lines are `font-mono text-caption` (hard to scan for non-technical users). Fix: sans-serif with tabular figures.
281. **P3 - AICoachModal.svelte:729-780: the footer's primary action label changes per step (Copy prompt / Review / Apply 3 of 5), which is good, but the step labels use inconsistent wording ("I have a reply" vs "Review" vs "Apply").** Fix: align with the stepper.
282. **P3 - AICoachModal.svelte:406: the modal is `z-[130]`, the same as EventSheet and SessionPreviewSheet, and the Plan history sheet is `z-[150]`, AiSendSheet `z-[170]`.** Stacking works by accident of DOM order for same-level ones. Fix: z-index tokens.
283. **P3 - AiSendSheet.svelte:65: a `ic:baseline-attach-money` icon in `status-caution` signals cost, with a text that says "This can cost money" in `<strong>`.** Good transparency. The "Cancel request" label while sending does not abort a request already received (verify). Fix: only if true.
284. **P3 - AskAboutSheet.svelte:125: the reply box has `max-h-72 overflow-y-auto` with a `whitespace-pre-wrap` raw text answer (no markdown rendering).** Long replies need nested scroll inside a scrolling sheet. Fix: render markdown, and remove the nested scroll.

#### EventSheet / SessionPreviewSheet / PlanHistorySheet

285. **P3 - EventSheet.svelte:20-21 and SessionPreviewSheet.svelte:69-70: a different sheet look (`bg-black/40`, `rounded-t-3xl`, `p-6`, `max-w-md`) from the rest (`bg-app-bg/90 backdrop-blur`, `rounded-t-2xl`, `p-5`, `max-w-lg`).** See cross-cutting #7.
286. **P3 - EventSheet.svelte:24: the calendar colour dot (`w-3.5 h-3.5`) sits between the title and the close button with `aria-hidden`, and carries the calendar identity visually only (the calendar name is further down, line 45).** Fine.
287. **P3 - EventSheet.svelte:38 and SessionPreviewSheet.svelte:96: "Find on map" links are `text-label font-bold` with an open-in-new icon; the link has no padding.** Fix: 44px.
288. **P3 - SessionPreviewSheet.svelte:75: the subtitle mixes "Done · Plan B · 1h 20m" with `mx-1` middots as separate spans.** Fine; `Done` in green bold is colour plus text.
289. **P3 - SessionPreviewSheet.svelte:117-124: two buttons: Start (secondary) and Open (primary, `flex-1`).** The less common action "Open" is the primary, while on Home "Start" is primary. Inconsistent emphasis. Fix: same hierarchy everywhere.
290. **P3 - PlanHistorySheet.svelte:33: the description "The last N AI changes and copied weeks. Going back to one also takes back the ones after it." is clear, but "Go back" has no confirm (`goBack`) and takes back later changes too.** Fix: confirm with the count of changes affected.


### Missing features users would expect (summary)

1. **History:** sort options, export of filtered results, bulk select, jump-to-date, per-session "repeat this session" (verify the session actions sheet), saved filters.
2. **Analytics:** per-chart "view as table", data export per chart, a custom date range, and a targeted comparison (this block vs the previous block). Zoom and pan exist only through paging.
3. **Plan:** undo for destructive actions in general (there is plan-change undo only for AI changes and copy); a drag to reschedule in the week grid exists, but there is no multi-select or bulk move; a "today" quick jump from the block view on wide screens; weekly template editing is only via block manager and phases.
4. **Home:** reorderable and hideable banners (see #4), a "snooze" for alerts, a daily summary or "what next" prompt, and widgets for wide screens.
5. **Accessibility:** keyboard support for every plot (no keyboard route into any chart), chart data tables, `prefers-contrast` handling for chart bands (contrast theme exists, but chart opacities are fixed), and colour-blind-safe category palettes (a pattern/shape option).
6. **Touch tooltips:** `chart-tip` is hover-only in LoadPanel (see #123, #196). Other panels use readout lines, which is the better pattern; converge on it.


## 5. Code audit: settings, onboarding, tour, update, common widgets, navigation chrome

Read from code (nothing run). Contrast ratios are arithmetic from the tokens in `app.css`. "Verify" marks items that could not be confirmed from the files alone. Paths relative to `src/`. Numbering is this part's own: cite as "Part 5 #n".

### Toast (`common/Toast.svelte`, `lib/toast.svelte.ts`)

1. **P2** `Toast.svelte:10`: the message is `truncate` (one line). Long toasts are cut, e.g. the widget fallback at `WidgetSettings.svelte:32` ("This launcher can't add it from here - long-press the home screen → Widgets → Boulder Tracker"), which is the only guidance in that error case. The category-delete message (`AnalyticsCategorySettings.svelte:129`) is cut too. *Fix:* `line-clamp-3` or let it wrap. (Confirmed in source.)
2. **P2** `Toast.svelte:12`: the Undo button is `py-1 -my-1 text-label`, about 28 px tall, no `.tap` expansion, and it is time-critical (6 s). *Fix:* `min-h-11 px-3` plus `.tap`.
3. **P2** `toast.svelte.ts:36-38`: 3 s for plain toasts, 6 s with an action, no pause on touch or hover. A second `show()` (line 24, `clearTimeout`) silently replaces a pending Undo, so the Undo is lost. *Fix:* pause while pressed or focused, 8 s+ for undo, queue toasts or never replace one that carries an action.
4. **P3** `toast.svelte.ts:61-68` (`scopedUndo`): the Undo toast is dismissed when the editor unmounts. Delete a phase or category, back out within 6 s, and the Undo is gone. *Fix:* keep the toast and let the Undo write through the store when the editor is gone.
5. **P3** `Toast.svelte:8-9`: `role="status"` sits inside `{#key toast.current.id}`, so the live region is recreated per toast and many screen readers will not announce it. *Fix:* a persistent live-region container whose text is swapped.
6. **P3** `Toast.svelte:8`: the toast is `z-[150]`, above sheets (z 100-125), at the bottom. For 3-6 s it covers sheet footers with Save and Cancel (`ExerciseTypeEditor.svelte:234`, `NoteSheet.svelte:71`). *Fix:* top-anchor while a sheet is open, or offset by the open sheet.
7. **P2** z-index stacking: `Welcome` z-180, tour and WhatsNew z-170, InfoSheet z-160, toast z-150. `Welcome.svelte:111-113` shows "Link copied" through the toast but Welcome covers it, so Copy link gives no feedback. `finish(true)` (`Welcome.svelte:139-140`) shows the starter-plan Undo and then starts the tour, which covers it. *Fix:* toast above overlays (z-190) or inline confirmation; define z-index tokens.
8. **P4** `Toast.svelte:8`: `inset-x-0` centres on the full window, not the content area beside the 72 px rail. No exit animation, no dismiss button or swipe.

### Sheet chrome in common/ and settings (`InfoSheet`, `WhatsNewSheet`, `NoteSheet`, editors)

9. **P2** Close buttons in the "simple" sheets have no padding (about 20 px): `InfoSheet.svelte:20`, `WhatsNewSheet.svelte:63`, `NoteSheet.svelte:57`, `PDFExportModal.svelte:169`. Editor sheets use `p-2 -mr-2` (about 36 px): `ExerciseTypeEditor.svelte:105`, `BenchmarkTypeSettings.svelte:353`, `ValueDefSettings.svelte:175`. *Fix:* one shared `SheetHeader` with a `w-11 h-11` close button.
10. **P3** Three sheet styles and no shared component: (A) sticky eyebrow + title header (ExerciseTypeEditor, BenchmarkTypeSettings `:347`, ValueDefSettings `:168`), (B) plain `p-5` panel (InfoSheet, NoteSheet, PDF, WhatsNew), (C) full screen (CircuitEditor `:83`, FullLogView `:76`). Scrims differ (`bg-app-bg/85` vs `/90`; drawer `bg-black/55`; tour `bg-black/65`), shadows differ (`shadow-2xl` vs `shadow-card`), max heights are `vh` (85/88/90/92) while the shell uses `h-dvh` (`App.svelte:147`), primary-action placement differs (sticky footer in ExerciseTypeEditor `:234`, inline at the end in BenchmarkTypeSettings `:453` and ValueDefSettings `:227`, fixed footer in CircuitEditor `:151`). *Fix:* one `Sheet` component, `dvh`.
11. **P2** `ExerciseTypeEditor.svelte:98`, `BenchmarkTypeSettings.svelte:327,346`, `ValueDefSettings.svelte:168` have no `role="dialog"`, `aria-modal` or accessible name; only InfoSheet and WhatsNew declare them.
12. **P2** The same three editors close on scrim tap, drag or back with no dirty check, so a half-edited test or exercise is discarded silently. `CircuitEditor.svelte:59-61` already does this properly with a Discard confirm. *Fix:* reuse that pattern.
13. **P3** `InfoSheet.svelte:16`: `onkeydown` Escape sits on a `tabindex="-1"` div that is never focused, so Escape does nothing there (verify whether the global dialog layer covers it).
14. **P3** Only `NoteSheet` and `ExerciseTypeEditor` use `keyboardAware`. The Benchmark editor (`:347`), ValueDef editor (`:169`) and PDF sheet have text inputs; the soft keyboard may cover Save (verify the Capacitor keyboard resize mode).
15. **P3** `WhatsNewSheet.svelte:43-46,56`: any close, including an accidental scrim tap, calls `markNotesSeen()`; the "Needs a look" actions (lines 66-75) are then gone and only reachable via Settings → Tests. *Fix:* only a button press counts as seen.
16. **P3** `WhatsNewSheet.svelte:87,69`: release notes are `text-caption` (11 px); primary reading content should be body size. Line 79 ("keeps a Home row for A, B") is jargon.
17. **P3** `WhatsNewSheet.svelte:61` promises "This stays under About → What's new", but `settings/WhatsNew.svelte:8` renders `CHANGELOG` (built from git commit subjects), not `RELEASE_NOTES` (verify; align the copy or the source).
18. **P4** `NoteSheet.svelte:63-67`: `autofocus` opens the keyboard even when the user only wants to read a note. Focus on tap of "Edit".
19. **P4** `InfoSheet.svelte:24-26`: glossary entries are paragraphs only. Add "Where to change it" links (ACWR → Training model).

### RangeSlider, ListRow, NavRow, InfoButton, banners

20. **P3** `RangeSlider.svelte:100,111,115`: `h-8` (32 px) with a 24 px thumb. The unfilled track is `bg-surface-elevated`, about 1.3:1 against surface in dark mode; in the contrast theme elevated and surface are both `#000`, so the track is invisible. No `aria-valuetext`, so volume reads "75" with no unit. *Fix:* `h-11` hit area, `border-border-strong` track, `aria-valuetext`.
21. **P3** `ListRow.svelte:45`: `text-content-subtle/70` on an 11 px detail line is about 3.4:1 (fails AA). `muted` (line 36, `opacity-70` on the whole row) is similar. *Fix:* drop the opacity, use a token.
22. **P3** `ListRow.svelte:48`: long-press quick actions have no visible affordance and no keyboard path (right-click only). *Fix:* a kebab button or a one-time hint.
23. **P3** `NavRow.svelte:12`: hover-only feedback (Tailwind v4 guards `hover` behind `(hover:hover)`), so touch gets no pressed state; no `type="button"`. *Fix:* `active:bg-surface-elevated/50`.
24. **P3** `InfoButton.svelte:19-22`: 20 px button, 13 px icon, `/70` opacity, `.tap` reaches about 36 px. *Fix:* larger inset or a 28 px button.
25. **P3** `InAppBrowserBanner.svelte:37-38`: buttons `py-1.5` (about 30 px); the banner reappears every visit (line 6); copy-link code duplicates `Welcome.svelte:108-115`. *Fix:* shared helper, taller buttons.
26. **P4** `ExampleDataBanner.svelte:12`: the Exit button is about 30 px and is the only way out of the mode. Make it a real 44 px target.

### Navigation chrome (`nav/*`, bottom bar in `App.svelte`)

27. **P2** `App.svelte:201-211`: the bottom `<nav>` has no `aria-label` (the rail has "Main", `NavRail.svelte:29`) and its tabs have no `aria-current` (rail and drawer do). Active state is colour plus `scale-105` only.
28. **P2** Bar mode has no route to Settings from Plan, History or Analytics. `navItems.ts` puts Settings only in the drawer and rail; in bar mode only the Home gear (`Home.svelte:124`) and ChecklistCard open it. Choosing "Bottom bar" in `GeneralSettings.svelte:44-47` buries Settings with no warning. *Fix:* a gear in every AppBar's actions, or warn on selecting the bar.
29. **P2** Sync errors and a running session surface only as drawer rows (`NavDrawer.svelte:18`, `navItems.ts`). The hamburger (`AppBar.svelte:28-37`) and rail menu (`NavRail.svelte:30-38`) carry no dot badge, and bar mode has no drawer, so there a sync failure has no surface at all. *Fix:* a dot on the menu button when `sync` or `resume` rows exist.
30. **P3** Active colour differs by chrome: bar `text-success` (`App.svelte:208`), rail and drawer `bg-primary/12 text-primary` (`NavRail.svelte:18`, `NavDrawer.svelte:62`). One token.
31. **P3** Labels at `text-[10px]` (`App.svelte:214`, `NavRail.svelte:25`) break the 11 px floor documented in `app.css:188`.
32. **P3** `AppBar.svelte:26`: the bar scrolls away with the page. On long Settings pages (AI sharing, tunables) the only on-screen Back disappears. *Fix:* `sticky top-0` on nested pages.
33. **P3** Landscape and notch: `App.svelte:160` uses `p-4` with no `env(safe-area-inset-left/right)`. Same for the FAB (`Fab.svelte:33`, `right-4`), toast (`px-4`), rail (`NavRail.svelte:29`) and drawer panel (`NavDrawer.svelte:49`). With `viewport-fit=cover` text sits under a cutout.
34. **P3** The drawer has no close button, no `aria-modal` or `role="dialog"` (`NavDrawer.svelte:46`; the comment at line 43 relies on the dialog layer), and "Boulder Tracker" at line 51 is a `<p>`, not a heading.
35. **P3** `NavDrawer.svelte:33-34` starts the tour even while a session is running; `AboutPage.svelte:80` disables it in that case. Apply the same guard.
36. **P4** `Fab.svelte:33` has a hardcoded shadow, `App.svelte:226` a glow (`shadow-[0_0_20px_var(--color-success)]`), `NavDrawer.svelte:49` a hardcoded shadow; the brief says "no glows". Use `shadow-card`.
37. **P4** The rail holds a "Log a workout" item and the floating + does the same thing; both use `data-tour="nav-add"` (`NavRail.svelte:22`, `Fab.svelte:38`), so the tour selector hits whichever is first. History's icon is `content-paste` (a clipboard).
38. **P4** `<nav>`, drawer and sheets all live inside `<main>` (`App.svelte:147`), no skip link, `no-scrollbar` on the main scroller (line 160) leaves desktop users no scroll affordance, no focus reset or route announcement on view change (lines 139-144 only reset scroll state).
39. **P2** `App.svelte:166-193`: the lazy `{#await import(...)}` blocks have no pending or catch branch. A failed chunk load (e.g. offline after a deploy with a stale hash) leaves a blank screen with no retry. *Fix:* `{:catch}` with Retry, a skeleton for pending. (Confirmed in source.)
40. **P3** `App.svelte:161-165`: loading state has no error or timeout path ("Loading Training Data..." with three dots and Title Case, unlike "Saving…"). If storage fails to load there is no recovery UI.
41. **P3** `App.svelte:264-278`: the import overlay is z-200, no cancel, no focus trap; progress is announced via `aria-live="polite"` on every update. *Fix:* `aria-atomic`, announce at coarse steps.

### Tokens and `app.css`

42. **P3** `app.css:123`: light `--theme-border-strong: #a1a1aa` on white is about 2.6:1, below the 3:1 non-text minimum for input outlines. Dark `#3f3f46` on `#121214` is about 1.9:1, and on the `surface-elevated` input background about 1.3:1.
43. **P3** `app.css:147`: light `--theme-status-caution: #d97706` as text on white is about 3.2:1, used for captions at `SyncSettings.svelte:151`, `DeviceCalendarSettings.svelte:45`, `TimerSettings.svelte:103`. Needs a darker text token.
44. **P2** The contrast theme (`app.css:152-185`) sets `surface-elevated` equal to `surface` (`#000`), so the quiet segmented selected state (`seg-on`, `app.css:273-275`), slider track, the custom notification toggle (`NotificationSettings.svelte:48`) and `.card` panels (`app.css:250`) are indistinguishable from their backgrounds. *Fix:* a 1 px `border-border` on those in the contrast theme, or a distinct elevated colour.
45. **P2** No global `:focus-visible` rule. Most inputs use `outline-none focus:border-primary/50` (`NoteSheet.svelte:68`, `PlacesSettings.svelte:90`, `ExerciseTypeEditor.svelte:116` and about 40 more); keyboard focus is a faint 1 px border change.
46. **P3** The type ramp (`app.css:194-197`) says caption is 11 px and the floor, yet inputs and buttons use `text-sm` (14 px) or `text-[10px]`/`text-[11px]` (`ErrorLogCard.svelte:115`, `SyncSettings.svelte:182`, `FullLogView.svelte:111`). Inputs under 16 px zoom on focus in iOS Safari, which the app supports as a PWA (verify the viewport meta).
47. **P3** `app.css:278-280` documents chips as "28px, tall enough to tap reliably"; `seg-item` (`app.css:271`) is also about 28 px. Meets WCAG 2.2 AA (24 px), not 44 px; sort and filter controls in `ExerciseLibrary.svelte:150-166` rely on them.
48. **P3** `app.css:333-336`: `body { width:100vw; height:100vh; position:fixed }` conflicts with the `h-dvh` shell; `100vh` can overshoot under a mobile URL bar and `100vw` includes the scrollbar on desktop.

### Settings hub (`Settings.svelte`, `tree.ts`)

49. **P2** `Settings.svelte:202`: an autosave failure opens a native modal alert ("Settings Error"). A background save should use an inline error plus Retry.
50. **P3** `Settings.svelte:220-224`: the "Saving… / Saved" indicator shows only when `section === 'setup'`, and `saved` never returns to idle. Every other page saves instantly with no feedback.
51. **P2** `Settings.svelte:73-82`: page changes do not reset the scroll container (the app's scroll reset keys on `trainingState.view` only, `App.svelte:139-144`), so entering a sub-page from a scrolled list can land mid-page.
52. **P3** `Settings.svelte:232-238`: the search field is 14 px (iOS focus-zoom), has no clear button, and results land on the page with no scroll to or highlight of the matching setting (`hits` carry only `page`).
53. **P3** `Settings.svelte:246` uses "Section › Page" while `settingsPath` (`tree.ts:164`) and copy use "→".
54. **P3** `Settings.svelte:262-268`: Title Case "How These Fit Together" with em dashes, jargon ("macrocycle", "Analytics Category") and body text in `text-caption`; the only orientation help in this section.
55. **P3** `tree.ts:181`: the search entry "Hide the top bar while scrolling" points to Look & feel, which has no such setting (`AppBar.svelte:6` says the bar scrolls). `tree.ts:197,198,204,203` list session notification, background timer and keep-screen-on entries that are not gated by capability, while `SessionSettings.svelte:69,81` and `TimerSettings.svelte:70,85` hide them, so search leads to a page without the setting. *Fix:* filter `SEARCH_ENTRIES` by `ctx`.
56. **P3** `tree.ts:88-89`: "Model & health" is vague ("Model" = the training model). Weekly targets sit under "Training setup" while the training model is elsewhere.
57. **P2** Defaults and reset exist only for tunables (`TunablesSettings.svelte:51-53`). Look & feel, units, timer, sound, voice, pain, notifications, AI sharing and Home layout have no per-page reset and no "(default)" marker. The only other route is Sync & backup → Settings → "Reset settings…" (`SettingsTransfer.svelte:84-88`).
58. **P3** `Settings.svelte:216`: `pb-24` on top of the shell's own bottom padding leaves excess space (verify).
59. **P4** Heading levels: AppBar renders h1, then cards use `h3` (`GeneralSettings.svelte:11` etc.), skipping h2.

### General, units, charts, display

60. **P2** `GeneralSettings.svelte:32-34,45,52-53,65-66,76-78`, `ChartSettings.svelte:16-27`, `HomeLayoutSettings.svelte:142-153`: segmented controls have no `aria-pressed` (Theme and Units do) and no `role="group"`/label.
61. **P3** `GeneralSettings.svelte:27-79`: five near-identical hand-written button groups with duplicated class strings. `app.css:261-266` says settings use the filled segmented style; violations: `WidgetSettings.svelte:74-77` (quiet `seg-on`), `Welcome.svelte:293-296` (`seg`), `DirectAISettings.svelte:88-91` mixes `seg` with `bg-primary`, `VoiceSettings.svelte:75` is bordered, `BenchmarkTypeSettings.svelte:385` is a bordered group. *Fix:* one `Segmented` component.
62. **P3** One concept, three names: "Auto" (`GeneralSettings.svelte:15`), "Automatic" (`:44`), "System" (`:76`). The theme "Contrast" button hides the "High contrast" copy in a caption at line 12.
63. **P3** `GeneralSettings.svelte:27-35`: Text size has no preview. Add a live sample line.
64. **P3** `GeneralSettings.svelte:41`: the Navigation paragraph is long and jargon-heavy ("rail", "drawer"); "Only on this device" is buried at the end. Show a "This device only" badge. Line 49 starts a second sub-setting with no heading.
65. **P4** `UnitsSettings.svelte:22`: the label is a `<p>` not tied to the control; no sample ("6A+ = V3").
66. **P4** `PlanDisplaySettings.svelte` is unreferenced dead code with a "coming in a future update" placeholder (`:14`). Delete it.

### Tunables (training model, outdoor, layout, nudges)

67. **P2** `TunablesSettings.svelte:82-89`: number inputs ignore `def.min`/`def.max`; clamping happens silently in the store, so an out-of-range value snaps back with no message, and `change` fires only on blur. No `inputmode="decimal"` for 0.05 steps.
68. **P2** No default or "changed" indication per row; hints rarely state the default and `reset()` (line 41) is always enabled.
69. **P2** `TunablesSettings.svelte:51-53`: "Reset to defaults" is `text-caption`, no padding, about 17 px tall, top right. For subset cards (`ids`, line 43) it runs with no undo, and the confirm names the card ("every Views setting").
70. **P2** Jargon with no help: "Count load (ACWR)" (`tunables.ts:50`), group "ACWR zones", "Sweet spot from", "pts" (`tunables.ts:54`), "Fatigue half-life". An `InfoButton`/glossary exists for ACWR (`glossary.ts:36`) but Tunables never renders one. Likewise `Settings.svelte:312` labels "Rolling Load & ACWR", "Monotony & Strain", "Filtered Load" and "RHR" with no explanation.
71. **P3** Dependent settings are not disabled when their parent is off ("Only with the strip on", `tunables.ts:87-88`).
72. **P3** `tunables.ts:64`: "Weekly check-in from" is a number input where `1 = Monday … 7 = Sunday, 0 = never`. Should be a weekday select.
73. **P3** `Settings.svelte:303`: "Flat sections instead of panels" (`ui.flatCards`) is a global look setting sitting in the Plan calendar "Views" card. Move to Look & feel.

### Toggles, sliders, list editors

74. **P3** About 25 toggles are native checkboxes (`w-5 h-5 accent-primary`). `NotificationSettings.svelte:36-51` builds a custom switch with `aria-pressed` (not `role="switch"`) whose off track is invisible in the contrast theme. `DeviceCalendarSettings.svelte:57` and `ExportSettings.svelte:44` use unsized default checkboxes. *Fix:* one `Toggle` component with `role="switch"` and a 44 px row.
75. **P2** `HomeLayoutSettings.svelte:105` and `OrderedListSettings.svelte:54`: the checkbox is not wrapped in a `<label>`, so only the 20 px box is tappable.
76. **P3** `OrderedListSettings.svelte:50`, `HomeLayoutSettings.svelte:89`: the drag handle is about 26 px; no up/down buttons give a non-drag path. `PhaseTemplateEditor.svelte:235` uses `dndzone` on the whole row, which fights touch scrolling.
77. **P4** `HomeLayoutSettings.svelte:114,87-133`: hidden sections' detail toggles are dimmed (`opacity-50`) but still active. Expandable rows show a chevron only on some rows.
78. **P3** `SoundSettings.svelte:71`: volume changes give no audible feedback; play a cue on release. Speed and pitch (`VoiceSettings.svelte:164,171`) get no auto-preview, only "Try it" at line 174 (about 18 px tall).
79. **P4** Copy: "75 %" with a space (`SoundSettings.svelte:69,72`) vs "10%" in Tunables; "untick to hide" vs "toggle to show or hide" (`HomeLayoutSettings.svelte:70`).

### Sessions and timer pages

80. **P2** `Settings.svelte:321-328`: the Timer page stacks five cards (AudioLevel, Timer, Tunables "Single-exercise timer", Sound, Voice) with overlapping controls. The audio-level dial (`AudioLevelSettings.svelte:17-23`) silently rewrites four settings below it. 3-2-1 beeps live in `TimerSettings`, beep style in `SoundSettings`, vibration under "Sound & vibration". *Fix:* split into "Alerts" and "Voice" subpages, or add anchors.
81. **P3** Duplicate and confusing wording: "Keep screen on" (`SessionSettings.svelte:74`) vs "Keep screen on while a timer runs" (`TimerSettings.svelte:74`); "Haptic feedback" (live) vs "Vibrate with the cues" (timer); cards "Sessions" and "While a session runs" on a page called "Live sessions".
82. **P3** `SessionSettings.svelte:47-58`: a radio-style choice built from `aria-pressed` buttons; `Welcome.svelte` uses `role="radio"`. Use `radiogroup` and roving arrows.
83. **P3** `VoiceSettings.svelte:24`: native selects `text-label py-1.5` (about 32 px) and two selects both labelled "Say it"; `:77-81` Auto/Custom has no `aria-pressed`.
84. **P3** `PainCheckInSettings.svelte:48,67,69`: number and time inputs have no `aria-label`; `Number('')` becomes 0 when cleared. "Ask to close after" and "After … days" read as the same setting.
85. **P2** `NotificationSettings.svelte:55-61`: "Fatigue Log Reminders" shows a static green "On" with no control. It looks like a status and a setting but cannot be turned off. (Confirmed in source.)
86. **P3** `NotificationSettings.svelte:33`: copy says "Both reminder types below" but three follow; labels are Title Case (`:57,66,93`); the denied-permission alert (`:21-24`) has no deep link to OS settings.
87. **P3** `RemindersSettings.svelte:25`: the explanatory `<p>` sits inside a `divide-y` list (stray divider), and the "needs the Android app" note is below the content on web, where the Notifications card is hidden (`NotificationSettings.svelte:29`). Put it first.

### Training setup: exercises, circuits, phases

88. **P2** Eight different delete patterns: exercise = inline two-step "Delete for good", no undo (`ExerciseTypeEditor.svelte:221-228`); test = confirm + Undo (`BenchmarkTypeSettings.svelte:213-224`); phase = instant + Undo (`PhaseSettings.svelte:74-83`); category = instant + Undo (`AnalyticsCategorySettings.svelte:97-134`); coach note = instant, no undo (`CoachNotesSettings.svelte:146`); place = confirm, no undo (`PlacesSettings.svelte:39-43`); value type = confirm + toast, no undo (`ValueDefSettings.svelte:97-115`); phase-template session or exercise = instant, no undo or confirm (`PhaseTemplateEditor.svelte:37-39,125-130,164,256`). *Fix:* one rule - everything reversible gets Undo; irreversible data loss gets a confirm.
89. **P2** `PhaseTemplateEditor.svelte:254-256`: per-exercise Duplicate, Edit and Remove are `p-1` with `text-xs` icons (about 20 px), adjacent. Remove has no `title` or `aria-label`; the others only `title`. Reorder arrows (`:155,162`) about 26 px. The app's most destructive tiny cluster.
90. **P2** `PhaseSettings.svelte:101-109`: "Load Starter Set" overwrites templates after a native confirm that does not list what is replaced, and reports success with a modal (`showAlert`) instead of a toast. No undo. `PhaseSettings.svelte:195` ("Reset ALL Phases to App Defaults") calls `resetTemplates` (`Settings.svelte:206-213`), which resets session templates, not phases. *Fix:* rename to "Reset all templates"; toast Undo.
91. **P2** `PhaseSettings.svelte:156-160`: phase templates open as an accordion with nested cards (about four levels). The only affordance is a chevron and the list gets very long. *Fix:* each phase on its own subpage.
92. **P2** `PhaseSettings.svelte:125` and `AnalyticsCategorySettings.svelte:158`: colour swatches are 24 px (`w-6 h-6`) with an 8 px gap and `aria-label="Select color bg-success-hover"` (a class name), no `aria-pressed`, and the selected ring is `ring-white` (invisible on a white light-theme surface). Unselected swatches drop to `opacity-70`. The palette is hardcoded Tailwind colours, duplicated in `PhaseSettings.svelte:19` and `AnalyticsCategorySettings.svelte:16`.
93. **P3** `PhaseSettings.svelte:48,59`, `AnalyticsCategorySettings.svelte:71,81`: validation via a native "Input Error" alert; show inline errors as `ExerciseTypeEditor.svelte:118` does.
94. **P3** `AnalyticsCategorySettings.svelte:154,163` uses `focus:ring-tertiary` and a purple Save button, while `PhaseSettings.svelte:121,130` uses primary. Brand colour per editor is arbitrary.
95. **P2** `AnalyticsCategorySettings.svelte:201`: `bg-warning text-white` is white on `#f97316` (about 2.8:1, fails). `ExerciseTypeEditor.svelte:223` white on `bg-danger #ef4444` is about 3.8:1.
96. **P3** Terminology collisions for one concept: Group (exercise), Analytics category, Analytics Categories tab, Folder (`BenchmarkTypeSettings.svelte:364`), "modality" (`ExerciseSettings.svelte:62`, `AnalyticsCategorySettings.svelte:188`). `ExerciseTypeEditor.svelte:196` says "Only groups load on the Analytics charts" while the control above is "Analytics category". "Tests" (UI) vs "Benchmarks" (page id, `Settings.svelte:312` "Benchmark Progress", "All Benchmarks").
97. **P3** `ExerciseSettings.svelte:43-56`: the Library / Analytics Categories sub-tabs have no `tablist`/`tab`/`aria-selected`. Depth is Settings → Training setup → Exercises → tab → editor sheet.
98. **P3** `ExerciseLibrary.svelte:135-140`: search input has no `aria-label`; clear button about 24 px (`:142`). Group rename (`:204`) applies to all exercises with no confirm or undo (`:103-111`). `groupFilter` makes header taps silently do nothing (`:198`).
99. **P3** `ExerciseTypeEditor.svelte:155-168`: the off → possible → default cycle button states its state only visually; the caption is `opacity-60`; "Default/Possible" are jargon. *Fix:* a "Track it" toggle plus "On by default" toggle with `aria-pressed`.
100. **P3** `ExerciseTypeEditor.svelte:118`: the name error shows only once something is typed; when empty, Save is disabled with no explanation (`:48`).
101. **P3** `ExerciseTypeEditor.svelte:199-206`: "Default planned load 5/10 - Expected stress of a standard session of it" is jargon with no scale anchors.
102. **P3** `CircuitEditor.svelte:167`: "Back to circuit" is `text-label px-1`, about 18 px tall. `:134-136` the Remove X sits about 30 px next to up/down arrows; removal has no undo. Save is disabled (`:155`) with no reason shown.
103. **P3** `ExerciseLibrary.svelte:125`: the "no how-to" nag is repeated on most rows.
104. **P4** Add-button copy varies: "Add Component" (`PhaseTemplateEditor.svelte:273`), "Add Session", "Add Phase", "Add Category", "Add a place", "New exercise", "New test", "New circuit", "New value type", "Add exercise". Case and verb vary, styles alternate between dashed outline, tinted fill and bare text. "Component" is jargon for exercise. Several `{#each}` blocks are unkeyed (`PhaseSettings.svelte:134`, `AnalyticsCategorySettings.svelte:167`, `PhaseTemplateEditor.svelte:134`).
105. **P3** `PhaseTemplateEditor.svelte:138-146`: session name and note are borderless inputs with no visible edit affordance; labels "Start Time", "Planned (min)" are Title Case.

### Tests (BenchmarkTypeSettings) and value types

106. **P3** `BenchmarkTypeSettings.svelte:243-251`: the weigh-in card is a six-sentence run of conditional text at 11 px behind one button that archives, imports and edits the plan together. Summarise the effects as a short list.
107. **P3** `:292`: a bare result count ("12") beside each test is unlabelled. Show "12 results".
108. **P3** `:357-367`: Name and Folder in a 3/5 + 2/5 grid at phone width. `:393-401` "Always…" is unclear (fixed value). `:419,441` ("Epley", "Result vs Set-up") are long 11 px jargon blocks.
109. **P3** `:386-388,404-408`: Result / Set-up and Added / Whole-load toggles are about 30 px high with no `role="group"`.
110. **P3** `ValueDefSettings.svelte:21,128-134`: the card collapses on its own page (`open = true`); `:187` Kind buttons have no `aria-pressed`.
111. **P4** Cross-references are plain, hardcoded text (`ValueDefSettings.svelte:223`, `BenchmarkTypeSettings.svelte:419`, `CoachNotesSettings.svelte:81`); `settingsPath()` exists but is not used, so they can drift. Make them tappable links.

### Places

112. **P2** `LocationEditor.svelte:104-105,43`: latitude and longitude are `type="number"` with no `inputmode`, so some Android keyboards lack a minus sign - a problem for west and south coordinates. Invalid input is silently ignored (no error; "Set Location" just does nothing).
113. **P3** `LocationEditor.svelte:68-70`: "Remove" and "Edit" are about 18 px text links 12 px apart; Remove is immediate. `:98` a failed or offline geocode shows the misleading "No matches". `:91` references a nonexistent `custom-scrollbar` class.
114. **P3** `PlacesSettings.svelte:134,147-151`: nested scroll in a result list (`max-h-40`) inside the page scroll; "Open in Maps" and "Remove coordinates" are 18 px text links; Remove coordinates has no confirm or undo. `:121-125` `role="radio"` buttons have no arrow-key or roving-tabindex support. No empty-state sentence for zero places.

### AI and coach

115. **P2** `DirectAISettings.svelte:115`: "Remove key" is immediate with no confirm or undo, and the key cannot be recovered (excluded from backups, line 119).
116. **P3** `DirectAISettings.svelte:114,130,157,166`: "Save key" and "Clear" are 28 px chips; saving gives no toast; a blank custom model id is committed (`:130`); four reset phrasings ("Use the listed prices", "Back to N", "Reset to defaults", "Phone's colour"); `:116` the external link does not say it opens a new tab.
117. **P3** `AISharingSettings.svelte:24-36`: labels mix Title Case ("Training Blocks", "Coach Notes & About Me") and sentence case. Defaults live in prose ("On by default"), so they cannot be seen at a glance. Group health-data toggles together; show a default badge.
118. **P3** `AISharingSettings.svelte:47-48`: two full prompt builds run as `$derived` on every reactive change (performance). `:80` "Prompt size now: … 12k tokens" uses undefined jargon.
119. **P3** Callouts use three styles: bordered (`AISharingSettings.svelte:85`, `SyncSettings.svelte:68`), borderless (`DirectAISettings.svelte:79`, `BenchmarkTypeSettings.svelte:237`) and `bg-warning` where status tokens are for status (`AnalyticsCategorySettings.svelte:183`).
120. **P3** `CoachNotesSettings.svelte:76` and `TargetsSettings.svelte:125`: explicit Save buttons while the neighbouring pages autosave; navigating away discards drafts silently. Targets has no input `min`/`max`, and `type="text" inputmode="numeric"` accepts a decimal comma only by replace.
121. **P4** `AIPromptTuning.svelte:45-46,65`: the compact/full control is about 28 px and "What takes the space" about 17 px tall. `CoachNotesSettings.svelte:122` notes counter is plain text.

### Data, sync, backup, export

122. **P2** `BackupSettings.svelte:42-51`: the replace-everything confirm comes before the user picks a file, so they confirm without seeing what the file contains. After the restore there is no in-app Undo (the safety copy is in Documents and is not offered back). *Fix:* pick the file first, show a summary ("142 sessions, saved 12 Oct") in the confirm, then offer a "Restore previous" toast.
123. **P3** `BackupSettings.svelte:59-68,112`: Delete all data uses one native confirm with the default OK label (the `Dialog` call at `utils.ts:28-34` supports no destructive label here), then a second only if the backup fails. The button is about 38 px. *Fix:* type-to-confirm or a distinct "Delete" label.
124. **P3** `SyncSettings.svelte:82`: "Replace this device's data" has the same visual weight as "Merge both" and no confirm despite being destructive. `:163` "Clear all" conflicts and `:188` Dismiss are immediate with no undo. `:182` raw JSON in a `pre` is unreadable for users.
125. **P3** `SyncSettings.svelte:87-96`: no connecting or loading state when starting OAuth; `:97,149` errors have no `role="alert"`; `:128` the rename input has no label; buttons at `:106,118,129` are about 30 px.
126. **P3** Action rows ("icon + title + hint + chevron") are hand-built six times with different padding (py-2, py-3, py-3.5): Backup, SettingsTransfer, Sync, Export, HealthConnect, DeviceCalendar. The chevron implies navigation but they perform actions. Extract an `ActionRow`.
127. **P3** `SettingsTransfer.svelte:66`: the card title "Settings" is ambiguous inside Settings. Rename "Settings file". This card is the good model (confirm + Undo), though `:48` an import error is a native alert.
128. **P3** `ExportSettings.svelte:27,43-46`: the "Include past sessions" checkbox sits below the button it modifies, is unsized and Title Case ("Calendar Integration" vs tree label "Calendar & PDF"). No feedback or empty state after the ICS export.
129. **P3** `PDFExportModal.svelte:38`: 49 week options labelled "Week 42 (2026)" with no dates; `:206-216` generation has no cancel and no progress detail.
130. **P3** `HealthConnectSettings.svelte:74-78`: three buttons at `py-2` (about 34 px); "Stop importing" in danger styling with no confirm; no loading state while `refreshStatus` runs.
131. **P3** `DeviceCalendarSettings.svelte:57,70`: a 16 px checkbox; swatch labels are "Use #hex" rather than colour names; `:88` "Hide calendar events" is a danger button with no confirm.
132. **P3** `WidgetSettings.svelte:53`: "Add" is ambiguous (add to home screen); sizes "4×2" unexplained.

### About, feedback, update, error log

133. **P3** `ErrorLogCard.svelte:105,107`: the expanded row is tracked by index and the key is `e.at + i`, so a new log entry shifts which row is expanded. `:130` Clear is immediate (destroys evidence for a bug report). `:90` "Full log — every console line" and `SOURCE` labels are developer jargon. Only here does a control use `min-h-11` (`:83`); apply it everywhere.
134. **P2** `FullLogView.svelte:87-92`: Copy and Clear (delete) are adjacent `p-2` icon buttons with no confirm for Clear. `:97` the search input has no label. `:111` 11 px mono text.
135. **P3** `FeedbackCard.svelte:37`: the mailto button does nothing without a mail client (common on web). Offer "Copy details".
136. **P3** `UpdateCard.svelte:27,38`: SHA-256 and commit are shown to ordinary users on Home (`compact`), and the changes list is `truncate` per line so commit subjects are cut mid-sentence. Hide the hash behind "Details". `:44` the progress bar has no `aria-label`; `:51` errors have no `role="alert"`.
137. **P3** `AppUpdateSettings.svelte:34`: "as soon as it's pushed" is dev jargon. Switching Stable ↔ Testing has no warning (Android cannot downgrade, per `:37`).
138. **P4** `AboutPage.svelte:37-43`: external hints use `truncate` and may be cut. About is the only place to take the tour in bar mode (three levels deep).

### Tour and onboarding

139. **P2** `TourOverlay.svelte:124-129` plus buttons at `:159-168`: a global `Enter`/`ArrowRight` handler runs `tour.next()` while a focused button also handles Enter. Pressing Enter on "Skip tour" advances and then ends it. `:135` focus is not moved into the dialog.
140. **P3** `TourOverlay.svelte:159,164,166`: buttons about 34-36 px tall. The card (`:147`) is clamped to `MARGIN = 16` with no `env(safe-area-inset-*)`, so the card or Next can sit under the status bar or gesture bar. A missing target falls back to a centred card (`:98-102`) while the body text still refers to it.
141. **P2** Onboarding length: up to seven steps (intro, platforms (web), focus, level, plan, units, location, done; `Welcome.svelte:42-46`). Focus, level and plan are three overlapping questions; only focus and location can be skipped; units could be inferred from `navigator.language`; the web-only "What works where" table (`:186-192`) comes before any value is shown. *Fix:* merge focus and level, preselect units from locale, move the platform table to Help.
142. **P3** `Welcome.svelte:199-205,210-217,226-237,245-271,278-289`: choice cards use `role="radio"` with no roving tabindex or arrow keys; clicking the selected option clears it (`:201,212`), which violates radio semantics; selected state is border and tint only.
143. **P2** `Welcome.svelte:172-176`: the restore card is a `<label>` around a `display:none` file input, so it cannot be reached by keyboard (no `tabindex`/role). `:177-182` the Drive connect button shows no loading state.
144. **P3** `PlatformTable.svelte:24`: a 4-column table at 11 px inside `overflow-x-auto`; at 360 px the Browser column is off-screen with no scroll hint; the first header cell is empty (`:27`).
145. **P3** `Welcome.svelte:147-153`: progress is an `aria-hidden` bar with no "Step n of m" text. `:197` "mostly for the AI coach" is confusing on a bouldering-only app. `:255-259` plan previews are long 11 px lists inside radio cards.
146. **P2** `IntroSlides.svelte:46`: the pager dots are 6 px with no tap padding and are the only non-swipe way to move. `:26` hard-codes `behavior: 'smooth'` instead of the app's `scrollBehavior()` helper (used in `TourOverlay.svelte:81`), contradicting the reduced-motion comment at `:5`. `:35` images have no width or height (layout shift) and alt is just "Home screen".
147. **P3** `Welcome.svelte:323-337`: on the iOS or in-app gate, the "Use it in the browser" escape sits below the install steps and may be below the fold.
