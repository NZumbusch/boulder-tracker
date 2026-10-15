# Package D: Home and History (status)

Branch `ui2-d-home-history`. "Home #n" and "History #n" are the numbered items of Part 4 in `docs/ui-fault-log.md` (the Home block is 1-85, History 86-101). Looked at on screen (headless Chrome, example data): Home phone portrait light (all cards), Home landscape dark (top), History phone portrait light. Not looked at: History with the filter panel open and the chips row, the Retry buttons, the 40+ day-strip states, the refresh button (shown only with a mouse), the share image.

## Findings

| finding | state | what changed or why not |
| --- | --- | --- |
| V-11 hero vs alert, housekeeping mixed with health | partly | Alerts: health/training signals first, backup, data gaps and unrated sessions in a quiet "Housekeeping" group; hero word is now Ready/Take care/Rest. The hero advice text itself comes from `lib/analytics/readiness` (not mine) |
| V-12 same ratio, different colour | fixed | One zone helper (`lib/home/acwrZone.ts`) drives the pill and sheets: Low is green. Seen on screen ("Load ratio 0.48 · Low") |
| V-13 Home is long | skipped: needs decision | see Needs a decision. Today Start is now a 44 px button |
| V-14 Today empty state | fixed | "Rest day" / "Done for today" / "Nothing planned for today", the next planned session (`lib/home/nextSession.ts`, tested), a secondary Start button |
| V-15 Metrics rows uneven | fixed | every row has a comparison line (7-day average for sleep and resting heart rate), same row height, sparklines have a text summary |
| V-16 Fatigue no reference | fixed | tick at 7 on each bar, "high" word and colour from 7, a one-line key |
| V-17 two greens, unlabelled bars | partly | mix bar labelled "Training mix" with its info button, plan bar labelled for screen readers, category dots in the caption; the two greens themselves are a colour decision |
| V-18 day circles | fixed | circles 28 px, glyphs 12-14 px, two-letter day names, trip in the button label |
| V-19 block bars | fixed | bars are buttons with a readout line, legend with swatches, current bar read by default |
| V-20 ISO date, block vs phase | fixed | "Nov 2" via `formatDay`, "Trip prep (Performance)" |
| V-21 countdown scale, projects look checkable | skipped: needs decision | the 44 px number is a taste call; "of 5 days" wording for multi-day goals fixed |
| V-22 Progress mixes things, blue streak | partly | subtitle, streak no longer link blue; splitting the card is a decision |
| V-23 F7 A7 C6 S6, load without context | partly | Recent activity: "Felt in: Fingers 7 · Arms 7 · Core 6 · Systemic 6 (of 10)"; no bar next to the load number (ListRow is package G's) |
| V-24 year on every date | fixed | `formatDay` everywhere on Home and History (year only when not this year) |
| V-48 session rows | partly | block moved into the meta line, month always shown, fatigue letters removed from the row (not replaced, see Needs a decision), stacked "load" hint stays (ListRow) |
| V-49 filter control, no summary | fixed | removable chips under the header, "Filters (3 active)", pill-style switch (shared Segmented) |
| 1.1 #1 deletes (History) | not an issue | History has no delete; those live in WorkoutView / SessionActionsSheet. In my files: Skip (Today) has Undo, the yes/no on a trip project has Undo, hiding "Get started" has Undo |
| 1.1 #8, #12 | partly | labels, 44 px targets, inputmode on History filters and the metric field |
| 1.1 #9 dates | fixed | `formatDay`/`formatWeek`; no hand-formatted dates left in my files |
| 1.1 #11 jargon | partly | "load pts" is "load" with the info button in Today, This week, Week recap, History months; Load ratio wording; fatigue letters replaced by words on Home. No info term exists for HRV, friction (handoff) |
| Cross-cutting 1 week format | fixed | `formatWeek` in my cards |
| Cross-cutting 4, 5 | partly | removed `/70` text and hover-only block bar titles in my cards; forecast strips show the conditions word |
| Cross-cutting 9 | fixed | see V-24 |
| Cross-cutting 10, 12 | partly | info buttons added (above); Readiness hero now `.card` |
| Cross-cutting 11 wide layouts | skipped: needs decision | layout change |
| Missing features: History sort/export/bulk, Home snooze | skipped: needs decision | new features |
| Home #1 title is the phase name | skipped: needs decision | see below |
| Home #2, #3 | fixed (round 1) | pencil glyph, tour/settings moved |
| Home #4 four banners | skipped: needs decision | |
| Home #5 conditional cards hint | skipped: outside my files | Settings home-sections page (package F) |
| Home #6 toast | fixed | "Up to date" |
| Home #7 no non-touch refresh | fixed | refresh button in the app bar, visible with a mouse only (`pointer-fine`) |
| Home #8 SectionHeader | fixed | `action` snippet, used by Get started, Pain check-in, Weekly check-in, Android card; note button 36 px + tap area |
| Home #9 note button | fixed | |
| Home #10 info-button rule | skipped: needs decision | |
| Home #11 Readiness hero | fixed | dead map removed, `.card` |
| Home #12 status words | fixed | `lib/home/readinessWords.ts`, tested |
| Home #13 "Why this score" | fixed | |
| Home #14 label columns | fixed | min-width, no wrap |
| Home #15, #16 Load row | fixed | chevron, renamed "Load ratio" |
| Home #17 load pts | fixed | |
| Home #18 Start 34 px | fixed | `btn`, 44 px |
| Home #19, #22 empty state | fixed | |
| Home #20 Open/Skip | fixed | 44 px, Undo on Skip |
| Home #21 missed | fixed | count badge in caution colour |
| Home #23 day glyphs | fixed | |
| Home #24 initials | fixed | |
| Home #25 unit/help | fixed | |
| Home #26 ACWR pill | fixed (round 1 helper) | |
| Home #27 placeholder | fixed | link style, "needs 4 weeks of history" |
| Home #28 above target | fixed | "Over target" word and icon |
| Home #29 two percentages | partly | bar labelled; target moved nowhere |
| Home #30 primary fallback | fixed | neutral |
| Home #31 mix legend | fixed | |
| Home #32 raw week id | fixed | |
| Home #33 trip icon | fixed | |
| Home #34, #35 Metrics edit | fixed | pencil, 44 px, labels, decimal keyboard, unit |
| Home #36 baseline | partly | "14-day average"; HRV info term missing (handoff) |
| Home #37 bodyweight | fixed | |
| Home #38 sparklines | fixed | |
| Home #39 subtitle | fixed | |
| Home #40, #41 Alerts | fixed | icon, word, 44 px rows |
| Home #42 snooze | skipped: needs decision | new stored setting |
| Home #43 Progress split | skipped: needs decision | subtitle added |
| Home #44, #45, #46, #47, #48 Progress | fixed | |
| Home #49, #50, #51 Fatigue | fixed | |
| Home #52 merge recap | skipped: needs decision | |
| Home #53 recap arrow | fixed | |
| Home #54 pain entry link | skipped: outside my files | needs an entry point to the pain timeline |
| Home #55, #56 block bars | fixed | |
| Home #57, #58 jump to block manager | skipped: outside my files | no open-block-manager function exists |
| Home #59 "3/5" | fixed | |
| Home #60 extract strip | partly | shared `FrictionMark`; strips differ too much to merge |
| Home #61 friction | partly | word always shown; info term missing |
| Home #62, #63, #64, #65 | fixed | |
| Home #66 weekday a day early | fixed (round 1) | |
| Home #67 both friction options off | skipped: needs decision | the user chose to hide both |
| Home #68, #69 | partly | two-line crag names, Retry; no timeout for "loading" |
| Home #70 unit slice | not an issue | headline has the unit, strips are bare on purpose |
| Home #71 | fixed | "Dew point", "UV index" |
| Home #72, #73, #74 | fixed | |
| Home #75 | fixed | |
| Home #76 hide for good | fixed | Undo |
| Home #77 | not an issue | |
| Home #78 | fixed | 44 px buttons |
| Home #79, #80 competing primaries | fixed | secondary style; "only the first few opens" is a decision |
| Home #81 ACWR sheet | fixed (round 1, shared Sheet) | |
| Home #82 sheet roles | fixed | Acwr and Taper sheets already use `Sheet` |
| Home #83, #84 | not an issue / partly | taper legend exists |
| Home #85 QuickLogSheet | skipped: outside my files | package B |
| History #86, #87 dates | fixed | |
| History #88 | fixed | |
| History #89 tabs | partly | shared Segmented (44 px, grouped buttons, not tab roles) |
| History #90 chips, case | fixed | |
| History #91 select arrow | fixed | native select |
| History #92 | fixed | |
| History #93 | fixed | |
| History #94 load bar | skipped: outside my files | ListRow (package G) |
| History #95 fatigue codes | partly | removed from the row |
| History #96 | fixed | |
| History #97 | fixed | |
| History #98 | fixed | "Show more (50 of 214)" |
| History #99 | fixed | sorted once |
| History #100 | skipped: needs decision | |
| History #101 share image text | fixed | 11 px minimum; also removed from the type-floor allowlist (`typeFloor.test.ts`) |

## Needs a decision

- V-13 Home length: (a) collapsible cards, Week recap and Recent activity collapsed by default; (b) leave as is, users hide cards in Settings.
- Home #1: keep the phase as the title, or a stable "Home" title with the phase as the subtitle.
- Home #4: one banner at a time by priority, or make them orderable Home sections.
- Home #10 info-button rule, Home #43 split Progress, Home #52 merge Week recap into This week, V-21 size of the goal countdown, Home #67.
- History rows: fatigue ratings were letters (F7 A7); options: leave out of the row (now), a third line with words, or a legend.
- Alert snooze (Home #42), History sort/export/bulk (Home #100), Android card only on the first few opens.

## Handoff

- `src/lib/help/glossary.ts` (G): terms for HRV and "conditions (friction)"; the Fatigue card keeps its own copy of the "7 = high" line from `FatiguePanel` (export `HIGH` there to share it).
- `ListRow` (G): an optional load bar under the value (History #94, V-23).
- `src/lib/ui/typeFloor.test.ts`: I removed three allowlist entries (ThisWeekCard, History, WorkoutShareImage) because they now pass.
- Settings home-sections page (F): hint that Crags, Alerts and Timer show only when relevant (Home #5).
- No new icons (`ic:baseline-refresh` was already bundled).
