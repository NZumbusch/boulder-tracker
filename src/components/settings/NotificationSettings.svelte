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
  import Toggle from '../ui/Toggle.svelte';

  const isNative = Capacitor.isNativePlatform();

  async function toggleNotifications() {
    const enabling = !trainingState.notificationsEnabled;
    const result = await trainingState.setNotificationsEnabled(enabling);
    if (enabling && !result) {
      await showAlert(
        'Notifications are blocked',
        'Notifications were not granted. Enable them for this app in your device Settings, then try again here.'
      );
    }
  }
</script>

{#if isNative}
  <div class="card space-y-3 animate-in fade-in">
    <div class="space-y-2">
      <h2 class="text-section uppercase text-content-muted px-1">Notifications</h2>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Local reminders only, nothing leaves this device. All three reminders below need this main switch on first.</p>
    </div>

    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-notifications-active" class="text-xl text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle checked={trainingState.notificationsEnabled} onChange={() => toggleNotifications()} label="Allow notifications" hint={trainingState.notificationsEnabled ? 'On' : 'Off. Turning it on asks Android for permission.'} />
      </div>
    </div>

    {#if trainingState.notificationsEnabled}
      <div class="divide-y divide-border border-t border-border animate-in fade-in">
        <div class="py-1">
          <Toggle checked={trainingState.tunableOn('alerts.fatigueReminder')} onChange={(v) => trainingState.setFatigueReminderEnabled(v)} label="Fatigue log reminder" hint="Once a planned session's time has passed, asking whether it happened so you can rate it." />
        </div>

        <div class="py-1">
          <Toggle checked={trainingState.dailyMetricsReminderEnabled} onChange={(v) => trainingState.setDailyMetricsReminderEnabled(v)} label="Daily metrics reminder" hint="When sleep, HRV or resting heart rate is still missing for today." />
          {#if trainingState.dailyMetricsReminderEnabled}
            <div class="flex items-center justify-between gap-3 pb-2 animate-in fade-in">
              <label for="daily-metrics-time" class="text-label text-content-subtle">Reminder time</label>
              <input id="daily-metrics-time" type="time" value={trainingState.dailyMetricsReminderTime} onchange={(e) => trainingState.setDailyMetricsReminderTime(e.currentTarget.value)} class="field !w-auto" />
            </div>
          {/if}
        </div>

        <div class="py-1">
          <Toggle checked={trainingState.planBReminderEnabled} onChange={(v) => trainingState.setPlanBReminderEnabled(v)} label="Plan B reminder" hint="The evening before an undecided Plan B, with the outdoor forecast." />
          {#if trainingState.planBReminderEnabled}
            <div class="flex items-center justify-between gap-3 pb-2 animate-in fade-in">
              <label for="plan-b-time" class="text-label text-content-subtle">Reminder time</label>
              <input id="plan-b-time" type="time" value={trainingState.planBReminderTime} onchange={(e) => trainingState.setPlanBReminderTime(e.currentTarget.value)} class="field !w-auto" />
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
