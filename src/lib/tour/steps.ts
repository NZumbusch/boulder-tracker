import type { ViewType } from "../types";
import { DEMO_CIRCUIT_SESSION_ID } from "./demoData";

/**
 * The launch tour, in order: one list of plain data, so adding, removing
 * or rewording a stop never touches the tour's machinery.
 *
 * `target` names a `data-tour="…"` attribute on the screen `view`; the
 * overlay spotlights that element and places the text beside it. A step
 * without a target, or whose target isn't on screen (a Home card the user
 * hid), shows its text in the middle instead - so a missing anchor can
 * never break the tour, only make that one step less pointed.
 */
export interface TourStep {
  view: ViewType;
  target?: string;
  /** A demo session to show in the session viewer for this step (closed again on the next). */
  openWorkout?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    view: "home",
    title: "A quick tour",
    body: "This is an example climber's training: two months of sessions, a plan and a trip coming up. It's only for the tour - nothing here is saved, and your own data comes back when it ends.",
  },
  {
    view: "home",
    target: "home-readiness",
    title: "Readiness",
    body: "One score for how ready you are to train hard today, from recent fatigue, training load and (if you log them) sleep and HRV. Tap the ring for the breakdown.",
  },
  {
    view: "home",
    target: "home-today",
    title: "Today",
    body: "Today's planned sessions. Start one live with timers, log it as planned in one tap, or skip it.",
  },
  {
    view: "home",
    target: "home-thisWeek",
    title: "This week",
    body: "Load done so far against what's planned. The (?) buttons around the app explain terms like load and ACWR.",
  },
  {
    view: "home",
    target: "home-quicklog",
    title: "Quick log",
    body: "Log pain, bodyweight, an outdoor send or a benchmark from anywhere on Home. Every Home card can be hidden or reordered in Settings.",
  },
  {
    view: "plan",
    target: "plan-calendar",
    title: "The plan at a glance",
    body: "Every week of the year, coloured by its training phase. Tap a week to open it below.",
  },
  {
    view: "plan",
    target: "plan-phase",
    title: "Phases",
    body: "Pick a phase for the week and its typical sessions appear. You can then move, edit or add sessions for just this week.",
  },
  {
    view: "plan",
    target: "plan-sessions",
    title: "The week's sessions",
    body: "Tap a session to see it, start it or edit it. + adds one, and Arrange moves sessions between days.",
  },
  {
    view: "plan",
    target: "plan-planb",
    title: "Plan B",
    body: "For days that could go either way - outdoor if it's dry, otherwise the board. Plan B holds the other version of those days; pick one when you know, and until then the likely one counts. Make one from a session's menu or the week's ⋯ menu.",
  },
  {
    view: "plan",
    target: "workout-circuit",
    openWorkout: DEMO_CIRCUIT_SESSION_ID,
    title: "Circuits and supersets",
    body: "Exercises done in rounds: a core circuit, or antagonist work in the rests between hard sets. Each exercise is one set; the circuit sets the rounds and rests. In a session a circuit runs on its own timer - holds count down, reps get a Done button. Group exercises in the editor, or save a circuit and reuse it.",
  },
  {
    view: "plan",
    target: "plan-blocks",
    title: "Training blocks",
    body: "Plan several weeks at once: e.g. three weeks Strength, then a Deload week. The calendar above fills in from these.",
  },
  {
    view: "plan",
    target: "plan-ai",
    title: "AI coach",
    body: "Copies a prompt with your plan and history for ChatGPT, Claude or Gemini. Paste the reply back and you get a list of changes to tick through - phases, weeks, Plan Bs, circuits. Nothing is sent anywhere by the app itself.",
  },
  {
    view: "plan",
    target: "plan-goals",
    title: "Goals",
    body: "Competitions and outdoor trips you're training for, with projects for a trip. Home counts down to the next one.",
  },
  {
    view: "add",
    target: "add-start",
    title: "Start a session",
    body: "The + button in the middle starts a live session: add exercises as you go, with a stopwatch, rest timers, interval timers and a round-by-round timer for circuits.",
  },
  {
    view: "add",
    target: "add-plan",
    title: "Plan or test",
    body: "Plan a session for another day, or record a benchmark test like max pull-ups to track strength over time.",
  },
  {
    view: "history",
    target: "history-list",
    title: "History",
    body: "Every completed session, by month. Tap one to see what you did, edit it, duplicate it or share it as an image.",
  },
  {
    view: "history",
    target: "history-tabs",
    title: "Sends",
    body: "Your outdoor ascents with a grade chart. Log them one by one or import your 8a.nu export.",
  },
  {
    view: "analytics",
    target: "analytics-range",
    title: "Analytics",
    body: "Pick how far back to look. Swipe sideways to page through earlier windows.",
  },
  {
    view: "analytics",
    target: "analytics-load",
    title: "Load over time",
    body: "Weekly load against the plan, with the acute:chronic ratio that warns when you ramp up too fast. Tap a column for that week's details.",
  },
  {
    view: "analytics",
    target: "analytics-tabs",
    title: "Training, body, performance",
    body: "Fatigue, recovery and training mix under Training; sleep, HRV, bodyweight and pain under Body; benchmarks and sends under Performance.",
  },
  {
    view: "settings",
    target: "settings-customization",
    title: "Make it yours",
    body: "Exercises, saved circuits, categories and the sessions each phase starts with - including switching between the Getting started and Advanced sets.",
  },
  {
    view: "settings",
    target: "settings-coach",
    title: "Coach notes",
    body: "What the AI coach should know about you (height, injuries, goals) and a short memory it keeps between chats - AI-proposed notes are only saved once you tick them.",
  },
  {
    view: "settings",
    target: "settings-data",
    title: "Back up your data",
    body: "Everything lives only on this device. Export a backup now and then (it's one file), or turn on Google Drive sync on Android - then pull down on Home to sync.",
  },
  {
    view: "settings",
    target: "settings-connections",
    title: "Connections & exports",
    body: "Sleep, resting heart rate and weight from Health Connect (Android), your plan in your calendar, a PDF of the plan, and what the AI coach gets to see.",
  },
  {
    view: "home",
    title: "That's the tour",
    body: "Close this and your own data is back. A good start: pick a phase for this week in Plan, or tap + to log a session. You can replay the tour from Settings → About & Help.",
  },
];
