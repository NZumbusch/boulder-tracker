# UI audit: workout

Run: `node scripts/audit/run.mjs --area=workout --out=<dir> --port=9504 --app=http://localhost:5304/` with `HEADLESS_OUT=<dir>/workout/shots`. 59 screens x 5 sizes x 2 themes. Headless Chrome only; nothing was tried on a real phone. Screens start real sessions and runs through the stores (`t.startSession`, `workoutModal`, `quickTimer`, `sessionActions`) and every teardown ends the session, run and modal (`clean()` in the screen file), so screens do not leak into each other. Two setups were flaky once ("session did not start") and passed on re-run; `session()` now retries.

## Components and the screens that show them (ids in `scripts/audit/screens/workout.mjs`)

- ActiveSessionModal: `wk-session-circuit`, `-empty`, `-full`, `-progress`, `-paused`, `-done`, `-edit`, `-edit-full`, `-edit-pick`, `-edit-group`, `-bubble`
- ChoiceSheet: `wk-session-skip-ask`
- CircuitPill: `wk-runner-minimised`, `wk-timer-run-minimised`
- CircuitRunner: `wk-runner-lead`, `-go`, `-paused`, `-end`, `-restart`, `-rest`, `-counted`, `-info`, `-volume`, `-minimised`, `wk-solo-go`, `wk-timer-run`, `wk-timer-run-go`
- ExerciseCard: `wk-view-planned`, `wk-view-circuit`, `wk-view-completed`, `wk-editor-full`, `wk-editor-circuit`
- ExerciseDetails: `wk-session-full`, `wk-runner-info`, `wk-view-planned`
- ExerciseForm: `wk-session-add`, `wk-session-add-todo`, `wk-editor-full`
- ExerciseLogSheet: `wk-session-log`, `wk-session-log-sets`
- ExercisePicker: `wk-session-add-picker`
- GroupCard: `wk-view-circuit`, `wk-editor-circuit`
- GroupSettings: `wk-session-edit-group`, `wk-editor-circuit`
- PresetNameSheet: `wk-solo-preset-name`
- QuickTimerHost: `wk-timer-run`, `wk-timer-run-go`, `wk-timer-run-minimised`
- QuickTimerSheet: `wk-timer-sheet`, `wk-timer-presets`, `wk-timer-pacer`
- RunAdjustSheet: `wk-solo-adjust`, `wk-timer-run-go`
- SessionAIModal: `wk-editor-ai`
- SessionActionsSheet: `wk-session-actions`, `wk-session-actions-done`
- SessionBubble: `wk-start-running` (strip), `wk-session-bubble` (button in bar)
- SessionExitModal: `wk-session-exit`, `wk-session-exit-empty`, `wk-runner-end`
- SessionNotesSheet: `wk-session-notes`, `wk-session-notes-filled`
- SessionReviewCard: `wk-view-completed`
- SetDetailSheet: `wk-runner-setdetail`
- SetRowsEditor: `wk-session-log-sets`, `wk-session-log`
- StartScreen: `wk-start`, `wk-start-empty`, `wk-start-running`, `wk-start-test`
- TargetHint: `wk-session-log`, `wk-session-add`
- TestSheet: `wk-session-edit-test`, `wk-session-test-log`, `wk-editor-test`
- TimerWidget: `wk-session-full`, `wk-solo-timer`
- VolumeBar, VolumeControl: `wk-runner-volume`, all runner screens
- WorkoutEditor: `wk-editor-new`, `wk-editor-full`, `wk-editor-circuit`, `wk-editor-ai`, `wk-editor-test`
- WorkoutModal: all `wk-view-*` and `wk-editor-*`
- WorkoutView: `wk-view-planned`, `wk-view-circuit`, `wk-view-completed`, `wk-view-empty`

Other screens: `wk-solo-timer`, `wk-solo-go` (a single exercise's own timer).

## Findings

First full run: 122 of 542 captures flagged, no overflow, clipping, off-screen elements, unlabelled buttons, tiny text or console errors anywhere (including landscape phone and laptop). All flags were small tap targets:
1. Cue volume chevron (VolumeControl, in every runner header): 32 px wide, now `min-w-10` (40 px).
2. Exercise name button in the workout editor and viewer cards (ExerciseCard): 21 px tall, now `py-2.5 -my-2.5` (41 px hit area, layout unchanged).
3. Session name field in WorkoutEditor: 30 px tall, now `min-h-10` (the header is 10 px taller).

Re-captured after the fixes at phone portrait and landscape (`wk-editor-full`, `wk-runner-lead`, `wk-runner-restart`, `wk-solo-preset-name`): 0 flagged. The other sizes were not re-run for these fixes (same classes, no size-dependent behaviour).

Live session in landscape (844x390) and small phone: the exercise list, current-exercise card, Finish button and the runner (dial left, controls right, `short:` variants) all fit and stay reachable with one thumb; sheets scroll inside themselves (the exit sheet shows its Discard button only after a small scroll in landscape, see questions).

Shared files touched: none. Dead code: none found. Handoffs: none.

## Shots looked at

phone-p light of nearly every screen (start, session states, log sheets, runner states, solo timer, timers, editor AI/test); phone-l contact sheet of ten screens (session circuit/full/edit, runner counted/lead dark, log, add, exit, adjust, test). Not looked at one by one: most tablet, laptop and dark captures (only the automatic checks).
