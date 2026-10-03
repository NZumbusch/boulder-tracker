import { DEFAULT_THEME, parseTheme, resolveTheme, type ResolvedTheme, type ThemePreference } from '../preferences/theme';
import { Capacitor } from '@capacitor/core';
import type { PermissionState } from '@capacitor/core';
import type { Workout, ViewType } from '../types';
import { showConfirm } from '../utils';
import { requestNotificationPermission, cancelAllReminders } from '../notifications/shared';
import { registerBack } from '../navigation/backStack.svelte';

const NOTIFICATIONS_ENABLED_KEY = 'boulder_tracker_notifications_enabled';
const NOTIFICATIONS_PROMPTED_KEY = 'boulder_tracker_notifications_prompted';

/**
 * View/navigation, theme, notification preferences, and modal visibility.
 */
export class UiStore {
  view = $state<ViewType>('home');
  /** The workout the fatigue-rating modal is rating. */
  activeWorkout = $state<Workout | null>(null);
  selectedWeekId = $state<string | null>(null);
  weekOffset = $state(0);
  showFatigue = $state(false);
  /** A completed workout History should open expanded and scroll to - set by Home's Recent Activity, consumed (cleared) by History. */
  historyFocusId = $state<string | null>(null);
  /** Which half of History is showing - kept across visits so a trip to Sends stays on Sends. */
  historyTab = $state<'sessions' | 'sends'>('sessions');
  /** Something a shortcut or the widget asked Home to open (see `navigation/deepLink`); Home clears it once handled. */
  homeRequest = $state<'quickLog' | 'metrics' | null>(null);
  /** With a quick-log request: the form to open straight away (the widget's buttons name one). */
  quickLogAction = $state<'pain' | 'bodyweight' | 'send' | 'benchmark' | null>(null);
  theme = $state<ThemePreference>(DEFAULT_THEME);
  /** The phone's own dark-mode setting, kept live for the "system" theme. */
  systemDark = $state(false);
  notificationsEnabled = $state(false);
  notificationPermission = $state<PermissionState>('prompt');

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.theme = parseTheme(localStorage.getItem('boulder_tracker_theme'));
      this.notificationsEnabled = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === 'true';
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      const query = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemDark = query.matches;
      query.addEventListener('change', (e) => (this.systemDark = e.matches));
    }
  }

  /** What the screen actually shows: the choice, with "system" resolved. */
  get resolvedTheme(): ResolvedTheme {
    return resolveTheme(this.theme, this.systemDark);
  }

  /**
   * Back from any tab but Home goes to Home (one history entry for "not on
   * Home", replaced rather than stacked as you move between tabs - back
   * doesn't replay every tab you visited). See `navigation/backStack`.
   */
  #tabRelease: (() => void) | null = null;

  /** Switches the main view. Workouts open in the workout modal (`lib/workoutModal.svelte.ts`), not through here. */
  navigate(view: ViewType) {
    this.view = view;
    this.showFatigue = false;
    this.activeWorkout = null;
    if (view === 'home') {
      const release = this.#tabRelease;
      this.#tabRelease = null;
      release?.();
    } else if (!this.#tabRelease) {
      this.#tabRelease = registerBack(() => {
        this.#tabRelease = null;
        this.view = 'home';
        this.#syncAddress();
      });
    }
    this.#syncAddress();
  }

  /** Keeps the address as `#/plan` etc., so a reload (or a shared link, in a browser) lands on the same tab. */
  #syncAddress() {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    window.history.replaceState(window.history.state, '', `#/${this.view}`);
  }

  /**
   * Opens the fatigue rating modal for a specific workout.
   */
  openFatigueModal(workout: Workout) {
    this.activeWorkout = $state.snapshot(workout) as Workout;
    this.showFatigue = true;
  }

  /**
   * Closes the fatigue modal and clears active workout.
   */
  closeFatigueModal() {
    this.showFatigue = false;
    this.activeWorkout = null;
  }

  /**
   * Updates the theme mode and persists to localStorage
   */
  setTheme(newTheme: ThemePreference) {
    this.theme = newTheme;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('boulder_tracker_theme', newTheme);
    }
  }

  /**
   * Enables or disables fatigue-log reminder notifications. Enabling
   * requests OS permission if not already granted; if the user denies it,
   * the preference reverts to disabled rather than silently pretending
   * it's on (actual scheduling happens separately, in `refresh()` via
   * `syncFatigueReminders`, once this flag is true and permission holds).
   */
  async setNotificationsEnabled(enabled: boolean): Promise<boolean> {
    if (enabled) {
      this.notificationPermission = await requestNotificationPermission();
      if (this.notificationPermission !== 'granted') {
        this.notificationsEnabled = false;
        this.persistNotificationsEnabled(false);
        return false;
      }
    } else {
      await cancelAllReminders();
    }
    this.notificationsEnabled = enabled;
    this.persistNotificationsEnabled(enabled);
    return enabled;
  }

  private persistNotificationsEnabled(enabled: boolean) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
    }
  }

  /**
   * Shows a one-time in-app prompt (native only) asking whether to enable
   * fatigue-log reminders. App.svelte calls it once the person has finished
   * a session (`notifications/promptRule.ts`), not at first launch. Never
   * re-prompts after this - a decline is respected, not nagged around.
   */
  async maybePromptForNotifications() {
    if (!Capacitor.isNativePlatform()) return;
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(NOTIFICATIONS_PROMPTED_KEY)) return;
    localStorage.setItem(NOTIFICATIONS_PROMPTED_KEY, 'true');

    const wantsReminders = await showConfirm(
      'Reminders?',
      "You've finished a session. Want a reminder to rate how a session felt (fatigue/RPE) after a planned workout's time has passed? You can change this anytime in Settings → Appearance & Behaviour."
    );
    if (wantsReminders) {
      await this.setNotificationsEnabled(true);
    }
  }
}
