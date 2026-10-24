import { fingerCategoryIds } from "./analytics/proMetrics";
import type { InsightInputs } from "./analytics/insights";
import { attachOrphanLogs, checkIn as checkInPainIssue, TREND_LABELS } from './pain/issues';
import { openWorkout } from './workoutModal.svelte';
import { toast, showUndo } from './toast.svelte';
import { copySessionsToWeek } from './planning/copyWeek';
import { storage, ImportCancelled, isNewerExportVersion } from './storage';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_TEMPLATE_LIBRARY, DATA_EXPORT_VERSION, BODYWEIGHT_METRIC_ID } from './constants';
import { isDemoMode, takeRecoveryNotice } from './storage/persistence';
import type { ThemePreference } from './preferences/theme';
import { adoptTotalBasis } from './benchmarks/basis';
import { adoptWayViews } from './benchmarks/ways';
import { TEST_VIEWS_ADOPTED_KEY } from './releaseNotes';
import { bodyweightFromBenchmark, withoutWeighInSlotsInAlternatives, withoutWeighInSlotsInTemplates } from './benchmarks/bodyweight';
import type { Workout, Benchmark, ExerciseTypeDef, ViewType, TrainingBlock, GoalEvent, PainLog, PainIssue, PainTrend, DailyMetricEntry, MetricDef, OutdoorAscent, ExternalActivity, PlanAlternative, PlanSide, DayOfWeek, AthleteProfile, CoachNote, Circuit, ValueDef, WorkoutTemplate, BenchmarkView } from './types';
import { MAX_COACH_NOTES, MAX_COACH_NOTE_LENGTH, newCoachNoteId } from './ai/coachNotes';
import { getWeekId, localIsoDate, trainingDayDate, formatWeekWithDates, weekIdOfIso } from './dateUtils';
import { sessionIsoDay } from './activity/overlap';
import { EFFORT_KINDS, externalAsWorkouts, type ExternalLoadConfig } from './activity/externalLoad';
import { ReadingsModel } from './analytics/daily/readingsModel';
import { ReadinessModel } from './analytics/daily/readinessModel';
import { slotTypeName } from './exerciseSlot';
import { getDominantBlockForWeek } from './planning/trainingBlocks';
import { sortWorkoutsBySchedule } from './planning/sortWorkouts';
import { weekNoteText } from './planning/notes';
import { tripInForecast } from './goals/goals';
import { num, flag, type TunableTopic } from './preferences/tunables';
import type { ReadinessConfig, FatigueModel } from './analytics/readiness';
import type { FrictionConfig } from './weather/friction';
import type { Units } from './units';
import type { PlanWrites, PlannerState } from './ai/changePlanner';
import {
  weekDiffersFromPhase,
  templatesForWeek,
  projectWeekWorkouts,
  effectiveWorkoutsForWeek,
  projectedSessionsInThePast,
  coveredWeekIds,
  isProvisionalId,
  type WeekProjectionContext,
} from './planning/weekProjection';
import {
  applyPlanBsToWeek,
  occurrenceFirstDay,
  isoOfDay,
  sideDates,
  resolveOccurrence,
  occurrenceKeys,
  occurrenceOnDay,
  parsePlanBSessionId,
  planBSessionId,
  dayIndexOf,
  newPlanB,
  saveInPlanB,
  deleteInPlanB,
  revertInPlanB,
  setOccurrence,
  MAX_PLAN_B_DAYS,
  type PlanBContext,
  type PlanBWeek,
} from './planning/planB';
import { showAlert, showConfirm, generateId } from './utils';
import type { StarterPlanOption } from './planning/starterPlan';
import { WorkoutStore } from './stores/workoutStore.svelte';
import { PlanningStore } from './stores/planningStore.svelte';
import { CatalogStore } from './stores/catalogStore.svelte';
import { BenchmarkStore } from './stores/benchmarkStore.svelte';
import { MetricsStore } from './stores/metricsStore.svelte';
import { OutdoorAscentStore } from './stores/outdoorAscentStore.svelte';
import { ExternalActivityStore } from './stores/externalActivityStore.svelte';
import { UiStore } from './stores/uiStore.svelte';
import { SessionStore } from './stores/sessionStore.svelte';
import { layout } from './navigation/layoutMode.svelte';
import { placeByName, samePlaceName, hasCoordinates, homeLocationOf, cragLocationsOf, withHome, withCrags, type Place } from './places/places';
import type { DailyForecastDay } from './weather/api';
import { BackupStore } from './stores/backupStore.svelte';
import { PreferencesStore } from './stores/preferencesStore.svelte';
import { applySettingsRecords, resetGroups, applyGroups, buildSettingsFile, parseSettingsFile, toSettingsRecords, type SettingsGroupId } from './preferences/portable';
import { stableStringify } from './sync/merge';
import { WeatherStore } from './stores/weatherStore.svelte';
import type { WeatherLocation, FatigueChartStyle, AnalyticsRange, RecoveryChartMode, HomeSectionPreference, AISharingPreferences, AIHistoryWindow, AIDetail, AddedExerciseTarget, PainCheckInPrefs, WidgetReadinessDetail, NavMode, NavAccent, NavStyle } from './preferences/migrate';
import { geocodeCity } from './weather/api';
import type { CragForecast } from './weather/suggestion';
import type { TextScale, MotionPreference } from './preferences/migrate';
import { syncFatigueReminders } from './notifications/fatigueReminder';
import { syncDailyMetricsReminder } from './notifications/dailyMetricsReminder';
import { syncPainReminder } from './notifications/painReminder';
import { syncInsightAlert } from './notifications/insightAlert';
import { buildInsights } from './analytics/insights';
import { cancelRemindersOfType } from './notifications/shared';
import { syncPlanBReminders, type PlanBReminderInput } from './notifications/planBReminder';
import { outdoorDayHints, hintText } from './weather/planBHint';

/**
 * Global reactive state for the application, composed from the domain
 * stores in `src/lib/stores/`. This facade preserves the pre-Phase-2
 * public API (same property/method names on `trainingState`) so the
 * many existing component call sites don't need to change - the domain
 * stores are the real decomposition, this is a thin compatibility layer
 * over them.
 */
class TrainingState {
  workoutStore = new WorkoutStore();
  planningStore = new PlanningStore();
  catalogStore = new CatalogStore();
  benchmarkStore = new BenchmarkStore();
  metricsStore = new MetricsStore();
  outdoorAscentStore = new OutdoorAscentStore();
  externalActivityStore = new ExternalActivityStore();
  uiStore = new UiStore();
  sessionStore = new SessionStore();
  backupStore = new BackupStore();
  preferencesStore = new PreferencesStore();
  weatherStore = new WeatherStore();

  isLoading = $state(true);
  /** Set while a backup import runs - drives the progress overlay in App.svelte. */
  importProgress = $state<{ label: string; fraction: number } | null>(null);
  /** Bumped whenever the AI undo snapshot changes, so views re-read `getPlanUndo`. */
  planUndoVersion = $state(0);
  /** The tour is showing example data (see lib/tour); nothing is saved meanwhile. */
  demoActive = $state(false);
  private hasLoaded = false;

  constructor() {
    this.refresh();
  }

  // --- Delegated data state (read-only from outside; mutated via actions) ---

  get workouts() { return this.workoutStore.workouts; }
  get trainingBlocks() { return this.planningStore.trainingBlocks; }
  get dismissedSessions() { return this.planningStore.dismissedSessions; }
  get weekNotes() { return this.planningStore.weekNotes; }
  /** Plan Bs for uncertain days - see `PlanAlternative` and `lib/planning/planB.ts`. */
  get planAlternatives() { return this.planningStore.planAlternatives; }
  /** The AI coach's About me and memory - see `lib/ai/coachNotes.ts`. */
  get athleteProfile() { return this.planningStore.athleteProfile; }
  get coachNotes() { return this.planningStore.coachNotes; }
  /** Saved circuits - see `lib/exercise/circuits.ts`. */
  get circuits() { return this.planningStore.circuits; }
  /** Competitions and outdoor trips - see `GoalEvent`. */
  get goals() { return this.planningStore.goals; }
  get templates() { return this.planningStore.templates; }
  get exerciseTypes() { return this.catalogStore.exerciseTypes; }
  get analyticsCategories() { return this.catalogStore.analyticsCategories; }
  /** The athlete's own value types - see `ValueDef`. */
  get valueDefs() { return this.catalogStore.valueDefs; }
  get benchmarkTypes() { return this.catalogStore.benchmarkTypes; }
  get phaseDefs() { return this.catalogStore.phaseDefs; }
  get benchmarks() { return this.benchmarkStore.benchmarks; }
  get metricDefs() { return this.metricsStore.metricDefs; }
  get dailyMetrics() { return this.metricsStore.dailyMetrics; }
  get painLogs() { return this.metricsStore.painLogs; }
  get painIssues() { return this.metricsStore.painIssues; }
  get outdoorAscents() { return this.outdoorAscentStore.outdoorAscents; }
  get externalActivities() { return this.externalActivityStore.externalActivities; }

  // --- Delegated UI state ---

  get view() { return this.uiStore.view; }
  get activeWorkout() { return this.uiStore.activeWorkout; }
  get showFatigue() { return this.uiStore.showFatigue; }
  get theme() { return this.uiStore.theme; }
  /** The theme on screen - `theme` with "system" resolved against the phone's setting. */
  get resolvedTheme() { return this.uiStore.resolvedTheme; }
  get notificationsEnabled() { return this.uiStore.notificationsEnabled; }
  get notificationPermission() { return this.uiStore.notificationPermission; }

  get selectedWeekId() { return this.uiStore.selectedWeekId; }
  set selectedWeekId(value: string | null) { this.uiStore.selectedWeekId = value; }

  get weekOffset() { return this.uiStore.weekOffset; }
  set weekOffset(value: number) { this.uiStore.weekOffset = value; }

  get textScale() { return this.preferencesStore.textScale; }
  get motion() { return this.preferencesStore.motion; }
  setTextScale(scale: TextScale) { this.preferencesStore.setTextScale(scale); }
  setMotion(motion: MotionPreference) { this.preferencesStore.setMotion(motion); }

  get dailyMetricsReminderEnabled() { return this.preferencesStore.dailyMetricsReminderEnabled; }
  get dailyMetricsReminderTime() { return this.preferencesStore.dailyMetricsReminderTime; }
  /**
   * Toggling this sub-preference doesn't wait for the next `refresh()` to
   * take effect - disabling cancels any pending daily-metrics reminder
   * immediately (`cancelRemindersOfType`, never touching the fatigue
   * type's own pending notifications), enabling schedules one right away
   * if today's metrics are still missing.
   */
  async setDailyMetricsReminderEnabled(enabled: boolean) {
    this.preferencesStore.setDailyMetricsReminderEnabled(enabled);
    if (enabled) {
      await syncDailyMetricsReminder(this.dailyMetrics, this.dailyMetricsReminderTime, new Date(), this.tunable('day.startHour'));
    } else {
      await cancelRemindersOfType('dailyMetrics');
    }
  }
  /** No-ops if the reminder itself is currently disabled - nothing to reschedule. */
  get planBReminderEnabled() { return this.preferencesStore.planBReminderEnabled; }
  get planBReminderTime() { return this.preferencesStore.planBReminderTime; }
  async setPlanBReminderEnabled(enabled: boolean) {
    this.preferencesStore.setPlanBReminderEnabled(enabled);
    if (enabled) await syncPlanBReminders(this.upcomingPlanBs(), this.planBReminderTime);
    else await cancelRemindersOfType('planB');
  }
  async setPlanBReminderTime(time: string) {
    this.preferencesStore.setPlanBReminderTime(time);
    if (this.planBReminderEnabled) await syncPlanBReminders(this.upcomingPlanBs(), time);
  }

  async setDailyMetricsReminderTime(time: string) {
    this.preferencesStore.setDailyMetricsReminderTime(time);
    if (this.dailyMetricsReminderEnabled) {
      await syncDailyMetricsReminder(this.dailyMetrics, time, new Date(), this.tunable('day.startHour'));
    }
  }

  // --- Weather ---

  /** Where you train (`lib/places`). */
  get places(): Place[] { return this.planningStore.places; }
  /** Replaces the places and fetches the weather of the home and crags among them. */
  async setPlaces(places: Place[]) {
    const before = JSON.stringify([this.homeLocation, this.crags]);
    await storage.savePlaces($state.snapshot(places) as Place[]);
    await this.planningStore.load();
    await this.reloadWeatherIfPlacesMoved(before);
  }
  /** Notes, prices and renames of places that are not weather places must not cost a network call. */
  private async reloadWeatherIfPlacesMoved(before: string) {
    if (JSON.stringify([this.homeLocation, this.crags]) === before) return;
    await Promise.all([this.weatherStore.loadHome(this.homeLocation), this.weatherStore.loadCrags(this.crags)]);
  }
  /** Places used to be a setting of this device: the first start with the table takes the old list over. */
  private async adoptDevicePlaces() {
    const old = this.preferencesStore.takeLegacyPlaces();
    if (old.length === 0 || this.planningStore.places.length > 0) return;
    await storage.savePlaces(old);
    await this.planningStore.load();
  }
  /**
   * Renames a place, and the sessions and phase templates that name it (they hold the name), in one write. `false` when
   * the new name is empty or another place has it.
   */
  async renamePlace(from: string, to: string): Promise<boolean> {
    const before = JSON.stringify([this.homeLocation, this.crags]);
    if (!(await storage.renamePlace(from, to))) return false;
    await this.refresh();
    await this.reloadWeatherIfPlacesMoved(before);
    return true;
  }
  /** The forecast for one day (ISO date) at one of the places, when it has coordinates and the weather has been read for it. */
  forecastAt(placeName: string, isoDate: string): DailyForecastDay | null {
    const place = placeByName(this.places, placeName);
    if (!place || !hasCoordinates(place)) return null;
    const snapshot = place.kind === 'home'
      ? this.weatherStore.home.snapshot
      : this.weatherStore.crags[this.crags.findIndex((c) => samePlaceName(c.name, place.name))]?.snapshot;
    return snapshot?.daily.find((d) => d.date === isoDate) ?? null;
  }
  get homeLocation(): WeatherLocation | null { return homeLocationOf(this.places); }
  get crags(): WeatherLocation[] { return cragLocationsOf(this.places); }
  get homeWeather() { return this.weatherStore.home; }
  /** Per-crag weather, same order as `crags`. */
  get cragWeather() { return this.weatherStore.crags; }

  /** Sets the home location and immediately fetches for it (or clears the card if `location` is `null`). */
  async setHomeLocation(location: WeatherLocation | null) {
    await this.setPlaces(withHome(this.places, location));
    await this.weatherStore.loadHome(location);
  }

  /** Replaces the saved crags and fetches conditions for them. */
  async setCrags(crags: WeatherLocation[]) {
    await this.setPlaces(withCrags(this.places, crags));
    await this.weatherStore.loadCrags(this.crags);
  }

  /** Re-fetches whichever locations are currently set - called from Home on mount, not on every `refresh()` (a network call on every save would be excessive for data that changes over hours, not seconds). */
  async refreshWeather() {
    const todayIso = this.todayIso;
    await Promise.all([
      this.weatherStore.loadHome(this.homeLocation),
      this.weatherStore.loadCrags(this.crags),
      this.weatherStore.loadGoal(tripInForecast(this.planningStore.goals, todayIso)?.location ?? null),
    ]);
  }

  /** Conditions at the next trip's place, once it's within the forecast - see `tripInForecast`. */
  get goalWeather() { return this.weatherStore.goal; }

  /** Forecasts an outdoor Plan B is judged by: the saved crags, or home when there are none. */
  get outdoorForecasts(): CragForecast[] {
    const crags = this.crags
      .map((c, i) => ({ name: c.name, days: this.cragWeather[i]?.snapshot?.daily ?? [] }))
      .filter((c) => c.days.length > 0);
    if (crags.length) return crags;
    const home = this.homeWeather.snapshot?.daily ?? [];
    return home.length ? [{ name: this.homeLocation?.name ?? 'Home', days: home }] : [];
  }

  /** City name -> candidate locations, for the Settings location picker (raw lat/lon entry bypasses this entirely). */
  async geocodeCity(query: string) {
    return geocodeCity(query);
  }

  // --- Custom value types (lib/exercise/valueDefs.ts) ---

  async saveValueDefs(defs: ValueDef[]) {
    await this.catalogStore.saveValueDefs(defs);
  }

  /** Deletes a value type and every value of it; returns how many values went. */
  async deleteValueDef(id: string): Promise<number> {
    const removed = await this.catalogStore.deleteValueDef(id);
    await this.refresh();
    return removed;
  }

  // --- Portable settings: reset, file, sync (lib/preferences/portable.ts) ---

  #settingsSeeded = false;

  /**
   * Keeps the `settings` table and the preferences in step. The first call
   * (startup) writes this device's preferences into the table - what is in
   * localStorage is the truth then. Later calls (after a sync or an import)
   * read the table back into the preferences, since that is where other
   * devices' changes arrive.
   */
  private async reconcileSettings() {
    if (isDemoMode()) return;
    try {
      if (!this.#settingsSeeded) {
        this.#settingsSeeded = true;
        this.preferencesStore.onSaved = () => { void this.saveSettingsRecords(); };
        await this.saveSettingsRecords();
        return;
      }
      const records = await storage.getSettings();
      const current = this.preferencesStore.snapshot();
      const next = applySettingsRecords(current, records);
      if (stableStringify(next) !== stableStringify(current)) this.preferencesStore.replace(next, true);
    } catch (err) {
      console.error('Failed to reconcile settings with the database:', err);
    }
  }

  private async saveSettingsRecords() {
    if (isDemoMode()) return;
    const records = toSettingsRecords(this.preferencesStore.snapshot());
    // Skipped when nothing changed: every flush is a sync-ledger event.
    if (stableStringify(records) === stableStringify(await storage.getSettings())) return;
    await storage.saveSettings(records);
  }

  /** The settings groups, back at their defaults. Categories restore the built-in ones without touching the user's own. */
  async resetSettings(groups: readonly SettingsGroupId[], opts: { categories?: boolean } = {}) {
    if (groups.length) this.preferencesStore.replace(resetGroups(this.preferencesStore.snapshot(), groups));
    if (opts.categories) await this.catalogStore.restoreDefaultCategories();
  }

  /** The portable settings as a file's text. */
  settingsFileText(): string {
    return JSON.stringify(buildSettingsFile(this.preferencesStore.snapshot()), null, 2);
  }

  /** Applies a settings file's text. Returns an error message, or null when it went in. */
  importSettingsText(text: string, groups: readonly SettingsGroupId[]): string | null {
    const parsed = parseSettingsFile(text);
    if (!parsed.ok) return parsed.error;
    this.preferencesStore.replace(applyGroups(this.preferencesStore.snapshot(), parsed.settings, groups));
    return null;
  }

  // --- Fatigue chart style, timer toggles, Home section layout ---

  get fatigueChartStyle() { return this.preferencesStore.fatigueChartStyle; }
  setFatigueChartStyle(style: FatigueChartStyle) { this.preferencesStore.setFatigueChartStyle(style); }

  get analyticsRange() { return this.preferencesStore.analyticsRange; }
  setAnalyticsRange(range: AnalyticsRange) { this.preferencesStore.setAnalyticsRange(range); }

  get timerVibrateEnabled() { return this.preferencesStore.timerVibrateEnabled; }
  get timerBeepEnabled() { return this.preferencesStore.timerBeepEnabled; }
  get timerKeepAwakeEnabled() { return this.preferencesStore.timerKeepAwakeEnabled; }
  get timerBackgroundAlerts() { return this.preferencesStore.timerBackgroundAlerts; }
  get timerCountdownTicks() { return this.preferencesStore.timerCountdownTicks; }
  get timerWarnBeforeEnd() { return this.preferencesStore.timerWarnBeforeEnd; }
  get timerPillHidden() { return this.preferencesStore.timerPillHidden; }
  get timerCues() { return this.preferencesStore.timerCues; }
  setTimerCues(changes: Parameters<PreferencesStore['setTimerCues']>[0]) { this.preferencesStore.setTimerCues(changes); }
  get sessionNotification() { return this.preferencesStore.sessionNotification; }
  setTimerVibrateEnabled(enabled: boolean) { this.preferencesStore.setTimerVibrateEnabled(enabled); }
  setTimerBeepEnabled(enabled: boolean) { this.preferencesStore.setTimerBeepEnabled(enabled); }
  setTimerKeepAwakeEnabled(enabled: boolean) { this.preferencesStore.setTimerKeepAwakeEnabled(enabled); }
  setTimerBackgroundAlerts(enabled: boolean) { this.preferencesStore.setTimerBackgroundAlerts(enabled); }
  setTimerCountdownTicks(enabled: boolean) { this.preferencesStore.setTimerCountdownTicks(enabled); }
  setTimerWarnBeforeEnd(enabled: boolean) { this.preferencesStore.setTimerWarnBeforeEnd(enabled); }
  setTimerPillHidden(hidden: boolean) { this.preferencesStore.setTimerPillHidden(hidden); }
  get timerPresets() { return this.preferencesStore.timerPresets; }
  saveTimerPreset(preset: Parameters<PreferencesStore['saveTimerPreset']>[0]) { this.preferencesStore.saveTimerPreset(preset); }
  deleteTimerPreset(id: string) { this.preferencesStore.deleteTimerPreset(id); }
  get painCheckIns() { return this.preferencesStore.painCheckIns; }
  async setPainCheckIns(changes: Partial<PainCheckInPrefs>) {
    this.preferencesStore.setPainCheckIns(changes);
    try {
      await syncPainReminder(this.metricsStore.painIssues, this.metricsStore.painLogs, this.preferencesStore.painCheckIns, new Date(), this.tunable('day.startHour'));
    } catch (err) {
      console.error('Failed to sync the pain check-in reminder:', err);
    }
  }
  get sessionKeepAwake() { return this.preferencesStore.sessionKeepAwake; }
  setSessionKeepAwake(enabled: boolean) { this.preferencesStore.setSessionKeepAwake(enabled); }
  get hapticsEnabled() { return this.preferencesStore.hapticsEnabled; }
  setHapticsEnabled(enabled: boolean) { this.preferencesStore.setHapticsEnabled(enabled); }
  setSessionNotification(enabled: boolean) { this.preferencesStore.setSessionNotification(enabled); }

  get homeSections() { return this.preferencesStore.homeSections; }
  setHomeSectionVisible(id: HomeSectionPreference['id'], visible: boolean) {
    this.preferencesStore.setHomeSectionVisible(id, visible);
  }
  setHomeSectionOrder(order: HomeSectionPreference['id'][]) {
    this.preferencesStore.setHomeSectionOrder(order);
  }
  /** Per-part Home toggles, keyed by `homeDetails.ts` ids - see `Preferences.homeDetails`. */
  get homeDetails() { return this.preferencesStore.homeDetails; }
  get sendsChartCounts() { return this.preferencesStore.sendsChartCounts; }
  get recoveryChartMode() { return this.preferencesStore.recoveryChartMode; }
  get fingerCategoryIds() { return this.preferencesStore.fingerCategoryIds; }
  get benchmarkTotalTypeIds() { return this.preferencesStore.benchmarkTotalTypeIds; }

  // --- Ordered, hideable lists (Analytics cards, quick-log actions) ---
  get analyticsSections() { return this.preferencesStore.analyticsSections; }
  get quickLogActions() { return this.preferencesStore.quickLogActions; }
  setListVisible(list: 'analyticsSections' | 'quickLogActions', id: string, visible: boolean) { this.preferencesStore.setListVisible(list, id, visible); }
  setListOrder(list: 'analyticsSections' | 'quickLogActions', order: string[]) { this.preferencesStore.setListOrder(list, order); }

  // --- Display units (lib/units.ts) ---
  get units() { return this.preferencesStore.units; }
  setUnit<K extends keyof Units>(key: K, value: Units[K]) { this.preferencesStore.setUnit(key, value); }

  // --- Adjustable thresholds (preferences/tunables.ts) ---
  get tunables() { return this.preferencesStore.tunables; }
  setTunable(id: string, value: number | boolean) { this.preferencesStore.setTunable(id, value); }
  resetTunables(topic: TunableTopic) { this.preferencesStore.resetTunables(topic); }
  /** A number tunable's current value. */
  tunable(id: string): number { return num(this.preferencesStore.tunables, id); }
  /** The fatigue-log reminder switch (Settings > Reminders): saves it and reschedules or cancels at once. */
  async setFatigueReminderEnabled(enabled: boolean) {
    this.setTunable('alerts.fatigueReminder', enabled);
    if (!this.uiStore.notificationsEnabled || isDemoMode()) return;
    try {
      await syncFatigueReminders(this.remindableWorkouts, enabled);
    } catch (err) {
      console.error('Failed to sync fatigue-reminder notifications:', err);
    }
  }
  /** Times of day on screen: 12-hour when the setting is on (`lib/timeFormat.ts`). */
  get clock12() { return flag(this.preferencesStore.tunables, 'ui.clock12'); }
  /** A switch tunable's current value. */
  tunableOn(id: string): boolean { return flag(this.preferencesStore.tunables, id); }
  get readinessConfig(): ReadinessConfig {
    const t = this.preferencesStore.tunables;
    return {
      use: { fatigue: flag(t, 'readiness.useFatigue'), acwr: flag(t, 'readiness.useAcwr'), sleep: flag(t, 'readiness.useSleep'), hrv: flag(t, 'readiness.useHrv'), pain: flag(t, 'readiness.usePain') },
      sleepLow: num(t, 'readiness.sleepLow'),
      sleepShortHours: num(t, 'readiness.sleepShortHours'),
      hrvDip: num(t, 'readiness.hrvDip'),
      acwrHighRisk: num(t, 'acwr.highRisk'),
    };
  }
  get acwrZones() {
    const t = this.preferencesStore.tunables;
    return { sweetMin: num(t, 'acwr.sweetMin'), caution: num(t, 'acwr.caution'), highRisk: num(t, 'acwr.highRisk') };
  }
  /**
   * Everything `buildInsights` reads, from the current data and settings -
   * the Insights tab and the AI prompt's "since the last plan" section use
   * the same inputs, so the athlete and the AI see the same findings.
   */
  insightInputs(): InsightInputs {
    return {
      asOf: this.today,
      workouts: this.workouts,
      workoutsForWeek: (weekId) => this.getWorkoutsForWeek(weekId),
      exerciseTypes: this.exerciseTypes,
      analyticsCategories: this.analyticsCategories,
      benchmarks: this.benchmarks,
      benchmarkTypes: this.benchmarkTypes,
      valueDefs: this.valueDefs,
      weightUnit: this.units.weight,
      dailyMetrics: this.dailyMetrics,
      ascents: this.outdoorAscents,
      targets: this.athleteProfile?.targets,
      blocks: this.trainingBlocks,
      goals: this.goals,
      fingerIds: fingerCategoryIds(this.analyticsCategories, this.fingerCategoryIds),
      config: {
        acwrZones: this.acwrZones,
        fatigueModel: this.fatigueModel,
        staleDays: this.tunable('insights.staleDays'),
        adherenceLow: this.tunable('insights.adherenceLow'),
        hrvDip: this.tunable('readiness.hrvDip'),
        sleepLow: this.tunable('readiness.sleepLow'),
        retestWeeks: this.tunable('progress.retestWeeks'),
      },
    };
  }
  /** A test is due this many weeks after its last result (Settings -> Home). */
  get retestWeeks() { return this.tunable('progress.retestWeeks'); }
  /** How imported activities count as load (Settings -> Training model -> Other training). */
  get externalLoadConfig(): ExternalLoadConfig {
    const t = this.preferencesStore.tunables;
    return {
      enabled: flag(t, 'load.otherEnabled'),
      weight: num(t, 'load.otherWeight'),
      useHeartRate: flag(t, 'load.otherUseHr'),
      effort: Object.fromEntries(EFFORT_KINDS.map((k) => [k.kind, num(t, `load.effort.${k.kind}`)])) as ExternalLoadConfig['effort'],
    };
  }
  /** Imported activities as pseudo-sessions - for load, fatigue and readiness only, never for lists or counts. */
  externalWorkouts = $derived(externalAsWorkouts(this.externalActivities, this.externalLoadConfig));
  /** Every session plus the imported activities that count: what load, the load ratio, fatigue and readiness are computed from. */
  workoutsForLoad = $derived([...this.workouts, ...this.externalWorkouts]);
  completedForLoad = $derived([...this.completedWorkouts, ...this.externalWorkouts]);

  // --- The daily models (lib/analytics/daily) -------------------------------------------------------------------
  // What the analytics screens read for anything that takes real work per day. Each is an immutable snapshot of its inputs,
  // rebuilt here whenever they change (that is the whole invalidation story) and filled in the background by App.svelte.
  /** Sleep, HRV, resting heart rate and the watch's daily values, with every metric's series. */
  readingsModel = $derived.by(() => {
    const model = new ReadingsModel(this.dailyMetrics, this.#lastReadings);
    this.#lastReadings = model;
    return model;
  });
  /** Readiness as it read on each day. Depends on the readings, the sessions that count as load, open pain and the readiness and fatigue settings. */
  readinessModel = $derived.by(() => {
    const model = new ReadinessModel(this.readingsModel, {
      workouts: this.workoutsForLoad,
      pain: { issues: this.painIssues, logs: this.painLogs },
      config: this.readinessConfig,
      halfLife: this.fatigueModel,
    }, this.#lastReadiness);
    this.#lastReadiness = model;
    return model;
  });
  // Each rebuild starts from the one before and keeps every day the change cannot touch (see daily/index.ts). Plain fields, not state.
  #lastReadings: ReadingsModel | undefined;
  #lastReadiness: ReadinessModel | undefined;
  get fatigueHalfLife() { return num(this.preferencesStore.tunables, 'fatigue.halfLifeDays'); }
  /** Half-life and softening for accumulated fatigue - see `computeFatigueDecay`. */
  get fatigueModel(): FatigueModel {
    const t = this.preferencesStore.tunables;
    return { halfLifeDays: num(t, 'fatigue.halfLifeDays'), soften: flag(t, 'fatigue.soften'), softKnee: num(t, 'fatigue.softKnee'), stacking: flag(t, 'fatigue.sumStacking') ? 'sum' : 'capacity' };
  }
  get frictionConfig(): FrictionConfig {
    const t = this.preferencesStore.tunables;
    return { idealMinC: num(t, 'friction.idealMinC'), idealMaxC: num(t, 'friction.idealMaxC'), wetRainMm: num(t, 'friction.wetRainMm') };
  }
  setSendsChartCounts(enabled: boolean) { this.preferencesStore.setSendsChartCounts(enabled); }
  setRecoveryChartMode(mode: RecoveryChartMode) { this.preferencesStore.setRecoveryChartMode(mode); }
  setFingerCategoryIds(ids: string[] | null) { this.preferencesStore.setFingerCategoryIds(ids); }
  setBenchmarkTotalTypeIds(ids: string[]) { this.preferencesStore.setBenchmarkTotalTypeIds(ids); }
  setHomeDetail(id: string, enabled: boolean) {
    this.preferencesStore.setHomeDetail(id, enabled);
  }

  // --- AI sharing ---

  get aiSharing() { return this.preferencesStore.aiSharing; }
  setAiSharing(category: keyof AISharingPreferences, enabled: boolean) {
    this.preferencesStore.setAiSharing(category, enabled);
  }
  get aiHistory() { return this.preferencesStore.aiHistory; }
  get aiDetail() { return this.preferencesStore.aiDetail; }
  setAiDetail(detail: AIDetail) { this.preferencesStore.setAiDetail(detail); }
  setAiHistory(history: AIHistoryWindow) {
    this.preferencesStore.setAiHistory(history);
  }


  /** What `prescribed` an exercise added mid-session gets - see `AddedExerciseTarget`. */
  get addedExerciseTarget() { return this.preferencesStore.addedExerciseTarget; }
  setAddedExerciseTarget(target: AddedExerciseTarget) {
    this.preferencesStore.setAddedExerciseTarget(target);
  }

  /** Text labels under the bottom-nav icons (a preference, off by default). */
  get navLabels() { return this.preferencesStore.navLabels; }
  setNavLabels(on: boolean) { this.preferencesStore.setNavLabels(on); }
  /** What is chosen for moving between screens: automatic, the side drawer (plus a rail on wide screens) or the bottom bar. */
  get navMode(): NavMode { return this.preferencesStore.navMode; }
  setNavMode(mode: NavMode) { this.preferencesStore.setNavMode(mode); }
  /** The colour of "you are here" in the navigation and of the floating + (a preference, blue by default). */
  get navAccent(): NavAccent { return this.preferencesStore.navAccent; }
  setNavAccent(accent: NavAccent) { this.preferencesStore.setNavAccent(accent); }
  /** What is in use now: automatic means the bottom bar on a phone held upright, the drawer and rail anywhere wider. */
  get navStyle(): NavStyle {
    const mode = this.preferencesStore.navMode;
    return mode === 'auto' ? (layout.wide ? 'drawer' : 'bar') : mode;
  }

  /** The (?) glossary buttons (a preference, on by default). */
  get helpButtons() { return this.preferencesStore.helpButtons; }
  setHelpButtons(on: boolean) { this.preferencesStore.setHelpButtons(on); }

  /** Whether the home-screen widgets show the readiness score. */
  get widgetShowReadiness() { return this.preferencesStore.widgetShowReadiness; }
  setWidgetShowReadiness(on: boolean) { this.preferencesStore.setWidgetShowReadiness(on); }
  /** What the tall readiness widget shows under the ring. */
  get widgetReadinessDetail() { return this.preferencesStore.widgetReadinessDetail; }
  setWidgetReadinessDetail(d: WidgetReadinessDetail) { this.preferencesStore.setWidgetReadinessDetail(d); }

  /** Whether the first-run welcome has been seen on this device. */
  get welcomeDone() { return this.preferencesStore.welcomeDone; }
  get homeCollapsed() { return this.preferencesStore.homeCollapsed; }
  setHomeCollapsed(id: HomeSectionPreference['id'], collapsed: boolean) { this.preferencesStore.setHomeCollapsed(id, collapsed); }
  get hiddenFindings() { return this.preferencesStore.hiddenFindings; }
  setFindingHidden(id: string | null, hide: boolean) { this.preferencesStore.setFindingHidden(id, hide); }
  get simpleHome() { return this.preferencesStore.simpleHome; }
  setSimpleHome(on: boolean) { this.preferencesStore.setSimpleHome(on); }
  setWelcomeDone(done: boolean) { this.preferencesStore.setWelcomeDone(done); }

  /**
   * "This test's weight already includes bodyweight" used to be a list in the
   * preferences; it is a property of the test's weight field now. Carry an
   * old list over, once, and empty it.
   */
  private async adoptBenchmarkBasis() {
    const ids = this.preferencesStore.benchmarkTotalTypeIds;
    if (ids.length === 0 || isDemoMode()) return;
    const { types, changed } = adoptTotalBasis(this.catalogStore.benchmarkTypes, this.catalogStore.valueDefs, ids);
    try {
      if (changed) {
        await storage.saveBenchmarkTypes($state.snapshot(types));
        this.catalogStore.benchmarkTypes = types;
      }
      this.preferencesStore.setBenchmarkTotalTypeIds([]);
    } catch (err) {
      console.error('Failed to carry the benchmark weight basis over:', err);
    }
  }

  /**
   * Tests used to be split into a row per edge depth or load; views replaced
   * that (`benchmarks/ways.ts`). Once per device, a test that had a few ways
   * gets a Home view for each so Home reads as before. What was added is
   * kept for the "what's new" sheet.
   */
  private async adoptTestViews() {
    if (isDemoMode() || typeof localStorage === 'undefined') return;
    try {
      if (localStorage.getItem(TEST_VIEWS_ADOPTED_KEY) !== null) return;
      const { types, added } = adoptWayViews(this.catalogStore.benchmarkTypes, this.benchmarkStore.benchmarks, this.catalogStore.valueDefs, this.preferencesStore.units.weight);
      if (added.length > 0) {
        await storage.saveBenchmarkTypes($state.snapshot(types));
        this.catalogStore.benchmarkTypes = types;
      }
      localStorage.setItem(TEST_VIEWS_ADOPTED_KEY, JSON.stringify(added.map((a) => ({ name: a.name, views: a.views }))));
    } catch (err) {
      console.error('Failed to carry the test rows over to views:', err);
    }
  }

  /**
   * Refreshes all data from storage.
   */
  async refresh() {
    // Only the first load swaps the screen for the loading view; later
    // refreshes (after a save or an import) update the current screen in
    // place instead of flashing it away and back.
    if (!this.hasLoaded) this.isLoading = true;
    try {
      // Run migrations on the local database before loading
      await storage.runStartupMigrations();
      // Blocks split into one-week pieces by earlier AI runs read as one block.
      await storage.coalesceTrainingBlocks();

      await Promise.all([
        this.workoutStore.load(),
        this.planningStore.load(),
        this.catalogStore.load(),
        this.benchmarkStore.load(),
        this.metricsStore.load(),
        this.outdoorAscentStore.load(),
        this.externalActivityStore.load(),
      ]);

      await this.reconcileSettings();
      await this.adoptDevicePlaces();
      await this.adoptBenchmarkBasis();
      await this.adoptTestViews();

      // The database file was damaged and got restored (storage/persistence.ts) - say so, once.
      const recovery = takeRecoveryNotice();
      if (recovery) void showAlert('Data restored', recovery);

      // Sessions a phase gave a day that has since passed are saved now, so
      // history records what was planned at the time rather than whatever
      // the templates say today. Must run after the stores have loaded and
      // before anything reads the week, and is a no-op in the common case.
      try {
        await this.savePastProjectedSessions();
      } catch (err) {
        console.error('Failed to save past planned sessions:', err);
      }

      // Not from the tour's example data.
      if (this.uiStore.notificationsEnabled && !isDemoMode()) {
        try {
          await syncFatigueReminders(this.remindableWorkouts, this.tunableOn('alerts.fatigueReminder'));
        } catch (err) {
          console.error('Failed to sync fatigue-reminder notifications:', err);
        }
        if (this.preferencesStore.dailyMetricsReminderEnabled) {
          try {
            await syncDailyMetricsReminder(this.metricsStore.dailyMetrics, this.preferencesStore.dailyMetricsReminderTime, new Date(), this.tunable('day.startHour'));
          } catch (err) {
            console.error('Failed to sync daily-metrics reminder notification:', err);
          }
        }
        try {
          await syncPainReminder(this.metricsStore.painIssues, this.metricsStore.painLogs, this.preferencesStore.painCheckIns, new Date(), this.tunable('day.startHour'));
        } catch (err) {
          console.error('Failed to sync the pain check-in reminder:', err);
        }
        try {
          const notify = flag(this.preferencesStore.tunables, 'alerts.insightNotify');
          await syncInsightAlert(notify ? buildInsights(this.insightInputs()) : [], notify, this.tunable('alerts.insightHour'), new Date(), this.tunable('day.startHour'));
        } catch (err) {
          console.error('Failed to sync the heads-up notification:', err);
        }
        if (this.preferencesStore.planBReminderEnabled) {
          try {
            await syncPlanBReminders(this.upcomingPlanBs(), this.preferencesStore.planBReminderTime);
          } catch (err) {
            console.error('Failed to sync Plan B reminder notifications:', err);
          }
        }
      }
    } finally {
      this.isLoading = false;
      const firstLoad = !this.hasLoaded;
      this.hasLoaded = true;
      // Once per app start, after the data has loaded, in the background.
      if (firstLoad) void this.backupStore.runAutoBackupIfDue(this.preferencesStore.autoBackup);
    }
  }

  // --- Derived State ---

  /** A moment inside today, where today only starts at the "New day starts at" hour (see `trainingDayDate`). */
  get today(): Date {
    return trainingDayDate(new Date(), this.tunable('day.startHour'));
  }
  /** Today as "YYYY-MM-DD", by the same rule. */
  get todayIso(): string {
    return localIsoDate(this.today);
  }

  get currentWeekId() {
    return getWeekId(this.today);
  }

  get completedWorkouts() {
    return this.workoutStore.completedWorkouts;
  }

  /**
   * Everything the projection layer needs to decide what a week shows.
   * Reads the live stores, so any `$derived` that calls through here stays
   * reactive to workouts, blocks, templates and overrides alike.
   */
  private get projectionContext(): WeekProjectionContext {
    return {
      workouts: this.workoutStore.workouts,
      trainingBlocks: this.planningStore.trainingBlocks,
      templates: this.planningStore.templates,
      dismissed: this.planningStore.dismissedSessions,
    };
  }

  /**
   * Whether a week could go back to following its phases - it has sessions
   * saved or deleted that differ from what they give it, and there is a
   * phase with templates behind it to fall back to.
   */
  canResetWeekToDefaults(weekId: string) {
    return weekDiffersFromPhase(this.projectionContext, weekId) && templatesForWeek(this.projectionContext, weekId).length > 0;
  }

  /** What Plan B resolution needs: the Plan Bs, and each week as it is without them. */
  private get planBContext(): PlanBContext {
    const projection = this.projectionContext;
    const blocks = this.planningStore.trainingBlocks;
    return {
      alternatives: this.planningStore.planAlternatives,
      baseWeek: (weekId) => effectiveWorkoutsForWeek(projection, weekId),
      blockIdForWeek: (weekId) => getDominantBlockForWeek(blocks, weekId)?.id,
    };
  }

  /**
   * A week's sessions as they count: its stored workouts, or its projected
   * ones while it is still provisional - with every Plan B applied, keeping
   * only the side that counts (chosen, else likely). Every screen that
   * lists or adds up a week's sessions reads through this, so a provisional
   * week and an undecided Plan B look and behave like a plain plan
   * everywhere.
   */
  getWorkoutsForWeek(weekId: string) {
    return applyPlanBsToWeek(this.planBContext, weekId).active;
  }

  /**
   * The Plan screen's view of a week: every session including the side of
   * each Plan B that doesn't count right now (tagged `planB`), plus the Plan
   * B stretches touching the week.
   */
  getWeekPlanView(weekId: string): PlanBWeek {
    return applyPlanBsToWeek(this.planBContext, weekId);
  }

  /** The sessions on these days (YYYY-MM-DD), done and planned, as their weeks show them. */
  workoutsOnDays(days: string[]): Workout[] {
    const weeks = [...new Set(days.map(weekIdOfIso))];
    return weeks.flatMap((w) => this.getWorkoutsForWeek(w)).filter((w) => {
      const day = sessionIsoDay(w);
      return day !== null && days.includes(day);
    });
  }

  /** What a session says it is, for matching it to an imported run or ride: its name, notes and exercises. */
  sessionText(w: Workout): string {
    return [w.notes, w.description, w.logNotes, ...w.exercises.map((e) => slotTypeName(e, this.exerciseTypes))].filter(Boolean).join(' ');
  }

  getPlannedWorkoutsForWeek(weekId: string) {
    return sortWorkoutsBySchedule(
      this.getWorkoutsForWeek(weekId).filter((w) => w.status === 'planned'),
    );
  }

  /**
   * The "Log a workout" screen's list: what counts, plus - while a Plan B is
   * still undecided - the sessions only its other side has, tagged `planB`,
   * so a Plan B session can be started from here too. Once a side is chosen
   * the side not chosen drops out. (The counted-only list stays
   * `getPlannedWorkoutsForWeek`, for Home, the widget and the numbers.)
   */
  getStartableWorkoutsForWeek(weekId: string) {
    const planned = applyPlanBsToWeek(this.planBContext, weekId).shown
      .filter((w) => w.status === 'planned' && (!w.planB || w.planB.active || !w.planB.decided));
    return sortWorkoutsBySchedule(planned);
  }

  /**
   * Puts a week back under its phases' control, undoing hand edits and
   * deleted sessions. Destructive to this week's saved planned sessions, so
   * it confirms first; completed sessions are always kept.
   */
  async resetWeekToPhaseDefaults(weekId: string) {
    const confirmed = await showConfirm(
      'Reset Week',
      `Discard this week's planned sessions and follow the phase again? Completed sessions are kept.`,
    );
    if (!confirmed) return;
    try {
      await this.planningStore.resetWeekToPhaseDefaults(weekId);
      await this.refresh();
    } catch (err) {
      console.error('Failed to reset week:', err);
      await showAlert('Error', 'Failed to reset this week.');
    }
  }

  /**
   * Saves the projected sessions whose day has passed. Run once per app
   * load: a past session must keep what was planned at the time, and a
   * projection would instead re-derive it from whatever the templates say
   * today - so an edit to a template would silently rewrite history.
   */
  private async savePastProjectedSessions() {
    const past = projectedSessionsInThePast(this.projectionContext, this.todayIso);
    if (past.length === 0) return;
    await this.workoutStore.saveProjectedSessions(past);
    await this.workoutStore.load();
  }

  getDominantBlockForWeek(weekId: string) {
    return this.planningStore.getDominantBlockForWeek(weekId);
  }

  // --- Plan B (lib/planning/planB.ts) ---

  /**
   * Plan B mode: while set, adding, editing, copying or deleting a planned
   * session changes this Plan B instead of the week. No `altId` = a new
   * Plan B, created by the first edit (starting on that session's day).
   */
  planBEditing = $state<{ altId?: string; key?: string } | null>(null);

  getPlanB(altId: string): PlanAlternative | undefined {
    return this.planningStore.planAlternatives.find((a) => a.id === altId);
  }

  /** Whether `workoutId` is a session Plan B `alt` replaces or drops in occurrence `key` - i.e. Plan A's own version. */
  private isPlanAOnly(alt: PlanAlternative, key: string, workoutId: string): boolean {
    return resolveOccurrence(this.planBContext, alt, key).aOnly.some((w) => w.id === workoutId);
  }

  /**
   * Where a save lands when a Plan B is involved: a planned Plan B session,
   * or any planned session saved in Plan B mode, changes the Plan B rule
   * instead of a week. Returns the saved session's id then, `'refused'`
   * when it can't join the stretch, or `null` for an ordinary save.
   *
   * Something logged or skipped is what happened rather than a plan, so it
   * is stored like any other session - under its Plan B id, which is how a
   * logged Plan B session decides the Plan B. Plan A's own version of a
   * swapped session (shown faded in Plan B mode) is edited as Plan A.
   */
  private async saveThroughPlanB(workout: Workout, into?: { alt: PlanAlternative; key: string }): Promise<{ id: string } | 'refused' | null> {
    if (workout.status !== 'planned') return null;
    if (workout.exercises.some((e) => e.logged || e.skipped)) return null;
    const own = parsePlanBSessionId(workout.id);
    let alt: PlanAlternative | undefined = into?.alt;
    let key: string | undefined = into?.key;
    let original: Workout | undefined;
    if (!alt && own) {
      if (this.workoutStore.workouts.some((w) => w.id === workout.id)) return null;
      alt = this.getPlanB(own.altId);
      key = own.occurrence;
      if (!alt) return null;
    } else if (!alt && this.planBEditing) {
      original = this.getWorkoutById(workout.id);
      if (original?.status === 'completed') return null;
      if (!workout.dayOfWeek) {
        toast.show('Give the session a day to add it to Plan B');
        return 'refused';
      }
      if (this.planBEditing.altId) {
        alt = this.getPlanB(this.planBEditing.altId);
        key = this.planBEditing.key;
      }
      if (alt && key && original && this.isPlanAOnly(alt, key, original.id)) return null;
      if (!alt || !key) {
        alt = newPlanB(generateId(), workout.weekId, workout.dayOfWeek);
        key = alt.startWeekId;
      }
    }
    if (!alt || !key) return null;
    const result = saveInPlanB($state.snapshot(alt) as PlanAlternative, key, workout, original, generateId);
    if (!result) {
      toast.show(`That day is too far away - a Plan B covers at most ${MAX_PLAN_B_DAYS} days`);
      return 'refused';
    }
    await storage.savePlanAlternative(result.alt);
    this.followPlanBEdit(result.alt.id, result.key);
    const changeId = own && own.altId === result.alt.id ? own.changeId : result.alt.changes[result.alt.changes.length - 1].id;
    return { id: planBSessionId(result.alt.id, result.key, changeId) };
  }

  /** Keeps Plan B mode pointing at the Plan B it's editing (a first edit creates it; growing backwards can move its key). */
  private followPlanBEdit(altId: string, key: string) {
    if (this.planBEditing && (!this.planBEditing.altId || this.planBEditing.altId === altId)) {
      this.planBEditing = { altId, key };
    }
  }

  /** Delete's counterpart of `saveThroughPlanB`. True when it handled the delete. */
  private async deleteThroughPlanB(workout: Workout): Promise<boolean> {
    if (workout.status !== 'planned') return false;
    const own = parsePlanBSessionId(workout.id);
    const isStored = this.workoutStore.workouts.some((w) => w.id === workout.id);
    let alt: PlanAlternative | undefined;
    let key: string | undefined;
    if (own && !isStored) {
      alt = this.getPlanB(own.altId);
      key = own.occurrence;
    } else if (this.planBEditing && !own) {
      if (!workout.dayOfWeek) return false;
      if (this.planBEditing.altId) {
        alt = this.getPlanB(this.planBEditing.altId);
        key = this.planBEditing.key;
        if (alt && key && this.isPlanAOnly(alt, key, workout.id)) return false;
      } else {
        alt = newPlanB(generateId(), workout.weekId, workout.dayOfWeek);
        key = alt.startWeekId;
      }
    }
    if (!alt || !key) return false;
    const before = this.getPlanB(alt.id);
    const beforeCopy = before ? ($state.snapshot(before) as PlanAlternative) : undefined;
    const next = deleteInPlanB($state.snapshot(alt) as PlanAlternative, key, workout, generateId);
    await storage.savePlanAlternative(next);
    this.followPlanBEdit(next.id, next.startWeekId === alt.startWeekId ? key : this.planBEditing?.key ?? key);
    await this.refresh();
    showUndo(`"${workout.notes || 'Session'}" taken out of Plan B`, async () => {
      if (beforeCopy) await storage.savePlanAlternative(beforeCopy);
      else await storage.deletePlanAlternative(next.id);
      await this.refresh();
    });
    return true;
  }

  /**
   * Enters Plan B mode on the Plan screen for the stretch covering
   * `weekId`/`day` - or, when there's none, for a new Plan B that starts
   * with the first change made.
   */
  editPlanBAt(weekId: string, day?: DayOfWeek) {
    const hit = day ? occurrenceOnDay(this.planningStore.planAlternatives, dayIndexOf(weekId, day)) : undefined;
    this.planBEditing = hit ? { altId: hit.alt.id, key: hit.key } : {};
    this.uiStore.selectedWeekId = weekId;
    if (this.uiStore.view !== 'plan') this.uiStore.navigate('plan');
  }

  /** Leaves Plan B mode. A Plan B that ended up with no differences is dropped. */
  async finishPlanBEditing() {
    const editing = this.planBEditing;
    this.planBEditing = null;
    const alt = editing?.altId ? this.getPlanB(editing.altId) : undefined;
    if (alt && alt.changes.length === 0) {
      await storage.deletePlanAlternative(alt.id);
      await this.planningStore.load();
    }
  }

  /** Label, outdoor side, likely side, repeat - anything on the Plan B itself. */
  async savePlanB(alt: PlanAlternative) {
    await storage.savePlanAlternative($state.snapshot(alt) as PlanAlternative);
    await this.refresh();
  }

  /** Sets one occurrence's likely side (the numbers follow it), its choice, or skips it. `undefined` clears a field. */
  async setPlanBOccurrence(altId: string, key: string, patch: { likely?: PlanSide; chosen?: PlanSide; skipped?: true }) {
    const alt = this.getPlanB(altId);
    if (!alt) return;
    await this.savePlanB(setOccurrence($state.snapshot(alt) as PlanAlternative, key, patch));
  }

  /** Takes one session's Plan B difference back out: it's the same in both plans again. */
  async revertPlanBSession(altId: string, workout: Workout) {
    const alt = this.getPlanB(altId);
    if (!alt) return;
    await this.savePlanB(revertInPlanB($state.snapshot(alt) as PlanAlternative, workout));
  }

  /** Deletes a whole Plan B (every week it repeats), with Undo. Plan A stays; logged sessions stay. */
  async deletePlanB(altId: string) {
    const alt = this.getPlanB(altId);
    if (!alt) return;
    const copy = $state.snapshot(alt) as PlanAlternative;
    const every = copy.repeatUntilWeekId ? ', every week it repeats' : '';
    const ok = await showConfirm('Delete Plan B', `Delete "${copy.label || 'Plan B'}"${every}? Plan A stays as it is, and sessions you logged are kept.`);
    if (!ok) return;
    if (this.planBEditing?.altId === altId) this.planBEditing = null;
    await storage.deletePlanAlternative(altId);
    await this.refresh();
    showUndo('Plan B deleted', async () => {
      await storage.savePlanAlternative(copy);
      await this.refresh();
    });
  }

  /**
   * Ids of stored sessions on the side of a Plan B that doesn't count right
   * now - left out of reminders, which would otherwise nag about a session
   * the user isn't going to do.
   */
  private inactivePlanBIds(): Set<string> {
    const ids = new Set<string>();
    const ctx = this.planBContext;
    const since = getWeekId(new Date(Date.now() - 14 * 86400000));
    for (const alt of ctx.alternatives) {
      for (const key of occurrenceKeys(alt)) {
        if (key < since) continue;
        const occ = resolveOccurrence(ctx, alt, key);
        for (const w of [...occ.aOnly, ...occ.bOnly]) if (w.planB && !w.planB.active) ids.add(w.id);
      }
    }
    return ids;
  }

  /** Plan B occurrences starting in the next week and a bit, for the evening-before reminder. */
  private upcomingPlanBs(): PlanBReminderInput[] {
    const ctx = this.planBContext;
    const today = Math.floor(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) / 86400000);
    const inputs: PlanBReminderInput[] = [];
    for (const alt of ctx.alternatives) {
      for (const key of occurrenceKeys(alt)) {
        const first = occurrenceFirstDay(alt, key);
        if (first <= today || first > today + 8) continue;
        const occ = resolveOccurrence(ctx, alt, key);
        const hint = alt.outdoor ? outdoorDayHints(sideDates(occ, alt.outdoor), this.outdoorForecasts, this.frictionConfig)[0] : undefined;
        inputs.push({ altId: alt.id, key, label: alt.label, firstDate: isoOfDay(first), decided: !!occ.decided, hint: hint ? hintText(hint) : undefined });
      }
    }
    return inputs;
  }

  /** Stored sessions minus the Plan B side that doesn't count - what reminders are scheduled from. */
  private get remindableWorkouts(): Workout[] {
    const inactive = this.inactivePlanBIds();
    return inactive.size ? this.workoutStore.workouts.filter((w) => !inactive.has(w.id)) : this.workoutStore.workouts;
  }

  // --- Actions ---

  /** Opens History scrolled to `workoutId`, with it open in the workout modal. */
  openInHistory(workoutId: string) {
    this.uiStore.historyFocusId = workoutId;
    this.uiStore.historyTab = 'sessions';
    this.uiStore.navigate('history');
  }

  /** Opens History on its Sends tab. */
  openSends() {
    this.uiStore.historyTab = 'sends';
    this.uiStore.navigate('history');
  }

  navigate(view: ViewType) {
    this.uiStore.navigate(view);
  }

  /**
   * Opens the fatigue rating modal for a specific workout.
   */
  openFatigueModal(workout: Workout) {
    this.uiStore.openFatigueModal(workout);
  }

  /**
   * Closes the fatigue modal and clears active workout.
   */
  closeFatigueModal() {
    this.uiStore.closeFatigueModal();
  }

  /**
   * Completes a workout by applying fatigue data and saving to storage.
   */
  async confirmFatigue(fatigueData: Partial<Workout>) {
    if (!this.activeWorkout) return;

    const completedWorkout: Workout = {
      ...this.activeWorkout,
      ...fatigueData,
      status: 'completed',
      date: this.activeWorkout.date || new Date().toISOString()
    };

    await this.saveWorkout(completedWorkout);

    // If this rating is what closed out the live session, the session's
    // job is done. Cleared only now, after the save succeeded, so a failed
    // write leaves the session intact to retry rather than losing it.
    if (this.sessionStore.isRunning(completedWorkout.id)) {
      this.sessionStore.discard();
    }

    // Land on the finished session in the workout modal, wherever the user
    // were - from a live session, "Log as planned", or a re-rate.
    this.uiStore.closeFatigueModal();
    openWorkout(completedWorkout, 'view');
  }

  // --- Live sessions (lib/session/) ---

  /** The running session, or `null`. At most one exists - see `SessionStore`. */
  get activeSession() { return this.sessionStore.session; }
  get isSessionActive() { return this.sessionStore.isActive; }

  /**
   * Starts a session from a planned workout, or from a freshly built one
   * for a spontaneous session, and opens the session modal.
   *
   * Refuses while another session is running rather than replacing it -
   * that would throw away logged work irrecoverably. The caller gets
   * `false`; the UI shows "Resume" instead of "Start" while a session is
   * live, so this is a backstop rather than the normal path.
   */
  startSession(workout: Workout): boolean {
    // Example data is for looking at; a session started on it would outlive it.
    if (this.demoActive) {
      toast.show('Exit the example data first, then start a session.');
      return false;
    }
    if (this.sessionStore.isActive) {
      // Tapping Start on the session that is already running just reopens it.
      if (this.sessionStore.isRunning(workout.id)) {
        this.sessionStore.openModal();
        return true;
      }
      return false;
    }
    const started = this.sessionStore.start(workout, { sourceWorkoutId: workout.id });
    if (started) {
      this.uiStore.showFatigue = false;
      // Every session starts with the timer tucked into its bottom bar.
      this.preferencesStore.setTimerPillHidden(true);
    }
    return started;
  }

  /**
   * Ends the session and hands what was done to the fatigue/rating step,
   * which is also where the measured duration can be corrected before it
   * is committed. The session itself is only cleared once the save has
   * actually gone through (`confirmFatigue`), so a failed save can't lose
   * an hour of logged work.
   */
  finishSession() {
    const completed = this.sessionStore.buildCompletedWorkout();
    if (!completed) return;
    this.sessionStore.minimize();
    this.openFatigueModal(completed);
  }

  /** Abandons the session without saving anything. The plan it came from is untouched. */
  discardSession() {
    this.sessionStore.discard();
  }

  // --- Backup Actions ---

  /**
   * Updates the theme mode and persists to localStorage
   */
  setTheme(newTheme: ThemePreference) {
    this.uiStore.setTheme(newTheme);
  }

  /**
   * Enables or disables fatigue-log reminder notifications, refreshing
   * scheduled notifications immediately afterward so a toggle takes
   * effect right away rather than waiting for the next unrelated refresh.
   */
  async setNotificationsEnabled(enabled: boolean) {
    const result = await this.uiStore.setNotificationsEnabled(enabled);
    await this.refresh();
    return result;
  }

  /**
   * Shows the one-time first-run prompt asking whether to enable
   * fatigue-log reminders. Safe to call on every app load - it no-ops
   * after the first time (see `UiStore.maybePromptForNotifications`).
   */
  async maybePromptForNotifications() {
    await this.uiStore.maybePromptForNotifications();
  }

  /**
   * Exports all training data to a JSON file.
   */
  async exportData() {
    await this.backupStore.exportData();
  }

  get lastBackupAt() { return this.backupStore.lastBackupAt; }
  get lastAutoBackup() { return this.backupStore.lastAutoBackup; }
  get autoBackup() { return this.preferencesStore.autoBackup; }
  setAutoBackup(enabled: boolean) {
    this.preferencesStore.setAutoBackup(enabled);
    if (enabled) void this.backupStore.runAutoBackupIfDue(true);
  }

  /**
   * Imports training data from a JSON file.
   */
  async importData(event: Event): Promise<boolean> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return false;

    const progress = (label: string, fraction: number) => { this.importProgress = { label, fraction }; };
    try {
      progress('Reading backup', 0.1);
      await this.backupStore.importFile(file, progress, (incoming) => this.confirmImport(incoming));
      progress('Loading your data', 0.85);
      await this.refresh();
      progress('Done', 1);
      // Let the full bar register rather than vanish mid-fill.
      await new Promise((r) => setTimeout(r, 400));
      this.importProgress = null;
      await showAlert('Import Success', 'Data imported successfully!');
      this.navigate('history');
      return true;
    } catch (err) {
      this.importProgress = null;
      if (err instanceof ImportCancelled) return false;
      await showAlert('Import Error', 'Failed to import data. Please check the file format.');
      return false;
    } finally {
      target.value = '';
    }
  }

  /** What the last restore replaced, if it was kept (for Settings > Backup). */
  async restoreSnapshotInfo(): Promise<{ at: string; workouts: number } | null> {
    return storage.getRestoreSnapshot();
  }

  /**
   * "Restore previous": puts back what the last backup restore replaced. The
   * data being replaced now is kept in turn, so it can be undone again.
   */
  async restorePrevious(): Promise<boolean> {
    const snap = await storage.getRestoreSnapshot();
    if (!snap) return false;
    const when = new Date(snap.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const ok = await showConfirm(
      'Go back to the data from before the restore?',
      `This puts back the ${snap.workouts} session${snap.workouts === 1 ? '' : 's'} (and everything else) that this device had on ${when}. What is here now is kept, so you can switch back.`,
      { ok: 'Restore previous', cancel: 'Keep what is here' },
    );
    if (!ok) return false;
    try {
      if (!(await storage.restorePrevious())) return false;
      await this.refresh();
      toast.show('Previous data restored');
      return true;
    } catch (err) {
      console.error('Restore previous failed:', err);
      await showAlert('Error', 'The previous data could not be restored. Nothing was changed.');
      return false;
    }
  }

  /**
   * What to check once a backup file has been read, before it replaces
   * anything: an empty file or one from a newer app is asked about, and a
   * safety copy of what is here now is saved (the way "Delete all data"
   * does), so a wrong file can be put right.
   */
  private async confirmImport(incoming: { workouts: number; exportVersion: string }): Promise<boolean> {
    this.importProgress = null;
    if (incoming.workouts === 0 && this.workouts.length > 0) {
      const ok = await showConfirm('This backup has no sessions', `It would replace your ${this.workouts.length} sessions with none. Restore it anyway?`);
      if (!ok) return false;
    }
    if (isNewerExportVersion(incoming.exportVersion)) {
      const ok = await showConfirm('From a newer version of the app', `This backup was made by a newer version (data format ${incoming.exportVersion}; this app reads ${DATA_EXPORT_VERSION}). Parts of it may be lost. Restore it anyway?`);
      if (!ok) return false;
    }
    let saved = true;
    try {
      if (Capacitor.isNativePlatform()) await this.backupStore.writeBackupNow();
      else saved = (await storage.exportData()) !== 'failed';
    } catch {
      saved = false;
    }
    if (!saved) {
      const ok = await showConfirm('No safety copy was saved', 'Restore anyway? What is on this device now would be lost.');
      if (!ok) return false;
    }
    this.importProgress = { label: 'Reading backup', fraction: 0.2 };
    return true;
  }

  /**
   * Exports all training data to a CSV file for analysis in Excel or Python.
   */
  async exportToCSV() {
    this.backupStore.exportToCSV(this.workouts, this.trainingBlocks, this.exerciseTypes, this.phaseDefs);
  }

  /**
   * Saves a workout to storage and refreshes local state. Returns the
   * session as it now is - for a Plan B edit that's Plan B's own copy, with
   * its own id - or `null` if the save was refused (a Plan B edit on a day
   * too far from its stretch).
   */
  async saveWorkout(workout: Workout): Promise<Workout | null> {
    const routed = await this.saveThroughPlanB(workout);
    if (routed === 'refused') return null;
    if (routed) {
      await this.refresh();
      return this.getWorkoutById(routed.id) ?? workout;
    }
    await this.storeWorkout(workout);
    return workout;
  }

  /** The plain save: just this session - the rest of its week keeps following its phase. */
  private async storeWorkout(workout: Workout) {
    await this.workoutStore.saveWorkout(workout);
    await this.refresh();
  }

  /**
   * Saves a workout without `refresh()`'s `isLoading` toggle - `App.svelte`
   * swaps its entire view tree while `isLoading` is true, so a full
   * `saveWorkout` briefly unmounts/remounts whatever screen is showing,
   * which reads as the page jumping back to its top. Fine for a save that
   * navigates away anyway, but wrong for an in-place
   * edit where the user stays put (e.g. the Plan screen's day-of-week
   * reassignment).
   * Reloads only the workouts store (everything a schedule change could
   * plausibly affect) and still re-syncs fatigue-reminder notifications,
   * since those key off `dayOfWeek`/`startTime` (`fatigueReminder.ts`) -
   * the one real side effect of the full `refresh()` a "quiet" save must
   * not silently drop.
   */
  async saveWorkoutQuiet(workout: Workout) {
    const routed = await this.saveThroughPlanB(workout);
    if (routed === 'refused') return;
    if (routed) {
      await this.planningStore.load();
      return;
    }
    await this.workoutStore.saveWorkout(workout);
    await this.workoutStore.load();
    if (this.uiStore.notificationsEnabled) {
      try {
        await syncFatigueReminders(this.remindableWorkouts, this.tunableOn('alerts.fatigueReminder'));
      } catch (err) {
        console.error('Failed to sync fatigue-reminder notifications:', err);
      }
    }
  }

  /**
   * Deletes a workout at once, with an Undo toast that saves it back.
   */
  async deleteWorkout(id: string) {
    const workout = this.getWorkoutById(id);
    if (!workout) return;
    const copy = $state.snapshot(workout) as Workout;
    if (await this.deleteThroughPlanB(copy)) return;
    // A session still only projected has no row to delete: it is remembered as deleted, so its template doesn't bring it back.
    if (workout.provisional) await this.workoutStore.dismissSession(id, workout.weekId);
    else await this.workoutStore.deleteWorkout(id);
    await this.refresh();
    // Straight back into the week - never through Plan B mode.
    showUndo(`"${copy.notes || 'Session'}" deleted`, () => this.storeWorkout(copy));
  }

  /**
   * Finds a workout by id across stored rows and, failing that, across every
   * week's projections - a projected session is a real thing the user can
   * act on, but has no stored row to look up.
   */
  getWorkoutById(id: string): Workout | undefined {
    const stored = this.workoutStore.workouts.find((w) => w.id === id);
    if (stored) return stored;
    const planB = parsePlanBSessionId(id);
    if (planB) {
      const alt = this.planningStore.planAlternatives.find((a) => a.id === planB.altId);
      return alt ? resolveOccurrence(this.planBContext, alt, planB.occurrence).bOnly.find((w) => w.id === id) : undefined;
    }
    if (!isProvisionalId(id)) return undefined;
    for (const weekId of coveredWeekIds(this.planningStore.trainingBlocks)) {
      const hit = projectWeekWorkouts(this.projectionContext, weekId).find((w) => w.id === id);
      if (hit) return hit;
    }
    return undefined;
  }

  /**
   * Duplicates an existing workout.
   */
  async duplicateWorkout(workout: Workout) {
    // A Plan B session, or anything copied in Plan B mode, is copied within Plan B.
    const planB = parsePlanBSessionId(workout.id);
    const isStored = this.workoutStore.workouts.some((w) => w.id === workout.id);
    if ((planB && !isStored) || (this.planBEditing && workout.status === 'planned')) {
      const snapshot = $state.snapshot(workout) as Workout;
      const alt = planB ? this.getPlanB(planB.altId) : undefined;
      const routed = await this.saveThroughPlanB({ ...snapshot, id: generateId() }, alt && planB ? { alt, key: planB.occurrence } : undefined);
      if (routed && routed !== 'refused') {
        await this.refresh();
        toast.show('Copied within Plan B');
      }
      return;
    }
    await this.workoutStore.duplicateWorkout(workout);
    await this.refresh();
    toast.show(`Copied as a planned session${workout.dayOfWeek ? ` on ${workout.dayOfWeek}` : ''}`);
  }

  /**
   * Saves a benchmark to storage and refreshes local state.
   */
  async saveBenchmark(benchmark: Benchmark, opts: { syncBodyweight?: boolean } = {}) {
    await this.benchmarkStore.saveBenchmark(benchmark);
    // A weigh-in result is a bodyweight reading as well (Home card, readiness, % of bodyweight). Bulk re-saves
    // (tidy-up, undo) pass `syncBodyweight: false`: restoring old results must not overwrite readings.
    const day = benchmark.date.slice(0, 10);
    const existing = this.metricsStore.dailyMetrics.find((m) => m.metricId === BODYWEIGHT_METRIC_ID && m.date === day);
    const type = this.catalogStore.benchmarkTypes.find((t) => t.id === benchmark.typeId);
    const reading = opts.syncBodyweight === false ? null : bodyweightFromBenchmark(benchmark, type, this.catalogStore.valueDefs, existing?.id);
    if (reading) await this.saveDailyMetric(reading, { id: BODYWEIGHT_METRIC_ID, name: 'Bodyweight', unit: 'kg' });
    else await this.refresh();
  }

  /**
   * Deletes a benchmark at once, with an Undo toast that saves it back.
   */
  /** Replaces a test's saved views (the ways of looking at its results); the test itself is untouched. */
  async saveBenchmarkViews(typeId: string, views: BenchmarkView[]) {
    const types = this.catalogStore.benchmarkTypes;
    if (!types.some((t) => t.id === typeId)) return;
    const next = types.map((t) => {
      if (t.id !== typeId) return t;
      const { views: _old, ...rest } = t;
      return views.length > 0 ? { ...rest, views: $state.snapshot(views) as BenchmarkView[] } : rest;
    });
    if (!isDemoMode()) await storage.saveBenchmarkTypes($state.snapshot(next));
    this.catalogStore.benchmarkTypes = next;
  }

  async deleteBenchmark(id: string) {
    const benchmark = this.benchmarkStore.benchmarks.find((b) => b.id === id);
    if (!benchmark) return;
    const copy = $state.snapshot(benchmark) as Benchmark;
    await this.benchmarkStore.deleteBenchmark(id);
    await this.refresh();
    showUndo(`${copy.type} result deleted`, () => this.saveBenchmark(copy, { syncBodyweight: false }));
  }

  /**
   * Resets a week by removing its phase assignment and all workouts.
   */
  async clearWeek(weekId: string) {
    const confirmed = await showConfirm('Clear Week', `Are you sure you want to clear all data for ${formatWeekWithDates(weekId)}? This will delete all workouts and benchmarks for this week.`);
    if (!confirmed) return;

    try {
      await this.planningStore.clearWeek(weekId);
      await this.refresh();
    } catch (err) {
      console.error("Failed to clear week:", err);
      await showAlert('Error', "Failed to clear week data.");
    }
  }

  /**
   * Creates or updates a (possibly multi-week) training block.
   */
  async saveTrainingBlock(block: TrainingBlock) {
    await this.planningStore.saveTrainingBlock(block);
    await this.refresh();
  }

  /**
   * Replaces all training blocks in one write - what the Block manager does
   * when an edit also shortens or splits its neighbours - with an Undo that
   * puts the previous blocks back.
   */
  async setTrainingBlocks(next: TrainingBlock[], undoLabel: string) {
    const before = $state.snapshot(this.planningStore.trainingBlocks) as TrainingBlock[];
    await this.planningStore.saveTrainingBlocks(next);
    await this.refresh();
    showUndo(undoLabel, async () => {
      await this.planningStore.saveTrainingBlocks(before);
      await this.refresh();
    });
  }

  /** Applies an AI change set's result (see `changePlanner.ts`) in one write, then reloads. */
  async applyPlanWrites(writes: PlanWrites, label?: { goal?: string; lines: string[] }) {
    const placesBefore = JSON.stringify([this.homeLocation, this.crags]);
    await storage.applyPlanWrites(writes, 'ai', label);
    await this.refresh();
    void this.reloadWeatherIfPlacesMoved(placesBefore);
    this.planUndoVersion++;
    showUndo('AI changes applied', async () => { await this.undoPlanChange(); });
  }

  /** The plan changes that can still be rolled back (AI changes and copied weeks), newest first, with what each asked for and did. */
  getPlanHistory() {
    return storage.getPlanHistory();
  }

  /**
   * Rolls the plan back to before change `index` of `getPlanHistory`, which
   * also takes back every change made after it - so that asks first. Sessions
   * logged since stay logged.
   */
  async undoPlanTo(index: number): Promise<boolean> {
    const history = await storage.getPlanHistory();
    const entry = history.find((h) => h.index === index);
    if (!entry) return false;
    const later = history.filter((h) => h.index > index).length;
    const ok = await showConfirm(
      'Go back',
      `The plan goes back to how it was before this change${later ? `, and the ${later === 1 ? 'change' : `${later} changes`} made after it ${later === 1 ? 'is' : 'are'} taken back too` : ''}. Sessions you logged stay. Go back?`,
    );
    if (!ok) return false;
    const placesBefore = JSON.stringify([this.homeLocation, this.crags]);
    await storage.undoPlanChangesTo(index);
    await this.refresh();
    void this.reloadWeatherIfPlacesMoved(placesBefore);
    this.planUndoVersion++;
    toast.show('Plan put back');
    return true;
  }

  /** The last bulk plan change (AI or copied week): what, when, and whether the plan was edited since - or null if there's nothing to undo. */
  getPlanUndo() {
    return storage.getPlanUndo();
  }

  /**
   * Undoes the last bulk plan change. If the plan was edited since, those
   * edits would be reverted too, so that asks first. Sessions logged since
   * are always kept.
   */
  async undoPlanChange(): Promise<boolean> {
    const undo = await storage.getPlanUndo();
    if (!undo) return false;
    if (undo.changedSince) {
      const what = undo.source === 'copy' ? 'copying that week' : 'these AI changes';
      const ok = await showConfirm(
        'Undo',
        `You have edited the plan since ${what}. Undoing also reverts those edits (sessions you logged stay). Undo anyway?`,
      );
      if (!ok) return false;
    }
    const placesBefore = JSON.stringify([this.homeLocation, this.crags]);
    await storage.undoPlanChange();
    await this.refresh();
    void this.reloadWeatherIfPlacesMoved(placesBefore);
    this.planUndoVersion++;
    toast.show(undo.source === 'copy' ? 'Copy undone' : 'AI changes undone');
    return true;
  }

  /**
   * Copies `fromWeekId`'s sessions into each of `toWeekIds` as a fresh plan
   * (`copySessionsToWeek`), replacing those weeks' planned sessions -
   * completed ones stay. Asks first when that replaces anything, and offers
   * Undo afterwards (the same one-step undo as an AI change).
   */
  async copyWeek(fromWeekId: string, toWeekIds: string[]) {
    const sessions = this.getWorkoutsForWeek(fromWeekId);
    if (sessions.length === 0 || toWeekIds.length === 0) return;
    const replaced = toWeekIds.reduce((n, id) => n + this.getWorkoutsForWeek(id).filter((w) => w.status === 'planned').length, 0);
    const range = toWeekIds.length === 1 ? toWeekIds[0] : `${toWeekIds[0]} – ${toWeekIds[toWeekIds.length - 1]}`;
    if (replaced > 0) {
      const ok = await showConfirm(
        'Copy week',
        `This replaces ${replaced} planned session${replaced === 1 ? '' : 's'} in ${range}. Completed sessions are kept.`,
      );
      if (!ok) return;
    }
    await storage.applyPlanWrites({
      weeks: toWeekIds.map((weekId) => ({
        weekId,
        planned: copySessionsToWeek(sessions, weekId, this.getDominantBlockForWeek(weekId)?.id),
      })),
      weekNotes: [],
    }, 'copy');
    await this.refresh();
    this.planUndoVersion++;
    showUndo(`${sessions.length} session${sessions.length === 1 ? '' : 's'} copied to ${range}`, async () => { await this.undoPlanChange(); });
  }

  /** Everything the AI change-set planner needs to know about the current plan. */
  get plannerState(): PlannerState {
    return {
      exerciseTypes: this.exerciseTypes,
      analyticsCategories: this.analyticsCategories,
      phaseDefs: this.phaseDefs,
      templates: this.templates,
      trainingBlocks: this.trainingBlocks,
      workouts: this.workouts,
      dismissedSessions: this.dismissedSessions,
      weekNotes: this.weekNotes,
      planAlternatives: this.planAlternatives,
      coachNotes: this.coachNotes,
      circuits: this.circuits,
      benchmarkTypes: this.benchmarkTypes,
      valueDefs: this.valueDefs,
      places: this.places,
      goals: this.goals,
      painIssues: this.painIssues,
      today: this.todayIso,
      currentWeekId: this.currentWeekId,
    };
  }

  /** `weekId`'s note, or "" - see `WeekNote`. */
  getWeekNote(weekId: string): string {
    return weekNoteText(this.planningStore.weekNotes, weekId);
  }

  /**
   * Sets `weekId`'s note (blank deletes it). A note belongs to the
   * week, not to its sessions, so writing one saves no session.
   */
  async saveWeekNote(weekId: string, text: string) {
    await this.planningStore.saveWeekNote(weekId, text);
    await this.refresh();
  }

  // --- Saved circuits (lib/exercise/circuits.ts) ---

  /** Adds a circuit to the library, or replaces the one with its id. */
  async saveCircuit(circuit: Circuit) {
    const all = $state.snapshot(this.circuits) as Circuit[];
    const plain = $state.snapshot(circuit) as Circuit;
    const exists = all.some((c) => c.id === plain.id);
    await storage.saveCircuits(exists ? all.map((c) => (c.id === plain.id ? plain : c)) : [...all, plain]);
    await this.refresh();
  }

  /** Removes a circuit from the library. Sessions that have a copy keep it. */
  async deleteCircuit(id: string) {
    const before = $state.snapshot(this.circuits) as Circuit[];
    const removed = before.find((c) => c.id === id);
    if (!removed) return;
    await storage.saveCircuits(before.filter((c) => c.id !== id));
    await this.refresh();
    showUndo(`${removed.name} removed`, async () => {
      await storage.saveCircuits(before);
      await this.refresh();
    });
  }

  // --- Coach notes (lib/ai/coachNotes.ts) ---

  async saveAthleteProfile(profile: AthleteProfile) {
    await storage.saveAthleteProfile($state.snapshot(profile) as AthleteProfile);
    await this.refresh();
  }

  /**
   * Adds or changes a note by hand. Editing one the AI wrote makes it the user's
   * ("me"), so later AI coaches leave it alone unless asked.
   */
  async saveCoachNote(text: string, id?: string): Promise<boolean> {
    const trimmed = text.trim().slice(0, MAX_COACH_NOTE_LENGTH);
    if (!trimmed) return false;
    const notes = $state.snapshot(this.coachNotes) as CoachNote[];
    const today = this.todayIso;
    if (id) {
      await storage.saveCoachNotes(notes.map((n) => (n.id === id ? { ...n, text: trimmed, source: 'me' as const, updatedOn: today } : n)));
    } else {
      if (notes.length >= MAX_COACH_NOTES) {
        toast.show(`${MAX_COACH_NOTES} notes is the most - remove one first`);
        return false;
      }
      await storage.saveCoachNotes([...notes, { id: newCoachNoteId(notes), text: trimmed, source: 'me', addedOn: today }]);
    }
    await this.refresh();
    return true;
  }

  async deleteCoachNote(id: string) {
    const before = $state.snapshot(this.coachNotes) as CoachNote[];
    const removed = before.find((n) => n.id === id);
    if (!removed) return;
    await storage.saveCoachNotes(before.filter((n) => n.id !== id));
    await this.refresh();
    showUndo('Coach note removed', async () => {
      await storage.saveCoachNotes(before);
      await this.refresh();
    });
  }

  /** Sets a block's note (blank clears it). */
  async saveBlockNotes(blockId: string, notes: string) {
    const block = this.planningStore.trainingBlocks.find((b) => b.id === blockId);
    if (!block) return;
    const trimmed = notes.trim();
    const { notes: _old, ...rest } = block;
    await this.saveTrainingBlock(trimmed ? { ...rest, notes: trimmed } : rest);
  }

  /** Creates or updates a goal - a competition or an outdoor trip. */
  async saveGoal(goal: GoalEvent) {
    await this.planningStore.saveGoal(goal);
    await this.refresh();
  }

  /** Deletes a goal after confirmation. */
  async deleteGoal(id: string) {
    const goal = this.planningStore.goals.find((g) => g.id === id);
    const what = goal?.kind === 'trip' ? 'trip' : 'competition';
    const confirmed = await showConfirm(`Delete ${what}`, `Delete "${goal?.name ?? 'this goal'}"?`);
    if (!confirmed) return;
    await this.planningStore.deleteGoal(id);
    await this.refresh();
  }

  /**
   * Logs a pain/discomfort entry.
   */
  async savePainLog(log: PainLog) {
    // Every entry belongs to an issue: one saved without (an edit of an
    // old entry, a caller that doesn't know about issues) joins the open
    // issue for its body part or starts one.
    const logs = [...this.metricsStore.painLogs.filter((l) => l.id !== log.id), log];
    const { logs: linked, issues } = attachOrphanLogs(logs, this.metricsStore.painIssues);
    await this.metricsStore.savePain(linked, issues);
    await this.refresh();
  }

  // --- Pain issues ---

  /** A new issue with its first check-in. */
  async reportPain(issue: PainIssue, first: PainLog) {
    await this.metricsStore.savePain(
      [...this.metricsStore.painLogs, { ...first, issueId: issue.id, bodyPart: issue.bodyPart }],
      [...this.metricsStore.painIssues.filter((i) => i.id !== issue.id), issue],
    );
    await this.refresh();
  }

  /** A check-in on an issue - one tap from Home or after a session. "Gone" closes it today. */
  async checkInPain(issueId: string, trend: PainTrend, extra: Partial<Pick<PainLog, 'severity' | 'notes' | 'kinds' | 'timing'>> = {}, dateIso = this.todayIso) {
    const issue = this.metricsStore.painIssues.find((i) => i.id === issueId);
    if (!issue) return;
    const r = checkInPainIssue($state.snapshot(issue) as PainIssue, this.metricsStore.painLogs, trend, dateIso, generateId, extra);
    await this.metricsStore.savePain(
      [...this.metricsStore.painLogs, r.log],
      this.metricsStore.painIssues.map((i) => (i.id === issueId ? r.issue : i)),
    );
    await this.refresh();
    const note = trend === 'gone' ? 'closed' : `check-in: ${TREND_LABELS[trend].toLowerCase()}`;
    showUndo(`${issue.bodyPart} ${note}`, () => this.undoPainCheckIn(r.log.id, issue));
  }

  /** Takes a check-in back and restores the issue as it was before it. */
  private async undoPainCheckIn(logId: string, issueBefore: PainIssue) {
    await this.metricsStore.savePain(
      this.metricsStore.painLogs.filter((l) => l.id !== logId),
      this.metricsStore.painIssues.map((i) => (i.id === issueBefore.id ? issueBefore : i)),
    );
    await this.refresh();
  }

  /** Edits an issue (name, region, watch list, notes, dates). A renamed issue renames its check-ins too. */
  async savePainIssue(issue: PainIssue) {
    const plain = $state.snapshot(issue) as PainIssue;
    await this.metricsStore.savePain(
      this.metricsStore.painLogs.map((l) => (l.issueId === plain.id && l.bodyPart !== plain.bodyPart ? { ...l, bodyPart: plain.bodyPart } : l)),
      [...this.metricsStore.painIssues.filter((i) => i.id !== plain.id), plain],
    );
    await this.refresh();
  }

  /** It came back: open again, end removed. */
  async reopenPainIssue(id: string) {
    const issue = this.metricsStore.painIssues.find((i) => i.id === id);
    if (!issue) return;
    const { endDate: _end, endEstimated: _est, ...open } = $state.snapshot(issue) as PainIssue;
    await this.savePainIssue(open);
  }

  /** Deletes an issue with all its check-ins, with an Undo toast. */
  async deletePainIssue(id: string) {
    const issue = this.metricsStore.painIssues.find((i) => i.id === id);
    if (!issue) return;
    const issueCopy = $state.snapshot(issue) as PainIssue;
    const logsCopy = $state.snapshot(this.metricsStore.painLogs.filter((l) => l.issueId === id)) as PainLog[];
    await this.metricsStore.savePain(
      this.metricsStore.painLogs.filter((l) => l.issueId !== id),
      this.metricsStore.painIssues.filter((i) => i.id !== id),
    );
    await this.refresh();
    showUndo(`${issueCopy.bodyPart} deleted`, async () => {
      await this.metricsStore.savePain([...this.metricsStore.painLogs, ...logsCopy], [...this.metricsStore.painIssues, issueCopy]);
      await this.refresh();
    });
  }

  /**
   * Deletes a pain/discomfort log entry at once, with an Undo toast.
   */
  async deletePainLog(id: string) {
    const log = this.metricsStore.painLogs.find((p) => p.id === id);
    if (!log) return;
    const copy = $state.snapshot(log) as PainLog;
    await this.metricsStore.deletePainLog(id);
    await this.refresh();
    showUndo('Pain entry deleted', () => this.savePainLog(copy));
  }

  /**
   * Logs (or updates) a daily metric entry, e.g. a bodyweight reading.
   * Ensures the referenced MetricDef exists first (a fresh install has none
   * seeded by migration).
   */
  async saveDailyMetric(entry: DailyMetricEntry, def: MetricDef) {
    await this.metricsStore.ensureMetricDef(def);
    await this.metricsStore.saveDailyMetric(entry);
    await this.refresh();
  }

  /** Saves a batch of imported daily metrics (Health Connect) in one write, then refreshes once. */
  async importDailyMetrics(entries: DailyMetricEntry[], defs: MetricDef[]) {
    for (const def of defs) await this.metricsStore.ensureMetricDef(def);
    await storage.upsertDailyMetrics(entries);
    await this.refresh();
  }

  /** Removes daily metric entries without a toast - for an undo that puts back what an action added. */
  async removeDailyMetrics(ids: string[]) {
    for (const id of ids) await this.metricsStore.deleteDailyMetric(id);
    await this.refresh();
  }

  /**
   * Deletes a daily metric entry (e.g. a bodyweight reading) at once, with an Undo toast.
   */
  async deleteDailyMetric(id: string) {
    const entry = this.metricsStore.dailyMetrics.find((m) => m.id === id);
    if (!entry) return;
    const copy = $state.snapshot(entry) as DailyMetricEntry;
    await this.metricsStore.deleteDailyMetric(id);
    await this.refresh();
    showUndo('Entry deleted', async () => {
      await this.metricsStore.saveDailyMetric(copy);
      await this.refresh();
    });
  }

  /** Adds imported activities not stored yet and returns how many were new. */
  async addExternalActivities(items: ExternalActivity[]): Promise<number> {
    const added = await this.externalActivityStore.add(items);
    await this.externalActivityStore.load();
    return added;
  }

  /** Fills in how-it-went stats on already imported activities that lack them; returns how many. */
  async refreshExternalActivities(items: ExternalActivity[]): Promise<number> {
    const changed = await this.externalActivityStore.addStats(items);
    await this.externalActivityStore.load();
    return changed;
  }

  async removeExternalActivities(ids: string[]) {
    await this.externalActivityStore.remove(ids);
    await this.externalActivityStore.load();
  }

  /**
   * Saves (or updates) a single outdoor ascent.
   */
  async saveOutdoorAscent(ascent: OutdoorAscent) {
    await this.outdoorAscentStore.saveOutdoorAscent(ascent);
    await this.refresh();
  }

  /**
   * Appends a batch of outdoor ascents (e.g. from a CSV import) in one write.
   */
  async addOutdoorAscents(ascents: OutdoorAscent[]) {
    await this.outdoorAscentStore.addOutdoorAscents(ascents);
    await this.refresh();
  }

  /**
   * Deletes an outdoor ascent at once, with an Undo toast.
   */
  async deleteOutdoorAscent(id: string) {
    const ascent = this.outdoorAscentStore.outdoorAscents.find((a) => a.id === id);
    if (!ascent) return;
    const copy = $state.snapshot(ascent) as OutdoorAscent;
    await this.outdoorAscentStore.deleteOutdoorAscent(id);
    await this.refresh();
    showUndo(`${copy.name || 'Send'} deleted`, () => this.saveOutdoorAscent(copy));
  }

  /**
   * Updates the global list of exercise modalities.
   */
  async updateExerciseTypes(types: ExerciseTypeDef[]) {
    await this.catalogStore.updateExerciseTypes(types);
    await this.refresh();
  }


  /**
   * Resets templates to their default values.
   */
  async resetTemplates() {
    await this.planningStore.resetTemplates();
    await this.refresh();
  }

  /**
   * The welcome's starter plan: takes out the blocks an earlier pick saved (`previousIds`, if the
   * person went back and chose again) and saves `option`'s. No sessions are written - the weeks
   * project them from the templates. Returns the new blocks' ids, for `previousIds` or an Undo.
   */
  async replaceStarterPlan(previousIds: string[], option: StarterPlanOption | null): Promise<string[]> {
    for (const id of previousIds) await this.planningStore.deleteTrainingBlock(id);
    const ids: string[] = [];
    for (const block of option?.blocks ?? []) {
      const id = generateId();
      ids.push(id);
      await this.planningStore.saveTrainingBlock({ id, ...block });
    }
    await this.refresh();
    return ids;
  }

  /**
   * Takes weigh-in test slots out of the phases' session templates and Plan B alternatives (planned sessions are
   * handled by the caller). Returns how many went and a function that puts them back.
   */
  async stripTestSlotsFromPlan(typeIds: string[]): Promise<{ count: number; undo: () => Promise<void> }> {
    const templates = withoutWeighInSlotsInTemplates(this.templates, typeIds);
    const alts = withoutWeighInSlotsInAlternatives(this.planningStore.planAlternatives, typeIds);
    if (templates.count === 0 && alts.count === 0) return { count: 0, undo: async () => {} };
    const beforeTemplates = $state.snapshot(this.templates) as Record<string, WorkoutTemplate[]>;
    const beforeAlts = alts.changed.map((a) => $state.snapshot(this.planningStore.planAlternatives.find((x) => x.id === a.id)) as PlanAlternative);
    if (templates.count > 0) await storage.saveTemplates({ ...beforeTemplates, ...structuredClone(templates.changed) });
    for (const a of alts.changed) await storage.savePlanAlternative($state.snapshot(a) as PlanAlternative);
    await this.refresh();
    return {
      count: templates.count + alts.count,
      undo: async () => {
        if (templates.count > 0) await storage.saveTemplates(beforeTemplates);
        for (const a of beforeAlts) await storage.savePlanAlternative(a);
        await this.refresh();
      },
    };
  }

  /** Replaces the phases' sessions with a starter set's (welcome screen's level choice). */
  async applyStarterSet(setId: string) {
    const set = DEFAULT_TEMPLATE_LIBRARY.find((s) => s.id === setId);
    if (!set) return;
    await storage.saveTemplates({ ...$state.snapshot(this.templates), ...structuredClone(set.templates) });
    await this.refresh();
  }
}

export const trainingState = new TrainingState();
