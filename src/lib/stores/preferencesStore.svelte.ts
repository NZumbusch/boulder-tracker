import { migratePreferences, defaultPreferences, HOME_SECTION_IDS, ANALYTICS_SECTION_IDS, QUICK_LOG_ACTION_IDS, type AnalyticsSectionId, type QuickLogActionId, type OrderedToggle, type TextScale, type MotionPreference, type Preferences, type WeatherLocation, type FatigueChartStyle, type ChartDensity, type RecoveryChartMode, type HomeSectionPreference, type AISharingPreferences, type AIHistoryWindow, type AddedExerciseTarget } from '../preferences/migrate';
import { defaultHomeDetails, type HomeDetails } from '../preferences/homeDetails';
import { defaultTunables, resetTopic, validateTunables, type Tunables, type TunableTopic } from '../preferences/tunables';
import { DEFAULT_UNITS, type Units } from '../units';

const PREFERENCES_KEY = 'boulder_tracker_preferences';
const LEGACY_THEME_KEY = 'boulder_tracker_theme';
const LEGACY_NOTIFICATIONS_KEY = 'boulder_tracker_notifications_enabled';

/**
 * Device-local UI preferences (text scale, motion). See
 * `src/lib/preferences/migrate.ts` for why this is separate from
 * `TrainingData` and why `theme`/`notificationsEnabled` are folded in but
 * not live-managed here (that stays `UiStore`'s job for now).
 */
export class PreferencesStore {
  textScale = $state<TextScale>('md');
  motion = $state<MotionPreference>('system');
  dailyMetricsReminderEnabled = $state(true);
  dailyMetricsReminderTime = $state('20:00');
  homeLocation = $state<WeatherLocation | null>(null);
  crags = $state<WeatherLocation[]>([]);
  fatigueChartStyle = $state<FatigueChartStyle>('bars');
  chartDensity = $state<ChartDensity>('auto');
  timerVibrateEnabled = $state(true);
  timerBeepEnabled = $state(true);
  timerKeepAwakeEnabled = $state(false);
  homeSections = $state<HomeSectionPreference[]>(HOME_SECTION_IDS.map((id) => ({ id, visible: true })));
  homeDetails = $state<HomeDetails>(defaultHomeDetails());
  sendsChartCounts = $state(true);
  recoveryChartMode = $state<RecoveryChartMode>('overlay');
  tunables = $state<Tunables>(defaultTunables());
  units = $state<Units>({ ...DEFAULT_UNITS });
  analyticsSections = $state<OrderedToggle<AnalyticsSectionId>[]>(ANALYTICS_SECTION_IDS.map((id) => ({ id, visible: true })));
  quickLogActions = $state<OrderedToggle<QuickLogActionId>[]>(QUICK_LOG_ACTION_IDS.map((id) => ({ id, visible: true })));
  aiSharing = $state<AISharingPreferences>(defaultPreferences().aiSharing);
  aiHistory = $state<AIHistoryWindow>(defaultPreferences().aiHistory);
  autoBackup = $state(defaultPreferences().autoBackup);
  addedExerciseTarget = $state<AddedExerciseTarget>(defaultPreferences().addedExerciseTarget);

  constructor() {
    if (typeof localStorage === 'undefined') return;

    const rawStored = localStorage.getItem(PREFERENCES_KEY);
    const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
    const legacyNotifications = localStorage.getItem(LEGACY_NOTIFICATIONS_KEY);

    const prefs = migratePreferences(
      rawStored ? safeParse(rawStored) : undefined,
      {
        theme: (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'contrast')
          ? legacyTheme
          : undefined,
        notificationsEnabled: legacyNotifications === null ? undefined : legacyNotifications === 'true',
      },
    );

    this.textScale = prefs.textScale;
    this.motion = prefs.motion;
    this.dailyMetricsReminderEnabled = prefs.dailyMetricsReminderEnabled;
    this.dailyMetricsReminderTime = prefs.dailyMetricsReminderTime;
    this.homeLocation = prefs.homeLocation;
    this.crags = prefs.crags;
    this.fatigueChartStyle = prefs.fatigueChartStyle;
    this.chartDensity = prefs.chartDensity;
    this.timerVibrateEnabled = prefs.timerVibrateEnabled;
    this.timerBeepEnabled = prefs.timerBeepEnabled;
    this.timerKeepAwakeEnabled = prefs.timerKeepAwakeEnabled;
    this.homeSections = prefs.homeSections;
    this.homeDetails = prefs.homeDetails;
    this.sendsChartCounts = prefs.sendsChartCounts;
    this.recoveryChartMode = prefs.recoveryChartMode;
    this.tunables = prefs.tunables;
    this.units = prefs.units;
    this.analyticsSections = prefs.analyticsSections;
    this.quickLogActions = prefs.quickLogActions;
    this.aiSharing = prefs.aiSharing;
    this.aiHistory = prefs.aiHistory;
    this.autoBackup = prefs.autoBackup;
    this.addedExerciseTarget = prefs.addedExerciseTarget;

    // Persist immediately so the fold (or a version migration) only ever
    // has to happen once, and so a fresh install's defaults are recorded
    // rather than re-derived from scratch on every load.
    if (rawStored === null || !isCurrentShape(rawStored, prefs)) {
      this.persist(prefs);
    }
  }

  setTextScale(scale: TextScale) {
    this.textScale = scale;
    this.persist();
  }

  setMotion(motion: MotionPreference) {
    this.motion = motion;
    this.persist();
  }

  setDailyMetricsReminderEnabled(enabled: boolean) {
    this.dailyMetricsReminderEnabled = enabled;
    this.persist();
  }

  setDailyMetricsReminderTime(time: string) {
    this.dailyMetricsReminderTime = time;
    this.persist();
  }

  setHomeLocation(location: WeatherLocation | null) {
    this.homeLocation = location;
    this.persist();
  }

  setCrags(crags: WeatherLocation[]) {
    this.crags = crags;
    this.persist();
  }

  setFatigueChartStyle(style: FatigueChartStyle) {
    this.fatigueChartStyle = style;
    this.persist();
  }

  setChartDensity(density: ChartDensity) {
    this.chartDensity = density;
    this.persist();
  }

  setTimerVibrateEnabled(enabled: boolean) {
    this.timerVibrateEnabled = enabled;
    this.persist();
  }

  setTimerBeepEnabled(enabled: boolean) {
    this.timerBeepEnabled = enabled;
    this.persist();
  }

  setTimerKeepAwakeEnabled(enabled: boolean) {
    this.timerKeepAwakeEnabled = enabled;
    this.persist();
  }

  setHomeSectionVisible(id: HomeSectionPreference['id'], visible: boolean) {
    this.homeSections = this.homeSections.map((s) => (s.id === id ? { ...s, visible } : s));
    this.persist();
  }

  /** Reorders `homeSections` to exactly `order` (every known id, in the given sequence) - the write path for drag-reorder in Settings. */
  setHomeSectionOrder(order: HomeSectionPreference['id'][]) {
    const byId = new Map(this.homeSections.map((s) => [s.id, s]));
    this.homeSections = order.map((id) => byId.get(id)!).filter(Boolean);
    this.persist();
  }

  /** Sets one tunable; the whole map is re-validated so ranges and ordering always hold. */
  setTunable(id: string, value: number | boolean) {
    this.tunables = validateTunables({ ...this.tunables, [id]: value });
    this.persist();
  }

  /** Show/hide one entry of an ordered list (Analytics cards, quick-log actions). */
  setListVisible(list: 'analyticsSections' | 'quickLogActions', id: string, visible: boolean) {
    if (list === 'analyticsSections') this.analyticsSections = this.analyticsSections.map((s) => (s.id === id ? { ...s, visible } : s));
    else this.quickLogActions = this.quickLogActions.map((s) => (s.id === id ? { ...s, visible } : s));
    this.persist();
  }

  /** Reorders an ordered list to exactly `order` (the drag-and-drop write path). */
  setListOrder(list: 'analyticsSections' | 'quickLogActions', order: string[]) {
    if (list === 'analyticsSections') {
      const byId = new Map(this.analyticsSections.map((s) => [s.id as string, s]));
      this.analyticsSections = order.map((id) => byId.get(id)!).filter(Boolean);
    } else {
      const byId = new Map(this.quickLogActions.map((s) => [s.id as string, s]));
      this.quickLogActions = order.map((id) => byId.get(id)!).filter(Boolean);
    }
    this.persist();
  }

  setUnit<K extends keyof Units>(key: K, value: Units[K]) {
    this.units = { ...this.units, [key]: value };
    this.persist();
  }

  resetTunables(topic: TunableTopic) {
    this.tunables = resetTopic(this.tunables, topic);
    this.persist();
  }

  setSendsChartCounts(enabled: boolean) {
    this.sendsChartCounts = enabled;
    this.persist();
  }

  setRecoveryChartMode(mode: RecoveryChartMode) {
    this.recoveryChartMode = mode;
    this.persist();
  }

  setHomeDetail(id: string, enabled: boolean) {
    this.homeDetails = { ...this.homeDetails, [id]: enabled };
    this.persist();
  }

  setAiSharing(category: keyof AISharingPreferences, enabled: boolean) {
    this.aiSharing = { ...this.aiSharing, [category]: enabled };
    this.persist();
  }

  setAutoBackup(enabled: boolean) {
    this.autoBackup = enabled;
    this.persist();
  }

  setAiHistory(history: AIHistoryWindow) {
    this.aiHistory = { ...history };
    this.persist();
  }

  setAddedExerciseTarget(target: AddedExerciseTarget) {
    this.addedExerciseTarget = target;
    this.persist();
  }

  /**
   * Re-reads the legacy theme/notification keys at persist time (rather
   * than trusting a value captured at construction) so this blob's copies
   * of them stay in sync with whatever `UiStore` currently has, instead of
   * drifting back to defaults the next time text scale or motion changes.
   */
  private persist(prefs?: Preferences) {
    if (typeof localStorage === 'undefined') return;
    const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
    const legacyNotifications = localStorage.getItem(LEGACY_NOTIFICATIONS_KEY);
    const toWrite = prefs ?? {
      ...defaultPreferences(),
      textScale: this.textScale,
      motion: this.motion,
      dailyMetricsReminderEnabled: this.dailyMetricsReminderEnabled,
      dailyMetricsReminderTime: this.dailyMetricsReminderTime,
      homeLocation: this.homeLocation,
      crags: this.crags,
      fatigueChartStyle: this.fatigueChartStyle,
      chartDensity: this.chartDensity,
      timerVibrateEnabled: this.timerVibrateEnabled,
      timerBeepEnabled: this.timerBeepEnabled,
      timerKeepAwakeEnabled: this.timerKeepAwakeEnabled,
      homeSections: this.homeSections,
      homeDetails: this.homeDetails,
      sendsChartCounts: this.sendsChartCounts,
      recoveryChartMode: this.recoveryChartMode,
      tunables: this.tunables,
      units: this.units,
      analyticsSections: this.analyticsSections,
      quickLogActions: this.quickLogActions,
      aiSharing: this.aiSharing,
      aiHistory: this.aiHistory,
      autoBackup: this.autoBackup,
      addedExerciseTarget: this.addedExerciseTarget,
      theme: (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'contrast')
        ? legacyTheme
        : defaultPreferences().theme,
      notificationsEnabled: legacyNotifications === null ? defaultPreferences().notificationsEnabled : legacyNotifications === 'true',
    };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(toWrite));
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isCurrentShape(rawStored: string, migrated: ReturnType<typeof migratePreferences>): boolean {
  const parsed = safeParse(rawStored);
  return typeof parsed === 'object' && parsed !== null
    && JSON.stringify(parsed) === JSON.stringify(migrated);
}
