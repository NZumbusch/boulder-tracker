# UI audit: history-sends

Run: `node scripts/audit/run.mjs --area=history-sends --out=<dir> --port=9505 --app=http://localhost:5305/` with `HEADLESS_OUT=<dir>/history-sends/shots` (the folder must exist). 33 screens x 5 sizes x 2 themes = 330 captures. Headless Chrome only; nothing was tried on a real phone. Screens that need other data (empty, full) re-seed the example data and restore it in their teardown.

## Components and the screens that show them (ids in `scripts/audit/screens/history-sends.mjs`)

- History: `hs-history`, `-empty`, `-full` (144 sessions, long names), `-more` ("Show more"), `-filters`, `-filtered` (no match), `-chips`, `-detail`, `-menu`
- WorkoutShareImage: `hs-share-image`, `hs-share-image-detailed`, `hs-share-image-stats`
- SendsLog: `hs-sends`, `-empty`, `-full` (77 sends, trips and months, long names), `-grade-picked`, `-year`, `-v-scale`, `-filters`, `-filtered-none`
- GradeChart: all `hs-sends*` screens (full, year, V scale, a picked grade, empty period)
- SendForm: `hs-send-form`, `-empty-first`, `-filled`, `hs-send-edit`, `hs-quicklog-send`
- SendImport: `hs-send-import` (file picker), `-review` (new, maybe, discarded rows), `-edit`
- BenchmarkForm: `hs-benchmark-form` (in Quick log; also Plan and Start screen)
- NoteSheet: `hs-note-sheet`, `hs-note-sheet-filled`
- PullToRefresh: `hs-pull-home` (finger held mid-pull)
- Quick log sheet (dashboard, only as host of the forms above): `hs-quicklog`
- RangeSlider, InfoButton, InfoSheet: covered in shell (`fatigue-modal`, `info-sheet`) and workout; History's "What is Load?" info buttons appear in `hs-history*`.
- Pain screens and BodyweightLog (health): done in home, not repeated.

## Findings

First run: 80 of 330 captures flagged, no overflow, clipping, off-screen elements, unlabelled buttons, tiny text or console errors. All were small tap targets:
1. Share image style tabs (WorkoutShareImage): 33 px tall, now `tap` (hit area 50 px, look unchanged).
2. Import review checkboxes (SendImport): 16 px, now wrapped in a 40 px label with a negative margin (row layout unchanged).
3. "N already logged (discarded)" toggle: 18 px tall, now `tap` with padding.
4. Grade chart bars (26 to 34 px wide, full height): not changed, see questions.

Re-captured after the fixes at all sizes: the three share screens, import review/edit, plus the corrected filter/chip/form setups: 0 flagged.

Harness fixes (not app issues): note sheet teardown must close the sheet before saving (the save hung otherwise); the sessions open through a tap on a row (opening through the store from History did nothing); the search field is found by its placeholder.

Shared files touched: none. Dead code: none found. Handoffs: none.

## Shots looked at

Phone portrait light: History (full, filters, chips, empty, detail, menu), Sends (default, V scale, form, filled form, edit, import, import edit, grade picked), quick log, send form, test result form, note sheets, pull indicator; five-size contact sheets of `hs-sends-full`, `hs-share-image`, `hs-history-detail`; one landscape dark import-edit. Not looked at one by one: most dark, tablet and laptop captures (automatic checks only). Share image export itself (html2canvas, Copy, Share) was not run.
