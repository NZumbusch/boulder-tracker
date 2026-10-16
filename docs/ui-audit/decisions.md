# UI audit: decisions

The owner answered the open questions in `questions.md`. What was done, one commit each:

1. **Wide screens**: list pages use one shared `page-col` utility (`src/app.css`): 512 px, 720 px from the `lg` breakpoint. Used by Home, History, Settings, Analytics, Start screen and the Plan list views (the calendar keeps its own 5xl width). Dialogs, sheets, full-screen editors and the toast are left alone; banners are full width already. Phones and portrait tablets are unchanged.
2. **Cut-off selects**: below 400 px wide (new `narrow:` variant) the From/To week pickers in the AI coach and direct sheets and the two "AI history" selects in Settings stack vertically. No wording change.
3. **Test result form**: `BenchmarkForm` has an `inSheet` prop; the quick-log sheet sets it so only the sheet's own title and close button show. Plan and Start screen are unchanged.
4. **Bodyweight chart**: bars start from a baseline below the window minimum (lowest bar about 28% high). Visual only; taps unchanged.
5. **Benchmark chips**: the `edgeFade` action and `edge-fade-x` style fade the clipped side of the chip rows in the Analytics test panel and the filter controls.

Kept as is: exit sheet, hour grid block heights, phase template fields, and every other "keep" recommendation.

Checked headless (Chrome, light theme, phone-p, phone-l, tablet-l, laptop): Home, quick-log bodyweight and test result, Analytics, Settings AI sharing, Plan AI coach and direct. Nothing was tried on a real phone.
