<script lang="ts">
  /**
   * "Update available" for the Android app (lib/update/): the new build,
   * what changed since yours, and Install. `compact` is Home's version,
   * which can be closed for this build; Settings shows it in full.
   */
  import Icon from '@iconify/svelte';
  import { updater } from '../../lib/update/updater.svelte';
  import { formatSize } from '../../lib/update/appUpdate';

  let { compact = false }: { compact?: boolean } = $props();

  const busy = $derived(updater.status === 'backing-up' || updater.status === 'downloading' || updater.status === 'installing');
  const changes = $derived(compact ? updater.changes.slice(0, 3) : updater.changes);
</script>

{#if updater.available}
  <div class="{compact ? 'card' : 'rounded-control bg-surface-elevated/40 p-3'} space-y-2.5 animate-in fade-in">
    <div class="flex items-start gap-2">
      <Icon icon="ic:baseline-system-update" class="text-primary text-xl shrink-0 mt-0.5" />
      <div class="min-w-0 flex-1">
        <p class="text-body font-semibold text-content">Update available</p>
        <p class="text-caption text-content-subtle tabular-nums">
          Build {updater.available.versionCode}{updater.installedCode ? ` · you have ${updater.installedCode}` : ''}{formatSize(updater.available.size) ? ` · ${formatSize(updater.available.size)}` : ''}
        </p>
      </div>
      {#if compact && !busy}
        <button onclick={() => updater.dismiss()} class="p-1 -mr-1 text-content-subtle hover:text-content" aria-label="Not now">
          <Icon icon="ic:baseline-close" class="text-lg" />
        </button>
      {/if}
    </div>

    {#if changes.length}
      <ul class="text-caption text-content-muted space-y-0.5 list-disc list-inside">
        {#each changes as line}<li class="truncate">{line}</li>{/each}
      </ul>
    {/if}

    {#if updater.status === 'downloading'}
      <div class="h-1.5 rounded-full bg-surface-elevated overflow-hidden" role="progressbar" aria-valuenow={Math.round(updater.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div class="h-full bg-primary transition-[width] duration-150" style="width: {Math.round(updater.progress * 100)}%"></div>
      </div>
    {/if}
    {#if updater.backedUpTo && updater.status !== 'backing-up'}
      <p class="text-caption text-content-subtle flex items-center gap-1"><Icon icon="ic:baseline-check" class="text-sm text-success" />Backed up to {updater.backedUpTo}</p>
    {/if}
    {#if updater.error}
      <p class="text-caption text-status-caution">{updater.error}</p>
    {/if}

    <button
      onclick={() => updater.install()}
      disabled={busy}
      class="w-full py-2.5 rounded-control bg-primary hover:bg-primary-hover text-white text-label font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
    >
      <Icon icon="ic:baseline-download" class="text-base" />
      {updater.status === 'backing-up' ? 'Backing up your data…' : updater.status === 'downloading' ? `Downloading ${Math.round(updater.progress * 100)}%` : updater.status === 'installing' ? 'Opening installer…' : 'Install'}
    </button>
    {#if !compact}
      <p class="text-caption text-content-subtle">A backup of your data goes to Documents/ClimbingTracker first. Android then asks you to confirm; your data stays - it's an update, not a reinstall.</p>
    {/if}
  </div>
{/if}
