<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { showConfirm } from '../../lib/utils';
  import { exportWorkoutsToICS } from '../../lib/ics';
  import { Capacitor } from '@capacitor/core';
  import { AUTO_BACKUP_KEEP } from '../../lib/storage/autoBackup';
  import PDFExportModal from './PDFExportModal.svelte';
  import { driveSync } from '../../lib/sync/driveSync.svelte';
  import Icon from "@iconify/svelte";

  let {
    onExport,
    onImport,
  }: {
    onExport: () => void;
    onImport: (e: Event) => void;
  } = $props();

  let showPDFExport = $state(false);
  const isNative = Capacitor.isNativePlatform();
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
</script>

<div class="space-y-4">
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Calendar Integration</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Export training history as an ICS file for integration with standard calendar applications.</p>
    </div>
    <button
      onclick={() => exportWorkoutsToICS(trainingState.workouts)}
      class="w-full flex items-center justify-between py-2 transition-colors group"
    >
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-calendar-today" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
        <div class="text-left">
          <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Export Calendar (.ics)</p>
          <p class="text-caption text-content-subtle">Download all sessions</p>
        </div>
      </div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
  </div>

  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2"><h3 class="text-section uppercase text-content-muted px-1">Printable Training Plan</h3><p class="text-caption text-content-subtle px-1 leading-relaxed">Generate a PDF of your workouts for any week range.</p></div>
    <button
      onclick={() => showPDFExport = true}
      class="w-full flex items-center justify-between py-2 transition-colors group"
    >
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-picture-as-pdf" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
        <div class="text-left">
          <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Export PDF</p>
          <p class="text-caption text-content-subtle">Select week range</p>
        </div>
      </div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
  </div>

  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2"><h3 class="text-section uppercase text-content-muted px-1">JSON Backups</h3><p class="text-caption text-content-subtle px-1">Ensure your data is safe by exporting a local JSON backup.</p></div>
    <div class="divide-y divide-border">
      <button onclick={onExport} class="w-full flex items-center justify-between py-3 transition-colors group"><div class="flex items-center gap-3"><Icon icon="ic:baseline-download" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" /><div class="text-left"><p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Export</p><p class="text-caption text-content-subtle">Save to local JSON</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
      <div class="relative">
        <button onclick={handleImportClick} class="w-full flex items-center justify-between py-3 transition-colors group cursor-pointer"><div class="flex items-center gap-3"><Icon icon="ic:baseline-upload" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" /><div class="text-left"><p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Import</p><p class="text-caption text-content-subtle">Restore from backup</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
        <input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={onImport} />
      </div>
    </div>
    {#if isNative}
      <label class="flex items-center justify-between gap-3 py-3 border-t border-border cursor-pointer">
        <div class="min-w-0">
          <p class="text-body text-content">Automatic weekly backup</p>
          <p class="text-caption text-content-subtle mt-0.5">
            Once a week, to Documents/ClimbingTracker, keeping the last {AUTO_BACKUP_KEEP}.
            {#if trainingState.lastAutoBackup}
              Last: {new Date(trainingState.lastAutoBackup.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{trainingState.lastAutoBackup.where !== 'Documents/ClimbingTracker' ? ` (in ${trainingState.lastAutoBackup.where})` : ''}.
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
</div>

{#if showPDFExport}
  <PDFExportModal onClose={() => showPDFExport = false} />
{/if}
