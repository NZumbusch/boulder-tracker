<script lang="ts">
  /**
   * Health Connect import (Android): connect, status, Import now. How it
   * works: `lib/health/healthConnect.svelte.ts` and `lib/health/import.ts`.
   */
  import { healthConnect } from '../../lib/health/healthConnect.svelte';
  import { HealthConnect, type HealthKind } from '../../lib/native/healthConnect';
  import Icon from '@iconify/svelte';

  const KIND_LABELS: Record<HealthKind, string> = {
    restingHeartRate: 'resting heart rate',
    weight: 'weight',
    sleep: 'sleep duration',
  };

  $effect(() => {
    if (healthConnect.supported) void healthConnect.refreshStatus();
  });

  const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const reading = $derived(healthConnect.granted.map((k) => KIND_LABELS[k]).join(', '));
</script>

{#if healthConnect.supported}
  <div class="card space-y-4 animate-in fade-in">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1 px-1 min-w-0">
        <h3 class="text-section uppercase text-content-muted">Health Connect</h3>
        <p class="text-caption text-content-subtle leading-relaxed">
          Fills in resting heart rate, weight and sleep duration from your watch or health apps (e.g. Garmin Connect). Read-only, and values you typed yourself are never replaced.
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
      <button onclick={() => HealthConnect.openSettings()} class="w-full py-2.5 border border-border-strong text-label text-content rounded-control hover:bg-surface-elevated">
        {healthConnect.availability === 'notInstalled' ? 'Get Health Connect' : 'Update Health Connect'}
      </button>
    {:else if !healthConnect.enabled}
      <button onclick={() => healthConnect.connect()} class="w-full flex items-center justify-between py-2 transition-colors group">
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-monitor-heart" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
          <div class="text-left">
            <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Connect Health Connect</p>
            <p class="text-caption text-content-subtle">Choose what to share on the next screen</p>
          </div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
      </button>
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
        <button onclick={() => healthConnect.importNow()} disabled={healthConnect.importing} class="px-3.5 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-label font-semibold rounded-control">
          {healthConnect.importing ? 'Importing…' : 'Import now'}
        </button>
        <button onclick={() => HealthConnect.openSettings()} class="px-3.5 py-2 border border-border-strong text-label text-content rounded-control hover:bg-surface-elevated">Permissions</button>
        <button onclick={() => healthConnect.disconnect()} class="px-3 py-2 text-label text-content-subtle hover:text-danger">Stop importing</button>
      </div>
    {/if}

    {#if healthConnect.error}
      <p class="text-caption text-status-caution px-1">{healthConnect.error}</p>
    {/if}
  </div>
{/if}
