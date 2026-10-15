<script lang="ts">
  /**
   * Health Connect import (Android): connect, status, Import now. How it
   * works: `lib/health/healthConnect.svelte.ts` and `lib/health/import.ts`.
   */
  import { healthConnect } from '../../lib/health/healthConnect.svelte';
  import { HealthConnect, type HealthKind } from '../../lib/native/healthConnect';
  import ActionRow from './ActionRow.svelte';
  import { showConfirm } from '../../lib/utils';

  const KIND_LABELS: Record<HealthKind, string> = {
    restingHeartRate: 'resting heart rate',
    weight: 'weight',
    sleep: 'sleep duration',
  };

  $effect(() => {
    if (healthConnect.supported) void healthConnect.refreshStatus();
  });

  const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  let connecting = $state(false);
  async function connect() {
    connecting = true;
    try { await healthConnect.connect(); } finally { connecting = false; }
  }
  async function stop() {
    if (await showConfirm('Stop importing?', 'New resting heart rate, weight and sleep values stop arriving. What was already imported stays, and you can connect again any time.', { ok: 'Stop importing', cancel: 'Keep importing' })) {
      await healthConnect.disconnect();
    }
  }
  const reading = $derived(healthConnect.granted.map((k) => KIND_LABELS[k]).join(', '));
</script>

{#if healthConnect.supported}
  <div class="card space-y-4 animate-in fade-in">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1 px-1 min-w-0">
        <h2 class="text-section uppercase text-content-muted">Health Connect</h2>
        <p class="text-caption text-content-subtle leading-relaxed">
          Fills in resting heart rate, weight and sleep duration from your watch or health apps (for example Garmin Connect). Read-only, and values you typed yourself are never replaced.
        </p>
      </div>
      {#if healthConnect.enabled}
        <span class="flex items-center gap-1.5 text-caption shrink-0 mt-0.5 {healthConnect.error ? 'text-status-caution' : 'text-content-subtle'}">
          <span class="w-1.5 h-1.5 rounded-full {healthConnect.error ? 'bg-status-caution' : healthConnect.importing ? 'bg-primary animate-pulse' : 'bg-status-good'}"></span>
          {healthConnect.importing ? 'Importing…' : healthConnect.error ? 'Problem' : 'On'}
        </span>
      {/if}
    </div>

    {#if healthConnect.availability === 'notInstalled' || healthConnect.availability === 'updateRequired'}
      <p class="text-caption text-content-subtle px-1 leading-relaxed">
        {healthConnect.availability === 'notInstalled'
          ? 'Health Connect isn\'t on this device. On Android 13 and older it\'s an app from the Play Store; Android 14 and newer have it built in.'
          : 'Health Connect needs an update first.'}
        If another of your devices has it, import there - sync brings the values here.
      </p>
      <button onclick={() => HealthConnect.openSettings()} class="btn btn-secondary w-full">
        {healthConnect.availability === 'notInstalled' ? 'Get Health Connect' : 'Update Health Connect'}
      </button>
    {:else if !healthConnect.enabled}
      <ActionRow icon="ic:baseline-monitor-heart" title={connecting ? 'Connecting…' : 'Connect Health Connect'} hint="Choose what to share on the next screen" onclick={connect} busy={connecting} />
    {:else}
      <div class="space-y-1 px-1">
        <p class="text-body text-content">Reading {reading || 'nothing - no access granted'}</p>
        <p class="text-caption text-content-subtle">
          {#if healthConnect.lastImportAt}Last import {when(healthConnect.lastImportAt)}{:else}Not imported yet{/if}{#if healthConnect.lastResult} · {healthConnect.lastResult.saved} new or updated{#if healthConnect.lastResult.keptManual > 0}, {healthConnect.lastResult.keptManual} kept as you entered them{/if}{/if}.
          Imports again when you open the app.
        </p>
        {#if !healthConnect.history}
          <p class="text-caption text-content-subtle">Only the last 30 days are available: past data wasn't allowed, or this Health Connect version can't share it.</p>
        {/if}
      </div>
      <div class="flex flex-wrap gap-2">
        <button onclick={() => healthConnect.importNow()} disabled={healthConnect.importing} class="btn btn-primary">
          {healthConnect.importing ? 'Importing…' : 'Import now'}
        </button>
        <button onclick={() => HealthConnect.openSettings()} class="btn btn-secondary">Permissions</button>
        <button onclick={stop} class="btn btn-danger">Stop importing</button>
      </div>
    {/if}

    {#if healthConnect.error}
      <p class="text-caption text-status-caution px-1" role="alert">{healthConnect.error}</p>
    {/if}
  </div>
{/if}
