# Package A: live session and run sheets

Looked at on screen (headless Chrome): empty session (phone light), session with a circuit, edit mode, the add-circuit sheet, the circuit runner (phone light, landscape dark), the End early and Restart sheets, the exercise picker. Not looked at on screen: reps-step steppers, the correction row, the quick timer sheet, the summary, the circuit pill, GroupSettings, dark phone. Nothing tried on a real phone.

## Findings

| finding id | state | what changed or why not |
| --- | --- | --- |
| V-45 empty session | partly | one full-width primary "Add an exercise"; header says "No exercises yet" with no empty bar; the greyed Edit is hidden. "Start from a planned session" skipped: new feature (see decisions) |
| V-46 header colours | partly | "Session running" is quiet text with a status dot, End is neutral text (red only on press), Pause/End position unchanged (see decisions) |
| V-8 bubble 0/0, 0/60 | fixed | no planned time or ratio until the session has exercises; "Paused" capitalised |
| Cross: sheet chrome | fixed | add-circuit sheet, Timer sheet, End early, Restart, exercise how-to now use the shared Sheet (Back, drag, safe area, Escape, dialog role) |
| Cross: close button sizes | fixed | all through Sheet or btn-icon |
| Cross: dialog roles, Escape | fixed | via Sheet and the dialog layer |
| Cross: primary buttons | fixed | live-session buttons use btn / btn-primary |
| Cross: text-white / text-app-bg | fixed | text-on-primary in all my files |
| Cross: delete without undo (dissolveCircuit) | fixed | Ungroup now has an Undo toast |
| Cross: number inputs, focus | fixed | field class, inputmode on QuickTimer, GroupSettings |
| ActiveSessionModal minimise, notes | fixed | 44 px |
| ActiveSessionModal Stop | partly | renamed End (matches "End this session?"), 44 px; not moved to the bottom |
| Notes duplicated | skipped: needs decision | drop one or add a count |
| Pause button colour logic | fixed | on-primary ink |
| Progress copy | fixed | label size |
| Empty state link | fixed | primary button |
| Circuit-pick validation | fixed | hints for 0 and 1 picked; button rule unchanged |
| Edit-mode row actions | fixed | 44 px with room; delete keeps its Undo. Move up/down not added (see decisions) |
| "Remove circuit" | fixed | "Ungroup", 44 px, Undo, reason shown when running |
| dissolveCircuit | fixed | Undo |
| Drag handle | partly | labelled; no tap alternative |
| Status pip + name | fixed | one 44 px target |
| Clock chip labels | fixed | minute variant labelled |
| Reopen icon | fixed | 44 px |
| Action row weights | skipped: needs decision | fixed slot for primary vs overflow for Skip |
| Swipe has no button | skipped: needs decision | an "As prescribed" button on the current row |
| Footer Edit/Add | fixed | 44 px |
| Finish & rate vocabulary | skipped: needs decision | one vocabulary (Finish/Discard) |
| Timer widget bottom hard-coded | fixed | measured footer height (`--live-footer-b`) |
| Add overlay Back | fixed | sticky 44 px header; Back already guarded by backWhile |
| Two segmented controls | partly | shared Segmented; collapsing the second behind "Advanced" skipped |
| Saved-circuit sheet | fixed | shared Sheet titled "Add a circuit" |
| CircuitRunner header buttons | fixed | 44 px; title moves under the buttons on a narrow phone |
| Restart/End panels pushing layout | fixed | bottom sheets; End early shows Finish now in one style |
| Panel buttons 28 px | fixed | 44 px |
| Finish now style | fixed | one danger style |
| Dial digits, elapsed label | not an issue | no finding / kept |
| Duplicated blocks | fixed | one snippet |
| Correction steppers | fixed | 44 px |
| Reps steppers | fixed | 56 px (44 in landscape) |
| Set details button | fixed | 44 px |
| Secondary row | partly | "Previous" label, 44 px; skip undo skipped (behaviour) |
| Dead `neverStarted` branch | fixed | removed |
| I'm ready size | fixed | same as Start |
| Summary close without logging | fixed | confirm when sets were recorded |
| Summary Log green | not an issue | success = done, kept |
| Info sheet | fixed | shared Sheet |
| TimerWidget (all) | fixed (round 1, checked) | 44 px modes, +/-30 s with true minus and labels, Reset apart from Start, preset chips |
| CircuitPill | fixed | play/pause 44, minimise 44, ink token |
| SessionBubble | fixed | see V-8 |
| SessionExitModal, ChoiceSheet, SetDetailSheet, PresetNameSheet, RunAdjustSheet | fixed (round 1, checked) | on Sheet; nothing left |
| QuickTimerSheet | fixed | Sheet, 44 px Edit/chips/play/delete, preset delete Undo, clamp notice, inputmode |
| QuickTimerSheet "Open timer" | not an issue | the runner opens waiting for Start |
| GroupSettings | fixed | 44 px steppers, field inputs commit on input, name labelled, Ungroup 44 px |
| SetRowsEditor | fixed (round 1, checked) | ghosting inherited values skipped: needs decision |
| VolumeControl | fixed | 44 px mute, 32 x 44 chevron |
| WorkoutModal | not an issue | already a dialog |

## Needs a decision

- Move Pause and End to a bottom bar (one-handed): footer or a second row.
- "Start from a planned session" on the empty session: new picker.
- Move up/down buttons for reordering, or keep drag only.
- "As prescribed" button for the swipe-done path.
- One vocabulary: Finish & rate vs End vs Save.
- Collapse the second add-exercise segmented control behind "Advanced".
- Notes affordance: drop the description button or show a count.

## Handoff

None.
