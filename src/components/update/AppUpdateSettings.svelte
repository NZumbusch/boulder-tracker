<script lang="ts">
  /** Settings → About: this build, automatic checks, "Check now", and an available update. Android app only. */
  import Icon from '@iconify/svelte';
  import { updater } from '../../lib/update/updater.svelte';
  import UpdateCard from './UpdateCard.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';

  const lastChecked = $derived(
    updater.lastCheckedAt ? new Date(updater.lastCheckedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never',
  );
</script>

{#if updater.supported}
  <div class="card space-y-3 animate-in fade-in">
    <div class="px-1">
      <h3 class="text-section uppercase text-content-muted">App updates</h3>
      <p class="text-caption text-content-subtle mt-0.5 tabular-nums">
        {updater.installedName ? `Version ${updater.installedName}` : 'Version unknown'}{updater.installedCode ? ` (build ${updater.installedCode})` : ''} · last checked {lastChecked}
      </p>
    </div>

    <div class="space-y-1.5 px-1">
      <p class="text-body text-content">Channel</p>
      <!-- A setting, so the filled segment. -->
      <Segmented
        label="Update channel"
        variant="setting"
        full
        value={updater.channel}
        onChange={(v) => updater.setChannel(v)}
        options={[{ value: 'stable', label: 'Stable' }, { value: 'testing', label: 'Testing' }]}
      />
      <p class="text-caption text-content-subtle">
        {updater.channel === 'stable' ? 'Builds that were tried out and promoted.' : 'Every new build as soon as it is ready - may have rough edges.'}
        Switching never installs an older version.
      </p>
      {#if updater.aheadOfChannel}
        <p class="text-caption text-content-subtle">You're on a newer build ({updater.installedCode}) than stable ({updater.latestOnChannel?.versionCode}). Android can't go back to an older version - the next stable build newer than yours will update you.</p>
      {/if}
    </div>

    <div class="px-1">
      <Toggle label="Check automatically" hint="When the app opens, at most every few hours. Nothing installs without you." checked={updater.auto} onChange={(v) => updater.setAuto(v)} />
    </div>

    <UpdateCard />

    {#if !updater.available}
      <button
        onclick={() => updater.check(true)}
        disabled={updater.status !== 'idle'}
        class="btn btn-secondary w-full"
      >
        <Icon icon="ic:baseline-refresh" class="text-base {updater.status === 'checking' ? 'animate-spin' : ''}" />
        {updater.status === 'checking' ? 'Checking…' : 'Check now'}
      </button>
      {#if updater.upToDate}<p class="text-caption text-success px-1">You're on the newest build.</p>{/if}
      {#if updater.error}<p class="text-caption text-status-caution px-1" role="alert">{updater.error}</p>{/if}
    {/if}
  </div>
{/if}
