# Package G: chrome, common widgets, navigation, tokens, onboarding, tour

## Shared additions (other packages may use these now)

| Name | What it is for |
| --- | --- |
| `text-content-faint` (token `--color-content-faint`) | The quietest text that still passes 4.5:1 on a plain surface or the page background. Use it instead of `text-content-subtle/60` or `/70`. Not for text on tinted panels. Tested in `src/lib/ui/tokens.test.ts`. |
| `text-micro` (`--typescale-micro`) | 11 px text that follows the Text size setting, for chart axes, badges and small labels. Replaces `text-[9px]` and `text-[10px]`. |
| `src/lib/ui/typeFloor.test.ts` | Lists the files that still use `text-[9px]`/`text-[10px]` as an allowlist. When you convert a file, delete its line from `ALLOWED` (the test fails if an allowed file is already clean). |
| `.tile` | A tight stat tile (`p-3`) that flattens with the "flat sections" setting like `.card` (transparent, hairline border). For summary strips and metric grids. |
| `.pressable` | A pressed state for rows/buttons on touch (`active:bg-surface-elevated/50`). |

Also new: glossary terms `planB`, `rhr`, `rampRate`, `tokens`, `readiness` (use `<InfoButton term="...">`); `Sheet` now carries `role="dialog"` and an `aria-label` itself.

Looked at on screen (phone light/dark, landscape, laptop): bar-mode Settings button, sticky nested bar, rail labels, welcome intro and platforms step, tour card, What's new sheet. Not looked at: update card (Android only), FatigueModal restyle, NoteSheet confirm, slow-load notice, skip link, announcements.

## Findings

| finding id | state | what changed or why not |
| --- | --- | --- |
| Toast 1, 2, 3, 5, 6, 7 | fixed (round 1, checked) | wraps, 44 px Undo, 8 s, pause, queue, live region, z-190 above Welcome |
| Toast 4 (scopedUndo dies with the editor) | skipped: needs decision | the restore writes into the editor's draft, which is gone; a store-level undo needs each caller changed |
| Toast 8 | partly | safe-area side padding added; no swipe or dismiss button |
| Sheet chrome 9, 10, 11, 13, 14 (common files) | fixed | all use `Sheet` (44 px close, dvh, drag, Back); static dialog role and name added; Escape is the dialog layer's (not an issue) |
| Sheet chrome 12 | skipped: outside my files | settings editors (package F): use `Sheet dirty` |
| Sheet chrome 15 | fixed | with pending "Needs a look" actions a scrim tap, drag or Back no longer counts as seen |
| Sheet chrome 16 | not an issue | notes are body size; the jargon line reads plainly |
| Sheet chrome 17 | fixed | copy says the latest changes are also under About |
| Sheet chrome 18, 19 | not an issue | already fixed in round 1 (no autofocus; "Change it" link) |
| RangeSlider 20, ListRow 21, NavRow 23, InfoButton 24, banners 25, 26 | fixed (round 1, checked); banner now uses the shared copy-link helper | |
| ListRow 22 (long-press has no visible cue) | skipped: needs decision | kebab button in every row, or a one-time hint |
| Nav 27-31, 34-37 | fixed (round 1, checked) | aria-label and aria-current, Settings and sync dot in the bar, one accent, 11 px labels, tour guard, no glows, drawer close and heading |
| Nav 32 | fixed | AppBar is sticky on nested pages |
| Nav 33 | fixed | drawer left safe area added; shell, FAB, toast already had it |
| Nav 38 | fixed | skip link, spoken screen name on change, scroll bar kept on wide screens |
| Nav 39 | fixed (round 1) | retry on failed chunk |
| Nav 40 | fixed | after 12 s a notice with Reload |
| Nav 41 | partly | spoken in quarters with aria-atomic; no cancel or focus trap |
| Tokens 42, 43, 44, 45, 46, 48 | fixed (round 1, checked) | field token, caution text, contrast lines, focus ring, 16 px fields, dvh |
| Tokens 47 | partly | chip 36 px and seg 40 px kept (meets WCAG 2.2 AA); 44 px would change every screen |
| Update 136 | fixed | hash behind Details, changes wrap, progress label, error role alert |
| Update 137 | fixed | jargon removed, "switching never installs an older version" line; shared Segmented and Toggle |
| Tour 139 | fixed | Enter on a focused button is that button's; focus moves to Next |
| Tour 140 | fixed | 44 px buttons, safe-area clamp, note when a target is not on screen |
| Onboarding 141 | partly | units preselected (round 1); merging focus and level or moving the platform table: needs decision |
| Onboarding 142, 143, 145, 147 | fixed (round 1, checked); RadioCards binding made reactive | |
| Onboarding 144 | partly | header cell labelled; table reflows at phone width (checked at 400 px) |
| Onboarding 146 | fixed | 32 px dot targets, motion-aware scrolling, image sizes, better alt |
| V-1, V-4, V-5, V-7 | fixed (round 1, checked) | default accent is primary; no glow; one pill in bar, rail, drawer; bubble docked in the bar |
| V-2 | partly | history icon done; labels on by default is a preference default (package F) |
| V-3 | skipped: needs decision | one "+" per screen touches Plan and Home |
| V-6 | partly | rail shows labels on laptop and tablet; a landscape phone (390 px) cannot fit them, follows the setting |
| V-8 | skipped: outside my files | SessionBubble (package A) |
| V-9 | not an issue | root Settings shows the menu in drawer mode; bar mode gives a back arrow to Home on purpose |
| V-10 | fixed (round 1) | |
| V-62, V-63, V-64 | skipped: outside my files | Block manager and AI sheets (C), Settings hub (F) |
| V-65 | partly | the dark primary text token is in place; bubble outline and alert dots belong to A and D |
| V-66 | skipped: needs decision | wide layouts; rail tooltips exist as `title` |
| 1.1 #5, #8, #10, #11 | fixed / partly | #11: five new glossary terms, buttons placed by the owning packages |
| 1.2 type floor, faint token, tile, focus ring | fixed | see additions; 16 files still on the allowlist |
| Deletes without confirm in my files | fixed | NoteSheet Clear now confirms |
| FatigueModal, BenchmarkForm chrome | fixed | shared fields, buttons and scrim, dvh, test form scrolls into view (answers StartScreen's "opens below the fold") |

## Needs a decision

- Toast 4: Undo that outlives the editor (store-level undo per caller).
- ListRow 22: kebab button or hint for long-press actions.
- Onboarding 141: merge "What do you climb" and "How do you train"; move "What works where" to Help.
- V-3: one "+" per screen.
- V-66: wide layouts for Home, History, Analytics.

## Handoff

- Package F: default `navLabels` to true in `src/lib/preferences/migrate.ts` (V-2); `GeneralSettings` editors use `Sheet dirty` (Sheet chrome 12).
- Package A: SessionBubble "0/0" and "0/60 min" (V-8).
- Everyone: convert `text-[9px]`/`text-[10px]` to `text-micro`/`text-caption` and delete the file from `ALLOWED` in `src/lib/ui/typeFloor.test.ts`; replace `text-content-subtle/60|70` with `text-content-faint`; stat tiles use `.tile`.
- `public/img/intro-home.webp` shows the old Home header with the "+" and gear: regenerate (not my files).
- No icons added.
