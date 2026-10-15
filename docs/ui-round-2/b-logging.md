# Package B: logging flows, sends, health

Pattern chosen for deletes: **delete at once, with an Undo toast** (8 s, 44 px Undo). The store methods already do this (`deleteWorkout`, `deleteOutdoorAscent`, `deleteDailyMetric`, `deletePainLog`, `deletePainIssue`); the fault log (written against an older branch) was stale on that. The UI now only makes the delete controls reachable (44 px, labelled, red).

Looked at on screen (headless, phone portrait light; dark for the pain edit sheet and send form): Log screen, session viewer, session editor, exercise picker, Sends tab (empty and with data), send form, Quick log, bodyweight, pain list, pain issue, pain edit. Not looked at: landscape, laptop, ExerciseLogSheet, TestSheet, SessionActionsSheet, SessionAIModal, SendImport, ExerciseForm (checked by `npm run check` and reading only).

## Findings

| finding id | state | what changed or why not |
| --- | --- | --- |
| V-42 | fixed | StartScreen: sentence case, no em dashes |
| V-43 backfill a past session | skipped: needs decision | needs a date picker and a completed-session editor flow |
| V-44 | partly | planned rows now tonal like the tiles; Plan B not listed: skipped, the list comes from `App.svelte` (package G) |
| V-45 | skipped: outside my files | empty live session is `ActiveSessionModal` (package A) |
| V-46 | skipped: outside my files | `ActiveSessionModal` (package A) |
| V-47 | fixed | Quick log tiles start-aligned, flat, one height |
| V-50 | fixed | stat tiles flat, 2x2 on phones; Add send is a 44 px primary, import a ghost button |
| V-51 | partly | bars at least 28 px and the chart scrolls; counts and hint kept; few-sends case unchanged |
| Cross: sheet chrome | fixed | PainReport, PainIssue, QuickLog, SessionActions, TestSheet, ExerciseLogSheet and the two circuit sheets in the editor use `Sheet` (role, drag, Back, Escape, safe area, 44 px close) |
| Cross: button sizes | fixed | `btn` utilities in all my files |
| Cross: cancel style | fixed | Cancel is ghost and after the primary |
| Cross: separators | fixed | em dashes and " - " removed from my copy |
| Cross: casing | fixed | sentence case across ExerciseForm, StartScreen, SendImport, editor |
| Cross: inputmode | fixed | numeric/decimal on ExerciseForm, bodyweight; weight left without so a minus can be typed (assisted) |
| Cross: focus states | fixed | `field` class and the global focus ring |
| Cross: hardcoded colours | fixed | `text-on-primary` instead of `text-white`, no `bg-black`, selected chips `bg-primary` |
| Cross: destructive | not an issue | already Undo toasts in the store; see top |
| 1.1 item 8, 12 | fixed in my files | reasons shown under disabled Save buttons (send, pain, test, exercise, import, bodyweight); inline errors |
| StartScreen (all bullets) | fixed | Title Case, two-line subtitles, blocked reason shown, empty "Nothing planned" with Open Plan, form scrolls into view, no glow, "Planned" day badge text `primary` |
| WorkoutEditor | fixed / partly | aria-labels, 44 px chips and clear buttons, trash icon, save error toast (`catch`), "Saving…", sticky back bar, shared sheets; empty-session warning and autosave skipped: needs decision |
| WorkoutView | fixed / partly | delete has Undo (store); 44 px chevrons and menu; menu closes on outside tap (the blurred header broke the fixed scrim); hint shown 3 times; inline reasons for Start and Log as planned; rating "—" now an en dash with aria-label, scale not explained: needs decision |
| ExerciseLogSheet | fixed / partly | shared sheet, 44 px steppers, 16 px fields, discard guard, double-save guard; thumb muted until touched and min/max messages skipped |
| ExerciseForm | fixed / partly | fields 16 px, sticky footer with reason, aria-pressed chips, checkbox roles, sentence case; per-field messages beyond the existing three skipped (rules unchanged); min above max grade not checked |
| ExercisePicker | fixed / partly | dvh, keyboardAware, 44 px close and clear, native clear hidden, search label, empty-library state; "Create" on typos kept |
| SessionActionsSheet | fixed | shared sheet, 44 px day buttons (three letters, aria-pressed), delete with Undo |
| SessionNotesSheet | not an issue | already on the shared sheet with 44 px controls |
| TestSheet | fixed | shared sheet, `field`, expanded state, role alert, faint text token, dirty guard; no link to Settings for "no tests": skipped, needs a navigation target |
| ExerciseCard/Details/TargetHint/ReviewCard/GroupCard | fixed / partly | TargetHint 12 px, no mono, icon title; notes and how-to at label size with `aria-expanded`; above/below colour not added: needs decision |
| SessionAIModal | fixed / partly | close asks when a reply is pasted, aria-pressed, clipboard failure message, 44 px buttons; step circles left |
| QuickLogSheet | fixed | shared sheet; save toasts from the forms |
| SendForm | fixed / partly | labels, grade hint (not blocking), style chips, recent-crag chips, Save and add another, toast, delete button separate; grade picker chips skipped |
| SendsLog | fixed | see V-50; empty state with button; star labelled |
| SendImport | fixed / partly | try/catch with message, file name, select all/none, row is a label (checkbox 20 px, 44 px row), toast, "skipped as already logged"; nested scroll kept so Import stays reachable |
| GradeChart | fixed | 11 px text, 28 px bars with scroll, new empty text, shared segmented control |
| BodyweightLog | fixed | labels, `inputmode`, max date, tap-to-read bars with min/max, 44 px delete, decorative tile removed |
| PainReportSheet | fixed | `aria-pressed`, shared sheet with discard guard, reason under Log it, scale anchors, "Name" |
| PainIssueSheet | fixed / partly | 44 px controls, visible red delete (Undo), "Add a number or note"; a check-in tap has no undo (only "gone" does): handoff |
| PainIssues / PainHeadsUp / CheckInButtons | fixed / partly | "days" spelled out, 12 px chip with solid text, group label, `aria-expanded`; chip not tappable (it sits inside rows); `split(' - ')` kept |
| Missing features | partly | save toasts, Save and add another, reasons and discard guards done; swipe hint is package A's file |

## Needs a decision

- Backfill a past session (V-43): one entry on the Log screen that opens the editor on a completed session with a date picker, or reuse Plan then mark done.
- Show Plan B sessions in "Planned for this week" (V-44): needs a list from `App.svelte`.
- Warn before saving an empty session; autosave a half-built session.
- Above and below target in `TargetHint`: colour both (amber/neutral) or keep the arrow only.

## Handoff

- `src/lib/state.svelte.ts` (`checkInPain`): show an Undo toast for every check-in, not only "gone".
- `src/lib/ui/typeFloor.test.ts`: I removed the three files I cleaned from `ALLOWED` (PainHeadsUp, GradeChart, TargetHint).
- No icons added or removed.
