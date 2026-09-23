/**
 * Device-local UI preferences (text scale, motion, and - going forward -
 * anything else purely cosmetic/device-specific). Deliberately outside
 * `TrainingData`: see UI_PLAN.md §5.1 - these are not athlete data, and
 * routing them through the `TrainingData` migration chain would mean a
 * schema field + migration step + `DATA_EXPORT_VERSION` bump for every new
 * toggle, against the highest-blast-radius part of the app.
 *
 * `theme` and `notificationsEnabled` are included in this shape for forward
 * compatibility (a future stage can move their live ownership here without
 * another shape change) but are NOT yet live-managed by this module - they
 * stay on their existing standalone `localStorage` keys, owned by `UiStore`,
 * per UI_PLAN.md §5.1. `migratePreferences` only folds their *current*
 * values in once, at first load, so a fresh `boulder_tracker_preferences`
 * blob does not silently reset a returning user's theme/notification choice
 * back to defaults. After that fold, this module never re-reads or
 * overwrites those two fields - `UiStore` remains their sole writer.
 */

import type { ChartDensity } from '../analytics/chartWindow';
import { defaultHomeDetails, validateHomeDetails, type HomeDetails } from './homeDetails';

export const CURRENT_PREFERENCES_VERSION = 1;

export type TextScale = 'sm' | 'md' | 'lg';
export type MotionPreference = 'system' | 'full' | 'reduced';
export type ThemePreference = 'dark' | 'light' | 'contrast';

export interface Preferences {
  version: number;
  textScale: TextScale;
  motion: MotionPreference;
  /** Forward-compat only - see module doc comment. Not live-managed here yet. */
  theme: ThemePreference;
  /** Forward-compat only - see module doc comment. Not live-managed here yet. */
  notificationsEnabled: boolean;
  /**
   * Whether the daily-metrics reminder (UI_PLAN.md §5.8, Stage 8) should
   * schedule at all once notifications are otherwise enabled. Defaults to
   * `true` - it's inert until `notificationsEnabled` is also true and
   * permission is granted, so there's no separate opt-in step needed on
   * top of turning notifications on in the first place.
   */
  dailyMetricsReminderEnabled: boolean;
  /** "HH:mm", 24-hour, local time. Default 20:00 per UI_PLAN.md §10 open question 4. */
  dailyMetricsReminderTime: string;
  /**
   * Weather (UI_PLAN.md §5.5) - `null` by default, meaning the weather card
   * is off until the user sets a location.
   */
  homeLocation: WeatherLocation | null;
  /**
   * Up to `MAX_CRAGS` outdoor spots, each with its own conditions on the
   * Home Crags card. Replaces the old single `tripLocation`, which
   * `migratePreferences` turns into the first crag.
   */
  crags: WeatherLocation[];
  /** Bars is the default (UI_PLAN.md §2/§3.3) - radar is the user-requested alternate, both real. */
  fatigueChartStyle: FatigueChartStyle;
  /**
   * How much horizontal room each week gets in the Analytics charts, which
   * is what decides how many weeks a given screen shows (see
   * `src/lib/analytics/chartWindow.ts`). "auto" sizes a week so its axis
   * label fits; "compact" packs in more history and thins the axis;
   * "comfortable" shows fewer, wider weeks. Every option fits the screen -
   * this is density, not overflow.
   */
  chartDensity: ChartDensity;
  /**
   * Timer behaviour toggles (UI_PLAN.md §5.7) - defaults match §4.7's own
   * mockup (vibrate/beep on, keep-awake off). Independently togglable, not
   * one master "sound on" switch - a user might want the haptic without
   * the beep, e.g.
   */
  timerVibrateEnabled: boolean;
  timerBeepEnabled: boolean;
  timerKeepAwakeEnabled: boolean;
  /**
   * Home section visibility + order (UI_PLAN.md §4.7's "Home sections
   * show/hide + reorder"). The array's order *is* the display order: an
   * entry earlier in the array renders above one later in it. Every known
   * section id must appear exactly once - `migratePreferences` repairs a
   * corrupt/partial list back to this invariant rather than letting a
   * section silently disappear or duplicate.
   */
  homeSections: HomeSectionPreference[];
  /**
   * Per-part toggles inside each Home card (Appearance -> Home sections,
   * expanded row). Keyed by the ids in `homeDetails.ts`'s registry, which
   * owns the defaults; always holds every registered id after migration.
   */
  homeDetails: HomeDetails;
  /**
   * What gets included in an AI prompt's condensed training profile
   * (UI_PLAN.md §5.8, Stage 10) - independent of whether the AI *has*
   * enough context, since sending health-adjacent personal data to an
   * external AI service the user pastes this into is its own privacy
   * decision. A category the user hasn't opted into is simply omitted from
   * the generated prompt (`src/lib/ai/context.ts`), never sent-but-redacted.
   */
  aiSharing: AISharingPreferences;
  /**
   * Which AI plan contract "Generate Plan" asks for.
   *
   * "phase" (the default) asks for the phase map plus each phase's distinct
   * sessions, which the importer expands across the phase's weeks. "weekly"
   * asks for every week written out in full - more control over week-to-week
   * progression, but a far longer response that duplicates each session once
   * per week. The importer accepts either shape regardless of this setting;
   * it only decides what the copied prompt requests.
   */
  planFormat: PlanFormat;
  /**
   * What `prescribed` an exercise added *during* a live session gets.
   *
   * "none" (the default) leaves it unset, so the exercise reads as an
   * unplanned extra: it is excluded from the session's planned load
   * (`workoutPlannedLoad`) and its work lands on top of the plan rather
   * than inside it, which is the honest account of something that was
   * never in the plan. "mirror" copies what you logged into `prescribed`
   * as well, so the addition counts as planned and the session still
   * reports full adherence.
   *
   * Only ever consulted for exercises added mid-session - an exercise
   * added while *planning* is prescribed by definition.
   */
  addedExerciseTarget: AddedExerciseTarget;
}

export type PlanFormat = 'phase' | 'weekly';

/** See `Preferences.addedExerciseTarget`. */
export type AddedExerciseTarget = 'none' | 'mirror';

/**
 * One toggle per data category `src/lib/ai/context.ts` can add to a prompt.
 * Training Blocks/Competitions are plan-structure data already adjacent to
 * what's shared today (phases, benchmarks) - default **on**. Readiness &
 * Daily Metrics/Pain Logs are health data in a stricter sense - default
 * **off**, opt-in, so a user who never opens the new settings section gets
 * the same AI-sharing footprint as before this stage. Outdoor Ascents is
 * borderline (performance data, not health data) - default **on**. Exact
 * defaults per UI_PLAN.md §5.8's "Open question forced by this stage".
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
}

/** Every togglable/reorderable Home section below the always-shown header (UI_PLAN.md §4.2), in the plan's own fixed default order. */
export const HOME_SECTION_IDS = [
  'readiness',
  'alerts',
  'today',
  'metrics',
  'fatigue',
  'thisWeek',
  'trainingBlock',
  'competition',
  'progress',
  'recentActivity',
  'weather',
  'crags',
] as const;

export const MAX_CRAGS = 3;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export interface HomeSectionPreference {
  id: HomeSectionId;
  visible: boolean;
}

export type FatigueChartStyle = 'bars' | 'radar';

/** Re-exported from the analytics helper that owns the per-density widths, so there is one definition of the set. */
export type { ChartDensity } from '../analytics/chartWindow';

export const DEFAULT_DAILY_METRICS_REMINDER_TIME = '20:00';

/** A resolved lat/lon plus a display label - either geocoded from a city name or entered directly (UI_PLAN.md §10 open question 3: raw lat/lon must work with no geocoding call). */
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
    theme: 'dark',
    notificationsEnabled: false,
    dailyMetricsReminderEnabled: true,
    dailyMetricsReminderTime: DEFAULT_DAILY_METRICS_REMINDER_TIME,
    homeLocation: null,
    crags: [],
    fatigueChartStyle: 'bars',
    chartDensity: 'auto',
    timerVibrateEnabled: true,
    timerBeepEnabled: true,
    timerKeepAwakeEnabled: false,
    homeSections: HOME_SECTION_IDS.map((id) => ({ id, visible: true })),
    homeDetails: defaultHomeDetails(),
    planFormat: 'phase',
    addedExerciseTarget: 'none',
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
const THEMES: ThemePreference[] = ['dark', 'light', 'contrast'];
const FATIGUE_CHART_STYLES: FatigueChartStyle[] = ['bars', 'radar'];
const CHART_DENSITIES: ChartDensity[] = ['auto', 'compact', 'comfortable'];

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
  const seen = new Set<HomeSectionId>();
  const result: HomeSectionPreference[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const c = entry as Record<string, unknown>;
      if (typeof c.id !== 'string' || !(HOME_SECTION_IDS as readonly string[]).includes(c.id)) continue;
      const id = c.id as HomeSectionId;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({ id, visible: typeof c.visible === 'boolean' ? c.visible : true });
    }
  }
  // A section the saved list doesn't know (added in a newer version) goes
  // right after the section that precedes it in the default order, so a new
  // card lands where it belongs instead of at the very bottom.
  HOME_SECTION_IDS.forEach((id, canonicalIndex) => {
    if (seen.has(id)) return;
    let insertAt = 0;
    for (let i = canonicalIndex - 1; i >= 0; i--) {
      const at = result.findIndex((s) => s.id === HOME_SECTION_IDS[i]);
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

/** Valid, de-duplicated (by name) crags, capped at `MAX_CRAGS`; falls back to the legacy single trip location. */
function validateCrags(raw: unknown, legacyTrip: unknown): WeatherLocation[] {
  const source = raw === undefined ? (legacyTrip === undefined ? [] : [legacyTrip]) : raw;
  if (!Array.isArray(source)) return [];
  const result: WeatherLocation[] = [];
  for (const entry of source) {
    const location = validateLocation(entry);
    if (!location || result.some((c) => c.name === location.name)) continue;
    result.push(location);
    if (result.length === MAX_CRAGS) break;
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
    chartDensity: CHART_DENSITIES.includes(candidate.chartDensity as ChartDensity)
      ? (candidate.chartDensity as ChartDensity)
      : defaults.chartDensity,
    timerVibrateEnabled: typeof candidate.timerVibrateEnabled === 'boolean'
      ? candidate.timerVibrateEnabled
      : defaults.timerVibrateEnabled,
    timerBeepEnabled: typeof candidate.timerBeepEnabled === 'boolean'
      ? candidate.timerBeepEnabled
      : defaults.timerBeepEnabled,
    timerKeepAwakeEnabled: typeof candidate.timerKeepAwakeEnabled === 'boolean'
      ? candidate.timerKeepAwakeEnabled
      : defaults.timerKeepAwakeEnabled,
    homeSections: candidate.homeSections === undefined ? defaults.homeSections : validateHomeSections(candidate.homeSections),
    homeDetails: validateHomeDetails(candidate.homeDetails),
    aiSharing: candidate.aiSharing === undefined ? defaults.aiSharing : validateAISharing(candidate.aiSharing),
    planFormat: candidate.planFormat === 'weekly' || candidate.planFormat === 'phase' ? candidate.planFormat : defaults.planFormat,
    addedExerciseTarget: candidate.addedExerciseTarget === 'mirror' || candidate.addedExerciseTarget === 'none'
      ? candidate.addedExerciseTarget
      : defaults.addedExerciseTarget,
  };
}
