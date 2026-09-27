<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { showConfirm } from '../../lib/utils';
  import { Capacitor } from '@capacitor/core';
  import { AUTO_BACKUP_KEEP } from '../../lib/storage/autoBackup';
  import { driveSync } from '../../lib/sync/driveSync.svelte';
  import Icon from "@iconify/svelte";
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
  onMount(async () => {
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

  async function handleImportClick() {
    const confirmed = await showConfirm(
      'Import Data',
      'Are you sure you want to import this data? This will overwrite your existing data and cannot be undone.'
        + (driveSync.connected ? ' Sync is on, so your other devices get the imported data too.' : '')
    );
    if (confirmed) {
      fileInput?.click();
    }
  }

  /**
   * Wipes this device back to a fresh install (welcome screens included),
   * saving a backup file first. Sync is disconnected before the wipe, or
   * the next sync would pull everything straight back from Drive.
   */
  async function deleteAllData() {
    const confirmed = await showConfirm(
      'Delete all data?',
      'This removes every session, plan, goal, log and setting from this device. A backup file is saved first.'
    );
    if (!confirmed) return;
    const outcome = await storage.exportData().catch(() => 'failed' as const);
    if (outcome === 'failed' || outcome === 'dismissed') {
      const anyway = await showConfirm('No backup was saved', 'Delete everything anyway? This cannot be undone.');
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
    <div class="space-y-2"><h3 class="text-section uppercase text-content-muted px-1">Backup</h3><p class="text-caption text-content-subtle px-1">One file with everything - to keep, move to another phone, or restore from.</p></div>
    <div class="divide-y divide-border">
      <button onclick={onExport} class="w-full flex items-center justify-between py-3 transition-colors group"><div class="flex items-center gap-3"><Icon icon="ic:baseline-download" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" /><div class="text-left"><p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Save a backup file</p><p class="text-caption text-content-subtle">Everything, as one .json file</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
      <div class="relative">
        <button onclick={handleImportClick} class="w-full flex items-center justify-between py-3 transition-colors group cursor-pointer"><div class="flex items-center gap-3"><Icon icon="ic:baseline-upload" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" /><div class="text-left"><p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Restore from a backup file</p><p class="text-caption text-content-subtle">Replaces what's on this device</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
        <input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={onImport} />
      </div>
    </div>
    {#if isNative}
      <label class="flex items-center justify-between gap-3 py-3 border-t border-border cursor-pointer">
        <div class="min-w-0">
          <p class="text-body text-content">Automatic weekly backup</p>
          <p class="text-caption text-content-subtle mt-0.5">
            Once a week, to Documents/{AUTO_BACKUP_FOLDER}, keeping the last {AUTO_BACKUP_KEEP}.
            {#if trainingState.lastAutoBackup}
              Last: {new Date(trainingState.lastAutoBackup.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{trainingState.lastAutoBackup.where !== `Documents/${AUTO_BACKUP_FOLDER}` && !trainingState.lastAutoBackup.where.startsWith('Documents/') ? ` (in ${trainingState.lastAutoBackup.where})` : ''}.
            {/if}
            {#if legacyFolder}
              Older backups, from before the app was renamed, are in Documents/{legacyFolder} - you can delete that folder once there are backups in the new one.
            {/if}
          </p>
        </div>
        <input
          type="checkbox"
          checked={trainingState.autoBackup}
          onchange={(e) => trainingState.setAutoBackup(e.currentTarget.checked)}
          class="w-5 h-5 rounded accent-primary shrink-0"
        />
      </label>
    {/if}
  </div>

  <div class="card space-y-3 animate-in fade-in">
    <div class="space-y-2"><h3 class="text-section uppercase text-content-muted px-1">Start Over</h3><p class="text-caption text-content-subtle px-1">Remove everything from this device and begin again from the welcome screen. A backup file is saved first.{#if driveSync.connected} Sync is switched off; your copy in Google Drive stays.{/if}</p></div>
    <button onclick={deleteAllData} class="w-full py-2.5 text-label text-danger border border-danger/40 rounded-control hover:bg-danger/10 transition-colors">Delete all data</button>
  </div>
</div>


