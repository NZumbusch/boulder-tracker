# Questions for later (UI audit)

One entry per decision: area, screen, options, recommendation.

## shell

- **shell / nav-bar-home, nav-drawer-home, toast-*, update-card-home (tablet-l, laptop)**: the content column is capped at `max-w-lg` (512 px), so on a 1180 or 1366 px screen there are wide empty margins on both sides (the rail or bottom bar spans the full width). Options: (a) keep, calm and readable; (b) widen to about 720 px from the `lg` breakpoint; (c) two columns of cards on Home from `lg`. Recommend (b), a modest widening, after Nathan has seen it on a tablet.
- **shell / banner-in-app-browser (phone-l)**: the "Open this in Chrome" banner takes about a third of a landscape phone's height (paragraph, two buttons). Options: (a) keep, it is closable and rare; (b) on short screens drop the paragraph and keep the title and buttons. Recommend (b) (wording is not changed, only hidden on short screens).
- **shell / welcome-* (tablet-p, tablet-l, laptop)**: the Back/Continue bar is pinned to the bottom of the screen while the 512 px column of content sits at the top, so on a tablet the button is far from what it confirms. Options: (a) keep the pinned bar (same position on every step); (b) on wide screens place the bar directly under the content. Recommend (a): the fixed position is the point of the bar.
- **shell / nav-drawer-open (phone-l)**: on a landscape phone the drawer's 7 rows (48 px each) do not fit and the list scrolls, with the last row ("Take the tour") half hidden and no scroll hint. I made the rows 40 px on short screens (still a 40 px target); alternative is a two-column list. Recommend keeping the 40 px rows.

## home

- **home / quicklog-bodyweight (all sizes)**: the bodyweight bar chart (last 12 weigh-ins) has one tappable bar each, 23 px wide on a phone (the gaps between bars were turned into hit area, no visual change) and still under the 40 px target size; the harness flags it. Options: (a) keep, it is a dense read-out and the dated list below has full-size rows; (b) show the last 7 weigh-ins on phones so each bar is about 38 px; (c) a scrub gesture (drag across the bars). Recommend (a), or (b) if bar taps matter.
- **home / home-full, home-pain-due (tablet-l, laptop)**: same as the shell question on column width: the Home column is 512 px wide on a 1366 px screen. Two columns of cards from `lg` would suit Home best. Recommend the shell's option (b) or (c) after Nathan has seen it on a tablet.
- **home / quicklog-bodyweight**: bars start from a baseline at the lowest weight in the window, so the lightest weigh-in shows as a sliver. Options: (a) keep (shows change); (b) start the bars from a bit below the minimum so none is a sliver. Recommend (b), purely visual.

## plan

- **plan / plan-cal-year (all sizes)**: the day cells in the year overview are 23 to 34 px wide (24 px on a phone, seven columns per month, two months per row). The cells touch, so the touch area cannot grow. Options: (a) keep, it is an overview and a tap only jumps to that day; (b) one month per row on phones (about 48 px cells, more scrolling). Recommend (a).
- **plan / plan-cal-week-grid, plan-cal-week-events, plan-cal-contrast (all sizes)**: sessions and phone-calendar events in the hour grid are as tall as their length (a 30 minute event is about 23 px) and as narrow as a day column on a phone (44 px), like any calendar app. The harness flags them as small targets. Options: (a) keep, same as Samsung Calendar; (b) a minimum block height of 32 px (overlaps the next hour slightly). Recommend (a). On a phone held upright the week is a list by default anyway.
- **plan / plan-ai-coach, plan-ai-direct (phone-p)**: the two week pickers ("W42 · Oct 12 (now)") are cut off in the middle of the label (about 164 px each at 16 px text). Options: (a) keep; (b) a shorter label ("W42 · Oct 12") with "now" as a marker; (c) stack the two pickers on narrow screens. Recommend (c), no wording change.
- **plan / plan-weeks (phone)**: the 10-column week grid cells are 30 px with 6 px gaps; the touch area now reaches 36 px (it cannot grow further without touching the next cell). Options: (a) keep; (b) 8 columns (about 38 px cells, a different grid rhythm). Recommend (a).
- **plan / plan-cal-week-grid, plan-cal-day (phone)**: the phase strip under the day headers is a 4 px stripe; its touch area is now 20 px tall. Options: (a) keep; (b) make the stripe 6 px. Recommend (a).
- **plan / plan-week-share (all)**: the share image preview uses 10 px text (it is a picture exported at 2x and scaled down in the sheet, so only the preview is small). Options: (a) keep; (b) scale the preview up. Recommend (a).

## workout

- **workout / wk-session-exit, wk-session-exit-empty (phone-l)**: in landscape the "End this session?" sheet is taller than the screen, so "Discard session" sits at the bottom edge and needs a scroll. Options: (a) keep; (b) put Discard beside the Close button as a quiet text link; (c) shorten the explanation text. Recommend (a), it is the destructive choice and is meant to be hard to hit.
- **workout / wk-editor-* (tablet-l, laptop)**: the workout viewer and editor are full-screen modals with a narrow content column, so on a 1366 px screen they are a thin strip with empty sides. Options: (a) keep; (b) use two columns (details beside the list) from `lg`. Recommend (a) until Nathan uses it on a tablet.

## history-sends

- **history-sends / hs-sends-full, hs-sends (grade chart, all sizes)**: each grade's bar is a full-height button but only 26 to 34 px wide (`BAR_MIN_PX` 28; the chart scrolls sideways below that). The harness flags them as small targets. Options: (a) keep, a wide hit area would make the chart scroll on every phone; (b) raise the minimum to 40 px so every bar is thumb-sized and the chart scrolls sooner. Recommend (a).
- **history-sends / hs-benchmark-form (all sizes)**: "Test result" in the quick-log sheet shows two headers and two close buttons: the sheet's own ("Test result", back, X) and the form's card ("Record a test result", X). Options: (a) keep (the form is shared with Plan and the Start screen); (b) hide the form's own header inside the sheet. Recommend (b).
- **history-sends / hs-history-* (laptop, tablet-l)**: History is a narrow left-aligned column (about 480 px) with empty space on the right, like the other list pages. Options: (a) keep; (b) centre it or use two columns. Recommend (a) until decided app-wide.

## analytics

- **analytics / an-recovery, an-pain-tap (all sizes)**: pain dots sit close together on a day, so their (now 40 px) touch areas overlap and the later dot wins. Options: (a) keep; (b) pick the nearest dot to the tap. Recommend (a), rare.
- **analytics / an-range-year, an-range-6m (phone)**: phase band segments get very thin (Deload 3 to 9 px) and carry no label; tapping one shows its name below the band. Options: (a) keep; (b) merge short blocks into a marker. Recommend (a).
- **analytics / an-overview, an-recovery (all sizes)**: with little history the plots use the full width but the data sits in the last few columns, leaving the left half empty. Options: (a) keep, columns stay comparable when paging; (b) shrink the window to the data. Recommend (a).
- **analytics / an-overview (laptop, tablet-l)**: Analytics is a 512 px column with empty sides like the other list pages. Options: (a) keep; (b) two chart columns from `lg`. Recommend (a) until decided app-wide.
- **analytics / an-benchmark-adjust (phone)**: test chips scroll sideways with the last one cut off and no fade hint. Options: (a) keep; (b) add an edge fade. Recommend (b).
