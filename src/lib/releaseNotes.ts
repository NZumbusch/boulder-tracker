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
