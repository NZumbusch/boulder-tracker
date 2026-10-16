<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { showConfirm } from '../../lib/utils';
  import { Capacitor } from '@capacitor/core';
  import { AUTO_BACKUP_KEEP } from '../../lib/storage/autoBackup';
  import { driveSync } from '../../lib/sync/driveSync.svelte';
  import ActionRow from './ActionRow.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import { storage } from '../../lib/storage';
  import { wipeAllLocalData, AUTO_BACKUP_FOLDER, LEGACY_BACKUP_FOLDERS } from '../../lib/storage/persistence';
  import { Filesystem, Directory } from '@capacitor/filesystem';
  import { onMount } from 'svelte';
  import { cancelAllReminders } from '../../lib/notifications/shared';

  let {
    onExport,
    onImport,
  }: {
    onExport: () => void;
    onImport: (e: Event) => void;
  } = $props();

  const isNative = Capacitor.isNativePlatform();

  /** Backups from before the rename, if this phone has any - only then is the old folder mentioned. */
  let legacyFolder = $state<string | null>(null);
  /** What the last restore replaced, if it was kept - offered as "Restore previous". */
  let previous = $state<{ at: string; workouts: number } | null>(null);
  async function loadPrevious() { previous = await trainingState.restoreSnapshotInfo(); }
  async function restorePrevious() {
    if (await trainingState.restorePrevious()) await loadPrevious();
  }
  onMount(async () => {
    void loadPrevious();
    if (!isNative) return;
    for (const folder of LEGACY_BACKUP_FOLDERS) {
      try {
        const { files } = await Filesystem.readdir({ path: folder, directory: Directory.Documents });
        if (files.length > 0) {
          legacyFolder = folder;
          return;
        }
      } catch {
        // Not there.
      }
    }
  });
  let fileInput = $state<HTMLInputElement>();

  /**
   * Restore: the file is picked first, and the confirmation says what is in it next to what is on this device, so the
   * replacement is never agreed to blind. The restore itself (and the safety copy it saves first) is the app's.
   */
  async function handlePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    let incoming = 'a backup file';
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data.workouts)) {
        const saved = new Date(file.lastModified).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        incoming = `a backup with ${data.workouts.length} session${data.workouts.length === 1 ? '' : 's'}, file dated ${saved}`;
      }
    } catch { /* the import itself reports an unreadable file */ }
    const confirmed = await showConfirm(
      'Replace everything on this device?',
      `This device has ${trainingState.workouts.length} session${trainingState.workouts.length === 1 ? '' : 's'}. They, and all your other data and settings, are replaced by ${incoming}. A backup of what is here now is saved first.`
        + (driveSync.connected ? ' Sync is on, so your other devices get the restored data too.' : ''),
      { ok: 'Replace everything', cancel: 'Keep my data' },
    );
    if (!confirmed) { input.value = ''; return; }
    onImport(e);
  }

  /**
   * Wipes this device back to a fresh install (welcome screens included),
   * saving a backup file first. Sync is disconnected before the wipe, or
   * the next sync would pull everything straight back from Drive.
   */
  async function deleteAllData() {
    const confirmed = await showConfirm(
      'Delete all data?',
      'This removes every session, plan, goal, log and setting from this device. A backup file is saved first.',
      { ok: 'Delete everything', cancel: 'Keep my data' },
    );
    if (!confirmed) return;
    const outcome = await storage.exportData().catch(() => 'failed' as const);
    if (outcome === 'failed' || outcome === 'dismissed') {
      const anyway = await showConfirm('No backup was saved', 'Delete everything anyway? This cannot be undone.', { ok: 'Delete without a backup', cancel: 'Keep my data' });
      if (!anyway) return;
    }
    if (driveSync.connected) await driveSync.disconnect();
    await cancelAllReminders().catch(() => {});
    await wipeAllLocalData();
    window.location.replace(window.location.pathname);
  }
</script>

<div class="space-y-4">
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2"><h2 class="text-section uppercase text-content-muted px-1">Backup</h2><p class="text-caption text-content-subtle px-1">One file with everything - to keep, move to another phone, or restore from.</p></div>
    <div class="divide-y divide-border">
      <ActionRow icon="ic:baseline-download" title="Save a backup file" hint="Everything, as one .json file" onclick={onExport} />
      <div class="relative">
        <ActionRow icon="ic:baseline-upload" title="Restore from a backup file" hint="Replaces everything on this device. You see what is in the file first." onclick={() => fileInput?.click()} />
        <input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={handlePicked} />
      </div>
      {#if previous}
        <ActionRow
          icon="ic:baseline-restore"
          title="Restore previous"
          hint={`Undo the last restore: back to the ${previous.workouts} session${previous.workouts === 1 ? '' : 's'} this device had on ${new Date(previous.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.`}
          onclick={restorePrevious}
        />
      {/if}
    </div>
    {#if isNative}
      <div class="border-t border-border">
        <Toggle
          checked={trainingState.autoBackup}
          onChange={(v) => trainingState.setAutoBackup(v)}
          label="Automatic weekly backup"
          hint={`Once a week, to Documents/${AUTO_BACKUP_FOLDER}, keeping the last ${AUTO_BACKUP_KEEP}.${trainingState.lastAutoBackup ? ` Last: ${new Date(trainingState.lastAutoBackup.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${trainingState.lastAutoBackup.where !== `Documents/${AUTO_BACKUP_FOLDER}` && !trainingState.lastAutoBackup.where.startsWith('Documents/') ? ` (in ${trainingState.lastAutoBackup.where})` : ''}.` : ''}${legacyFolder ? ` Older backups, from before the app was renamed, are in Documents/${legacyFolder}. You can delete that folder once there are backups in the new one.` : ''}`}
        />
      </div>
    {/if}
  </div>

  <div class="card space-y-3 animate-in fade-in">
    <div class="space-y-2"><h2 class="text-section uppercase text-content-muted px-1">Start over</h2><p class="text-caption text-content-subtle px-1">Remove everything from this device and begin again from the welcome screen. A backup file is saved first.{#if driveSync.connected}{' '}Sync is switched off; your copy in Google Drive stays.{/if}</p></div>
    <button onclick={deleteAllData} class="btn btn-danger w-full">Delete all data</button>
  </div>
</div>


