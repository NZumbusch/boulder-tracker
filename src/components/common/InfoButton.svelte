<script lang="ts">
  /**
   * A small (?) that opens the glossary entry for a term (see lib/help/glossary).
   * Hidden everywhere when the "Help buttons" preference is off. Sized and
   * aligned to sit on a text line (a heading or a caption) without pushing
   * it apart; its tap area reaches past the icon.
   */
  import Icon from '@iconify/svelte';
  import { showInfo } from '../../lib/help/infoSheet.svelte';
  import { GLOSSARY, type TermId } from '../../lib/help/glossary';
  import { trainingState } from '../../lib/state.svelte';

  let { term }: { term: TermId } = $props();
</script>

{#if trainingState.helpButtons}
  <button
    onclick={(e) => { e.stopPropagation(); showInfo(term); }}
    class="inline-flex items-center justify-center align-middle w-5 h-5 -my-1 rounded-full text-content-subtle/70 hover:text-content hover:bg-surface-elevated transition-colors shrink-0"
    aria-label="What is {GLOSSARY[term].title}?"
  >
    <Icon icon="ic:outline-help-outline" class="text-[13px]" />
  </button>
{/if}
