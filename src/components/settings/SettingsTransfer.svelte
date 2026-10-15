<script lang="ts">
  /**
   * Settings -> Data & connections -> Sync & backup: the settings on their own - a file to carry
   * them to another device (or keep as a restore point), and a reset by group.
   * Never touches sessions, exercises or history. With Drive sync on they also
   * travel by themselves (`lib/preferences/portable.ts`).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { saveFile } from '../../lib/share/saveFile';
  import { localIsoDate } from '../../lib/dateUtils';
  import { SETTINGS_GROUP_IDS, SETTINGS_GROUPS, type SettingsGroupId } from '../../lib/preferences/portable';
  import { showConfirm } from '../../lib/utils';
  import { showUndo, toast } from '../../lib/toast.svelte';
  import { driveSync } from '../../lib/sync/driveSync.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import ActionRow from './ActionRow.svelte';

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
    if (outcome === 'failed') toast.show('The settings file could not be saved');
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
    if (error) toast.show(`Import failed: ${error}`);
    else showUndo('Settings imported', () => trainingState.preferencesStore.replace(before));
  }

  async function reset() {
    const parts = [...chosenGroups.map((id) => SETTINGS_GROUPS[id].label), ...(picked[CATEGORIES] ? ['Analytics categories (built-ins restored, yours kept)'] : [])];
    const ok = await showConfirm('Reset settings', `Put these back to their defaults?\n\n- ${parts.join('\n- ')}\n\nSessions, exercises and history are not touched.`, { ok: 'Reset', cancel: 'Keep them' });
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
    <h2 class="text-section uppercase text-content-muted px-1">Settings file</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Just your settings - layout, units, tunables, session behaviour, AI sharing. Not your location, reminders or text size, which belong to the device.
      {driveSync.connected ? 'They also sync through Drive with everything else.' : 'With Drive sync on they travel by themselves.'}
    </p>
  </div>
  <div class="divide-y divide-border">
    <ActionRow icon="ic:baseline-download" title="Export settings" hint="A small .json file" onclick={exportFile} />
    <ActionRow icon="ic:baseline-upload" title="Import settings" hint="From a settings file. You can undo it afterwards." onclick={() => fileInput?.click()} />
    <input bind:this={fileInput} type="file" accept=".json,application/json" class="hidden" onchange={importFile} />
    <ActionRow icon="ic:baseline-restore" title="Reset settings…" hint="Pick what goes back to defaults" onclick={() => (resetting = !resetting)} expanded={resetting} />
  </div>

  {#if resetting}
    <div class="space-y-1 animate-in fade-in">
      {#each SETTINGS_GROUP_IDS as id (id)}
        <Toggle checked={!!picked[id]} onChange={(v) => (picked[id] = v)} label={SETTINGS_GROUPS[id].label} hint={SETTINGS_GROUPS[id].description} />
      {/each}
      <Toggle checked={!!picked[CATEGORIES]} onChange={(v) => (picked[CATEGORIES] = v)} label="Analytics categories" hint="Restores the built-in ones (names, colours, un-archived). Yours stay." />
      <button onclick={reset} disabled={!anyPicked} class="btn btn-danger w-full mt-2">Reset selected</button>
      {#if !anyPicked}<p class="text-caption text-content-subtle text-center">Switch on what to reset first.</p>{/if}
    </div>
  {/if}
</div>
