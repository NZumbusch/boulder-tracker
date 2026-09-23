import { storage } from './storage';
import type { Workout, WorkoutTemplate, PhaseDef, Benchmark, BenchmarkTypeDef, AnalyticsCategory, ExerciseTypeDef, ViewType, TrainingBlock, GoalEvent, PainLog, DailyMetricEntry, MetricDef, OutdoorAscent } from './types';
import { getWeekId } from './dateUtils';
import { sortWorkoutsBySchedule } from './planning/sortWorkouts';
import { weekNoteText } from './planning/notes';
import { tripInForecast } from './goals/goals';
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
import { showAlert, showConfirm } from './utils';
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
import type { WeatherLocation, FatigueChartStyle, ChartDensity, HomeSectionPreference, AISharingPreferences, PlanFormat, AddedExerciseTarget } from './preferences/migrate';
import { geocodeCity } from './weather/api';
import type { TextScale, MotionPreference } from './preferences/migrate';
import { syncFatigueReminders } from './notifications/fatigueReminder';
import { syncDailyMetricsReminder } from './notifications/dailyMetricsReminder';
import { cancelRemindersOfType } from './notifications/shared';

/**
 * Global reactive state for the application, composed from the domain
 * stores in `src/lib/stores/`. This facade preserves the pre-Phase-2
 * public API (same property/method names on `trainingState`) so the
 * many existing component call sites don't need to change - the domain
 * stores are the real decomposition, this is a thin compatibility layer
 * over them (see PLAN.md Phase 2 / PROGRESS.md 2026-09-16).
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

  constructor() {
    this.refresh();
  }

  // --- Delegated data state (read-only from outside; mutated via actions) ---

  get workouts() { return this.workoutStore.workouts; }
  get trainingBlocks() { return this.planningStore.trainingBlocks; }
  get weekOverrides() { return this.planningStore.weekOverrides; }
  get weekNotes() { return this.planningStore.weekNotes; }
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
  get outdoorAscents() { return this.outdoorAscentStore.outdoorAscents; }

  // --- Delegated UI state ---

  get view() { return this.uiStore.view; }
  get activeWorkout() { return this.uiStore.activeWorkout; }
  get showFatigue() { return this.uiStore.showFatigue; }
  get theme() { return this.uiStore.theme; }
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
  async setDailyMetricsReminderTime(time: string) {
    this.preferencesStore.setDailyMetricsReminderTime(time);
    if (this.dailyMetricsReminderEnabled) {
      await syncDailyMetricsReminder(this.dailyMetrics, time);
    }
  }

  // --- Weather (UI_PLAN.md §5.5) ---

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

  /** Replaces the saved crags (up to `MAX_CRAGS`) and fetches conditions for them. */
  async setCrags(crags: WeatherLocation[]) {
    this.preferencesStore.setCrags(crags);
    await this.weatherStore.loadCrags(this.preferencesStore.crags);
  }

  /** Re-fetches whichever locations are currently set - called from Home on mount, not on every `refresh()` (a network call on every save would be excessive for data that changes over hours, not seconds). */
  async refreshWeather() {
    const todayIso = new Date().toISOString().split('T')[0];
    await Promise.all([
      this.weatherStore.loadHome(this.homeLocation),
      this.weatherStore.loadCrags(this.crags),
      this.weatherStore.loadGoal(tripInForecast(this.planningStore.goals, todayIso)?.location ?? null),
    ]);
  }

  /** Conditions at the next trip's place, once it's within the forecast - see `tripInForecast`. */
  get goalWeather() { return this.weatherStore.goal; }

  /** City name -> candidate locations, for the Settings location picker (UI_PLAN.md §10 open question 3 - raw lat/lon entry bypasses this entirely). */
  async geocodeCity(query: string) {
    return geocodeCity(query);
  }

  // --- Fatigue chart style, timer toggles, Home section layout (UI_PLAN.md §4.7) ---

  get fatigueChartStyle() { return this.preferencesStore.fatigueChartStyle; }
  setFatigueChartStyle(style: FatigueChartStyle) { this.preferencesStore.setFatigueChartStyle(style); }

  get chartDensity() { return this.preferencesStore.chartDensity; }
  setChartDensity(density: ChartDensity) { this.preferencesStore.setChartDensity(density); }

  get timerVibrateEnabled() { return this.preferencesStore.timerVibrateEnabled; }
  get timerBeepEnabled() { return this.preferencesStore.timerBeepEnabled; }
  get timerKeepAwakeEnabled() { return this.preferencesStore.timerKeepAwakeEnabled; }
  setTimerVibrateEnabled(enabled: boolean) { this.preferencesStore.setTimerVibrateEnabled(enabled); }
  setTimerBeepEnabled(enabled: boolean) { this.preferencesStore.setTimerBeepEnabled(enabled); }
  setTimerKeepAwakeEnabled(enabled: boolean) { this.preferencesStore.setTimerKeepAwakeEnabled(enabled); }

  get homeSections() { return this.preferencesStore.homeSections; }
  setHomeSectionVisible(id: HomeSectionPreference['id'], visible: boolean) {
    this.preferencesStore.setHomeSectionVisible(id, visible);
  }
  setHomeSectionOrder(order: HomeSectionPreference['id'][]) {
    this.preferencesStore.setHomeSectionOrder(order);
  }
  /** Per-part Home toggles, keyed by `homeDetails.ts` ids - see `Preferences.homeDetails`. */
  get homeDetails() { return this.preferencesStore.homeDetails; }
  setHomeDetail(id: string, enabled: boolean) {
    this.preferencesStore.setHomeDetail(id, enabled);
  }

  // --- AI sharing (UI_PLAN.md §5.8, Stage 10) ---

  get aiSharing() { return this.preferencesStore.aiSharing; }
  setAiSharing(category: keyof AISharingPreferences, enabled: boolean) {
    this.preferencesStore.setAiSharing(category, enabled);
  }

  /** Which plan contract "Generate Plan" asks the AI for - see `PlanFormat`. */
  get planFormat() { return this.preferencesStore.planFormat; }
  setPlanFormat(format: PlanFormat) {
    this.preferencesStore.setPlanFormat(format);
  }

  /** What `prescribed` an exercise added mid-session gets - see `AddedExerciseTarget`. */
  get addedExerciseTarget() { return this.preferencesStore.addedExerciseTarget; }
  setAddedExerciseTarget(target: AddedExerciseTarget) {
    this.preferencesStore.setAddedExerciseTarget(target);
  }

  /**
   * Refreshes all data from storage.
   */
  async refresh() {
    this.isLoading = true;
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

      // Any provisional week that has since finished is written out now, so
      // history records what was planned at the time rather than whatever
      // the templates say today. Must run after the stores have loaded and
      // before anything reads the week, and is a no-op in the common case.
      try {
        await this.materializePastWeeks();
      } catch (err) {
        console.error('Failed to materialize past provisional weeks:', err);
      }

      if (this.uiStore.notificationsEnabled) {
        try {
          await syncFatigueReminders(this.workoutStore.workouts);
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
      }
    } finally {
      this.isLoading = false;
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

  /**
   * A week's sessions as the app should show them: its stored workouts, or
   * its projected ones while it is still provisional. Every screen that
   * lists a week's sessions reads through this, so a provisional week looks
   * and behaves like a planned one everywhere.
   */
  getWorkoutsForWeek(weekId: string) {
    return effectiveWorkoutsForWeek(this.projectionContext, weekId);
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
   * Bulk write path for an AI plan import. Deliberately bypasses the
   * copy-on-write gate: the importer has already decided which weeks get
   * stored rows and which stay provisional, so materialising a week here
   * would write the phase's templates *and* the imported sessions into the
   * same week. Refreshes once at the end rather than once per workout.
   */
  async importPlanWorkouts(workouts: Workout[]) {
    for (const workout of workouts) {
      await this.workoutStore.saveWorkout(workout);
    }
    await this.refresh();
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

  getBlocksForWeek(weekId: string) {
    return this.planningStore.getBlocksForWeek(weekId);
  }

  getDominantBlockForWeek(weekId: string) {
    return this.planningStore.getDominantBlockForWeek(weekId);
  }

  isWeekCustomized(weekId: string) {
    return this.planningStore.isWeekCustomized(weekId);
  }

  getBenchmarksForWeek(weekId: string) {
    return this.benchmarkStore.getBenchmarksForWeek(weekId);
  }

  // --- Actions ---

  /**
   * Navigates to a specific view and optionally sets an active workout.
   */
  /** Opens History with `workoutId` expanded and scrolled into view. */
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

  navigate(view: ViewType, workout: Workout | null = null) {
    this.uiStore.navigate(view, workout);
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

    this.navigate('history');
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
    if (started) this.uiStore.showFatigue = false;
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
  setTheme(newTheme: 'dark' | 'light' | 'contrast') {
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

  /**
   * Imports training data from a JSON file.
   */
  async importData(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      await this.backupStore.importFile(file);
      await this.refresh();
      await showAlert('Import Success', 'Data imported successfully!');
      this.navigate('history');
    } catch (err) {
      await showAlert('Import Error', 'Failed to import data. Please check the file format.');
    }
  }

  /**
   * Exports all training data to a CSV file for analysis in Excel or Python.
   */
  async exportToCSV() {
    this.backupStore.exportToCSV(this.workouts, this.trainingBlocks, this.exerciseTypes, this.phaseDefs);
  }

  /**
   * Saves a workout to storage and refreshes local state.
   */
  async saveWorkout(workout: Workout) {
    await this.materializeWeekIfProvisional(workout.weekId);
    await this.workoutStore.saveWorkout(workout);
    await this.refresh();
  }

  /**
   * Saves a workout without `refresh()`'s `isLoading` toggle - `App.svelte`
   * swaps its entire view tree while `isLoading` is true, so a full
   * `saveWorkout` briefly unmounts/remounts whatever screen is showing,
   * which reads as the page jumping back to its top. Fine for a save that
   * navigates away anyway (`processWorkoutSave`), but wrong for an in-place
   * edit where the user stays put (e.g. the Plan screen's day-of-week
   * reassignment, `UI_PLAN.md §4.3`) - found and fixed 2026-09-18 after the
   * new day-picker made this pre-existing behaviour newly visible.
   * Reloads only the workouts store (everything a schedule change could
   * plausibly affect) and still re-syncs fatigue-reminder notifications,
   * since those key off `dayOfWeek`/`startTime` (`fatigueReminder.ts`) -
   * the one real side effect of the full `refresh()` a "quiet" save must
   * not silently drop.
   */
  async saveWorkoutQuiet(workout: Workout) {
    await this.materializeWeekIfProvisional(workout.weekId);
    await this.workoutStore.saveWorkout(workout);
    await this.workoutStore.load();
    if (this.uiStore.notificationsEnabled) {
      try {
        await syncFatigueReminders(this.workoutStore.workouts);
      } catch (err) {
        console.error('Failed to sync fatigue-reminder notifications:', err);
      }
    }
  }

  /**
   * Handles the high-level logic of saving a workout, including modal triggers.
   */
  async processWorkoutSave(workout: Workout) {
    if (workout.status === 'completed') {
      this.openFatigueModal(workout);
    } else {
      await this.saveWorkout(workout);
      this.navigate('plan');
    }
  }

  /**
   * Deletes a workout from storage after confirmation.
   */
  async deleteWorkout(id: string) {
    const confirmed = await showConfirm('Delete Workout', 'Are you sure you want to delete this workout?');
    if (!confirmed) return;
    // Look the week up before deleting, and materialise it first: a
    // projected session has no stored row to delete until the week is real.
    const weekId = this.getWorkoutById(id)?.weekId;
    await this.materializeWeekIfProvisional(weekId);
    await this.workoutStore.deleteWorkout(id);
    await this.refresh();
  }

  /**
   * Finds a workout by id across stored rows and, failing that, across every
   * provisional week's projections - a projected session is a real thing the
   * user can act on, but has no stored row to look up.
   */
  getWorkoutById(id: string): Workout | undefined {
    const stored = this.workoutStore.workouts.find((w) => w.id === id);
    if (stored) return stored;
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
    await this.materializeWeekIfProvisional(workout.weekId);
    await this.workoutStore.duplicateWorkout(workout);
    await this.refresh();
  }

  /**
   * Saves a benchmark to storage and refreshes local state.
   */
  async saveBenchmark(benchmark: Benchmark) {
    await this.benchmarkStore.saveBenchmark(benchmark);
    await this.refresh();
  }

  /**
   * Deletes a benchmark from storage after confirmation.
   */
  async deleteBenchmark(id: string) {
    const confirmed = await showConfirm('Delete Benchmark', 'Are you sure you want to delete this benchmark?');
    if (!confirmed) return;
    await this.benchmarkStore.deleteBenchmark(id);
    await this.refresh();
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
   * Updates the global list of benchmark test types.
   */
  async updateBenchmarkTypes(types: BenchmarkTypeDef[]) {
    await this.catalogStore.updateBenchmarkTypes(types);
    await this.refresh();
  }

  /**
   * Updates the global list of macrocycle phase definitions.
   */
  async updatePhaseDefs(defs: PhaseDef[]) {
    await this.catalogStore.updatePhaseDefs(defs);
    await this.refresh();
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
    await this.metricsStore.savePainLog(log);
    await this.refresh();
  }

  /**
   * Deletes a pain/discomfort log entry after confirmation.
   */
  async deletePainLog(id: string) {
    const confirmed = await showConfirm('Delete Log', 'Delete this pain/discomfort log entry?');
    if (!confirmed) return;
    await this.metricsStore.deletePainLog(id);
    await this.refresh();
  }

  /**
   * Logs (or updates) a daily metric entry, e.g. a bodyweight reading.
   * Ensures the referenced MetricDef exists first - defensive, see
   * PROGRESS.md 2026-09-17 (fresh-install MetricDef seeding gap).
   */
  async saveDailyMetric(entry: DailyMetricEntry, def: MetricDef) {
    await this.metricsStore.ensureMetricDef(def);
    await this.metricsStore.saveDailyMetric(entry);
    await this.refresh();
  }

  /**
   * Deletes a daily metric entry (e.g. a bodyweight reading) after confirmation.
   */
  async deleteDailyMetric(id: string) {
    const confirmed = await showConfirm('Delete Entry', 'Delete this log entry?');
    if (!confirmed) return;
    await this.metricsStore.deleteDailyMetric(id);
    await this.refresh();
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
   * Deletes an outdoor ascent after confirmation.
   */
  async deleteOutdoorAscent(id: string) {
    const confirmed = await showConfirm('Delete Ascent', 'Delete this logged ascent?');
    if (!confirmed) return;
    await this.outdoorAscentStore.deleteOutdoorAscent(id);
    await this.refresh();
  }

  /**
   * Updates the global list of analytics categories.
   */
  async updateAnalyticsCategories(categories: AnalyticsCategory[]) {
    await this.catalogStore.updateAnalyticsCategories(categories);
    await this.refresh();
  }

  /**
   * Updates the global list of exercise modalities.
   */
  async updateExerciseTypes(types: ExerciseTypeDef[]) {
    await this.catalogStore.updateExerciseTypes(types);
    await this.refresh();
  }

  /**
   * Updates workout templates for different phases.
   */
  async updateTemplates(templates: Record<string, WorkoutTemplate[]>) {
    await this.planningStore.updateTemplates(templates);
    await this.refresh();
  }

  /**
   * Resets templates to their default values.
   */
  async resetTemplates() {
    await this.planningStore.resetTemplates();
    await this.refresh();
  }
}

export const trainingState = new TrainingState();
