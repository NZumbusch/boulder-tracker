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
  import ActionRow from './ActionRow.svelte';

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

  let connecting = $state(false);
  async function connect() {
    connecting = true;
    try { await driveSync.connect(); } finally { connecting = false; }
  }
  /** Replacing this device's data by Drive's is the destructive choice: it is asked about, by what it does. */
  async function replaceFromDrive() {
    const ok = await showConfirm(
      "Replace this device's data with Drive's?",
      "Everything on this device that Drive does not have is lost. A backup of what is here is saved to Documents first.",
      { ok: 'Replace', cancel: 'Keep mine' },
    );
    if (ok) await driveSync.finishConnect('replace');
  }
  async function clearAllConflicts() {
    const ok = await showConfirm('Clear the list?', `The ${driveSync.conflicts.length} other versions are forgotten, so they can no longer be restored. What is on your devices now stays.`, { ok: 'Clear list', cancel: 'Keep them' });
    if (ok) driveSync.clearConflicts();
  }
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
        <h2 class="text-section uppercase text-content-muted">Sync</h2>
        <p class="text-caption text-content-subtle leading-relaxed">
          Keeps this device and your others (phone, tablet) in step through your own Google Drive, in a private app folder only this app can see.
        </p>
      </div>
      {#if driveSync.connected}
        <span class="flex items-center gap-1.5 text-caption shrink-0 mt-0.5 {driveSync.status === 'error' ? 'text-status-caution' : 'text-content-subtle'}">
          <span class="w-1.5 h-1.5 rounded-full {driveSync.status === 'error' ? 'bg-status-caution' : driveSync.status === 'syncing' ? 'bg-primary animate-pulse' : 'bg-status-good'}"></span>
          {driveSync.status === 'syncing' ? 'Syncing…' : driveSync.status === 'error' ? 'Problem' : 'On'}
        </span>
      {/if}
    </div>

    {#if driveSync.notice}
      <!-- This copy was restored from a backup and given its own identity (lib/sync/identity.ts). -->
      <div class="p-3 rounded-control bg-surface-elevated/50 space-y-2" role="status">
        <p class="text-label text-content flex items-center gap-1.5"><Icon icon="ic:baseline-info" class="text-base text-status-caution shrink-0" />Restored from a backup</p>
        <p class="text-caption text-content-muted leading-relaxed">{driveSync.notice}</p>
        <button onclick={() => driveSync.dismissNotice()} class="btn btn-secondary">Got it</button>
      </div>
    {/if}

    {#if driveSync.choosing}
      <!-- Connecting found data both here and on Drive. -->
      <div class="p-3 rounded-control bg-surface-elevated/40 space-y-3">
        <p class="text-label text-content" role="status">Drive already has data from another device</p>
        <p class="text-caption text-content-subtle leading-relaxed">This device has its own data too. Merge keeps both (where the same thing differs, Drive's version is used). Replace makes this device a copy of Drive, and a backup of what's here is saved to Documents first.</p>
        <div class="flex flex-wrap gap-2">
          <button onclick={() => driveSync.finishConnect('merge')} class="btn btn-primary">Merge both (keeps everything)</button>
          <button onclick={replaceFromDrive} class="btn btn-danger">Replace this device's data</button>
          <button onclick={() => driveSync.cancelConnect()} class="btn btn-ghost">Cancel</button>
        </div>
      </div>
    {:else if !driveSync.connected}
      <ActionRow icon="ic:baseline-cloud-sync" title={connecting ? 'Connecting…' : 'Connect Google Drive'} hint="Sign in on each device you want to keep in sync" onclick={connect} busy={connecting} />
      {#if driveSync.error}<p class="text-caption text-status-caution px-1" role="alert">{driveSync.error}</p>{/if}
    {:else}
      <div class="divide-y divide-border">
        <div class="flex items-center justify-between gap-3 py-2.5">
          <div class="min-w-0">
            <p class="text-caption text-content-muted">Account</p>
            <p class="text-body text-content truncate">{driveSync.accountName ?? driveSync.account ?? 'Google account'}</p>
            {#if driveSync.accountName && driveSync.account}<p class="text-caption text-content-subtle truncate">{driveSync.account}</p>{/if}
          </div>
          <button onclick={disconnect} class="btn btn-danger gap-1 shrink-0">
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
            class="btn btn-secondary gap-1 shrink-0"
          >
            <Icon icon="ic:baseline-sync" class="text-base {driveSync.status === 'syncing' ? 'animate-spin' : ''}" /> Sync now
          </button>
        </div>
        <div class="py-2.5">
          <p class="text-caption text-content-muted">Devices</p>
          {#if renaming}
            <form class="flex items-center gap-2 py-1" onsubmit={(e) => { e.preventDefault(); driveSync.renameDevice(nameDraft); renaming = false; }}>
              <!-- svelte-ignore a11y_autofocus -->
              <input bind:value={nameDraft} autofocus aria-label="Name of this device" placeholder="e.g. Phone" maxlength="30" class="field flex-1 min-w-0" />
              <button type="submit" class="btn btn-primary">Save</button>
              <button type="button" onclick={() => renaming = false} class="btn btn-ghost">Cancel</button>
            </form>
            <p class="text-caption text-content-subtle">Other devices see it as "{nameDraft.trim() ? `${nameDraft.trim()} (${driveSync.deviceModel})` : driveSync.deviceModel}".</p>
          {:else}
            <div class="flex items-center gap-2">
              <p class="text-body text-content min-w-0 truncate">
                {driveSync.deviceLabel ?? driveSync.deviceModel}{#if driveSync.deviceLabel}{' '}<span class="text-content-subtle">({driveSync.deviceModel})</span>{/if}
                <span class="text-caption text-content-subtle">· this one</span>
              </p>
              <button onclick={() => { nameDraft = driveSync.deviceLabel ?? ''; renaming = true; }} class="btn-icon shrink-0" aria-label="Name this device" title="Name this device">
                <Icon icon="ic:baseline-edit" class="text-xl" />
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
          <p class="text-caption text-status-caution" role="alert">{driveSync.error}</p>
          {#if driveSync.needsSignIn}
            <button onclick={() => driveSync.signInAgain()} class="btn btn-secondary text-primary shrink-0">Sign in</button>
          {/if}
        </div>
      {/if}
    {/if}

    {#if driveSync.conflicts.length > 0}
      <div class="space-y-2 pt-3 border-t border-border">
        <div class="flex items-center justify-between gap-3 px-1">
          <p class="text-label text-content">Edited on two devices <span class="text-content-subtle font-normal">({driveSync.conflicts.length})</span></p>
          <button onclick={clearAllConflicts} class="btn btn-ghost">Clear all</button>
        </div>
        <p class="text-caption text-content-subtle px-1 leading-relaxed">The newer edit was kept everywhere. Restore puts the other version back instead.</p>
        <div class="divide-y divide-border">
          {#each driveSync.conflicts as c (conflictKey(c))}
            {@const open = expanded === conflictKey(c)}
            <div class="py-2">
              <button onclick={() => (expanded = open ? null : conflictKey(c))} class="w-full flex items-center justify-between gap-3 text-left min-h-11" aria-expanded={open}>
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
                    <details class="text-caption text-content-subtle">
                      <summary class="min-h-11 flex items-center cursor-pointer">Technical details of the other version</summary>
                      <pre class="text-caption leading-snug text-content-muted bg-surface-elevated/40 rounded-control p-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(c.lost.value, null, 1)}</pre>
                    </details>
                  {/if}
                  <div class="flex gap-2">
                    <button onclick={() => driveSync.restoreConflict(c)} class="btn btn-primary">
                      {c.lost.deleted ? 'Delete it after all' : 'Restore this version'}
                    </button>
                    <button onclick={() => driveSync.dismissConflict(c)} class="btn btn-ghost">Keep the current one</button>
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
