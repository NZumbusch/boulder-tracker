<script lang="ts">
  /** The glossary bottom sheet, mounted once in App; `showInfo(term)` opens it. */
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '@iconify/svelte';
  import { infoSheet } from '../../lib/help/infoSheet.svelte';
  import { GLOSSARY } from '../../lib/help/glossary';
  import { settingsPath } from '../../lib/settings/tree';
  import { trainingState } from '../../lib/state.svelte';

  const entry = $derived(infoSheet.term ? GLOSSARY[infoSheet.term] : null);
  const close = () => (infoSheet.term = null);
  function openWhere() {
    const page = entry?.where;
    if (!page) return;
    close();
    trainingState.uiStore.openSettingsPage(page);
  }
</script>

{#if entry}
  <Sheet title={entry.title} level="top" onClose={close}>
    {#each entry.paragraphs as p}
      <p class="text-body text-content-muted leading-relaxed">{p}</p>
    {/each}
    {#if entry.where}
      <button type="button" onclick={openWhere} class="btn btn-secondary w-full justify-between">
        <span class="text-left">Change it: {settingsPath(entry.where).replace('Settings → ', '')}</span>
        <Icon icon="ic:baseline-chevron-right" class="text-xl shrink-0" />
      </button>
    {/if}
  </Sheet>
{/if}
