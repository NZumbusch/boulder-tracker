# Package F: Settings

Branch `ui2-f-settings`. Every settings id, tunable id, `settingsPath` target and tour target is unchanged; no default, preference key, storage format or migration was touched.

Looked at on screen (headless Chrome, example data): phone portrait light for Look & feel, Units, Training model, Home, Phases and templates (expanded), Sync & backup; landscape 850x390 dark for every page (smoke run, no console errors) with Tests read closely. Not looked at on screen: the editors opened as sheets (exercise, value type, test), Places, Direct AI, Health Connect, phone calendar and widgets (Android-only pages are hidden in the browser), light contrast theme.

## Shared pieces added (all in `src/components/settings/`)

`ActionRow.svelte` (icon, title, hint, busy state, no chevron), `ColorPicker.svelte` + `colorChoices.ts` (one named palette for phases and categories), `rovingRadios.ts` (arrow keys for radio groups built from buttons).

## Findings (Part 5 sections)

| finding id | state | what changed or why not |
| --- | --- | --- |
| 49 autosave error alert | fixed | inline message with "Try again", no native alert |
| 50 saving indicator | partly | "Saved" returns to idle after 2.5 s; still only the Training setup section shows it (the other pages save instantly) |
| 51 scroll reset | fixed | each page opens at its top |
| 52 search field | partly | 16 px field, clear button; no scroll-to or highlight of the matching setting (needs per-setting anchors): skipped: needs decision |
| 53 "›" vs "→" | fixed | search hits use "→" |
| 54 "How These Fit Together" | fixed | sentence case, no em dashes, plain words, body size |
| 55 search entries | fixed | removed the nonexistent top-bar entry; capability-gated entries are filtered (`needs`, `wakeLock` in the context) |
| 56 "Model & health" name | skipped: needs decision | rename the section (for example "Readiness & health") and/or move Weekly targets next to the model |
| 57 per-page reset and default marker | partly | Tunables got default markers and per-row and per-card reset with Undo; other pages: skipped: needs decision (a new reset per page) |
| 58 `pb-24` | not an issue | looked at on screen, the bottom spacing clears the bar and is not excessive |
| 59 heading levels | fixed | card titles are h2 (37 headings) |
| 60 aria-pressed on segments | fixed | shared `Segmented` (group, label, aria-pressed) everywhere |
| 61 hand-written segment groups | fixed | Look & feel, units, charts, Home, widgets, AI, voice, audio level, places, tests, value types, error log all use `Segmented`; Welcome belongs to G |
| 62 Auto/Automatic/System | fixed | "Automatic" everywhere; the contrast theme is "High contrast" |
| 63 text size preview | fixed | live sample line |
| 64 navigation paragraph | fixed | shorter, "This device only" shown beside the title, "Names under the icons" has its own heading |
| 65 units label and sample | partly | label is bold and the V-scale hint gives the example; no live sample |
| 66 PlanDisplaySettings | fixed | deleted |
| 67 number input range | fixed | min and max, decimal keyboard, message when a value was clamped, Enter commits |
| 68 default and changed indication | fixed | "Default: x" with Reset on changed rows; card reset disabled at defaults |
| 69 reset button | fixed | 44 px, Undo toast instead of a confirm |
| 70 jargon in Tunables | partly | info buttons for ACWR zones, "Count load (ACWR)" and fatigue half-life; "pts" shown as "points"; the Analytics card names are plain (Rolling load and ACWR, Filtered load); no glossary for monotony or RHR in the card names |
| 71 dependent settings | fixed | disabled and dimmed while their parent is off |
| 72 weekday number | fixed | weekday select (value still 0 to 7) |
| 73 flat sections location | fixed | moved to Look & feel; qa-checklist 18.2 still names the old page (handoff) |
| 74 native checkboxes | fixed | every on/off row uses the shared `Toggle` (role switch, 44 px row) |
| 75 unwrapped checkboxes | fixed | whole row is the target |
| 76 drag handle size, no buttons | partly | handles are 44 px and keyboard-draggable (svelte-dnd-action); phase-template exercises use a handle instead of whole-row drag; up and down buttons on Home and list rows: skipped: needs decision |
| 77 hidden section details | fixed | detail switches disabled with a note while the section is hidden; chevron rows unchanged |
| 78 volume feedback | fixed | the beep plays when the slider is released; speed and pitch speak a sample on release; "Try it" is 44 px |
| 79 copy "75 %", "untick" | fixed | "75%", "use the switch" |
| 80 Timer page stack | partly | the dial now says it sets the switches below, cards renamed; splitting into Alerts and Voice pages: skipped: needs decision (new page ids, search entries) |
| 81 duplicate wording | fixed | "Keep the screen on during a session" vs "...while a timer runs", "Vibrate with the timer cues", cards renamed |
| 82 radio built from buttons | fixed | radiogroup with arrow keys (sessions, beep style) |
| 83 voice selects | fixed | 44 px fields, the two "Say it" labels renamed, Automatic/Custom is a `Segmented` |
| 84 pain inputs | fixed | labelled, empty box ignored, "Ask whether it is over after" |
| 85 Fatigue Log Reminders "On" | fixed | no longer styled as a status; says there is no switch (making it switchable needs a preference: skipped: needs decision) |
| 86 notification copy | partly | "All three reminders", sentence case; no deep link to Android settings (outside my files: needs a native call) |
| 87 reminders note | fixed | on the web the note is first, outside the divided list |
| 88 eight delete patterns | fixed | one rule: reversible removals get an Undo toast (phase template session and exercise, circuit exercise, place, coordinates, location, exercise library delete, group rename, template reset, starter set, tunable reset), irreversible ones a named-button confirm (coach note, AI key, exercise "delete for good", value type, full log) |
| 89 template exercise buttons | fixed | 44 px, labelled with the exercise name, handle for drag |
| 90 starter set and reset | fixed | confirm lists the phases replaced, toast with Undo, button renamed "Reset all session templates" |
| 91 phase accordion | skipped: needs decision | a subpage per phase: new navigation level |
| 92 colour swatches | fixed | named, 40 px, ring in the text colour, one shared palette |
| 93 validation alerts | fixed | inline errors |
| 94 purple Save | fixed | primary |
| 95 contrast of white on warning and danger | fixed | the callout is neutral, buttons use `btn-danger` |
| 96 terminology | partly | "modality" removed from visible text, test wording unified in Settings; Group vs Analytics category kept (explained in the editor) |
| 97 sub-tabs | fixed | `Segmented` with labelled group |
| 98 library search, rename | fixed | labelled, 44 px clear, rename has Undo, filtered group headers are no longer dead buttons |
| 99 off, possible, default cycle | fixed | "Track" switch plus "Filled in from the start" switch |
| 100 name error | fixed | shown on Save when empty; Save is no longer silently disabled |
| 101 planned load scale | fixed | anchors "1 easy ... 10 as hard as a session gets" |
| 102 circuit editor | fixed | 44 px buttons, Undo on removal, reason beside a disabled Save |
| 103 "no how-to" nag | fixed | removed from rows |
| 104 add-button copy, keys | partly | sentence case "Add exercise/session/phase/category", keyed lists; verbs and button styles still vary |
| 105 template session fields | fixed | visible underline, sentence case, `field` inputs |
| 106 weigh-in card | fixed | short list of effects |
| 107 result count | fixed | "12 results" |
| 108 name/folder grid, jargon | partly | stacked, "Fixed value"; Epley wording shortened but still in the hint |
| 109 role toggles | fixed | `Segmented` |
| 110 value type card collapse, Kind | fixed | not collapsible, `Segmented` kind |
| 111 cross-references as links | skipped: needs decision | tappable links; text now built from `settingsPath` where touched |
| 112 coordinates keyboard | fixed | text field, minus sign and decimal comma accepted, inline range errors |
| 113 location links | fixed | 44 px, Remove has Undo, honest empty message ("nothing found, or no connection"); the missing class was removed |
| 114 places | fixed | no nested scroll, 44 px links, Undo on remove and remove coordinates, empty state; kind group now arrow-key friendly via `Segmented` |
| 115 remove key | fixed | confirm that says it cannot be recovered |
| 116 direct AI details | fixed | toast on save, blank model id ignored, one "Reset to ..." phrasing, link says new tab |
| 117 AI sharing labels | partly | sentence case; default badges and a health-data group: skipped: needs decision (the descriptions and the stored defaults disagree for two items) |
| 118 prompt builds, tokens | partly | info button for tokens; the two prompt builds are unchanged (performance) |
| 119 callout styles | fixed | one neutral surface, status colour only on icons |
| 120 explicit Save buttons | partly | "Unsaved changes" notice, Targets reason; autosave: skipped: needs decision |
| 121 prompt tuning sizes | fixed | `Segmented`, 44 px breakdown button |
| 122 restore confirm | partly | file is picked first, the confirm names the file's sessions and date and this device's; no in-app "Restore previous" (needs `state.svelte.ts`: handoff) |
| 123 delete all data | partly | named buttons ("Delete everything"); type-to-confirm: skipped: needs decision |
| 124 sync | fixed | Replace is a confirm and danger styled, Clear all confirms, raw JSON behind details, errors announced |
| 125 sync states | fixed | connecting state, alerts, labelled rename, 44 px buttons |
| 126 action rows | fixed | `ActionRow` in Backup, Settings file, Sync, Export, Health Connect, phone calendar |
| 127 "Settings" card title | fixed | "Settings file"; import errors are toasts |
| 128 export page | fixed | switch above the button, sentence case, empty message |
| 129 PDF modal | partly | shared Sheet, weeks show dates; no cancel or progress while generating |
| 130 Health Connect | fixed | 44 px, Stop importing confirms, connecting state |
| 131 phone calendar | fixed | 44 px switch rows, numbered colour names, calm "Stop showing" button |
| 132 widgets | fixed | "Add to home screen", sizes explained |
| 133 error log card | partly | stable open row, Clear confirms, plain "Full log" title; the 10 px stack text remains (the allowlist in `typeFloor.test.ts` belongs to G: handoff) |
| 134 full log | fixed | 44 px buttons, Clear confirms, labelled search; 11 px mono lines kept on purpose |
| 135 feedback | fixed | "Copy details" |
| 136 update card | not an issue | done by G (not in my files) |
| 137 app update settings | not an issue | done by G |
| 138 About | fixed | heading level; the tour row stays |

## Part 1.1 and 1.2 items for Settings

| item | state | what changed or why not |
| --- | --- | --- |
| 1.1 #1 deletes | fixed | see 88 |
| 1.1 #8 accessibility | fixed | switches, segmented groups, 44 px targets, labelled inputs, radio groups in Settings |
| 1.1 #11 jargon | partly | see 70, 118 |
| 1.1 #12 silent disabled buttons | fixed | exercise, circuit, reset, targets, test and value editors say why |
| 1.2 shared Sheet, Toggle, Segmented | fixed | exercise, value type, test, PDF editors are `Sheet`s with `dirty`; settings editors that are inline forms stay inline |
| 1.2 opacity on text tokens | partly | removed in the files touched |
| "Settings only reachable from Home in bar mode" | skipped: outside my files | navigation chrome, package G (done there) |

## Needs a decision

- Phases as one subpage each (91); per-page reset and defaults (57); split Timer into Alerts and Voice (80); up and down buttons next to drag handles (76).
- Search: scroll to and highlight the matching setting (52).
- "Model & health" section name (56).
- A switch for the fatigue log reminder (85, needs a preference); AI sharing default badges (117, descriptions and defaults disagree for "Readiness" and "Pain issues").
- Autosave for Coach notes and Targets (120); type-to-confirm for Delete all data (123).
- `navLabels` default true (package G asked): not changed, it is a default.

## Handoff

- `docs/qa-checklist.md` 18.2: the flat-sections switch is now under Settings, App & display, Look & feel.
- `src/lib/ui/typeFloor.test.ts`: when ErrorLogCard's `text-[10px]` stack line is converted to `text-micro`, drop it from `ALLOWED`.
- `src/lib/state.svelte.ts` (`importData`): offer a "Restore previous" Undo after a restore (122).
- Native: a deep link to the app's notification settings for the denied-permission message (86).
- Icons: no new icons; removed from `offline-icons.json` because nothing refers to them any more: `baseline-brightness-auto`, `baseline-contrast`, `baseline-dark-mode`, `baseline-light-mode`, `baseline-indeterminate-check-box` (merge conflicts in that one-line file: re-run the removal script or delete these five keys).
