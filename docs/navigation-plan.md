# Navigation: from a bottom bar to a drawer and rail

Written 2026-10-14 before any code, to be argued with. Nathan's decision: "Full Samsung style everywhere" - a hamburger and a side drawer instead of the bottom bar, on every screen size. Goal he set: as few barriers as possible, quick and intuitive, modern, minimal, sleek - the nice parts of the app combined with Samsung Calendar.

## What is there today (facts)

- Six views in `ViewType`: Home, Plan, Add ("Start Session"), History, Analytics, Settings. A bottom bar (75 px, 52 px in landscape) holds Home, Plan, a round **+** (Log a workout), History, Analytics. Settings is not in it: it is a gear in Home's header, next to a help (tour) button. So Settings can't be reached from Plan, History or Analytics without going Home.
- Every screen draws its own title row (Home: phase + week; Plan: title + view switch; History, Analytics, Start Session: a plain title). Settings has its own back-arrow header for its sub-pages.
- Things anchored to the bottom bar's height: the toast (88 px up), the session bubble (91 px), the timer pill (91 px / 80 px), page bottom padding.
- Back handling (`backStack`) already closes sheets first and sends any tab to Home - a drawer registers there like any sheet.
- The tour has no step on the bottom bar (its targets are on the screens), so it needs no change except one line of copy.
- `navLabels` ("Icons only / Icons + labels") is a synced setting for the bar.

## What he wants it to feel like

From his Samsung Calendar screenshots: one calm screen, no chrome beyond a slim top bar (menu, title, a couple of actions); a drawer for everything else; on a tablet a slim icon rail with the same menu button; a floating round + for the main action; nothing boxed in.

## Honest note on the trade-off (so it is a decision, not a surprise)

A drawer makes each switch between sections one tap longer than a bottom bar (menu, then destination). On a phone held in one hand that is the cost of cleaner screens. The plan below recovers it with: a context-aware floating **+** (the most frequent action, one tap from anywhere), "Resume" for a running session at the top of the drawer, Home cards that jump to Plan / History / Analytics, and the drawer opening with a swipe from the left *within the top bar*. Because it is a taste call, **the bottom bar stays available as a setting** (Settings -> App & display -> Navigation: Drawer / Bottom bar). Drawer is the default for new and existing installs, as asked.

## Design

### Anatomy (phone, portrait)

```
┌────────────────────────────┐
│ ☰   Plan              ✦  + │  top bar: 52 px, no border at rest
│                            │  (a hairline appears once content scrolls under it)
│        …the screen…        │
│                       ┌──┐ │
│                       │ +│ │  floating action: 56 px, 16 px from the corner
│                       └──┘ │
└────────────────────────────┘
```

- **Top bar** (one component, `AppBar`, first child of every screen; plain page content that scrolls away, no longer sticky): hamburger left, title (+ optional one-line subtitle, e.g. Home's "Week 4 of 4") next to it, actions right (Home: quick log; Plan: the grid/calendar switch and the AI coach; Analytics/History: their own). On a nested page (Settings sub-page, a full-screen editor) the hamburger becomes a back arrow - Android's rule. Always the same height, so nothing jumps between screens (the lesson from the calendar header).
- **Drawer** (a left panel, 84 % of the width, max 320 px; scrim; slides in 200 ms, instant with reduced motion):
  - top: the running session, if any - "Session running · 23:41 · Resume" (a one-tap way back);
  - destinations, 48 px rows, the current one a soft pill: **Home, Plan, Log a workout, History, Analytics**;
  - a quiet divider, then **Settings, Take the tour, What's new**, and - only when relevant - "Back up now" (when a backup is overdue), sync status ("Synced 2 min ago" / "Sync needs attention"), "Exit example data";
  - bottom: app version.
  - Opens from the hamburger; closes on a scrim tap, on choosing a destination, with Android back (it is a `backStack` entry) or Escape. Focus moves into it and returns to the hamburger. No swipe from the screen's very edge: on Android 10+ gesture navigation that edge belongs to the system back gesture and the two would fight.
- **Floating +**: the round button from the old bar, now bottom-right. Context-aware, so it is always the thing you most likely want: Home, History, Analytics -> Log a workout. Plan -> add a session on the selected day (what Samsung's + does in a calendar; the header + in the calendar goes, since two pluses would compete). Hidden on the Log screen, in Settings, in editors, and while a session is running (the session bubble takes the corner). Long-press is left free for later (quick timer).
- **Colour and shape**: surfaces as today (no new palette). Active destination `bg-primary/12 text-primary`; the + keeps the app's success/primary accent. No borders anywhere in the chrome; the drawer is separated from the screen by the scrim and a soft shadow only.

### Wide screens (tablet, laptop) and landscape phone

- A persistent **icon rail** on the left (64 px): hamburger at the top, the five destinations as icons (labels optional - the old "icons + labels" setting now applies here), Settings at the bottom. The hamburger expands the full drawer over the content (as on Samsung's tablet). Breakpoint: width >= 768 px, or landscape on a phone (`short`) - there a rail also gives the 52 px the bottom bar took back to the content.
- The top bar loses its hamburger there (the rail has it). The floating + stays bottom-right.
- Content width: Plan's calendar already goes wide. Home, History and Analytics stay a readable column (~640 px) centred - their wide-screen layouts (two columns of cards) are a separate piece of work, listed under "Later".

### Overlays that sat above the bottom bar

Toast, session bubble, timer pill (and the docked timer) were positioned relative to the bar. They move to a shared rule: bottom 16 px, and 88 px higher on the right while the floating + is visible, so they never cover each other. The toast is centred and stops short of the + (padding on the right).

## Code structure

- `lib/navigation/navItems.ts` - the single list of destinations and secondary items (id, label, icon, view or action, when it shows). The drawer, the rail and the old bar all read it. Pure and tested.
- `lib/navigation/layoutMode.svelte.ts` - `compact | wide` from `matchMedia` (width >= 768 or max-height 500 with landscape), reactive.
- `lib/stores/preferencesStore`: `navStyle` ('drawer' | 'bar', default 'drawer'), `navRailExpanded` is session state only. Both **device-local, not synced** (a phone and a tablet want different things). `navLabels` stays, now for the rail. Migration: absent -> defaults; nothing to convert.
- `components/nav/`: `AppBar.svelte`, `NavDrawer.svelte`, `NavRail.svelte`, `Fab.svelte`; `App.svelte` chooses the shell (bar or drawer/rail) and keeps the live-session mounts as they are.
- Each screen swaps its own title row for `<AppBar>`; screen-specific actions go in its `actions` snippet. In 'bar' style the AppBar simply has no hamburger, so the two styles share every screen.
- Overlays take their offset from one CSS variable set by the shell (`--bottom-chrome`), so 'bar' and drawer styles both work.
- Back: the drawer registers with `backWhile`; the existing rules (tab -> Home) are unchanged.

## Stages (each leaves the app working; tests first for the logic, headless screenshots at four sizes and two themes for the rest)

| # | Stage | Notes |
| --- | --- | --- |
| N1 | `navItems`, `layoutMode`, `navStyle` preference + Settings row (default stays the bar for now) | pure logic, tested |
| N2 | `AppBar`, `NavDrawer`, `NavRail`, `Fab`; shell switch in `App.svelte`; overlays on `--bottom-chrome` | behind the setting |
| N3 | Screens on `AppBar`: Home (gear/help leave it), Plan (header + removed in the calendar, grid/calendar switch and AI coach into the bar), History, Analytics, Start Session, Settings (back arrow on sub-pages) | one commit per screen |
| N4 | Flip the default to Drawer; tour copy; QA rows; release note | the commit that changes what everyone sees |
| N5 | Polish: motion, focus handling, wide-screen card layouts | later, optional |

## Tests and checks

- Unit: `navItems` (what shows when: backup nag, sync state, session running, example data), layout mode thresholds, preference defaults.
- Headless Chrome (CDP) on the real backup: open and close the drawer by tap, scrim, Escape and back; every destination reachable in <= 2 taps; FAB visible/hidden per screen and never over the session bubble; rail at 820 and 1366 px and in landscape; touch targets >= 44 px; no horizontal scroll; no layout shift of the top bar between screens; light and dark.
- Not verifiable here: real Android back key / gesture navigation, haptics, a real phone's safe areas. These go into QA section 13.

## Decisions to make (asked of Nathan)

1. Keep the bottom bar as an optional setting? (Plan: yes, drawer is the default.)
2. What the floating + does on Plan. (Plan: add a session on the selected day; Log a workout is one drawer tap away. The alternative is Log everywhere and keeping the calendar's header +.)

## Later (not in this change)

- Wide-screen layouts for Home / History / Analytics (two columns of cards, master-detail like Samsung Calendar's Day + event pane).
- A search entry in the bar (sessions, exercises, results).
- Long-press on the + for a speed dial (quick timer, log as planned).

## Progress (2026-10-14)

Decided with Nathan: bottom bar kept as a per-device setting (drawer is the default); the floating + adds a session on the selected day on Plan.

Built and checked in headless Chrome (phone, landscape phone, tablet, laptop; light and dark; the real backup):
- N1: `lib/navigation/navItems.ts` (destinations, drawer rows, what the + does where), `layoutMode.svelte.ts` (compact / wide), `navStyle` preference ('drawer' | 'bar', device-local, default drawer) with a Settings row (+ the old labels switch now covers the rail too).
- N2: `components/nav/AppBar|NavDrawer|NavRail|Fab`; the shell in `App.svelte`; toast, session bubble and timer pills now sit on `--chrome-b` (bottom bar height, 0 with the drawer) and `--fab-b` (the + footprint).
- N3: Home, Plan, History, Analytics, Log, Settings on `AppBar` (Home's gear and help live in the drawer; with the bottom bar chosen they stay in Home's bar; Plan's paging arrows moved to the legend row; the calendar's header + shows only with the bottom bar).
- N4: drawer is the default; QA section 13, release note.
- Found on the way: `lib/ui/dialogLayer` already treats any `fixed inset-0 z-[100+]` overlay as a dialog (page behind inert, focus in, Escape closes) - the drawer gets that for free, so it has no focus trap of its own; focus returns to the menu button after the dialog layer has caught up (40 ms).
- Back: the drawer is a `backWhile` entry; back closes it, then the old rules apply (tested: back from Plan goes Home).
- Not verified: the real Android back key and gesture navigation, haptics, real safe areas.
- Honest cost, as predicted: one more tap per switch between screens on a phone; the + and the "Resume session" row are the compensation. A FAB can cover a button at the right edge while scrolling (Home's Start buttons); judged acceptable, easy to tune (size, hide on Home).
