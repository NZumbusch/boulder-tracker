<script lang="ts">
  /**
   * Timer behaviour toggles. Vibrate/beep
   * always offered; keep-awake only when `navigator.wakeLock` actually
   * exists - degrade silently rather than showing a dead toggle, matching how the Notifications section below already hides
   * itself entirely on non-native platforms.
   */
  import { trainingState } from '../../lib/state.svelte';
  import Icon from "@iconify/svelte";

  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  import { Capacitor } from '@capacitor/core';
  import { exactAlarmStatus, openExactAlarmSetting } from '../../lib/notifications/timerAlerts';

  // Background alerts need Android's "Alarms & reminders" permission to
  // arrive on the second; Android 14 turns it off for new installs.
  const isNative = Capacitor.isNativePlatform();
  let exactAlarms = $state<'granted' | 'denied' | 'unsupported'>('unsupported');
  async function refreshExact() {
    exactAlarms = await exactAlarmStatus();
  }
  $effect(() => {
    void refreshExact();
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshExact(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Timer</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Behaviour of the floating rest/stopwatch timer during a workout.</p>
  </div>

  <div class="divide-y divide-border">
    <label class="w-full flex items-center justify-between py-3 cursor-pointer">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-vibration" class="text-lg text-content-muted" />
        <span class="text-body text-content">Vibrate on finish</span>
      </div>
      <input
        type="checkbox"
        checked={trainingState.timerVibrateEnabled}
        onchange={(e) => trainingState.setTimerVibrateEnabled(e.currentTarget.checked)}
        class="w-5 h-5 rounded accent-primary"
      />
    </label>

    <label class="w-full flex items-center justify-between py-3 cursor-pointer">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-volume-up" class="text-lg text-content-muted" />
        <span class="text-body text-content">Audible beep</span>
      </div>
      <input
        type="checkbox"
        checked={trainingState.timerBeepEnabled}
        onchange={(e) => trainingState.setTimerBeepEnabled(e.currentTarget.checked)}
        class="w-5 h-5 rounded accent-primary"
      />
    </label>

    <label class="w-full flex items-center justify-between py-3 cursor-pointer">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-looks-3" class="text-lg text-content-muted" />
        <div>
          <span class="block text-body text-content">3-2-1 countdown</span>
          <span class="block text-caption text-content-subtle">Beeps the last three seconds of a countdown, rest or interval phase</span>
        </div>
      </div>
      <input
        type="checkbox"
        checked={trainingState.timerCountdownTicks}
        onchange={(e) => trainingState.setTimerCountdownTicks(e.currentTarget.checked)}
        class="w-5 h-5 rounded accent-primary shrink-0"
      />
    </label>

    <label class="w-full flex items-center justify-between py-3 cursor-pointer">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-notifications-active" class="text-lg text-content-muted" />
        <div>
          <span class="block text-body text-content">15 s warning</span>
          <span class="block text-caption text-content-subtle">A heads-up 15 seconds before a countdown or rest ends</span>
        </div>
      </div>
      <input
        type="checkbox"
        checked={trainingState.timerWarnBeforeEnd}
        onchange={(e) => trainingState.setTimerWarnBeforeEnd(e.currentTarget.checked)}
        class="w-5 h-5 rounded accent-primary shrink-0"
      />
    </label>

    {#if isNative}
      <label class="w-full flex items-center justify-between py-3 cursor-pointer">
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-phonelink-ring" class="text-lg text-content-muted" />
          <div>
            <span class="block text-body text-content">Timer in the background</span>
            <span class="block text-caption text-content-subtle">While a timer runs: a notification with the live countdown (Pause / +30 s), and the beeps keep playing when the phone is locked - music gets quieter for each beep instead of stopping</span>
          </div>
        </div>
        <input
          type="checkbox"
          checked={trainingState.timerBackgroundAlerts}
          onchange={(e) => trainingState.setTimerBackgroundAlerts(e.currentTarget.checked)}
          class="w-5 h-5 rounded accent-primary shrink-0"
        />
      </label>
      {#if trainingState.timerBackgroundAlerts && exactAlarms === 'denied'}
        <div class="flex items-center justify-between gap-3 py-3">
          <p class="text-caption text-status-caution">Only matters if the timer notification can't run: plain alerts may then arrive late. Allowing exact alarms keeps them on time.</p>
          <button onclick={() => openExactAlarmSetting()} class="chip text-primary shrink-0">Allow</button>
        </div>
      {/if}
    {/if}

    {#if wakeLockSupported}
      <label class="w-full flex items-center justify-between py-3 cursor-pointer">
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-lightbulb" class="text-lg text-content-muted" />
          <span class="text-body text-content">Keep screen awake</span>
        </div>
        <input
          type="checkbox"
          checked={trainingState.timerKeepAwakeEnabled}
          onchange={(e) => trainingState.setTimerKeepAwakeEnabled(e.currentTarget.checked)}
          class="w-5 h-5 rounded accent-primary"
        />
      </label>
    {/if}
  </div>
</div>
