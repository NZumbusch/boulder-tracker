/**
 * "Reset this page to defaults": which preferences and tunables each Settings page owns, and the pure function that
 * puts exactly those back. The registry here is the one place that knows it, so a page's reset can't quietly touch
 * something on another page (a test pins that), and a new setting is one line.
 *
 * Deliberately never reset from a page: data lists (exercises, circuits, phases, tests, value types, places, coach
 * notes, targets), secrets and sync state (the AI key, Drive sync, Health Connect and phone calendar), and device
 * state that is not a taste (`notificationsEnabled` is the OS permission, `welcomeDone`, `autoBackup`, the saved
 * timer runs, the folded Home cards, the hidden findings). Those pages have no reset at all.
 */
import { defaultPreferences, type Preferences } from "../preferences/migrate";
import { TUNABLES, validateTunables, type Tunables } from "../preferences/tunables";
import type { PageId } from "./tree";

type PrefKey = keyof Preferences;

/** The tunables on each page (the cards in `Settings.svelte`, `GeneralSettings` and `RemindersSettings` render these). */
export const PAGE_TUNABLES: Partial<Record<PageId, string[]>> = {
  general: ["ui.raisedCards", "ui.flatCards"],
  home: ["home.recentActivityCount", "home.progressBenchmarks"],
  planCalendar: [
    "plan.weekAgenda", "plan.weekListOnPhone", "plan.exerciseList", "plan.highContrast", "plan.eventEdges", "plan.calendarPhases",
    "plan.calendarPhaseNames", "plan.calendarPhaseTint", "plan.calendarCategoryColors", "plan.weekPatterns", "plan.weekGridClear", "plan.gridWholeWords", "plan.gridTextSize", "plan.gridWide", "plan.gridPeek", "plan.goalsInCalendar",
    "day.startHour", "ui.clock12",
  ],
  history: ["analytics.plannedOutline"],
  live: ["circuit.askSkip"],
  timer: ["timer.leadIn", "timer.setRest", "timer.openNext"],
  model: TUNABLES.filter((t) => t.topic === "model").map((t) => t.id),
  // The places page has a data list, so it has no page reset; its own card still resets these.
  weather: TUNABLES.filter((t) => t.topic === "outdoor").map((t) => t.id),
  reminders: ["alerts.fatigueReminder", "progress.retestWeeks", "alerts.backupDays", "alerts.insightNotify", "alerts.insightHour"],
};

/** The preferences on each page that has a reset. The theme is applied by the caller (it lives with the UI store). */
export const PAGE_PREFS: Partial<Record<PageId, PrefKey[]>> = {
  general: ["theme", "textScale", "motion", "navMode", "navLabels", "helpButtons"],
  units: ["units"],
  home: ["homeSections", "homeDetails", "simpleHome", "quickLogActions", "fatigueChartStyle"],
  planCalendar: [],
  history: ["analyticsSections", "sendsChartCounts", "recoveryChartMode"],
  live: ["sessionKeepAwake", "hapticsEnabled", "sessionNotification", "addedExerciseTarget"],
  timer: ["timerKeepAwakeEnabled", "timerBackgroundAlerts", "timerCountdownTicks", "timerWarnBeforeEnd"],
  sounds: ["timerBeepEnabled", "timerVibrateEnabled", "timerCues"],
  model: [],
  pain: ["painCheckIns"],
  reminders: ["dailyMetricsReminderEnabled", "dailyMetricsReminderTime", "planBReminderEnabled", "planBReminderTime"],
  aiSharing: ["aiSharing", "aiHistory"],
  widgets: ["widgetShowReadiness", "widgetReadinessDetail"],
};

/** Pages whose lists or connections are data, not preferences: no reset action. */
export const PAGES_WITHOUT_RESET: PageId[] = [
  "exercises", "circuits", "phases", "benchmarks", "values", "targets", "weather", "coach", "aiDirect", "sync", "healthConnect", "deviceCalendar", "exports", "about",
];

/** What the confirm says the reset covers. */
const PAGE_WHAT: Partial<Record<PageId, string>> = {
  general: "theme, text size, motion, navigation, help buttons and panels",
  units: "the units",
  home: "which cards show and their order, their details, the quick log actions, the fatigue chart style and the list lengths",
  planCalendar: "the calendar views and when a new day starts",
  history: "the Analytics cards, the recovery chart, the sends chart and the planned load outlines",
  live: "the live session options and the circuit skip question",
  timer: "the countdown warnings, screen and background alerts and the single-exercise timer",
  sounds: "the beeps, volume, vibration and spoken exercises",
  model: "every number of the training model",
  pain: "the pain check-in prompts",
  reminders: "the reminder times, switches and nudges (notification permission stays as it is)",
  aiSharing: "what the AI sees and how far back",
  widgets: "the readiness options on the widgets",
};

export const canResetPage = (id: PageId): boolean => id in PAGE_PREFS && !PAGES_WITHOUT_RESET.includes(id);

/** "theme, text size and ..." - what the confirm lists. */
export const pageResetWhat = (id: PageId): string => PAGE_WHAT[id] ?? "this page's settings";

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** `prefs` with only this page's preferences and tunables back at their defaults. Other pages and data are untouched. */
export function resetPage(prefs: Preferences, id: PageId): Preferences {
  if (!canResetPage(id)) return prefs;
  const defaults = defaultPreferences();
  const next: Preferences = { ...prefs };
  for (const key of PAGE_PREFS[id] ?? []) (next as unknown as Record<string, unknown>)[key] = defaults[key];
  const tunables: Tunables = { ...prefs.tunables };
  for (const tid of PAGE_TUNABLES[id] ?? []) tunables[tid] = defaults.tunables[tid];
  next.tunables = validateTunables(tunables);
  return next;
}

/** Whether everything the page's reset covers is already at its default. */
export function pageIsAtDefaults(prefs: Preferences, id: PageId): boolean {
  if (!canResetPage(id)) return true;
  const defaults = defaultPreferences();
  return (PAGE_PREFS[id] ?? []).every((k) => sameJson(prefs[k], defaults[k]))
    && (PAGE_TUNABLES[id] ?? []).every((tid) => prefs.tunables[tid] === defaults.tunables[tid]);
}
