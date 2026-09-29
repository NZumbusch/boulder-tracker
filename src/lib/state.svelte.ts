import { attachOrphanLogs, checkIn as checkInPainIssue } from './pain/issues';
import { openWorkout } from './workoutModal.svelte';
import { toast, showUndo } from './toast.svelte';
import { copySessionsToWeek } from './planning/copyWeek';
import { storage } from './storage';
import { DEFAULT_TEMPLATE_LIBRARY } from './constants';
import { isDemoMode, takeRecoveryNotice } from './storage/persistence';
import type { ThemePreference } from './preferences/theme';
import type { Workout, Benchmark, ExerciseTypeDef, ViewType, TrainingBlock, GoalEvent, PainLog, PainIssue, PainTrend, DailyMetricEntry, MetricDef, OutdoorAscent, PlanAlternative, PlanSide, DayOfWeek, AthleteProfile, CoachNote, Circuit } from './types';
import { MAX_COACH_NOTES, MAX_COACH_NOTE_LENGTH, newCoachNoteId } from './ai/coachNotes';
import { getWeekId, localIsoDate } from './dateUtils';
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
  isWeekProvisional,
  templatesForWeek,
  projectWeekWorkouts,
  effectiveWorkoutsForWeek,
  provisionalPastWeeks,
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
import { WorkoutStore } from './stores/workoutStore.svelte';
import { PlanningStore } from './stores/planningStore.svelte';
import { CatalogStore } from './stores/catalogStore.svelte';
import { BenchmarkStore } from './stores/benchmarkStore.svelte';
import { MetricsStore } from './stores/metricsStore.svelte';
import { OutdoorAscentStore } from './stores/outdoorAscentStore.svelte';
import { UiStore } from './stores/uiStore.svelte';
import { SessionStore } from './stores/sessionStore.svelte';
import { BackupStore } from './stores/backupStore.svelte';
import { PreferencesStore } from './stores/preferencesStore.svelte';
import { WeatherStore } from './stores/weatherStore.svelte';
import type { WeatherLocation, FatigueChartStyle, AnalyticsRange, RecoveryChartMode, HomeSectionPreference, AISharingPreferences, AIHistoryWindow, AddedExerciseTarget, PainCheckInPrefs } from './preferences/migrate';
import { geocodeCity } from './weather/api';
import type { CragForecast } from './weather/suggestion';
import type { TextScale, MotionPreference } from './preferences/migrate';
import { syncFatigueReminders } from './notifications/fatigueReminder';
import { syncDailyMetricsReminder } from './notifications/dailyMetricsReminder';
import { syncPainReminder } from './notifications/painReminder';
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
  get weekOverrides() { return this.planningStore.weekOverrides; }
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
  get benchmarkTypes() { return this.catalogStore.benchmarkTypes; }
  get phaseDefs() { return this.catalogStore.phaseDefs; }
  get benchmarks() { return this.benchmarkStore.benchmarks; }
  get metricDefs() { return this.metricsStore.metricDefs; }
  get dailyMetrics() { return this.metricsStore.dailyMetrics; }
  get painLogs() { return this.metricsStore.painLogs; }
  get painIssues() { return this.metricsStore.painIssues; }
  get outdoorAscents() { return this.outdoorAscentStore.outdoorAscents; }

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
      await syncDailyMetricsReminder(this.dailyMetrics, this.dailyMetricsReminderTime);
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
      await syncDailyMetricsReminder(this.dailyMetrics, time);
    }
  }

  // --- Weather ---

  get homeLocation() { return this.preferencesStore.homeLocation; }
  get crags() { return this.preferencesStore.crags; }
  get homeWeather() { return this.weatherStore.home; }
  /** Per-crag weather, same order as `crags`. */
  get cragWeather() { return this.weatherStore.crags; }

  /** Sets the home location and immediately fetches for it (or clears the card if `location` is `null`). */
  async setHomeLocation(location: WeatherLocation | null) {
    this.preferencesStore.setHomeLocation(location);
    await this.weatherStore.loadHome(location);
  }

  /** Replaces the saved crags and fetches conditions for them. */
  async setCrags(crags: WeatherLocation[]) {
    this.preferencesStore.setCrags(crags);
    await this.weatherStore.loadCrags(this.preferencesStore.crags);
  }

  /** Re-fetches whichever locations are currently set - called from Home on mount, not on every `refresh()` (a network call on every save would be excessive for data that changes over hours, not seconds). */
  async refreshWeather() {
    const todayIso = localIsoDate();
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
  get sessionNotification() { return this.preferencesStore.sessionNotification; }
  setTimerVibrateEnabled(enabled: boolean) { this.preferencesStore.setTimerVibrateEnabled(enabled); }
  setTimerBeepEnabled(enabled: boolean) { this.preferencesStore.setTimerBeepEnabled(enabled); }
  setTimerKeepAwakeEnabled(enabled: boolean) { this.preferencesStore.setTimerKeepAwakeEnabled(enabled); }
  setTimerBackgroundAlerts(enabled: boolean) { this.preferencesStore.setTimerBackgroundAlerts(enabled); }
  setTimerCountdownTicks(enabled: boolean) { this.preferencesStore.setTimerCountdownTicks(enabled); }
  setTimerWarnBeforeEnd(enabled: boolean) { this.preferencesStore.setTimerWarnBeforeEnd(enabled); }
  setTimerPillHidden(hidden: boolean) { this.preferencesStore.setTimerPillHidden(hidden); }
  get painCheckIns() { return this.preferencesStore.painCheckIns; }
  async setPainCheckIns(changes: Partial<PainCheckInPrefs>) {
    this.preferencesStore.setPainCheckIns(changes);
    try {
      await syncPainReminder(this.metricsStore.painIssues, this.metricsStore.painLogs, this.preferencesStore.painCheckIns);
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
  get readinessConfig(): ReadinessConfig {
    const t = this.preferencesStore.tunables;
    return {
      use: { fatigue: flag(t, 'readiness.useFatigue'), acwr: flag(t, 'readiness.useAcwr'), sleep: flag(t, 'readiness.useSleep'), hrv: flag(t, 'readiness.useHrv') },
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
  get fatigueHalfLife() { return num(this.preferencesStore.tunables, 'fatigue.halfLifeDays'); }
  /** Half-life and softening for accumulated fatigue - see `computeFatigueDecay`. */
  get fatigueModel(): FatigueModel {
    const t = this.preferencesStore.tunables;
    return { halfLifeDays: num(t, 'fatigue.halfLifeDays'), soften: flag(t, 'fatigue.soften'), softKnee: num(t, 'fatigue.softKnee') };
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

  /** The (?) glossary buttons (a preference, on by default). */
  get helpButtons() { return this.preferencesStore.helpButtons; }
  setHelpButtons(on: boolean) { this.preferencesStore.setHelpButtons(on); }

  /** Whether the first-run welcome has been seen on this device. */
  get welcomeDone() { return this.preferencesStore.welcomeDone; }
  setWelcomeDone(done: boolean) { this.preferencesStore.setWelcomeDone(done); }

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

      await Promise.all([
        this.workoutStore.load(),
        this.planningStore.load(),
        this.catalogStore.load(),
        this.benchmarkStore.load(),
        this.metricsStore.load(),
        this.outdoorAscentStore.load(),
      ]);

      // The database file was damaged and got restored (storage/persistence.ts) - say so, once.
      const recovery = takeRecoveryNotice();
      if (recovery) void showAlert('Data restored', recovery);

      // Any provisional week that has since finished is written out now, so
      // history records what was planned at the time rather than whatever
      // the templates say today. Must run after the stores have loaded and
      // before anything reads the week, and is a no-op in the common case.
      try {
        await this.materializePastWeeks();
      } catch (err) {
        console.error('Failed to materialize past provisional weeks:', err);
      }

      // Not from the tour's example data.
      if (this.uiStore.notificationsEnabled && !isDemoMode()) {
        try {
          await syncFatigueReminders(this.remindableWorkouts);
        } catch (err) {
          console.error('Failed to sync fatigue-reminder notifications:', err);
        }
        if (this.preferencesStore.dailyMetricsReminderEnabled) {
          try {
            await syncDailyMetricsReminder(this.metricsStore.dailyMetrics, this.preferencesStore.dailyMetricsReminderTime);
          } catch (err) {
            console.error('Failed to sync daily-metrics reminder notification:', err);
          }
        }
        try {
          await syncPainReminder(this.metricsStore.painIssues, this.metricsStore.painLogs, this.preferencesStore.painCheckIns);
        } catch (err) {
          console.error('Failed to sync the pain check-in reminder:', err);
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

  get currentWeekId() {
    return getWeekId(new Date());
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
      weekOverrides: this.planningStore.weekOverrides,
    };
  }

  /** True while a week still shows projected sessions rather than stored ones (see `lib/planning/weekProjection.ts`). */
  isWeekProvisional(weekId: string) {
    return isWeekProvisional(this.projectionContext, weekId);
  }

  /**
   * Whether a materialised week could go back to following its phase -
   * i.e. there is a phase with templates behind it to fall back to. False
   * for a week that is already provisional (nothing to reset) or one no
   * phase covers.
   */
  canResetWeekToDefaults(weekId: string) {
    if (isWeekProvisional(this.projectionContext, weekId)) return false;
    return templatesForWeek(this.projectionContext, weekId).length > 0;
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

  getPlannedWorkoutsForWeek(weekId: string) {
    return sortWorkoutsBySchedule(
      this.getWorkoutsForWeek(weekId).filter((w) => w.status === 'planned'),
    );
  }

  /**
   * The copy-on-write gate. Every write path that touches a week calls this
   * first: if the week is still provisional, its projected sessions are
   * written out as real rows *before* the caller's own change is applied.
   *
   * Whole-week, not per-session, deliberately - editing one projected
   * session must not make the week's other projected sessions vanish, which
   * is exactly what would happen if the edit alone were saved (the week
   * would stop being provisional the moment it had one stored row).
   */
  private async materializeWeekIfProvisional(weekId: string | undefined) {
    if (!weekId) return;
    const projected = projectWeekWorkouts(this.projectionContext, weekId);
    if (projected.length === 0) return;
    await this.workoutStore.materializeWeek(weekId, projected);
    await this.workoutStore.load();
  }

  /**
   * Puts a week back under its phase's control, undoing a lock-in (or any
   * hand edits). Destructive to this week's planned sessions, so it
   * confirms first; completed sessions are always kept.
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
   * Explicitly commits a provisional week - the Plan screen's "lock in"
   * action. Same materialisation every write triggers, just with nothing
   * else attached to it.
   */
  async materializeWeek(weekId: string) {
    await this.materializeWeekIfProvisional(weekId);
    await this.refresh();
  }

  /**
   * Materialises every provisional week that has already finished. Run once
   * per app load: a past week must keep what was planned at the time, and a
   * projection would instead re-derive it from whatever the templates say
   * today - so an edit to a template would silently rewrite history.
   */
  private async materializePastWeeks() {
    const stale = provisionalPastWeeks(this.projectionContext, this.currentWeekId);
    if (stale.length === 0) return;
    for (const weekId of stale) {
      const projected = projectWeekWorkouts(this.projectionContext, weekId);
      if (projected.length > 0) {
        await this.workoutStore.materializeWeek(weekId, projected);
        await this.workoutStore.load();
      }
    }
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
   * you aren't going to do.
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

    // Land on the finished session in the workout modal, wherever you
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
  async importData(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const progress = (label: string, fraction: number) => { this.importProgress = { label, fraction }; };
    try {
      progress('Reading backup', 0.1);
      await this.backupStore.importFile(file, progress);
      progress('Loading your data', 0.85);
      await this.refresh();
      progress('Done', 1);
      // Let the full bar register rather than vanish mid-fill.
      await new Promise((r) => setTimeout(r, 400));
      this.importProgress = null;
      await showAlert('Import Success', 'Data imported successfully!');
      this.navigate('history');
    } catch (err) {
      this.importProgress = null;
      await showAlert('Import Error', 'Failed to import data. Please check the file format.');
    } finally {
      target.value = '';
    }
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

  /** The plain save: into its week, materialising it first. */
  private async storeWorkout(workout: Workout) {
    await this.materializeWeekIfProvisional(workout.weekId);
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
   * reassignment) - found and fixed 2026-09-18 after the
   * new day-picker made this pre-existing behaviour newly visible.
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
    await this.materializeWeekIfProvisional(workout.weekId);
    await this.workoutStore.saveWorkout(workout);
    await this.workoutStore.load();
    if (this.uiStore.notificationsEnabled) {
      try {
        await syncFatigueReminders(this.remindableWorkouts);
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
    // Materialise the week first: a projected session has no stored row to
    // delete until the week is real.
    await this.materializeWeekIfProvisional(workout.weekId);
    await this.workoutStore.deleteWorkout(id);
    await this.refresh();
    // Straight back into the week - never through Plan B mode.
    showUndo(`"${copy.notes || 'Session'}" deleted`, () => this.storeWorkout(copy));
  }

  /**
   * Finds a workout by id across stored rows and, failing that, across every
   * provisional week's projections - a projected session is a real thing the
   * user can act on, but has no stored row to look up.
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
    await this.materializeWeekIfProvisional(workout.weekId);
    await this.workoutStore.duplicateWorkout(workout);
    await this.refresh();
    toast.show(`Copied as a planned session${workout.dayOfWeek ? ` on ${workout.dayOfWeek}` : ''}`);
  }

  /**
   * Saves a benchmark to storage and refreshes local state.
   */
  async saveBenchmark(benchmark: Benchmark) {
    await this.benchmarkStore.saveBenchmark(benchmark);
    await this.refresh();
  }

  /**
   * Deletes a benchmark at once, with an Undo toast that saves it back.
   */
  async deleteBenchmark(id: string) {
    const benchmark = this.benchmarkStore.benchmarks.find((b) => b.id === id);
    if (!benchmark) return;
    const copy = $state.snapshot(benchmark) as Benchmark;
    await this.benchmarkStore.deleteBenchmark(id);
    await this.refresh();
    showUndo(`${copy.type} result deleted`, () => this.saveBenchmark(copy));
  }

  /**
   * Resets a week by removing its phase assignment and all workouts.
   */
  async clearWeek(weekId: string) {
    const confirmed = await showConfirm('Clear Week', `Are you sure you want to clear all data for ${weekId}? This will delete all workouts and benchmarks for this week.`);
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
   * Assigns a training phase to a specific week.
   */
  async assignPhase(weekId: string, phaseId: string) {
    await this.planningStore.assignPhase(weekId, phaseId);
    await this.refresh();
  }

  /**
   * Creates or updates a (possibly multi-week) training block.
   */
  async saveTrainingBlock(block: TrainingBlock) {
    await this.planningStore.saveTrainingBlock(block);
    await this.refresh();
  }

  /** Applies an AI change set's result (see `changePlanner.ts`) in one write, then reloads. */
  async applyPlanWrites(writes: PlanWrites) {
    await storage.applyPlanWrites(writes);
    await this.refresh();
    this.planUndoVersion++;
    showUndo('AI changes applied', async () => { await this.undoPlanChange(); });
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
    await storage.undoPlanChange();
    await this.refresh();
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
        customized: true,
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
      weekOverrides: this.weekOverrides,
      weekNotes: this.weekNotes,
      planAlternatives: this.planAlternatives,
      coachNotes: this.coachNotes,
      circuits: this.circuits,
      today: localIsoDate(),
      currentWeekId: this.currentWeekId,
    };
  }

  /** `weekId`'s note, or "" - see `WeekNote`. */
  getWeekNote(weekId: string): string {
    return weekNoteText(this.planningStore.weekNotes, weekId);
  }

  /**
   * Sets `weekId`'s note (blank deletes it). Deliberately not routed
   * through the materialise gate: a note belongs to the week, not to its
   * sessions, so writing one leaves a provisional week provisional.
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
   * Adds or changes a note by hand. Editing one the AI wrote makes it yours
   * ("me"), so later AI coaches leave it alone unless asked.
   */
  async saveCoachNote(text: string, id?: string): Promise<boolean> {
    const trimmed = text.trim().slice(0, MAX_COACH_NOTE_LENGTH);
    if (!trimmed) return false;
    const notes = $state.snapshot(this.coachNotes) as CoachNote[];
    const today = localIsoDate();
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

  /**
   * Deletes a training block after confirmation.
   */
  async deleteTrainingBlock(id: string) {
    const confirmed = await showConfirm('Delete Training Block', 'Delete this training block? Any weeks only covered by it will show no phase.');
    if (!confirmed) return;
    await this.planningStore.deleteTrainingBlock(id);
    await this.refresh();
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

  // --- Pain issues (PAIN_PLAN.md) ---

  /** A new issue with its first check-in. */
  async reportPain(issue: PainIssue, first: PainLog) {
    await this.metricsStore.savePain(
      [...this.metricsStore.painLogs, { ...first, issueId: issue.id, bodyPart: issue.bodyPart }],
      [...this.metricsStore.painIssues.filter((i) => i.id !== issue.id), issue],
    );
    await this.refresh();
  }

  /** A check-in on an issue - one tap from Home or after a session. "Gone" closes it today. */
  async checkInPain(issueId: string, trend: PainTrend, extra: Partial<Pick<PainLog, 'severity' | 'notes' | 'kinds' | 'timing'>> = {}, dateIso = localIsoDate()) {
    const issue = this.metricsStore.painIssues.find((i) => i.id === issueId);
    if (!issue) return;
    const r = checkInPainIssue($state.snapshot(issue) as PainIssue, this.metricsStore.painLogs, trend, dateIso, generateId, extra);
    await this.metricsStore.savePain(
      [...this.metricsStore.painLogs, r.log],
      this.metricsStore.painIssues.map((i) => (i.id === issueId ? r.issue : i)),
    );
    await this.refresh();
    if (trend === 'gone') showUndo(`${issue.bodyPart} closed`, () => this.undoPainCheckIn(r.log.id, issue));
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
   * Ensures the referenced MetricDef exists first - defensive, see
   * (fixed 2026-09-17: a fresh install had no MetricDefs seeded).
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

  /** Replaces the phases' sessions with a starter set's (welcome screen's level choice). */
  async applyStarterSet(setId: string) {
    const set = DEFAULT_TEMPLATE_LIBRARY.find((s) => s.id === setId);
    if (!set) return;
    await storage.saveTemplates({ ...$state.snapshot(this.templates), ...structuredClone(set.templates) });
    await this.refresh();
  }
}

export const trainingState = new TrainingState();
