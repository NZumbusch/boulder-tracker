<script lang="ts">
  let renaming = $state(false);
  let nameDraft = $state('');
  /**
   * Google Drive sync (Android): connect, status, the other devices, and
   * conflicts - versions that lost to a newer edit on another device, kept
   * here to restore. How it works: `lib/sync/driveSync.svelte.ts`.
   */
  import { driveSync } from '../../lib/sync/driveSync.svelte';
  import type { SyncConflict } from '../../lib/sync/merge';
  import { showConfirm } from '../../lib/utils';
  import Icon from '@iconify/svelte';

  // Re-render "2 min ago" every half minute.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });

  function ago(t: number | null): string {
    if (!t) return 'never';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  /** A conflict side's device by name; anything not among the other devices is this one. */
  function side(conflict: SyncConflict, which: 'kept' | 'lost'): string {
    const id = conflict[which].device;
    return driveSync.devices.find((d) => d.deviceId === id)?.deviceName ?? 'this device';
  }

  let expanded = $state<string | null>(null);
  const conflictKey = (c: SyncConflict) => `${c.table}/${c.key}/${c.at}`;

  async function disconnect() {
    if (await showConfirm('Disconnect Google Drive', 'This device stops syncing. Its data stays here, and the copy on Drive stays for your other devices.')) {
      await driveSync.disconnect();
    }
  }
</script>

{#if driveSync.available}
  <div class="card space-y-4 animate-in fade-in">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1 px-1 min-w-0">
        <h3 class="text-section uppercase text-content-muted">Sync</h3>
        <p class="text-caption text-content-subtle leading-relaxed">
          Keeps this device and your others (phone, tablet) in step through your own Google Drive - a private app folder only this app can see.
        </p>
      </div>
      {#if driveSync.connected}
        <span class="flex items-center gap-1.5 text-caption shrink-0 mt-0.5 {driveSync.status === 'error' ? 'text-status-caution' : 'text-content-subtle'}">
          <span class="w-1.5 h-1.5 rounded-full {driveSync.status === 'error' ? 'bg-status-caution' : driveSync.status === 'syncing' ? 'bg-primary animate-pulse' : 'bg-status-good'}"></span>
          {driveSync.status === 'syncing' ? 'Syncing…' : driveSync.status === 'error' ? 'Problem' : 'On'}
        </span>
      {/if}
    </div>

    {#if driveSync.choosing}
      <!-- Connecting found data both here and on Drive. -->
      <div class="p-3 rounded-control bg-surface-elevated/40 space-y-3">
        <p class="text-label text-content">Drive already has data from another device</p>
        <p class="text-caption text-content-subtle leading-relaxed">This device has its own data too. Merge keeps both (where the same thing differs, Drive's version is used). Replace makes this device a copy of Drive - a backup of what's here is saved to Documents first.</p>
        <div class="flex flex-wrap gap-2">
          <button onclick={() => driveSync.finishConnect('merge')} class="px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-label font-semibold rounded-control">Merge both</button>
          <button onclick={() => driveSync.finishConnect('replace')} class="px-3.5 py-2 border border-border-strong text-label text-content rounded-control hover:bg-surface-elevated">Replace this device's data</button>
          <button onclick={() => driveSync.cancelConnect()} class="px-3 py-2 text-label text-content-subtle hover:text-content">Cancel</button>
        </div>
      </div>
    {:else if !driveSync.connected}
      <button onclick={() => driveSync.connect()} class="w-full flex items-center justify-between py-2 transition-colors group">
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-cloud-sync" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
          <div class="text-left">
            <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Connect Google Drive</p>
            <p class="text-caption text-content-subtle">Sign in on each device you want to keep in sync</p>
          </div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
      </button>
      {#if driveSync.error}<p class="text-caption text-status-caution px-1">{driveSync.error}</p>{/if}
    {:else}
      <div class="divide-y divide-border">
        <div class="flex items-center justify-between gap-3 py-2.5">
          <div class="min-w-0">
            <p class="text-caption text-content-muted">Account</p>
            <p class="text-body text-content truncate">{driveSync.accountName ?? driveSync.account ?? 'Google account'}</p>
            {#if driveSync.accountName && driveSync.account}<p class="text-caption text-content-subtle truncate">{driveSync.account}</p>{/if}
          </div>
          <button onclick={disconnect} class="flex items-center gap-1 px-3 py-1.5 rounded-control border border-danger/40 text-label font-semibold text-danger hover:bg-danger/10 transition-colors shrink-0">
            <Icon icon="ic:baseline-link-off" class="text-base" /> Disconnect
          </button>
        </div>
        <div class="flex items-center justify-between gap-3 py-2.5">
          <div class="min-w-0">
            <p class="text-caption text-content-muted">Last synced</p>
            <p class="text-body text-content">{ago(driveSync.lastSyncAt)}</p>
          </div>
          <button
            onclick={() => driveSync.syncNow()}
            disabled={driveSync.status === 'syncing'}
            class="flex items-center gap-1 px-3 py-1.5 rounded-control border border-border text-label text-content hover:bg-surface-elevated disabled:opacity-50 shrink-0"
          >
            <Icon icon="ic:baseline-sync" class="text-base {driveSync.status === 'syncing' ? 'animate-spin' : ''}" /> Sync now
          </button>
        </div>
        <div class="py-2.5">
          <p class="text-caption text-content-muted">Devices</p>
          {#if renaming}
            <form class="flex items-center gap-2 py-1" onsubmit={(e) => { e.preventDefault(); driveSync.renameDevice(nameDraft); renaming = false; }}>
              <!-- svelte-ignore a11y_autofocus -->
              <input bind:value={nameDraft} autofocus placeholder="e.g. Phone" maxlength="30" class="flex-1 min-w-0 px-2.5 py-1.5 bg-surface-elevated text-content rounded-control border border-border-strong text-body outline-none focus:border-primary/60" />
              <button type="submit" class="px-3 py-1.5 rounded-control bg-primary text-white text-label font-semibold">Save</button>
              <button type="button" onclick={() => renaming = false} class="px-2 py-1.5 text-label text-content-subtle">Cancel</button>
            </form>
            <p class="text-caption text-content-subtle">Other devices see it as "{nameDraft.trim() ? `${nameDraft.trim()} (${driveSync.deviceModel})` : driveSync.deviceModel}".</p>
          {:else}
            <div class="flex items-center gap-2">
              <p class="text-body text-content min-w-0 truncate">
                {driveSync.deviceLabel ?? driveSync.deviceModel}{#if driveSync.deviceLabel}{' '}<span class="text-content-subtle">({driveSync.deviceModel})</span>{/if}
                <span class="text-caption text-content-subtle">· this one</span>
              </p>
              <button onclick={() => { nameDraft = driveSync.deviceLabel ?? ''; renaming = true; }} class="p-1 text-content-subtle hover:text-content shrink-0" aria-label="Name this device" title="Name this device">
                <Icon icon="ic:baseline-edit" class="text-sm" />
              </button>
            </div>
          {/if}
          {#each driveSync.devices as d (d.deviceId)}
            <p class="text-body text-content">{d.deviceName} <span class="text-caption text-content-subtle">· last upload {ago(d.writtenAt)}</span></p>
          {/each}
        </div>
      </div>
      {#if driveSync.error}
        <div class="flex items-center justify-between gap-3 px-1">
          <p class="text-caption text-status-caution">{driveSync.error}</p>
          {#if driveSync.needsSignIn}
            <button onclick={() => driveSync.signInAgain()} class="text-label text-primary shrink-0">Sign in</button>
          {/if}
        </div>
      {/if}
    {/if}

    {#if driveSync.conflicts.length > 0}
      <div class="space-y-2 pt-3 border-t border-border">
        <div class="flex items-center justify-between gap-3 px-1">
          <p class="text-label text-content">Edited on two devices <span class="text-content-subtle font-normal">({driveSync.conflicts.length})</span></p>
          <button onclick={() => driveSync.clearConflicts()} class="text-caption text-content-subtle hover:text-content">Clear all</button>
        </div>
        <p class="text-caption text-content-subtle px-1 leading-relaxed">The newer edit was kept everywhere. Restore puts the other version back instead.</p>
        <div class="divide-y divide-border">
          {#each driveSync.conflicts as c (conflictKey(c))}
            {@const open = expanded === conflictKey(c)}
            <div class="py-2">
              <button onclick={() => (expanded = open ? null : conflictKey(c))} class="w-full flex items-center justify-between gap-3 text-left">
                <div class="min-w-0">
                  <p class="text-body text-content truncate">{c.label}</p>
                  <p class="text-caption text-content-subtle">
                    Kept {side(c, 'kept')}'s edit ({when(c.kept.t)}) · {c.lost.deleted ? 'it was deleted' : 'edited'} on {side(c, 'lost')} ({when(c.lost.t)})
                  </p>
                </div>
                <Icon icon={open ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-content-subtle text-xl shrink-0" />
              </button>
              {#if open}
                <div class="mt-2 space-y-2">
                  {#if !c.lost.deleted}
                    <pre class="text-[11px] leading-snug text-content-muted bg-surface-elevated/40 rounded-control p-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(c.lost.value, null, 1)}</pre>
                  {/if}
                  <div class="flex gap-2">
                    <button onclick={() => driveSync.restoreConflict(c)} class="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-label rounded-control">
                      {c.lost.deleted ? 'Delete it after all' : 'Restore this version'}
                    </button>
                    <button onclick={() => driveSync.dismissConflict(c)} class="px-3 py-1.5 text-label text-content-subtle hover:text-content">Dismiss</button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
