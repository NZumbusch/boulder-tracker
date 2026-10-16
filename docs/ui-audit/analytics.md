# UI audit: analytics

Run: `node scripts/audit/run.mjs --area=analytics --out=<dir> --port=9506 --app=http://localhost:5306/` with `HEADLESS_OUT=<dir>/analytics/shots` (the folder must exist). 37 screens x 5 sizes x 2 themes. Headless Chrome only; nothing was tried on a real phone. Screens that need other data (empty, almost empty, low, full, logged weights) re-seed the example data and restore it in their teardown. Charts are tapped with synthetic touch pointer events.

## Components and the screens that show them (ids in `scripts/audit/screens/analytics.mjs`)

- Analytics: every `an-*` screen. Tabs: `an-overview`, `an-training`, `an-training-more`, `an-recovery`, `an-progress`; ranges and paging `an-range-4w/6m/year/year-recovery`, `an-paged-back`; states `an-empty`, `an-almost-empty` (no sessions, but daily metrics and pain logs), `an-low-*` (one session), `an-full-*` (160 sessions, long names, 70 sends, logged weights), `an-sections-off` (every card hidden); the "More charts" fold: `an-training-more`, `an-low-training`, `an-full-year-training`, `an-strain-tap`
- SummaryStrip, FindingsPanel: top of every tab (`an-overview`, `an-training`, `an-recovery`, `an-progress`, `an-low-*`)
- LoadPanel (also the ACWR pane), PhaseBand, ZoneMark: `an-overview`, `an-load-readout`, `an-range-*`, `an-full-year`
- WeekDetailSheet: `an-week-detail`, `an-week-detail-year`
- HeatmapPanel: `an-overview`, `an-heatmap-tap`
- MixPanel: `an-training`, `an-mix-toggle`
- StrainPanel, FingerLoadPanel (More fold): `an-training-more`, `an-strain-tap`, `an-full-year-training`
- FatiguePanel, RecoveryTrendPanel (overlay, metric toggle): `an-recovery`, `an-recovery-toggle`, `an-recovery-tap`, `an-range-year-recovery`
- PainTimelinePanel: `an-recovery`, `an-pain-tap`
- OutdoorAscentsPanel: `an-progress`, `an-low-progress`, `an-full-progress`
- BenchmarkPanel, BenchmarkViewControls (Adjust, filters, save as view): `an-progress`, `an-benchmark-adjust`, `an-benchmark-saveview`
- BenchmarkOverviewPanel: `an-progress`, `an-full-progress`
- ExerciseProgressPanel: `an-full-progress`, `an-progress-show-all`, `an-exercise-progress*`
- ExerciseProgressSheet: `an-exercise-progress`, `an-exercise-progress-long`
- BlockReviewSheet: `an-block-review`
- ChartEmpty: all chart screens with an empty window (`an-almost-empty`, `an-low-*`, `an-sections-off` shows the no-cards text)
- ChartTable (screen-reader table under each chart): not visible; checked for page overflow in `an-full-year-training`
- chartTypes.ts: types only, no UI

## Findings

First run: 276 of 350 captures flagged. One real bug, the rest small tap targets.
1. **Page grew sideways on phones** (`an-full-year-training`, Training with More open, 1Y): the screen-reader-only chart table is a `<table class="sr-only">`; tables ignore width and overflow, so the wide finger-load table made the page scroll sideways. ChartTable now puts `sr-only` on a wrapper div.
2. Phase band segments (PhaseBand, 20 px tall, down to 3 px wide at 1Y): now `tap` (hit area 36 px tall, wider on thin ones; looks unchanged).
3. Benchmark chips (BenchmarkPanel): 36 px, now `min-h-10` (4 px taller).
4. Week detail session rows (WeekDetailSheet): 37 px, now `min-h-10`.
5. Pain timeline dots (24 px) and issue names (80x28): `tap`; the name is now a flex button around a line-clamped span so the hit area is not clipped.
6. Empty state buttons ("Log a session", "See it with example data"): 38 px, now `min-h-10`.
7. Exercise progress chart points: invisible hit circle 34 px, radius 16 to 19 (about 40 px).

After the fixes: full re-run 10 of 360 flagged (the empty buttons, fixed after); the changed screens (`an-empty`, `an-almost-empty`, `an-exercise-progress*`, `an-full-progress`, `an-progress-show-all`) re-run: 0 flagged except the chart points, re-run at phone-p and laptop: 0. No tiny text, clipping, overflow, unlabelled buttons or console errors in any capture.

Shared files touched: none. Dead code: none found. Handoffs: none.

## Shots looked at

Phone portrait light: all four tabs scrolled top to bottom, Training with More open; week detail, block review, exercise progress sheets. Phone landscape: Overview (light) and Recovery (dark). Laptop: Overview, Recovery (dark), 1Y Overview, Training with More (dark). Charts were readable everywhere I looked: labels not clipped, content column capped at 512 px so nothing stretches. Not looked at one by one: tablets, most dark and the interaction screens (readouts after a tap), only the automatic checks. Chart colour contrast in dark was judged by eye on the Recovery and Training screens only.
