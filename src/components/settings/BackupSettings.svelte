<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { showConfirm } from '../../lib/utils';
  import { exportWorkoutsToICS } from '../../lib/ics';
  import { Capacitor } from '@capacitor/core';
  import { AUTO_BACKUP_KEEP } from '../../lib/storage/autoBackup';
  import PDFExportModal from './PDFExportModal.svelte';
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
      class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-card border border-border-strong/50 transition-all group"
    >
      <div class="flex items-center gap-3">
        <div class="p-2.5 bg-success/10 rounded-control text-success group-hover:bg-success group-hover:text-white transition-colors">
          <Icon icon="ic:baseline-calendar-today" class="text-xl" />
        </div>
        <div class="text-left">
          <p class="text-body font-bold text-content">Export Calendar (.ics)</p>
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
      class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-card border border-border-strong/50 transition-all group"
    >
      <div class="flex items-center gap-3">
        <div class="p-2.5 bg-danger/10 rounded-control text-danger group-hover:bg-danger group-hover:text-white transition-colors">
          <Icon icon="ic:baseline-picture-as-pdf" class="text-xl" />
        </div>
        <div class="text-left">
          <p class="text-body font-bold text-content">Export PDF</p>
          <p class="text-caption text-content-subtle">Select week range</p>
        </div>
      </div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
  </div>

  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2"><h3 class="text-section uppercase text-content-muted px-1">JSON Backups</h3><p class="text-caption text-content-subtle px-1">Ensure your data is safe by exporting a local JSON backup.</p></div>
    <div class="grid grid-cols-1 gap-3">
      <button onclick={onExport} class="flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-card border border-border-strong/50 transition-all group"><div class="flex items-center gap-3"><div class="p-2.5 bg-primary-hover/10 rounded-control text-primary group-hover:bg-primary-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-download" class="text-xl" /></div><div class="text-left"><p class="text-body font-bold text-content">Export</p><p class="text-caption text-content-subtle">Save to local JSON</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
      <div class="relative">
        <button onclick={handleImportClick} class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-card border border-border-strong/50 transition-all group cursor-pointer"><div class="flex items-center gap-3"><div class="p-2.5 bg-success-hover/10 rounded-control text-success group-hover:bg-success-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-upload" class="text-xl" /></div><div class="text-left"><p class="text-body font-bold text-content">Import</p><p class="text-caption text-content-subtle">Restore from backup</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
        <input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={onImport} />
      </div>
    </div>
    {#if isNative}
      <label class="flex items-center justify-between gap-3 p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 cursor-pointer">
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
