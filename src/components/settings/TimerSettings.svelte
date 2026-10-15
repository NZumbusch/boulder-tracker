<script lang="ts">
  /**
   * The timer itself: what runs in the background, the screen, and which
   * warnings it gives. (How it sounds and what it says are the next two
   * cards on this page; the live session's own behaviour is under Live
   * sessions.) Keep-awake only when `navigator.wakeLock` exists - degrade
   * silently rather than showing a dead toggle.
   */
  import { trainingState } from '../../lib/state.svelte';
  import Icon from "@iconify/svelte";
  import Toggle from '../ui/Toggle.svelte';
  import { Capacitor } from '@capacitor/core';
  import { exactAlarmStatus, openExactAlarmSetting } from '../../lib/notifications/timerAlerts';

  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

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

<div class="card space-y-2 animate-in fade-in">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Countdowns and warnings</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Intervals, rests, countdowns and circuits.</p>
  </div>

  <div class="divide-y divide-border">
    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-looks-3" class="text-lg text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle
          checked={trainingState.timerCountdownTicks}
          onChange={(v) => trainingState.setTimerCountdownTicks(v)}
          label="3-2-1 countdown"
          hint="Beeps the last three seconds of a countdown, rest or interval phase"
        />
      </div>
    </div>

    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-notifications-active" class="text-lg text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle
          checked={trainingState.timerWarnBeforeEnd}
          onChange={(v) => trainingState.setTimerWarnBeforeEnd(v)}
          label="15 s warning"
          hint="A heads-up 15 seconds before a countdown or rest ends"
        />
      </div>
    </div>

    {#if wakeLockSupported}
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-lightbulb" class="text-lg text-content-muted shrink-0" />
        <div class="flex-1 min-w-0">
          <Toggle
            checked={trainingState.timerKeepAwakeEnabled}
            onChange={(v) => trainingState.setTimerKeepAwakeEnabled(v)}
            label="Keep the screen on while a timer runs"
          />
        </div>
      </div>
    {/if}

    {#if isNative}
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-phone-android" class="text-lg text-content-muted shrink-0" />
        <div class="flex-1 min-w-0">
          <Toggle
            checked={trainingState.timerBackgroundAlerts}
            onChange={(v) => trainingState.setTimerBackgroundAlerts(v)}
            label="Timer in the background"
            hint="While a timer runs: a notification with the live countdown (Pause and +30 s), and the beeps keep playing when the phone is locked. Music gets quieter for each beep instead of stopping"
          />
        </div>
      </div>
      {#if trainingState.timerBackgroundAlerts && exactAlarms === 'denied'}
        <div class="flex items-center justify-between gap-3 py-3">
          <p class="text-caption text-status-caution">Only matters if the timer notification can't run: plain alerts may then arrive late. Allowing exact alarms keeps them on time.</p>
          <button onclick={() => openExactAlarmSetting()} class="btn btn-secondary shrink-0">Allow</button>
        </div>
      {/if}
    {/if}
  </div>
</div>
