<script lang="ts">
  /**
   * Settings -> Backup & Sync: the settings on their own - a file to carry
   * them to another device (or keep as a restore point), and a reset by group.
   * Never touches sessions, exercises or history. With Drive sync on they also
   * travel by themselves (`lib/preferences/portable.ts`).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { saveFile } from '../../lib/share/saveFile';
  import { localIsoDate } from '../../lib/dateUtils';
  import { SETTINGS_GROUP_IDS, SETTINGS_GROUPS, type SettingsGroupId } from '../../lib/preferences/portable';
  import { showAlert, showConfirm } from '../../lib/utils';
  import { showUndo, toast } from '../../lib/toast.svelte';
  import { driveSync } from '../../lib/sync/driveSync.svelte';
  import Icon from '@iconify/svelte';

  let fileInput = $state<HTMLInputElement>();
  let resetting = $state(false);
  let picked = $state<Record<string, boolean>>({});
  const CATEGORIES = 'categories';
  const chosenGroups = $derived(SETTINGS_GROUP_IDS.filter((id) => picked[id]));
  const anyPicked = $derived(chosenGroups.length > 0 || !!picked[CATEGORIES]);

  async function exportFile() {
    const outcome = await saveFile({
      content: trainingState.settingsFileText(),
      fileName: `boulder-tracker-settings-${localIsoDate()}.json`,
      mimeType: 'application/json',
      title: 'Boulder Tracker settings',
    });
    if (outcome === 'failed') await showAlert('Export failed', 'The settings file could not be saved.');
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const ok = await showConfirm(
      'Import settings',
      'This replaces your layout, units, tunables, session behaviour and AI sharing with the file\'s. Your sessions and exercises are not touched.'
        + (driveSync.connected ? ' Sync is on, so your other devices get these settings too.' : ''),
    );
    if (!ok) return;
    const before = trainingState.preferencesStore.snapshot();
    const error = trainingState.importSettingsText(await file.text(), SETTINGS_GROUP_IDS);
    if (error) await showAlert('Import failed', error);
    else showUndo('Settings imported', () => trainingState.preferencesStore.replace(before));
  }

  async function reset() {
    const parts = [...chosenGroups.map((id) => SETTINGS_GROUPS[id].label), ...(picked[CATEGORIES] ? ['Analytics categories (built-ins restored, yours kept)'] : [])];
    const ok = await showConfirm('Reset settings', `Put these back to their defaults?\n\n- ${parts.join('\n- ')}\n\nSessions, exercises and history are not touched.`);
    if (!ok) return;
    const before = trainingState.preferencesStore.snapshot();
    await trainingState.resetSettings(chosenGroups, { categories: !!picked[CATEGORIES] });
    resetting = false;
    picked = {};
    if (chosenGroups.length) showUndo('Settings reset', () => trainingState.preferencesStore.replace(before));
    else toast.show('Categories restored');
  }
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Settings</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Just your settings - layout, units, tunables, session behaviour, AI sharing. Not your location, reminders or text size, which belong to the device.
      {driveSync.connected ? 'They also sync through Drive with everything else.' : 'With Drive sync on they travel by themselves.'}
    </p>
  </div>
  <div class="divide-y divide-border">
    <button onclick={exportFile} class="w-full flex items-center justify-between py-3 transition-colors group">
      <div class="flex items-center gap-3"><Icon icon="ic:baseline-download" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
        <div class="text-left"><p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Export settings</p><p class="text-caption text-content-subtle">A small .json file</p></div></div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
    <button onclick={() => fileInput?.click()} class="w-full flex items-center justify-between py-3 transition-colors group">
      <div class="flex items-center gap-3"><Icon icon="ic:baseline-upload" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
        <div class="text-left"><p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Import settings</p><p class="text-caption text-content-subtle">From a settings file</p></div></div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
    <input bind:this={fileInput} type="file" accept=".json,application/json" class="hidden" onchange={importFile} />
    <button onclick={() => resetting = !resetting} class="w-full flex items-center justify-between py-3 transition-colors group" aria-expanded={resetting}>
      <div class="flex items-center gap-3"><Icon icon="ic:baseline-restore" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
        <div class="text-left"><p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Reset settings…</p><p class="text-caption text-content-subtle">Pick what goes back to defaults</p></div></div>
      <Icon icon={resetting ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-content-subtle text-xl" />
    </button>
  </div>

  {#if resetting}
    <div class="space-y-1 animate-in fade-in">
      {#each SETTINGS_GROUP_IDS as id (id)}
        <label class="flex items-center justify-between gap-3 py-2.5 cursor-pointer">
          <div class="min-w-0"><p class="text-body text-content">{SETTINGS_GROUPS[id].label}</p><p class="text-caption text-content-subtle">{SETTINGS_GROUPS[id].description}</p></div>
          <input type="checkbox" bind:checked={picked[id]} class="w-5 h-5 rounded accent-primary shrink-0" />
        </label>
      {/each}
      <label class="flex items-center justify-between gap-3 py-2.5 cursor-pointer">
        <div class="min-w-0"><p class="text-body text-content">Analytics categories</p><p class="text-caption text-content-subtle">Restores the built-in ones (names, colours, un-archived). Yours stay.</p></div>
        <input type="checkbox" bind:checked={picked[CATEGORIES]} class="w-5 h-5 rounded accent-primary shrink-0" />
      </label>
      <button onclick={reset} disabled={!anyPicked} class="w-full mt-2 py-3 text-label font-bold text-danger bg-danger/10 hover:bg-danger/15 rounded-control transition-colors disabled:opacity-40">Reset selected</button>
    </div>
  {/if}
</div>
