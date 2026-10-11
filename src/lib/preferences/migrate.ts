/**
 * Device-local UI preferences (text scale, motion, and - going forward -
 * anything else purely cosmetic/device-specific). Deliberately outside
 * `TrainingData`: these are not athlete data, and
 * routing them through the `TrainingData` migration chain would mean a
 * schema field + migration step + `DATA_EXPORT_VERSION` bump for every new
 * toggle, against the highest-blast-radius part of the app.
 *
 * `theme` and `notificationsEnabled` are included in this shape for forward
 * compatibility (a future stage can move their live ownership here without
 * another shape change) but are NOT yet live-managed by this module - they
 * stay on their existing standalone `localStorage` keys, owned by `UiStore`,
 * `migratePreferences` only folds their *current*
 * values in once, at first load, so a fresh `boulder_tracker_preferences`
 * blob does not silently reset a returning user's theme/notification choice
 * back to defaults. After that fold, this module never re-reads or
 * overwrites those two fields - `UiStore` remains their sole writer.
 */

import { type TimerCues, validateTimerCues } from '../timer/timerCues';
import { ANALYTICS_RANGES, DEFAULT_ANALYTICS_RANGE, type AnalyticsRange } from '../analytics/range';
import { defaultHomeDetails, validateHomeDetails, type HomeDetails } from './homeDetails';
import { defaultTunables, validateTunables, type Tunables } from './tunables';
import { DEFAULT_UNITS, validateUnits, type Units } from '../units';

export const CURRENT_PREFERENCES_VERSION = 1;

export type TextScale = 'sm' | 'md' | 'lg';
export type MotionPreference = 'system' | 'full' | 'reduced';
import { DEFAULT_THEME, THEMES, type ThemePreference } from './theme';
export type { ThemePreference } from './theme';

export interface Preferences {
  version: number;
  textScale: TextScale;
  motion: MotionPreference;
  /** Forward-compat only - see module doc comment. Not live-managed here yet. */
  theme: ThemePreference;
  /** Forward-compat only - see module doc comment. Not live-managed here yet. */
  notificationsEnabled: boolean;
  /**
   * Whether the daily-metrics reminder should
   * schedule at all once notifications are otherwise enabled. Defaults to
   * `true` - it's inert until `notificationsEnabled` is also true and
   * permission is granted, so there's no separate opt-in step needed on
   * top of turning notifications on in the first place.
   */
  dailyMetricsReminderEnabled: boolean;
  /** "HH:mm", 24-hour, local time. Default 20:00. */
  dailyMetricsReminderTime: string;
  /** The evening before an undecided Plan B: "Plan A or Plan B?" (with the outdoor forecast). Inert until notifications are on. */
  planBReminderEnabled: boolean;
  /** "HH:mm", 24-hour, local time, on the evening before. Default 19:00. */
  planBReminderTime: string;
  /**
   * Weather - `null` by default, meaning the weather card
   * is off until the user sets a location.
   */
  homeLocation: WeatherLocation | null;
  /**
   * Saved outdoor spots (as many as wanted), each with its own
   * conditions on the Home Crags card. Replaces the old single `tripLocation`, which
   * `migratePreferences` turns into the first crag.
   */
  crags: WeatherLocation[];
  /** Bars is the default - radar is the user-requested alternate, both real. */
  fatigueChartStyle: FatigueChartStyle;
  /** The Analytics window: 4 weeks, 3 or 6 months (a week per column), or a year (a month per column) - see `lib/analytics/range.ts`. */
  analyticsRange: AnalyticsRange;
  /**
   * Timer behaviour toggles - defaults: vibrate/beep on, keep-awake off. Independently togglable, not
   * one master "sound on" switch - a user might want the haptic without
   * the beep, e.g.
   */
  timerVibrateEnabled: boolean;
  timerBeepEnabled: boolean;
  timerKeepAwakeEnabled: boolean;
  /** Alert when a rest or countdown ends while the app is in the background (a scheduled notification). */
  timerBackgroundAlerts: boolean;
  /** Beep the last three seconds of a countdown, rest or interval phase (3-2-1). */
  timerCountdownTicks: boolean;
  /** A heads-up 15 seconds before a countdown or rest ends - on screen and, in the background, as a notification. */
  timerWarnBeforeEnd: boolean;
  /** The live session's floating timer is tucked away to a small button. */
  timerPillHidden: boolean;
  /** Cue loudness, whether it sets the media volume, and the spoken announcements. */
  timerCues: TimerCues;
  /** The screen stays on for the whole running session, not only while a timer runs. */
  sessionKeepAwake: boolean;
  /** Pain check-in prompts - each switchable. */
  painCheckIns: PainCheckInPrefs;
  /** Short vibrations on finishing an exercise, a session, swipes and long-presses (native app). */
  hapticsEnabled: boolean;
  /** Android: an ongoing notification while a session runs (its clock, progress, pause). */
  sessionNotification: boolean;
  /**
   * Home section visibility + order. The array's order *is* the display order: an
   * entry earlier in the array renders above one later in it. Every known
   * section id must appear exactly once - `migratePreferences` repairs a
   * corrupt/partial list back to this invariant rather than letting a
   * section silently disappear or duplicate.
   */
  homeSections: HomeSectionPreference[];
  /** Order + visibility of the Analytics cards. */
  analyticsSections: OrderedToggle<AnalyticsSectionId>[];
  /** Order + visibility of the quick-log actions. */
  quickLogActions: OrderedToggle<QuickLogActionId>[];
  /**
   * Per-part toggles inside each Home card (Appearance -> Home sections,
   * expanded row). Keyed by the ids in `homeDetails.ts`'s registry, which
   * owns the defaults; always holds every registered id after migration.
   */
  homeDetails: HomeDetails;
  /** Whether History's sends-by-grade chart prints each bar's count above it (it always shows on tap/hover). */
  sendsChartCounts: boolean;
  /** Analytics recovery chart: HRV/sleep/RHR overlaid as % vs baseline, or as three lanes in their own units. */
  recoveryChartMode: RecoveryChartMode;
  /** Analytics categories counted as finger load; null = guessed from the category names (see `proMetrics.ts`). */
  fingerCategoryIds: string[] | null;
  /** Weight benchmarks whose value already includes bodyweight (a total, not added weight) - for relative strength. */
  benchmarkTotalTypeIds: string[];
  /** Adjustable thresholds and windows - see `tunables.ts`, which owns ids, ranges and defaults. */
  tunables: Tunables;
  /** Display units - storage is always °C / kg / km/h / Font (see `lib/units.ts`). */
  units: Units;
  /**
   * What gets included in an AI prompt's condensed training profile - independent of whether the AI *has*
   * enough context, since sending health-adjacent personal data to an
   * external AI service the user pastes this into is its own privacy
   * decision. A category the user hasn't opted into is simply omitted from
   * the generated prompt (`src/lib/ai/context.ts`), never sent-but-redacted.
   */
  aiSharing: AISharingPreferences;
  /** How much training history AI prompts carry by default - see `AIHistoryWindow`. */
  aiHistory: AIHistoryWindow;
  /** Android: write a backup to Documents/BoulderTracker once a week (`lib/storage/autoBackup.ts`). */
  autoBackup: boolean;
  /**
   * What `prescribed` an exercise added *during* a live session gets.
   *
   * "none" (the default) leaves it unset, so the exercise reads as an
   * unplanned extra: it is excluded from the session's planned load
   * (`workoutPlannedLoad`) and its work lands on top of the plan rather
   * than inside it, which is the honest account of something that was
   * never in the plan. "mirror" copies what was logged into `prescribed`
   * as well, so the addition counts as planned and the session still
   * reports full adherence.
   *
   * Only ever consulted for exercises added mid-session - an exercise
   * added while *planning* is prescribed by definition.
   */
  addedExerciseTarget: AddedExerciseTarget;
  /** Text under the bottom-nav icons. Off by default (the icon-only look); both are real options. */
  navLabels: boolean;
  /** The (?) buttons next to terms like load, ACWR and phases. On by default. */
  helpButtons: boolean;
  /** Home-screen widgets (Android) show the readiness score. Off hides the number - the ring stays empty - for those who'd rather not have it on the home screen. */
  widgetShowReadiness: boolean;
  /** What the readiness widget shows under the ring when it is stretched tall: nothing (the clean look), the factors behind the score, or today's logged numbers. */
  widgetReadinessDetail: WidgetReadinessDetail;
  /**
   * The welcome screens (level, units, location, install) have been seen.
   * False only on a fresh install: a blob saved before this key existed is
   * a returning user, who never needs welcoming.
   */
  welcomeDone: boolean;
  /** Home hides cards that are empty shells until there is data (`lib/home/newUser.ts`). */
  simpleHome: boolean;
}

/** See `Preferences.addedExerciseTarget`. */
export type WidgetReadinessDetail = 'none' | 'factors' | 'metrics';
export const WIDGET_READINESS_DETAILS: WidgetReadinessDetail[] = ['none', 'factors', 'metrics'];

export type AddedExerciseTarget = 'none' | 'mirror';

/**
 * One toggle per data category `src/lib/ai/context.ts` can add to a prompt.
 * Training Blocks/Competitions are plan-structure data already adjacent to
 * what's shared today (phases, benchmarks) - default **on**. Readiness &
 * Daily Metrics/Pain Logs are health data in a stricter sense - default
 * **off**, opt-in, so a user who never opens the new settings section gets
 * the same AI-sharing footprint as before these toggles existed. Outdoor Ascents is
 * borderline (performance data, not health data) - default **on**.
 */
export interface AISharingPreferences {
  trainingBlocks: boolean;
  competitions: boolean;
  readinessMetrics: boolean;
  painLogs: boolean;
  outdoorAscents: boolean;
  /**
   * Block and week notes. Default **on**, unlike the health categories: they
   * are the user's own words written partly *for* the coach ("travelling
   * Thu-Sun"), and a plan that ignores them is the worse outcome. Still a
   * toggle, since a note can mention an injury.
   */
  notes: boolean;
  /**
   * About me, the standing goal and the coach notes (`lib/ai/coachNotes.ts`).
   * Default on: written for the coach. Optional, as older saved
   * preferences don't have it (read as on).
   */
  coachNotes?: boolean;
  /**
   * "How it went" on past sessions (`Workout.logNotes`). Default on: the
   * athlete's own account of what happened is what a coach most needs.
   * Optional - older saved preferences read as on.
   */
  sessionNotes?: boolean;
  /**
   * The plan-side note (`Workout.description`) of sessions already done.
   * Default **off**: it is the intent written beforehand, usually stale
   * once the session is logged. Optional - older saved preferences read as off.
   */
  planNotesInHistory?: boolean;
}

/**
 * How far back an AI prompt looks (`src/lib/ai/context.ts`): completed
 * sessions from the last `fullWeeks` weeks go in full, and the
 * `summaryWeeks` weeks before those as one line each (sessions, minutes
 * per category, load, average ratings). The whole history costs about
 * what 20 sessions used to, and reaches back months instead of ~3 weeks.
 * The AI Coach can change both per request; these are the defaults.
 */
export interface AIHistoryWindow {
  fullWeeks: number;
  summaryWeeks: number;
}
export const AI_HISTORY_FULL_WEEK_OPTIONS = [1, 2, 3, 4, 6, 8] as const;
export const AI_HISTORY_SUMMARY_WEEK_OPTIONS = [0, 4, 8, 12, 16, 26] as const;
export const DEFAULT_AI_HISTORY: AIHistoryWindow = { fullWeeks: 2, summaryWeeks: 8 };

/** Every togglable/reorderable Home section below the always-shown header, in the plan's own fixed default order. */
export const HOME_SECTION_IDS = [
  'checklist',
  'readiness',
  'alerts',
  'today',
  'metrics',
  'fatigue',
  'thisWeek',
  'weekRecap',
  'trainingBlock',
  'competition',
  'progress',
  'recentActivity',
  'weather',
  'crags',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export interface HomeSectionPreference {
  id: HomeSectionId;
  visible: boolean;
}

/** Analytics cards that can be shown, hidden and reordered (Settings -> History & Analytics). */
export const ANALYTICS_SECTION_IDS = ['load', 'strain', 'fingerLoad', 'mix', 'fatigue', 'heatmap', 'recoveryTrend', 'pain', 'outdoor', 'benchmarks', 'benchmarkOverview'] as const;
export type AnalyticsSectionId = (typeof ANALYTICS_SECTION_IDS)[number];

/** The actions in Home's "+" quick-log sheet (Settings -> Home). */
export const QUICK_LOG_ACTION_IDS = ['pain', 'bodyweight', 'send', 'benchmark'] as const;
export type QuickLogActionId = (typeof QUICK_LOG_ACTION_IDS)[number];

/** One entry of a user-ordered, individually hideable list. */
export interface OrderedToggle<Id extends string> {
  id: Id;
  visible: boolean;
}

export type FatigueChartStyle = 'bars' | 'radar';

/** Re-exported from the analytics helper that owns the per-density widths, so there is one definition of the set. */
export type { AnalyticsRange } from '../analytics/range';

export const DEFAULT_DAILY_METRICS_REMINDER_TIME = '20:00';

/** A resolved lat/lon plus a display label - either geocoded from a city name or entered directly - raw lat/lon must work with no geocoding call. */
export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

/** Values a fresh install (or an unreadable/corrupt blob) starts from. */
export function defaultPreferences(): Preferences {
  return {
    version: CURRENT_PREFERENCES_VERSION,
    textScale: 'md',
    motion: 'system',
    theme: DEFAULT_THEME,
    notificationsEnabled: false,
    dailyMetricsReminderEnabled: true,
    dailyMetricsReminderTime: DEFAULT_DAILY_METRICS_REMINDER_TIME,
    planBReminderEnabled: true,
    planBReminderTime: '19:00',
    homeLocation: null,
    crags: [],
    fatigueChartStyle: 'bars',
    analyticsRange: DEFAULT_ANALYTICS_RANGE,
    timerVibrateEnabled: true,
    timerBeepEnabled: true,
    timerKeepAwakeEnabled: false,
    timerBackgroundAlerts: true,
    timerCountdownTicks: true,
    timerWarnBeforeEnd: false,
    timerPillHidden: false,
    timerCues: validateTimerCues(undefined),
    sessionKeepAwake: true,
    painCheckIns: { ...DEFAULT_PAIN_CHECK_INS },
    hapticsEnabled: true,
    sessionNotification: true,
    homeSections: HOME_SECTION_IDS.map((id) => ({ id, visible: true })),
    analyticsSections: ANALYTICS_SECTION_IDS.map((id) => ({ id, visible: true })),
    quickLogActions: QUICK_LOG_ACTION_IDS.map((id) => ({ id, visible: true })),
    homeDetails: defaultHomeDetails(),
    sendsChartCounts: true,
    recoveryChartMode: 'overlay',
    fingerCategoryIds: null,
    benchmarkTotalTypeIds: [],
    tunables: defaultTunables(),
    units: { ...DEFAULT_UNITS },
    addedExerciseTarget: 'none',
    navLabels: false,
    helpButtons: true,
    widgetShowReadiness: true,
    widgetReadinessDetail: 'factors',
    welcomeDone: false,
    simpleHome: true,
    aiHistory: { ...DEFAULT_AI_HISTORY },
    autoBackup: true,
    aiSharing: {
      trainingBlocks: true,
      competitions: true,
      readinessMetrics: false,
      painLogs: false,
      outdoorAscents: true,
      notes: true,
    },
  };
}

const TEXT_SCALES: TextScale[] = ['sm', 'md', 'lg'];
const MOTION_PREFS: MotionPreference[] = ['system', 'full', 'reduced'];
const FATIGUE_CHART_STYLES: FatigueChartStyle[] = ['bars', 'radar'];
export type RecoveryChartMode = 'overlay' | 'lanes';
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}
const RECOVERY_CHART_MODES: RecoveryChartMode[] = ['overlay', 'lanes'];

/** Validates an unknown value as a `WeatherLocation`, or `null` if it isn't one - never throws, mirrors every other field's independent-defaulting discipline. */
function validateLocation(raw: unknown): WeatherLocation | null {
  if (raw === null || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== 'string' || c.name.trim() === '') return null;
  if (typeof c.latitude !== 'number' || c.latitude < -90 || c.latitude > 90) return null;
  if (typeof c.longitude !== 'number' || c.longitude < -180 || c.longitude > 180) return null;
  return { name: c.name, latitude: c.latitude, longitude: c.longitude };
}

/**
 * Repairs an unknown value into a valid `HomeSectionPreference[]`: unknown
 * ids and duplicate entries are dropped, and any known section missing
 * from the recovered list (a corrupt blob, a partial one, or one written
 * by an older app version that didn't know about a newer section) is
 * appended visible, in `HOME_SECTION_IDS`'s canonical order - so a section
 * can never silently disappear or duplicate, and this can never throw.
 */
function validateHomeSections(raw: unknown): HomeSectionPreference[] {
  return validateOrderedToggles(raw, HOME_SECTION_IDS);
}

/**
 * Repairs any user-ordered, hideable list against its known ids: unknown
 * and duplicate entries are dropped, the saved order and visibility are
 * kept, and a known id the saved list lacks (added in a newer version) is
 * inserted - visible - right after the id that precedes it by default, so
 * it lands where it belongs rather than at the bottom. Never throws.
 */
export function validateOrderedToggles<Id extends string>(raw: unknown, ids: readonly Id[]): OrderedToggle<Id>[] {
  const seen = new Set<Id>();
  const result: OrderedToggle<Id>[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const c = entry as Record<string, unknown>;
      if (typeof c.id !== 'string' || !(ids as readonly string[]).includes(c.id)) continue;
      const id = c.id as Id;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({ id, visible: typeof c.visible === 'boolean' ? c.visible : true });
    }
  }
  ids.forEach((id, canonicalIndex) => {
    if (seen.has(id)) return;
    let insertAt = 0;
    for (let i = canonicalIndex - 1; i >= 0; i--) {
      const at = result.findIndex((s) => s.id === ids[i]);
      if (at !== -1) {
        insertAt = at + 1;
        break;
      }
    }
    result.splice(insertAt, 0, { id, visible: true });
    seen.add(id);
  });
  return result;
}

/** Valid, de-duplicated (by name) crags; falls back to the legacy single trip location. */
function validateCrags(raw: unknown, legacyTrip: unknown): WeatherLocation[] {
  const source = raw === undefined ? (legacyTrip === undefined ? [] : [legacyTrip]) : raw;
  if (!Array.isArray(source)) return [];
  const result: WeatherLocation[] = [];
  for (const entry of source) {
    const location = validateLocation(entry);
    if (!location || result.some((c) => c.name === location.name)) continue;
    result.push(location);
  }
  return result;
}

/**
 * Repairs an unknown value into a valid `AISharingPreferences`: each of the
 * five fields defaults independently (this module's own established
 * discipline - see `defaultPreferences`'s own field-by-field fallback),
 * rather than one malformed field discarding every other toggle the user
 * already set.
 */
function validateAISharing(raw: unknown): AISharingPreferences {
  const defaults = defaultPreferences().aiSharing;
  if (typeof raw !== 'object' || raw === null) return defaults;
  const c = raw as Record<string, unknown>;
  return {
    trainingBlocks: typeof c.trainingBlocks === 'boolean' ? c.trainingBlocks : defaults.trainingBlocks,
    competitions: typeof c.competitions === 'boolean' ? c.competitions : defaults.competitions,
    readinessMetrics: typeof c.readinessMetrics === 'boolean' ? c.readinessMetrics : defaults.readinessMetrics,
    painLogs: typeof c.painLogs === 'boolean' ? c.painLogs : defaults.painLogs,
    outdoorAscents: typeof c.outdoorAscents === 'boolean' ? c.outdoorAscents : defaults.outdoorAscents,
    notes: typeof c.notes === 'boolean' ? c.notes : defaults.notes,
    ...(typeof c.coachNotes === 'boolean' ? { coachNotes: c.coachNotes } : {}),
    ...(typeof c.sessionNotes === 'boolean' ? { sessionNotes: c.sessionNotes } : {}),
    ...(typeof c.planNotesInHistory === 'boolean' ? { planNotesInHistory: c.planNotesInHistory } : {}),
  };
}

/** Repairs an unknown value into a valid `AIHistoryWindow`; each field falls back on its own, and only to a listed option. */
function validateAIHistory(raw: unknown): AIHistoryWindow {
  const c = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, options: readonly number[], fallback: number) =>
    typeof v === 'number' && options.includes(v) ? v : fallback;
  return {
    fullWeeks: pick(c.fullWeeks, AI_HISTORY_FULL_WEEK_OPTIONS, DEFAULT_AI_HISTORY.fullWeeks),
    summaryWeeks: pick(c.summaryWeeks, AI_HISTORY_SUMMARY_WEEK_OPTIONS, DEFAULT_AI_HISTORY.summaryWeeks),
  };
}

/** The legacy standalone values to fold in when no preferences blob exists yet. */
export interface LegacyPreferenceValues {
  theme?: ThemePreference;
  notificationsEnabled?: boolean;
}

/**
 * Pure, never throws. Unknown/corrupt/missing input returns defaults
 * (folding in `legacy` values, if given, so a returning user's theme/
 * notification choice survives this preferences key not existing yet).
 * Unknown extra keys are dropped; each known key is validated and falls
 * back to its own default independently, rather than discarding the whole
 * object over one bad field. An unrecognised `version` (including a future
 * one newer than `CURRENT_PREFERENCES_VERSION`) is treated the same as
 * missing/corrupt input - safest default when this code doesn't know what
 * that version's shape means.
 */
export function migratePreferences(raw: unknown, legacy?: LegacyPreferenceValues): Preferences {
  const defaults = defaultPreferences();
  if (legacy?.theme && THEMES.includes(legacy.theme)) defaults.theme = legacy.theme;
  if (typeof legacy?.notificationsEnabled === 'boolean') {
    defaults.notificationsEnabled = legacy.notificationsEnabled;
  }

  if (typeof raw !== 'object' || raw === null) return defaults;
  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== CURRENT_PREFERENCES_VERSION) return defaults;

  return {
    version: CURRENT_PREFERENCES_VERSION,
    textScale: TEXT_SCALES.includes(candidate.textScale as TextScale)
      ? (candidate.textScale as TextScale)
      : defaults.textScale,
    motion: MOTION_PREFS.includes(candidate.motion as MotionPreference)
      ? (candidate.motion as MotionPreference)
      : defaults.motion,
    theme: THEMES.includes(candidate.theme as ThemePreference)
      ? (candidate.theme as ThemePreference)
      : defaults.theme,
    dailyMetricsReminderEnabled: typeof candidate.dailyMetricsReminderEnabled === 'boolean'
      ? candidate.dailyMetricsReminderEnabled
      : defaults.dailyMetricsReminderEnabled,
    planBReminderEnabled: typeof candidate.planBReminderEnabled === 'boolean' ? candidate.planBReminderEnabled : defaults.planBReminderEnabled,
    planBReminderTime: typeof candidate.planBReminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.planBReminderTime)
      ? candidate.planBReminderTime
      : defaults.planBReminderTime,
    dailyMetricsReminderTime: typeof candidate.dailyMetricsReminderTime === 'string'
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.dailyMetricsReminderTime)
      ? candidate.dailyMetricsReminderTime
      : defaults.dailyMetricsReminderTime,
    notificationsEnabled: typeof candidate.notificationsEnabled === 'boolean'
      ? candidate.notificationsEnabled
      : defaults.notificationsEnabled,
    homeLocation: candidate.homeLocation === undefined ? defaults.homeLocation : validateLocation(candidate.homeLocation),
    crags: validateCrags(candidate.crags, candidate.tripLocation),
    fatigueChartStyle: FATIGUE_CHART_STYLES.includes(candidate.fatigueChartStyle as FatigueChartStyle)
      ? (candidate.fatigueChartStyle as FatigueChartStyle)
      : defaults.fatigueChartStyle,
    analyticsRange: ANALYTICS_RANGES.includes(candidate.analyticsRange as AnalyticsRange)
      ? (candidate.analyticsRange as AnalyticsRange)
      : defaults.analyticsRange,
    timerVibrateEnabled: typeof candidate.timerVibrateEnabled === 'boolean'
      ? candidate.timerVibrateEnabled
      : defaults.timerVibrateEnabled,
    timerBeepEnabled: typeof candidate.timerBeepEnabled === 'boolean'
      ? candidate.timerBeepEnabled
      : defaults.timerBeepEnabled,
    timerKeepAwakeEnabled: typeof candidate.timerKeepAwakeEnabled === 'boolean'
      ? candidate.timerKeepAwakeEnabled
      : defaults.timerKeepAwakeEnabled,
    timerBackgroundAlerts: typeof candidate.timerBackgroundAlerts === 'boolean' ? candidate.timerBackgroundAlerts : defaults.timerBackgroundAlerts,
    timerCountdownTicks: typeof candidate.timerCountdownTicks === 'boolean' ? candidate.timerCountdownTicks : defaults.timerCountdownTicks,
    timerWarnBeforeEnd: typeof candidate.timerWarnBeforeEnd === 'boolean' ? candidate.timerWarnBeforeEnd : defaults.timerWarnBeforeEnd,
    timerPillHidden: typeof candidate.timerPillHidden === 'boolean' ? candidate.timerPillHidden : defaults.timerPillHidden,
    timerCues: validateTimerCues(candidate.timerCues),
    sessionKeepAwake: typeof candidate.sessionKeepAwake === 'boolean' ? candidate.sessionKeepAwake : defaults.sessionKeepAwake,
    painCheckIns: validatePainCheckIns(candidate.painCheckIns),
    hapticsEnabled: typeof candidate.hapticsEnabled === 'boolean' ? candidate.hapticsEnabled : defaults.hapticsEnabled,
    sessionNotification: typeof candidate.sessionNotification === 'boolean' ? candidate.sessionNotification : defaults.sessionNotification,
    homeSections: candidate.homeSections === undefined ? defaults.homeSections : validateHomeSections(candidate.homeSections),
    analyticsSections: validateOrderedToggles(candidate.analyticsSections, ANALYTICS_SECTION_IDS),
    quickLogActions: validateOrderedToggles(candidate.quickLogActions, QUICK_LOG_ACTION_IDS),
    homeDetails: validateHomeDetails(candidate.homeDetails),
    sendsChartCounts: typeof candidate.sendsChartCounts === 'boolean' ? candidate.sendsChartCounts : defaults.sendsChartCounts,
    recoveryChartMode: RECOVERY_CHART_MODES.includes(candidate.recoveryChartMode as RecoveryChartMode)
      ? (candidate.recoveryChartMode as RecoveryChartMode)
      : defaults.recoveryChartMode,
    fingerCategoryIds: isStringArray(candidate.fingerCategoryIds) ? candidate.fingerCategoryIds : null,
    benchmarkTotalTypeIds: isStringArray(candidate.benchmarkTotalTypeIds) ? candidate.benchmarkTotalTypeIds : [],
    tunables: validateTunables(candidate.tunables),
    units: validateUnits(candidate.units),
    aiSharing: candidate.aiSharing === undefined ? defaults.aiSharing : validateAISharing(candidate.aiSharing),
    aiHistory: validateAIHistory(candidate.aiHistory),
    autoBackup: typeof candidate.autoBackup === 'boolean' ? candidate.autoBackup : defaults.autoBackup,
    addedExerciseTarget: candidate.addedExerciseTarget === 'mirror' || candidate.addedExerciseTarget === 'none'
      ? candidate.addedExerciseTarget
      : defaults.addedExerciseTarget,
    navLabels: typeof candidate.navLabels === 'boolean' ? candidate.navLabels : defaults.navLabels,
    helpButtons: typeof candidate.helpButtons === 'boolean' ? candidate.helpButtons : defaults.helpButtons,
    widgetShowReadiness: typeof candidate.widgetShowReadiness === 'boolean' ? candidate.widgetShowReadiness : defaults.widgetShowReadiness,
    widgetReadinessDetail: WIDGET_READINESS_DETAILS.includes(candidate.widgetReadinessDetail as WidgetReadinessDetail) ? (candidate.widgetReadinessDetail as WidgetReadinessDetail) : defaults.widgetReadinessDetail,
    welcomeDone: typeof candidate.welcomeDone === 'boolean' ? candidate.welcomeDone : true,
    simpleHome: typeof candidate.simpleHome === 'boolean' ? candidate.simpleHome : defaults.simpleHome,
  };
}


// --- Pain check-ins ----------------------------------------------------------

export interface PainCheckInPrefs {
  /** Home asks "still there?" about open issues not checked in today. */
  home: boolean;
  /** The post-session sheet asks about open issues. */
  session: boolean;
  /** After this many days without a check-in, Home asks whether to close it. */
  staleDays: number;
  /** A notification when an open issue hasn't been checked in for `reminderDays`. */
  reminder: boolean;
  reminderDays: number;
  /** HH:MM */
  reminderTime: string;
}

export const DEFAULT_PAIN_CHECK_INS: PainCheckInPrefs = { home: true, session: true, staleDays: 10, reminder: true, reminderDays: 3, reminderTime: '19:00' };

export function validatePainCheckIns(raw: unknown): PainCheckInPrefs {
  const d = DEFAULT_PAIN_CHECK_INS;
  if (typeof raw !== 'object' || raw === null) return { ...d };
  const c = raw as Record<string, unknown>;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const days = (v: unknown, def: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 60 ? v : def);
  return {
    home: bool(c.home, d.home),
    session: bool(c.session, d.session),
    staleDays: days(c.staleDays, d.staleDays),
    reminder: bool(c.reminder, d.reminder),
    reminderDays: days(c.reminderDays, d.reminderDays),
    reminderTime: typeof c.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.reminderTime) ? c.reminderTime : d.reminderTime,
  };
}
