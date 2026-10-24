/**
 * "What's new" after an update: a short, hand-written note per change that
 * matters to the person using the app (the git changelog on the About page
 * is for developers). The sheet shows the notes newer than the last one this
 * device has seen, plus what the update needs from the athlete - computed
 * from their data (`pendingTestActions`), never a fixed to-do.
 *
 * Add a note at the TOP when a release changes how something works; its `id`
 * is what "seen" remembers, so ids only ever grow (date-based).
 */

export interface ReleaseNote {
  id: string;
  title: string;
  /** One line each: what is different, in the athlete's words. */
  points: string[];
  /** Which pending action (if any) this note's change creates - see `pendingTestActions`. */
  needs?: "tests";
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: "2026-11-04-ai-sees-more",
    title: "The AI coach sees more, in fewer words",
    points: [
      "Your sessions now reach it with their details: hang times, edges, grades, board and style, not just sets and reps. Analyze Past looks at recovery and other training of the weeks you pick.",
      "Runs and rides: import your Garmin or Strava export again to add pace, kilometre splits, your Garmin heart-rate zones, what Garmin says it trained and the rating you gave on the watch (which now also sets the effort of that activity in your load). Settings → AI & coach → What the AI sees has a switch for each, with what it costs in the prompt. History → Activities → an activity → Ask the AI about this.",
      "A Garmin import now also keeps every row of the export unchanged in the app (and in sync), without duplicates when you import again - Settings → Import activities shows what is kept and can remove it.",
      "The prompt is about a quarter shorter: tighter rules, test results and outdoor ascents as a summary, and Plan B, tests, places and coach notes explained only when they apply.",
    ],
  },
  {
    id: "2026-11-02-wearable-insights",
    title: "Your other training and recovery, put to use",
    points: [
      "Imported runs, rides and walks now count toward load, fatigue and readiness (Settings → Training model → Other training: set how much each kind counts).",
      "Analytics → Recovery has a Wellness chart (Body Battery, stress, steps, breathing, VO2max) and Best Sessions, which looks for what goes with your better sessions.",
      "Home: a short read of this morning's signals on the readiness card, other training and recovery in Week Recap, and a note when your Garmin data is getting old.",
      "The AI coach can see your sleep, HRV and other training - you choose how much under Settings → AI & coach → What the AI sees.",
    ],
  },
  {
    id: "2026-11-01-garmin-export",
    title: "Your Garmin history",
    points: [
      "Import your Garmin data export (Settings → Data & connections → Import activities): sleep, HRV, resting heart rate, steps, stress, Body Battery, VO2max and weight fill in for as far back as the export goes.",
      "Readiness, the recovery chart and the insights use them straight away. Days you typed yourself are never replaced.",
      "Garmin activities that you already imported from Strava are recognised and skipped.",
    ],
  },
  {
    id: "2026-10-31-strava-import",
    title: "Runs, rides and routes from Strava and Garmin",
    points: [
      "Settings → Data & connections → Import activities: pick your Strava archive or Garmin export (.zip), or single .fit, .gpx and .tcx files.",
      "History has an Activities tab with each one's numbers and, where there was GPS, its route.",
      "Optional real maps behind a route (street, terrain or satellite, free public map services) - off until you pick one on an activity or turn it on in Settings.",
      "Activities that match a session you logged at the same time, or the same run from another source, are skipped - you see them first. They never change your load.",
    ],
  },
  {
    id: "2026-10-30-circuit-builder",
    title: "Easier circuits",
    points: [
      "Add a circuit now starts with a search of your saved circuits, or a new one.",
      "A circuit has one amount per exercise (reps or seconds), rounds, and rests in plain words; add exercises right inside.",
      "Change a saved circuit's values before adding it, and save new ones to your circuits.",
      "Hangboard repeaters (reps × seconds on / off) and added weight can be set right in the circuit builder.",
      "Add exercise and Add circuit sit side by side.",
    ],
  },
  {
    id: "2026-10-29-status-colours",
    title: "Sessions coloured by status",
    points: [
      "In the calendar a session is blue while it is still to do, green when done, and red when it was planned for a day that has passed and not done. The check mark is gone (more room for the title). Colour by exercise category in Settings still gives type colours, with the check mark. Focus on sessions now only greys the phone's events. Sessions are brighter, phone-calendar events are all a light pastel of their calendar's colour (kept off blue, red and green hues so they never look like a session; a colour you pick yourself is used as chosen), and trips and competitions are a bright gold (the icon tells them apart).",
    ],
  },
  {
    id: "2026-10-29-grid-text",
    title: "Easier-to-read text in the hour grid (optional)",
    points: [
      "Settings > App & display > Plan calendar & day has four new switches, all off by default: whole words (no mid-word cuts, an ellipsis instead of sliced lines), event text size (the same extra size for every title), wider days (the week scrolls sideways so titles have room) and hold an event to read its whole title.",
    ],
  },
  {
    id: "2026-10-29-tour-and-screens",
    title: "Tour, help and screenshots brought up to date",
    points: [
      "The tour now covers the Phases page and the Weeks / Calendar button, and always shows the Weeks view. The help for phases, the settings search and the Welcome and website screenshots match the new look.",
    ],
  },
  {
    id: "2026-10-29-plan-handoff",
    title: "Weeks and Calendar remember where you were",
    points: [
      "Switching between Weeks and Calendar lands on the day you tapped or the session you opened, scrolls to it and flashes it briefly - not just the same week.",
    ],
  },
  {
    id: "2026-10-29-declutter",
    title: "Fewer buttons on Plan, Analytics and Phases",
    points: [
      "Plan > Weeks: the phase legend is one sideways row, and Add session is a round +. Log a past session moved to the Log a workout screen (Past session), out of the Plan and History bars.",
      "Analytics: the range switch and the back/forward arrows share one row. Phases: Edit and Move are buttons, everything else is in the menu; the help ? moved to its top bar.",
    ],
  },
  {
    id: "2026-10-29-calmer-calendar",
    title: "A calmer Plan calendar",
    points: [
      "Weeks / Calendar is now one icon in the top bar. The calendar header is the title with arrows (and a round + when you use the bottom bar), then Day / Week / Month / Year and one View button.",
      "View holds the week layout, Focus on sessions (now on by default: phone events grey, sessions coloured by type) and the list of phone calendars. Reset zoom is a small icon on the grid.",
    ],
  },
  {
    id: "2026-10-29-soft-week-grid",
    title: "A lighter look: week grid, cards, buttons, bottom bar",
    points: [
      "Cards are light raised cards with a soft shadow again (Settings > General > Raised cards turns it off; Flat sections still wins). Secondary buttons are soft outlined pills, and the bottom bar marks where you are with a small dot under the icon.",
      "The Weeks view is back to soft rounded tiles in solid phase colours: empty weeks are a faint grey, the week you picked has a soft ring and its number, this week has a dot. Settings > Views > Clear week grid brings back a number on every tile and the firm outline; the High contrast theme always uses that one.",
    ],
  },
  {
    id: "2026-10-29-phases-page",
    title: "A Phases page with a timeline",
    points: [
      "The phases button in Plan now opens a page: every phase as a bar on a timeline (Month / Quarter / Year). Tap a bar, then drag its ends to change the days or drag the bar to move it.",
      "Split a phase, move it (and everything after it) by weeks, or repeat a cycle such as three weeks load plus a deload. Each shows what it will change before you save.",
      "A new phase can be a cycle: tap 3 + 1 and it adds load and deload weeks, repeated as often as you like. Zoomed out, dragging snaps to whole weeks, and deleting a phase now offers Undo.",
      "Only days still ahead are flagged as having no phase (you can't plan the past), and a stretch can be ignored with the x. Switch knobs are centred, and cards have a firmer edge.",
      "Days with no phase and phases that run together are listed under \"Needs a look\".",
    ],
  },
  {
    id: "2026-10-29-focus-sessions",
    title: "Plan calendar: focus on sessions",
    points: [
      "In Day, Week and Month, the dumbbell button next to the layout toggle greys out every phone-calendar event at once and colours each session by its main exercise type. Tap again to go back; it is remembered.",
    ],
  },
  {
    id: "2026-10-28-settings-pages",
    title: "Settings: a page per phase, reset a page, timer split",
    points: [
      "Settings > Phases & templates: tap a phase to open it on its own page (name, colour, the sessions it starts with, Delete).",
      "Every page with settings ends with a quiet \"Reset this page to defaults\" that asks first and can be undone. Pages with your lists, places, notes, the AI key or sync have none.",
      "The timer page is two: Timer (countdown warnings, screen, background alerts, rest times) and Sound & voice (how much it speaks up, beeps, volume, spoken exercises). Search finds each setting on its page.",
    ],
  },
  {
    id: "2026-10-27-fold-cards-and-findings",
    title: "Fold Home cards, hide findings, fatigue letters back",
    points: [
      "Home: tap a card's title to fold it to its header; Home remembers which cards you folded. The Fatigue colours now match the Analytics chart.",
      "History: each session row shows its ratings as F7 A7 C6 S6 again, with a one-line legend above the list.",
      "Plan: the phase legend filters the weeks, and Settings > Plan calendar & day can add a pattern per phase (for colour blindness) and hide the Goals card under the calendar.",
      "Analytics: hide a finding you don't want (bring it back from the new top menu, which also holds the CSV export). Rolling Load can draw planned load as outlines behind the bars, on a scale of its own. Settings lists the cards by the names Analytics prints.",
    ],
  },
  {
    id: "2026-10-26-session-bar-and-one-plus",
    title: "Pause and End at your thumb, one + per screen",
    points: [
      "In a running session Pause and End are in the bar at the bottom, with Finish beside them once everything is done. Ending a circuit early says End now.",
      "One + per screen: where the floating + is, the other \"add\" buttons for the same thing are gone (the empty states point at the +).",
      "An Undo after removing an exercise keeps working after you save and close the editor, and the setup asks what you climb, your goal and how you train on one screen.",
    ],
  },
  {
    id: "2026-10-25-past-sessions-and-clock",
    title: "Log a past session, 12-hour clock, undo for check-ins",
    points: [
      "Log a session you already did: the button at the top of History and Plan asks for the day, then opens the usual editor.",
      "Plan B sessions are listed in Log a workout while the Plan B is undecided. Saving a session with nothing in it now asks first.",
      "New switches: a 12-hour clock for the calendar and session times (Settings > Plan calendar & day) and the fatigue log reminder (Settings > Reminders).",
      "Every pain check-in has an Undo, Clear week names the week in words, and after restoring a backup Settings > Sync & backup can put your previous data back.",
    ],
  },
  {
    id: "2026-10-24-wider-screens",
    title: "Roomier on big screens",
    points: [
      "On a tablet in landscape or a laptop, Home, History, Plan lists, Analytics and Settings use a wider column.",
      "On narrow phones the two week pickers (AI coach, AI settings) stack so nothing is cut off.",
      "Small tidy-ups: the test result form in Quick log has one title, bodyweight bars never shrink to a sliver, and the test chips in Analytics fade where they scroll.",
    ],
  },
  {
    id: "2026-10-23-ui-round-two",
    title: "A tidier, more readable app",
    points: [
      "Sheets, switches and buttons look and behave the same everywhere (and are at least 44 px to tap); dialogs close with Back or Escape and say why a button is disabled.",
      "Mid-workout controls are bigger, an empty session has one clear Add an exercise, and ungrouping a circuit or deleting a saved timer can be undone.",
      "Plan B is explained once with one control; every + on the Plan says what it adds; the week actions are in a labelled menu.",
      "Analytics: tap a week in the load chart for its numbers, charts can be used with the keyboard and have a data table for screen readers, and chart colours no longer mix with status colours.",
      "Settings: every page uses the same switches and choices, removals can be undone, and a backup restore shows what is in the file before it replaces your data.",
      "Home says Ready / Take care / Rest with a Why link, and the alerts separate real signals from housekeeping.",
    ],
  },
  {
    id: "2026-10-23-chips-order-and-session-card",
    title: "Calendar chips and session cards",
    points: [
      "The phone-calendar chips under the calendar's header list the calendars that are on first and the ones that are off after them.",
      "Zoomed in, a session card with its exercises as blocks now has a faint wash of its colour behind them, so it reads as one card with rounded corners instead of coloured blocks on white.",
    ],
  },
  {
    id: "2026-10-22-event-edges-setting",
    title: "Calendar edges are a setting",
    points: ["The fine edge around phone-calendar events is off by default now; Settings → Plan calendar & day → Edges on phone-calendar events brings it back, and Higher contrast always draws a firmer one."],
  },
  {
    id: "2026-10-21-ai-calendar",
    title: "The AI coach can see your calendar - if you let it",
    points: [
      "Settings → What the AI sees → Phone calendar (Android, off by default): the coach's prompt then lists the titles and times of your phone-calendar events in the weeks it plans - never where, notes or guests - so it plans around lectures, trips and late nights.",
      "The privacy policy is updated: places, the phone calendar, the direct AI connection with your own key, and what each AI sharing switch can include.",
    ],
  },
  {
    id: "2026-10-20-calendar-contrast-and-swipe",
    title: "Calendar: clearer pale blocks, and swiping that works",
    points: [
      "Phone-calendar events have a fine edge in their own colour and a stronger tint on the light theme, so they no longer dissolve into the grey ground. Settings → Plan calendar & day → Higher contrast makes sessions and events solid with a firmer edge.",
      "Swiping sideways pages the calendar from anywhere - it used to work only from empty ground, which a busy week hardly has. A slightly slanted swipe counts too. Holding a session to move it still doesn't page.",
    ],
  },
  {
    id: "2026-10-19-analytics-by-question",
    title: "Analytics, rebuilt around four questions",
    points: [
      "Four tabs: Overview (this window against the one before, what needs a look, the load chart, your training calendar), Training (mix; strain and finger load under More charts), Recovery (fatigue, the recovery chart, pain) and Progress (tests, exercises, sends).",
      "Findings moved next to the charts they point at: the few that matter most on Overview, the rest at the top of their own tab. The summary tiles show once, and the range and paging work on every tab.",
      "The load chart no longer puts two scales on one plot: weekly load as bars, the acute:chronic ratio in its own strip under it with its zones, one shared time axis.",
      "Recovery keeps the overlaid chart you know, now with a labelled Overlay / Rows switch for one row per measure; week labels thin out instead of running together.",
    ],
  },
  {
    id: "2026-10-18-calm-panels",
    title: "Calmer panels everywhere",
    points: [
      "Grouped content on Home, Analytics, History, Settings and the Plan's week card is a soft panel without borders or shadows now, and small buttons and chips are filled instead of outlined.",
      "The Plan's block grid is quieter: no box around it, smaller rounded weeks in softer colours, the current week a dot, the selected one a ring, the year written inside its first week.",
      "Home's readiness card is a plain panel too (the ring and status text keep the colour); sheets and editors - Block manager, AI coach, session and phase editors - lose their outlines.",
      "Settings → Plan calendar & day → \"Flat sections instead of panels\" drops the panels altogether: sections are separated by whitespace and a hairline, like the calendar.",
    ],
  },
  {
    id: "2026-10-18-samsung-style-calendar",
    title: "The calendar looks more like Samsung Calendar",
    points: [
      "Trips, competitions and your phone calendar's all-day and multi-day events are one bar across their days at the top, instead of a label in every day; with many, the last row says \"+N\" and opens up when tapped.",
      "Your sessions are one green. The colours belong to phases (a faint tint behind each day, with the strip) and to the phone calendar's events, which keep their calendar's colour but are turned away from the sessions' green. Settings → Plan calendar & day can bring back colouring sessions by exercise category or turn the tint off.",
      "Settings → Phone calendar: tap a calendar's dot to pick its colour. Chips under the calendar's header show or hide each phone calendar. Today's column is lightly highlighted and the hour labels are slimmer, so the days get more room.",
    ],
  },
  {
    id: "2026-10-18-top-bar-and-long-events",
    title: "The top bar scrolls with the page; long events stay in the calendar",
    points: [
      "The top bar is part of the page now: it scrolls away with the content like any heading, instead of sliding in and out. The setting for hiding it is gone.",
      "An event from your phone calendar that runs through the night or over several days no longer breaks the hour grid: the part outside the hours shown is cut off.",
    ],
  },
  {
    id: "2026-10-17-places-in-the-plan",
    title: "The AI coach can manage your places",
    points: [
      "Ask the AI coach to add a new gym (with price, opening hours and notes), change what is written about a place, rename it or remove it - it shows up as Places rows in the review, each of them tickable, and a session in the same answer can already use the new place.",
      "AI coach → Organise has a Places area to tidy names, kinds, prices, hours and notes, and to merge duplicates.",
      "Your places now live with the rest of your data: they are in backups and exports, sync through Drive, and undoing an AI change puts them back too. The ones you had set up moved over by themselves.",
    ],
  },
  {
    id: "2026-10-16-places-and-previews",
    title: "Places, session previews and event details",
    points: [
      "Tap a session in the calendar for a preview first: when, where, the note about what it is for, and its exercises. Open goes into the full session, Start begins it.",
      "Tap an event from your phone calendar for its details - when, where (with Find on map), which calendar, notes.",
      "Sessions can say where they are. Settings → Model & health → Places, weather & outdoor now holds your places (home, crags, gyms): rename them, add coordinates by search or by pasting them from a map app, and write a price, opening hours and notes. A Where chip in the session editor picks one (or any text).",
      "The AI coach knows your places (never their coordinates; switch under AI sharing) and can set a session's place by name. The weather still follows your home and crags.",
      "The week in Plan can be hour columns or a list on a phone too: two small icons next to the day/week/month/year switch.",
    ],
  },
  {
    id: "2026-10-15-bar-and-calendar",
    title: "Bottom bar on the phone, a calmer top bar, a roomier calendar",
    points: [
      "Navigation is automatic now: the bottom bar on a phone held upright, the side drawer and rail on a tablet, a laptop or a phone on its side. Settings → App & display → Look & feel can pin either one.",
      "The top bar slides away while you scroll down and comes back when you scroll up (it can be set to stay), and nothing draws over it any more - the year labels in the block planner no longer sit on top of it.",
      "Plan's week list puts your phone calendar's events and your sessions in the order of the day; the block planner button is in the calendar views too.",
      "Sessions in the calendar are bigger and rounder: roomier blocks, softer exercise pills, and a plain list with colour dots as an option (Settings → App & display → Plan calendar & day).",
    ],
  },
  {
    id: "2026-10-15-live-session-fixes",
    title: "Live sessions: circuits, weights and the notification",
    points: [
      "Skipping an exercise inside a circuit now asks: just that exercise (the circuit runs without it) or the whole circuit. Settings → Sessions & timer can turn the question off.",
      "Stopping a session while a circuit runs saves the sets it recorded and stops its timer (before, the timer carried on and the sets were lost). Start circuit is never greyed out silently any more: a timer that was never started makes way, one under way asks.",
      "A planned weight (the coach's \"+12.5 kg\" on hangs) can be changed when you log, in a circuit's set details too; \"Add weight\" puts one on an exercise that had none.",
      "Chin tucks and other timed holds say \"Hold 6/8\", hangs keep \"Hang\".",
      "The timer notification has Done and Skip buttons for the set that is on.",
      "The round + hides while you scroll down and returns when you scroll up; Plan's week view is a list on a phone held upright (Settings can switch it back); small buttons are easier to hit.",
    ],
  },
  {
    id: "2026-10-14-navigation",
    title: "A menu instead of a bottom bar",
    points: [
      "The bottom bar is gone: a menu button (top left) opens a side drawer with every screen, Settings and the tour. On a tablet, a laptop or a phone on its side a slim rail stays on the left instead.",
      "A round + floats at the bottom right: it logs a workout from Home, History and Analytics, and adds a session on the selected day in Plan. Settings is now one tap away from every screen.",
      "Every screen has the same slim top bar with its title and its own buttons.",
      "Prefer the old bottom bar? Settings → App & display → Navigation. It is a per-device choice.",
    ],
  },
  {
    id: "2026-10-14-phase-days",
    title: "Phases are ranges of days",
    points: [
      "A phase can start or end on any day, not only a Monday: a week can hold two phases. The block view splits the week's cell in two colours and the week card names both with their days.",
      "Sessions from a phase are saved one by one, only when you log, change, move or delete one. The others keep following the phase, so changing Monday no longer freezes Thursday. A session you delete stays deleted. The week's Lock In and \"not saved yet\" are gone.",
      "The AI coach can set a phase for exact days too (\"fromDate\" / \"toDate\"), not only whole weeks; it only changes the phase, so sessions you changed stay.",
      "Days that have passed keep what was planned, so changing a phase later never rewrites history.",
      "Tap a phase on the week card (or the colour strip in the calendar) to open the Block manager on that day: start another phase from there, or edit a block's first and last day - it tells you what that does to its neighbours.",
      "New in the calendar: a thin colour strip for the phase on each day (Settings → App & display; one line per phase in Month and Year), your trips and competitions as bars across their days, sessions you can move by holding and dragging them to another day or time, and a calendar that looks like a calendar app: flat, each session coloured by its main training category, pinch to zoom the hours (zoomed in, a long session shows each exercise as its own coloured block).",
    ],
  },
  {
    id: "2026-10-13-tests",
    title: "Tests: look at your results any way you like",
    needs: "tests",
    points: [
      "Every value of a test is kept, and nothing is split into separate series any more: pull-ups at 0, 5 and 10 kg are one test.",
      "Test progress → Adjust: plot any value over time or against another (reps against weight), keep only some results (no added weight, 10 kg or more, one edge), draw a line per weight or edge, and show the best or average per week or month - or the best at each weight, your strength curve.",
      "Save a view with the test and show it on Home. Tests that used to have a row per edge or load keep those rows as views, so Home reads as before.",
      "Planning a test can set any value beforehand: reps 1 to find the heaviest single, or a weight to find the reps. The AI can schedule the same.",
      "In a test's fields, \"Condition\" is now called \"Set-up\": it starts from last time and decides what \"Like your latest\" compares.",
    ],
  },
  {
    id: "2026-10-12-timer",
    title: "One timer for everything",
    points: [
      "Intervals, sets and the free-bouldering pacer all run on the circuit timer. Open it from Add → Timer or the Timer card on Home; save any run you set up as a preset.",
      "The pacer counts problems, can be paused, reset and changed on the fly, and what you did is logged against the plan.",
      "A get-ready lead-in per exercise, and the next exercise's timer opens after you log one (both can be turned off in Settings → Timer, sound & voice).",
      "Background alerts keep working with the screen off, with a fallback to scheduled notifications.",
    ],
  },
  {
    id: "2026-10-12-bodyweight",
    title: "Bodyweight is a daily reading, not a test",
    needs: "tests",
    points: [
      "Weigh-ins are logged under Metrics on Home; the AI no longer schedules a weigh-in test.",
      "Past weigh-in tests can be moved over to bodyweight readings in one tap (nothing is deleted, and Undo is offered).",
    ],
  },
  {
    id: "2026-10-12-load",
    title: "Fatigue adds up more realistically",
    points: [
      "Two medium sessions no longer add up to \"complete\": fatigue stacks by the capacity you have left. The old plain sum is a setting (Settings → Training model).",
      "Volume 0% now means mute, the header bar has more room, and a bodyweight logged in a workout reaches Home.",
    ],
  },
];

const SEEN_KEY = "boulder_tracker_release_notes_seen";
/** Set (to what was carried over) once a device has turned its old per-way test rows into views. */
export const TEST_VIEWS_ADOPTED_KEY = "boulder_tracker_test_views_adopted";

export const newestNoteId = (notes: readonly ReleaseNote[] = RELEASE_NOTES): string | null => notes[0]?.id ?? null;

export function readSeenNote(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** Remembers that the notes up to the newest have been seen on this device. */
export function markNotesSeen(notes: readonly ReleaseNote[] = RELEASE_NOTES): void {
  const id = newestNoteId(notes);
  if (!id) return;
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    /* the sheet may show again next time */
  }
}

/** The notes newer than the last one seen, newest first; everything when none was seen yet (an install from before this existed). */
export function unseenNotes(seen: string | null, notes: readonly ReleaseNote[] = RELEASE_NOTES): ReleaseNote[] {
  if (seen === null) return [...notes];
  const at = notes.findIndex((n) => n.id === seen);
  return at === -1 ? [...notes] : notes.slice(0, at);
}

/** Test views carried over on this device: what the "what's new" sheet says was kept. */
export function readAdoptedViews(): { name: string; views: string[] }[] {
  try {
    const raw = localStorage.getItem(TEST_VIEWS_ADOPTED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((a) => a && typeof a.name === "string" && Array.isArray(a.views)) : [];
  } catch {
    return [];
  }
}
