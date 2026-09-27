<script lang="ts">
  /** Settings → About: this build, automatic checks, "Check now", and an available update. Android app only. */
  import Icon from '@iconify/svelte';
  import { updater } from '../../lib/update/updater.svelte';
  import UpdateCard from './UpdateCard.svelte';

  const lastChecked = $derived(
    updater.lastCheckedAt ? new Date(updater.lastCheckedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never',
  );
</script>

{#if updater.supported}
  <div class="card space-y-3 animate-in fade-in">
    <div class="px-1">
      <h4 class="text-section uppercase text-content-muted">App updates</h4>
      <p class="text-caption text-content-subtle mt-0.5 tabular-nums">
        {updater.installedName ? `Version ${updater.installedName}` : 'Version unknown'}{updater.installedCode ? ` (build ${updater.installedCode})` : ''} · last checked {lastChecked}
      </p>
    </div>

    <div class="space-y-1.5 px-1">
      <p class="text-body text-content">Channel</p>
      <!-- A setting, so the filled segment. -->
      <div class="flex bg-surface-elevated/50 p-1 rounded-control" role="group" aria-label="Update channel">
        {#each [['stable', 'Stable'], ['testing', 'Testing']] as [id, label]}
          <button
            onclick={() => updater.setChannel(id as 'stable' | 'testing')}
            aria-pressed={updater.channel === id}
            class="flex-1 py-2 text-label rounded-control transition-all {updater.channel === id ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
          >{label}</button>
        {/each}
      </div>
      <p class="text-caption text-content-subtle">
        {updater.channel === 'stable' ? 'Builds that were tried out and promoted.' : 'Every new build, as soon as it\'s pushed - may have rough edges.'}
      </p>
      {#if updater.aheadOfChannel}
        <p class="text-caption text-content-subtle">You're on a newer build ({updater.installedCode}) than stable ({updater.latestOnChannel?.versionCode}). Android can't go back to an older version - the next stable build newer than yours will update you.</p>
      {/if}
    </div>

    <label class="flex items-center justify-between cursor-pointer px-1">
      <div class="min-w-0">
        <p class="text-body text-content">Check automatically</p>
        <p class="text-caption text-content-subtle mt-0.5">When the app opens, at most every few hours. Nothing installs without you.</p>
      </div>
      <input type="checkbox" checked={updater.auto} onchange={(e) => updater.setAuto(e.currentTarget.checked)} class="w-5 h-5 rounded accent-primary shrink-0 ml-3" />
    </label>

    <UpdateCard />

    {#if !updater.available}
      <button
        onclick={() => updater.check(true)}
        disabled={updater.status !== 'idle'}
        class="w-full py-2.5 rounded-control bg-surface-elevated text-content text-label font-bold transition-colors hover:bg-surface-elevated/70 disabled:opacity-60 flex items-center justify-center gap-1.5"
      >
        <Icon icon="ic:baseline-refresh" class="text-base {updater.status === 'checking' ? 'animate-spin' : ''}" />
        {updater.status === 'checking' ? 'Checking…' : 'Check now'}
      </button>
      {#if updater.upToDate}<p class="text-caption text-success px-1">You're on the newest build.</p>{/if}
      {#if updater.error}<p class="text-caption text-status-caution px-1">{updater.error}</p>{/if}
    {/if}
  </div>
{/if}
