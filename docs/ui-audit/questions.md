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
