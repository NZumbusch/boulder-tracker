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
