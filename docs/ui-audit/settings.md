# UI audit: settings

Run: `node scripts/audit/run.mjs --area=settings --out=<dir> --port=9507 --app=http://localhost:5307/` with `HEADLESS_OUT=<dir>/settings/shots` (create the `shots` folder first). 80 screens x 5 sizes x 2 themes. Headless Chrome only; nothing was tried on a real phone. Pages open through `uiStore.settingsPageRequest`; the empty/full screens re-seed the example data (many places, circuits, exercises, categories) and restore it afterwards. Health Connect and the phone calendar do not exist in a browser, so `st-health-*` and `st-calendar-*` switch the two stores to "supported" and set their state by hand (native calls turned off). The update card (AppUpdateSettings, UpdateCard) belongs to shell.

## Components and the screens that show them (ids in `scripts/audit/screens/settings.mjs`)

- AIHistoryPicker: `st-page-aiSharing`, `st-ai-tuning` (the two "history" selects)
- AIPromptTuning: `st-page-aiSharing`, `st-ai-tuning`
- AISharingSettings: `st-page-aiSharing`
- AboutPage: `st-page-about`, `st-section-7`, `st-about-new`
- ActionRow: `st-page-sync`, `st-page-exports`, `st-health-*`, `st-calendar-*`
- AnalyticsCategorySettings: `st-page-exercises`, `st-exercises-full`, `st-category-new`
- AudioLevelSettings: `st-page-sounds`
- BackupSettings: `st-page-sync`
- BenchmarkTypeSettings: `st-page-benchmarks`, `st-benchmarks-empty`
- ChartSettings: `st-page-history`
- CircuitEditor: `st-circuit-new`, `st-circuit-edit`
- CircuitSettings: `st-page-circuits`, `st-circuits-empty`, `st-circuits-full`
- CoachNotesSettings: `st-page-coach`
- ColorPicker: `st-phase-new`, `st-phase-edit`, `st-category-new`
- DeviceCalendarSettings: `st-page-deviceCalendar`, `st-calendar-off`, `st-calendar-on`, `st-calendar-colour`
- DirectAISettings: `st-page-aiDirect`
- ErrorLogCard: `st-page-about`, `st-errorlog`, `st-errorlog-open`
- ExerciseLibrary: `st-page-exercises`, `st-exercises-full`
- ExerciseSettings: `st-page-exercises`
- ExerciseTypeEditor: `st-exercise-edit`, `st-exercise-new`
- ExportSettings: `st-page-exports`
- FeedbackCard: `st-page-about`
- FullLogView: `st-fulllog`
- GeneralSettings: `st-page-general`
- HealthConnectSettings: `st-page-healthConnect` (browser: empty), `st-health-off`, `-on`, `-error`, `-missing`
- HomeLayoutSettings: `st-page-home`
- LocationEditor: `st-location-editor` (inside the Plan goal form)
- NotificationSettings: `st-page-reminders`
- OrderedListSettings: `st-page-home`, `st-page-history`
- PDFExportModal: `st-pdf-export`
- PageReset: `st-reset-undo`, `st-reset-timer` (the foot of every page that has one)
- PainCheckInSettings: `st-page-pain`
- PhaseSettings: `st-page-phases`, `st-phases-empty`, `st-phase-new`, `st-phase-edit` (a phase's own page), `st-phase-edit-dirty`, `st-phase-starter`
- PhaseTemplateEditor: `st-phase-templates`
- PlacesSettings: `st-page-weather`, `st-places-empty`, `st-places-full`, `st-place-open`, `st-place-add`
- RemindersSettings: `st-page-reminders`
- SessionSettings: `st-page-live`
- Settings: `st-index`, `st-search`, `st-search-none`, `st-section-0` to `st-section-7`, every `st-page-*`
- SettingsTransfer: `st-page-sync`
- SoundSettings: `st-page-sounds`
- SyncSettings: `st-page-sync`
- TargetsSettings: `st-page-targets`
- TimerSettings: `st-page-timer`
- TunablesSettings: `st-page-planCalendar`, `-home`, `-live`, `-timer`, `-model`, `-weather`
- UnitsSettings: `st-page-units`
- ValueDefSettings: `st-page-values`
- VoiceSettings: `st-page-sounds`
- WhatsNew: `st-page-about`, `st-about-new`
- WidgetSettings: `st-page-widgets` (page opens although the browser hides it from the list)
- Not mine, same folder: `colorChoices.ts`, `rovingRadios.ts` (helpers, no screen).

Pages (`st-page-<id>`): exercises, circuits, phases, benchmarks, targets, values, general, units, home, planCalendar, history, live, timer, sounds, model, pain, weather, reminders, coach, aiSharing, aiDirect, sync, healthConnect, deviceCalendar, exports, widgets, about.

## Findings

First full run (62 screens, 602 captures): no overflow, clipping, off-screen elements, unlabelled buttons or tiny text. Found and fixed:
1. **Crash: "New circuit"** (CircuitEditor): a circuit with no exercises has no group, so `asWorkout.groups[0]` threw, the editor did not open and an error toast showed. It now falls back to the draft's own timing; verified at phone and laptop with no console errors.
2. Commit link in About (AboutPage): 37 px tall hit area, now 41 px (same look).
3. Phase template editor (PhaseTemplateEditor): day chips "Fri" 37 px wide now `min-w-10`; the session name and note lines are 40 px tall (about 20 px more per session card; see questions).

Re-captured after the fixes (phone and laptop, or phone and landscape): circuit-new, place-open, place-add, page-about, phase-templates, errorlog: 0 flagged.

Skipped / left: the "Brione" place chip in the Plan goal form (GoalForm, plan's file) is 27 px tall in `st-location-editor`: handoff, add the `tap` class. Wide-screen column width, a cut-off select and the template fields are in `questions.md`.

Shared files touched: none. Dead code: none found.

## Shots looked at

Contact sheets or single shots (mostly phone portrait): Timer page (all sizes), Look & feel dark (all sizes), circuit editor (new, edit), exercise editor, phase new (colour picker), AI tuning, direct AI, benchmarks, places (open, tablet full), PDF export (portrait and landscape), full log, error log, about, sync, widgets, goal form with the location editor, Health Connect and phone calendar states (portrait and landscape). Not looked at one by one: most dark and tablet captures, the other section lists (only the automatic checks).


Follow-up 4: Phases open one per page (`PhaseSettings` has a list view and a phase view), Timer is split into `timer` and `sounds` (Sound & voice), and `PageReset` ends each page that has preferences. See `followup-4.md`.
