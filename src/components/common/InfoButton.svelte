<script lang="ts">
  /** A small (?) that opens the glossary entry for a term (see lib/help/glossary). */
  import Icon from '@iconify/svelte';
  import { showInfo } from '../../lib/help/infoSheet.svelte';
  import { GLOSSARY, type TermId } from '../../lib/help/glossary';

  let { term }: { term: TermId } = $props();
</script>

<button
  onclick={(e) => { e.stopPropagation(); showInfo(term); }}
  class="p-1 -m-1 rounded-control text-content-subtle hover:text-content transition-colors"
  aria-label="What is {GLOSSARY[term].title}?"
>
  <Icon icon="ic:outline-help-outline" class="text-sm" />
</button>
