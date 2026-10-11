<script lang="ts">
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  /** The glossary bottom sheet, mounted once in App; `showInfo(term)` opens it. */
  import Icon from '@iconify/svelte';
  import { infoSheet } from '../../lib/help/infoSheet.svelte';
  import { GLOSSARY } from '../../lib/help/glossary';
  import { backWhile } from '../../lib/navigation/backStack.svelte';

  const entry = $derived(infoSheet.term ? GLOSSARY[infoSheet.term] : null);
  const close = () => (infoSheet.term = null);
  backWhile(() => infoSheet.term !== null, close);
</script>

{#if entry}
  <div class="fixed inset-0 pb-safe bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[160] backdrop-blur-md animate-in fade-in duration-150">
    <div class="absolute inset-0" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()} role="button" tabindex="-1" aria-label="Close"></div>
    <div class="relative bg-surface w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-3" use:sheetDrag={close} role="dialog" aria-modal="true" aria-label={entry.title}>
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-title text-content">{entry.title}</h3>
        <button onclick={close} class="text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
          <Icon icon="ic:baseline-close" class="text-xl" />
        </button>
      </div>
      {#each entry.paragraphs as p}
        <p class="text-body text-content-muted leading-relaxed">{p}</p>
      {/each}
    </div>
  </div>
{/if}
