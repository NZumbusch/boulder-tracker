# Package C - Plan (branch ui2-c-plan)

Looked at on screen (headless, phone portrait, light, demo data): Plan weeks view with the Plan B card, week grid, Training Blocks sheet, calendar Month and Year views, goals card. Not looked at: landscape, dark, laptop, the AI coach modal, Event/Session preview sheets, GoalForm, History sheet (checked by `npm run check` and reading only). Nothing tried on a phone.

Note: many findings of the log were already fixed in round 1 or by the calendar rework (week label W42, 11px text in the time grid, reset zoom, trip/competition colours, per-day + only on empty days, time grid "+N" sizes, deletes of blocks/goals/Plan B/tests/clear week already confirm or undo in `state.svelte.ts`).

| finding id | state | what changed or why not |
| --- | --- | --- |
| V-25 / #197 / #198 | fixed | Weeks / Calendar is a labelled segmented control under the title; the AppBar icon is labelled "Phases and training blocks" (icon unchanged). |
| V-26 / #202 legend | skipped: needs decision | Legend as filter vs collapsed. |
| V-27 / #203 / #205 | partly | Week number printed in every cell (11px), year at 11px, group label "Weeks, 2026 to 2027". No pattern / letter code for colour-blind users (needs a decision). |
| #204 overlap dot | fixed | Themed dot, explained by a caption under the grid when any week shows it. |
| V-28 / #268 / #269 / 1.1 item 6 | fixed | One state line ("Undecided, counting Plan A"), one A/B control with Decide/Reopen, the explanation behind one help button, one "Edit" button (opens the Plan B sheet, which now has "Change Plan B's sessions"). Every capability kept. |
| #264 / #266 / #267 Plan B sheet | fixed | Shared Sheet, plain labels with help text, repeat steps 1-4, 6, 8, 12, 16, 26 weeks (a stored value stays selectable), delete already confirms in the store. |
| V-29 / #199 / #208 / #209 | fixed | Header keeps note + "Week actions"; reset and clear are in the panel with labels; Repeat button says "Replace N weeks". Clear asks first (store). |
| V-30 / #200 / #201 | fixed | Pencil next to the phase name; "No phase - tap to add" muted. |
| V-31, V-32 / #212 | partly | Badges 11px; A/B emphasis unchanged (needs decision). |
| V-33, V-34, V-35, V-36, V-38 | not an issue / earlier | Already handled by round 1 / calendar rework, not re-checked. |
| V-37 / #217 Goals card | skipped: needs decision | Hide in calendar view or keep. |
| V-39 / #225 year view | fixed | Two columns on phones under 460px (cells about 25px), 11px numbers. |
| V-40 / #206 / #218 Today | fixed | Hidden when already on today (blocks and calendar). |
| V-41 sublabel | partly | Uses formatWeek and year; the sublabel still switches between week and totals (a design choice). |
| #207 week strip dots | fixed | 8px dots. |
| #210 planned load jargon | skipped: needs decision | "planned load" vs "planned effort" wording; the info button exists. |
| #211 Arrange label | fixed | "Finish arranging". |
| #213 Start button | fixed | 40px minimum. |
| #214 Drop here | not an issue | Only rendered while arranging. |
| #215 / #216 Tests + | fixed | Labelled "Add test"; delete has Undo in the store. |
| 1.1 item 7 / cross-cutting 13 / #221 #246 #240 | fixed | Every + in Plan is a text button: "Add session" (week card, calendar header), "Add test", "Add competition" / "Add outdoor trip" (one step), per-day + in the list keeps its label "Add a session on <day>". |
| #219 mode control size | fixed | Taller buttons. |
| #220 week layout toggle | skipped: needs decision | Move into Settings / overflow menu. |
| #222 sublabel height | fixed | min-h instead of fixed. |
| #223 / #224 | fixed | "Set one in the Weeks view" is a button that switches view; empty week shows an "Add a session" button. |
| #226 hour gutter 24h | skipped: needs decision | The whole app is 24h; a 12h option would be a setting. |
| #227-#234 time grid | not an issue | Already fixed by the rework (W42, 2-3 letters, 11px, reset zoom, shared goal style). |
| #235-#239 month | fixed | 11px weekday headers and mini numbers, 8px dots, "+N" count, full dates (with year) in aria-labels. #237 goal bar icon: skipped (colour only, needs decision). |
| #241 radii, #242 13px pills | not an issue | Not found in the current code. |
| #243 event time format | skipped: needs decision | Same 24h question as #226. |
| #244 chips | fixed | 36px, visible "Phone calendars" label, no opacity on text. |
| #245 goal naming | not an issue | |
| #248 one competition icon | fixed | GOAL_STYLE icon used in goals list and form. |
| #249-#252 GoalForm | fixed | Visible labels, 44px remove button, stacked project fields on narrow screens, reason shown while Save is disabled. |
| #254 #255 BlockManager | fixed | Shared Sheet (scrim, Escape, drag, Back, labels); delete/edit/review buttons labelled with the block name, 44px. |
| #256 #257 | fixed | Stable subtitle; "Showing the current block and what comes next" note; priority under "Advanced". |
| #258 phase picker | skipped: needs decision | Select vs button list. |
| #259-#262 | fixed | One row style (no border) in both lists, week ids gone, dates only, pager hidden for one page, 44px buttons. |
| #263 browse as same sheet | skipped: needs decision | Still a full-screen takeover; Back order checked by reading. |
| #271 Escape | fixed | Ignored while a nested sheet is open; asks before closing with a pasted reply. |
| #272 #273 | fixed | Mode tabs truncate safely; only the current step label under 420px. |
| #274 | fixed | From/To drag each other so the range is never invalid; labels "W42 · Oct 12". |
| #275 / V-63 uncertain days | fixed | "Days I am unsure about", three letters, 44px. |
| #276 prompt size | fixed | "about N pages of text (13k tokens)". |
| #277 | fixed | formatDay date, 44px History and "Undo last change" (the store confirms when edits were made since). |
| #278 #280 | partly | Paste box 14px; change details use sans with tabular figures. |
| #279 | fixed | "Copy fix request" is a secondary button in the error panel. |
| #281 | fixed | "I have the reply"; one line explaining that the AI runs in your own chat app. |
| #282 z-index | fixed | Nested sheets use the Sheet levels. The AI coach modal itself stays z-130 (full-screen page, not a sheet). |
| #283 | not an issue | Cancel while sending aborts the request. |
| #284 AskAbout | fixed | Shared Sheet, nested scroll box removed. Markdown rendering skipped (needs a library). |
| #285 #286 #287 #288 | fixed | EventSheet and SessionPreviewSheet use the shared Sheet; Find on map 44px. |
| #289 | fixed | Start is primary when a session can be started, Open otherwise. |
| #290 Go back | not an issue | `undoPlanTo` already confirms with the number of later changes. |
| Cross-cutting 1, 9 | fixed in my files | formatWeek / formatDay everywhere in Plan; no raw week ids. |
| Cross-cutting 3 | fixed in my files | CalendarMonth, WeekCalendar, TrainingPlan off the 9-10px list (PhaseStrip and the share image remain). |
| Cross-cutting 5 | partly | Week cells have aria-labels; tooltip still hover only. |
| Cross-cutting 6 | not an issue | All Plan deletes confirm or undo via the store. |
| Cross-cutting 7 | fixed | Sheets in plan now share Sheet. |
| Cross-cutting 8 | not an issue | Goal colours come from GOAL_STYLE. |
| Cross-cutting 12 | not done | AICoachModal change cards still bordered (taste). |
| Missing feature "undo for destructive actions" (Plan) | not an issue | See cross-cutting 6. |

## Needs a decision

- Legend as filter or collapsed (V-26); colour-blind pattern or letter on week cells (V-27).
- 12-hour clock option for the calendar (#226, #243).
- Hide the Goals card in calendar view (#217).
- Move the week layout toggle to Settings (#220); phase picker as a button list (#258); browse timeline inside the same sheet (#263).
- "planned load" wording (#210); A/B badge colours (V-32).

## Handoff

- `src/lib/ui/typeFloor.test.ts`: I removed CalendarMonth, TrainingPlan and WeekCalendar from the allowlist (they no longer use 9-10px text). If the merge conflicts, keep that removal.
- `src/lib/icons/offline-icons.json`: removed the unused `ic:baseline-grid-view`; no new icons added.
- `src/lib/state.svelte.ts` `clearWeek`: the confirm text prints the raw week id ("2026-W42"); use `formatWeek(weekId)` (package owning state).
- Glossary: a "Plan B" term would let the Plan B help button open the shared info sheet (owner of `lib/help/glossary.ts`).
