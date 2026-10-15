# Package E: Analytics

Branch `ui2-e-analytics`. Finding numbers are those of Part 4 "Analytics" in `docs/ui-fault-log.md` (102-196), V-52..V-61, the cross-cutting items that touch analytics files, 1.1 items 4, 5, 8, 11, 12 and the Analytics line of "Missing features".

## What was built

- **Tap or key to read a chart.** Rolling load: the two panes are one target; hover, tap or the arrow keys pick a week and its numbers (load, % of plan, ACWR with its zone, change on the week before) print above the plot, with a Details button that opens the sheet (a tap no longer jumps straight to it). Mix, Monotony & Strain, Finger load, Fatigue, Outdoor ascents, Recovery trends, Test progress and the training calendar are focusable (`role="application"`, arrow keys, Escape) with a live readout. Screen readers get a hidden data table per chart (`ChartTable.svelte`).
- **ACWR marks by shape and colour** (`ZoneMark.svelte`): circle sweet, grey circle low, diamond caution, triangle high risk, hollow not counted; zone bands raised to 15 % plus a low band; a legend with the edges from Settings.
- **Series colours** from `src/series.css` everywhere data is drawn (load, HRV, sleep, RHR, strain, finger load, readiness, ascents, fatigue areas, test lines, calendar cells); status colours only for status (caution flags, zones, severity).
- **Gaps**: the outdoor "hardest each week" line uses `joinRuns.adjacentRuns` and no longer slopes across empty weeks. Other line charts already break at missing data.
- **11 px floor**: no `text-[9px]/[10px]` left in `components/analytics` (analytics entries removed from `typeFloor.test.ts`); `/70` `/80` opacity on text removed.
- New files: `ChartTable.svelte`, `ZoneMark.svelte`.

## Findings

| finding id | state | what changed or why not |
| --- | --- | --- |
| 102 | fixed | tabs and range use the shared 40 px segmented look |
| 103 | fixed | tabpanel, aria-controls, roving tabindex, arrow/Home/End keys |
| 104 | partly | 44 px prev/next, Today only away from the current window; export moved to a labelled button at the bottom of the page, not an overflow menu (taste) |
| 105 | fixed | the dates are the AppBar subtitle; the buttons say "Previous 3 months" etc. |
| 106 | partly | chart dates use `formatDay`; the window subtitle keeps its own short format |
| 107 | not an issue | pickers act on taps only (a swipe is ignored by `TapTracker`); the heatmap is `data-no-swipe`; device check still needed |
| 108 | not an issue | fine as written |
| 109 | fixed | a button that opens Settings, History & Analytics |
| 110 | partly | the load pane says the ratio needs about 4 weeks (or is not counted after a break); other cards unchanged |
| 111 | fixed | "vs the previous 4 weeks / the previous year" |
| 112 | fixed | sign and word in text (arrow plus +/-, sr-only up/down), comparison line above the tiles, counts show a plain difference not a percent |
| 113 | fixed | auto-fit grid of equal tiles |
| 114 | fixed | each tile opens its chart |
| 115 | fixed | "Nothing to compare with yet" |
| 116 | fixed | tone icons (warning, circled !, check, info) with names |
| 117 | fixed | "Ask AI" text button, 44 px |
| 118 | fixed | "Findings" and "Training/Recovery/Progress findings" |
| 119 | skipped: needs decision | "hide this rule" needs a stored preference (package F); option: a hidden-rules list in tunables |
| 120 | fixed | "points" in the subtitle, 11 px ticks |
| 121 | fixed | bands 15 %, low band (neutral), zone legend with names; zones use `acwrZone` so Home and chart agree |
| 122 | fixed | one column-wide tap target for both panes, shapes per zone |
| 123 | fixed | tap shows the readout, Details opens the sheet |
| 124 | fixed | flag in caution colour, wording "load jumped on the week before" with the Ramp rate info button, value in the readout |
| 125 | skipped: needs decision | planned load is a different scale from rated load (HANDOVER); outline bars would invite the comparison the app avoids |
| 126 | fixed | plan done is in the readout |
| 127 | fixed | `ChartEmpty` overlay |
| 128 | fixed | one wrapper padding for band and plot |
| 129 | fixed | 11 px white on the full phase colour, label from 20 % width |
| 130 | partly | 28 px targets; whether every chart shows the band is a design call |
| 131 | skipped: outside my files | GoalForm / GoalsCalendar use the flag; PhaseBand already uses the trophy (package C) |
| 132 | fixed | shared `Segmented` (40 px) and a caption line |
| 133 | partly | keyboard, readout and table; the 2 px minimum segment stays |
| 134 | fixed | hidden chips are struck through |
| 135 | fixed | keyboard plus table on all charts; Recovery trends has keys and a readout but no table (365 rows) |
| 136 | fixed | `formatMinutes` |
| 137 | fixed | one-sentence explanation, two plots with their own scale labels, bars keep their series colour, flag for high monotony |
| 138 | fixed | strain is series 2 |
| 139 | partly | legends are plain text, filters are chips; not further unified |
| 140 | fixed | "Finger Load" |
| 141 | fixed | series 3; flag is status |
| 142 | fixed | chips, 36 px |
| 143 | fixed | icon in the legend |
| 144 | fixed | one widget, arrow keys, drag across with a finger, 6M cells default, weekday labels |
| 145 | fixed | "Training Days", says it ignores the range |
| 146 | fixed | shared Segmented |
| 147 | fixed | month labels `text-micro`, legend explains the shade quarters with numbers |
| 148 | not an issue | |
| 149 | fixed | `ChartEmpty` |
| 150 | fixed | chips carry the latest value (Home's copy: package D) |
| 151 | fixed | new wording |
| 152 | fixed | 12 % and a "high" label |
| 153 | skipped: not done | label alignment left as is |
| 154 | fixed | a dash per line, in chips and readout |
| 155 | fixed | 24 px targets, triangle marker plus ring, legend |
| 156 | fixed | wraps to two lines |
| 157 | fixed | short subtitle, legend line |
| 158 | not an issue | |
| 159 | fixed | legend entries |
| 160 | fixed | "Recovery Trends" |
| 161 | fixed | "Sleep score" / "Sleep (h)" |
| 162 | fixed | "RHR (flipped)" and the subtitle says so |
| 163 | fixed | Overlay/Rows explained in the subtitle |
| 164 | fixed | label column 40 px |
| 165 | fixed | readiness is series 4 |
| 166 | partly | latest readiness value shown; no today marker |
| 167 | partly | indent now equals the label column width; not tested at large text |
| 168 | fixed | "over the last 6 months whatever range is chosen" |
| 169 | skipped: outside my files | needs the Quick log opener (package B/D) |
| 170 | partly | larger dots in the flash/onsight series colour; existing jitter kept |
| 171 | not an issue | own step is deliberate (the grade gutter narrows the plot) |
| 172 | fixed | `min-w-9` |
| 173 | fixed | "Hardest each week, between neighbouring weeks" |
| 174 | skipped: needs decision | opening a send from the readout needs a detail opener; option: link to the Sends view |
| 175 | skipped: needs decision | "Test progress / All tests / Tests" naming across Home, Settings (F) |
| 176 | fixed | "Improved" / "Slower" in words |
| 177 | skipped: not done | scroll fade on the chip rows |
| 178 | fixed | 44 px button, "(edited)" |
| 179 | fixed | confirm before deleting a view |
| 180 | fixed | repeats are dashed |
| 181 | skipped: needs decision | dual axis stays (colour-matched); option: small multiples |
| 182 | fixed | gradient removed |
| 183 | skipped: not done | the controls box layout |
| 184 | fixed | chips |
| 185 | fixed | 0% labelled at the dashed line |
| 186 | fixed | values printed above bars, `text-micro` |
| 187 | fixed | units, load info button |
| 188 | fixed | neutral colour for declines, arrow glyphs |
| 189 | partly | text 11 in viewBox units; points focusable |
| 190 | fixed | r=16 |
| 191 | fixed | four tiles |
| 192 | fixed | icon, ACWR info button |
| 193 | skipped: not done | projected sessions stay silently untappable |
| 194 | fixed | `formatDay` with the month |
| 195 | fixed | `role="status"` |
| 196 | fixed | see 123 |
| V-52 | not an issue | already fixed in round 1; window ends this week (checked: "Jul 20 - Oct 18") |
| V-53 | partly | tiles show a plain count difference; the sends tile's time base is the window |
| V-54 | fixed | |
| V-55 | fixed | findings name where they lead |
| V-56 | fixed | one flag colour, zone shapes, visible bands |
| V-57 | fixed | |
| V-58 | fixed | month labels aligned, weekday labels, legend numbers |
| V-59 | fixed | |
| V-60 | fixed | `adjacentRuns` |
| V-61 | fixed | |
| Cross #1 | partly | analytics prints "W42" labels from buckets |
| Cross #2, #3, #4, #5 | fixed | series palette, `text-micro`/caption, no opacity on text, readouts |
| Cross #9 | partly | `formatDay` in all charts and sheets; the window subtitle keeps its own format |
| Cross #10 | partly | info buttons on ACWR, load, monotony, ramp rate (strain explained inline) |
| Cross #12 | partly | summary tiles and block review tiles flat; the Benchmark controls box unchanged |
| 1.1 #4, #5, #8, #11 | fixed / partly | as above |
| 1.1 #12 | not an issue | no forms in analytics |
| Missing: per-chart table | partly | screen-reader tables; no visible table, export per chart or custom range (skipped: needs decision) |

Looked at on screen (phone, light, example data): header and tabs, summary tiles, findings, load chart with a tap readout (light and dark), training calendar, mix, strain, finger load, fatigue, recovery trends, outdoor ascents, test progress. Not looked at: landscape and laptop widths, the sheets (block review, week detail, exercise progress), pain panel, test controls, a real keyboard or screen reader, a touch device.

## Needs a decision

- Hide-this-finding (119): a stored list of hidden rules, or leave out.
- Planned load as outline bars (125): breaks the "never compare rated load with planned" rule.
- Send detail from the outdoor readout (174): a link to Sends, or a detail sheet.
- Test naming (175): "Test progress / All tests" vs "Benchmarks" in Settings.
- Dual-axis test chart (181): keep or small multiples.
- Export: bottom button or overflow menu (104).

## Handoff

- `src/lib/constants.ts` `FATIGUE_AXIS_COLORS` (Home's fatigue lines): Analytics now uses series 3/5/4/6 for fingers/arms/core/systemic with dashes; Home should match.
- `GoalForm.svelte`, `GoalsCalendar.svelte`: use `ic:baseline-emoji-events` (trophy) for competitions, as PhaseBand does (131).
- Settings "History & Analytics" list names the card "Benchmark Progress"/"All Benchmarks": align with "Test progress"/"All tests" (175); card names changed here: "Training Days" (was Training Calendar), "Recovery Trends", "Finger Load" (was Filtered Load).
- No new icons were added.
