<script lang="ts">
  /**
   * Notifications - the fatigue reminder (moved out of
   * `PreferencesSettings.svelte`'s old spot next to the theme picker, which
   * didn't scale) plus the new daily-metrics reminder, each with its own time where
   * applicable. Both ultimately depend on `notificationsEnabled` (native
   * permission) - the section title itself explains this rather than
   * nesting a second conditional gate in the markup.
   */
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import { showAlert } from '../../lib/utils';
  import Icon from "@iconify/svelte";

  const isNative = Capacitor.isNativePlatform();

  async function toggleNotifications() {
    const enabling = !trainingState.notificationsEnabled;
    const result = await trainingState.setNotificationsEnabled(enabling);
    if (enabling && !result) {
      await showAlert(
        'Permission Needed',
        'Notifications were not granted. Enable them for this app in your device Settings, then try again here.'
      );
    }
  }
</script>

{#if isNative}
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Notifications</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Local reminders only - nothing leaves this device. Both reminder types below need this master switch on first.</p>
    </div>

    <button
      onclick={toggleNotifications}
      aria-pressed={trainingState.notificationsEnabled}
      class="w-full flex items-center justify-between py-2 text-left"
    >
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-notifications-active" class="text-xl text-content-muted" />
        <div class="text-left">
          <p class="text-body font-semibold text-content">Allow notifications</p>
          <p class="text-caption text-content-subtle">{trainingState.notificationsEnabled ? 'On' : 'Off'}</p>
        </div>
      </div>
      <span class="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 {trainingState.notificationsEnabled ? 'bg-primary' : 'bg-surface-elevated'}">
        <span class="block w-5 h-5 rounded-full bg-white shadow transition-transform {trainingState.notificationsEnabled ? 'translate-x-4' : ''}"></span>
      </span>
    </button>

    {#if trainingState.notificationsEnabled}
      <div class="divide-y divide-border border-t border-border animate-in fade-in">
        <div class="flex items-center justify-between py-3">
          <div class="min-w-0">
            <p class="text-body text-content">Fatigue Log Reminders</p>
            <p class="text-caption text-content-subtle mt-0.5">After a planned session's scheduled time has passed.</p>
          </div>
          <span class="text-label text-success shrink-0 ml-3">On</span>
        </div>

        <div class="py-3 space-y-3">
          <label class="flex items-center justify-between cursor-pointer">
            <div class="min-w-0">
              <p class="text-body text-content">Daily Metrics Reminder</p>
              <p class="text-caption text-content-subtle mt-0.5">When sleep, HRV, or resting HR is still missing for today.</p>
            </div>
            <input
              type="checkbox"
              checked={trainingState.dailyMetricsReminderEnabled}
              onchange={(e) => trainingState.setDailyMetricsReminderEnabled(e.currentTarget.checked)}
              class="w-5 h-5 rounded accent-primary shrink-0 ml-3"
            />
          </label>
          {#if trainingState.dailyMetricsReminderEnabled}
            <div class="flex items-center justify-between gap-3 animate-in fade-in">
              <label for="daily-metrics-time" class="text-label text-content-subtle">Reminder time</label>
              <input
                id="daily-metrics-time"
                type="time"
                value={trainingState.dailyMetricsReminderTime}
                onchange={(e) => trainingState.setDailyMetricsReminderTime(e.currentTarget.value)}
                class="bg-surface-elevated text-content px-3 py-1.5 rounded-control border border-border-strong text-sm outline-none"
              />
            </div>
          {/if}
        </div>

        <div class="py-3 space-y-3">
          <label class="flex items-center justify-between cursor-pointer">
            <div class="min-w-0">
              <p class="text-body text-content">Plan B Reminder</p>
              <p class="text-caption text-content-subtle mt-0.5">The evening before an undecided Plan B, with the outdoor forecast.</p>
            </div>
            <input
              type="checkbox"
              checked={trainingState.planBReminderEnabled}
              onchange={(e) => trainingState.setPlanBReminderEnabled(e.currentTarget.checked)}
              class="w-5 h-5 rounded accent-primary shrink-0 ml-3"
            />
          </label>
          {#if trainingState.planBReminderEnabled}
            <div class="flex items-center justify-between gap-3 animate-in fade-in">
              <label for="plan-b-time" class="text-label text-content-subtle">Reminder time</label>
              <input
                id="plan-b-time"
                type="time"
                value={trainingState.planBReminderTime}
                onchange={(e) => trainingState.setPlanBReminderTime(e.currentTarget.value)}
                class="bg-surface-elevated text-content px-3 py-1.5 rounded-control border border-border-strong text-sm outline-none"
              />
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
