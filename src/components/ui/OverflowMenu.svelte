<script lang="ts">
  /**
   * The "more" button of a top bar (three dots) and the small menu it opens: a list of text actions that don't earn
   * a button of their own. A tap elsewhere or Escape closes it. Rows are 44 px tall.
   */
  import Icon from '@iconify/svelte';

  export interface OverflowItem {
    label: string;
    icon: string;
    onclick: () => void;
  }

  let { items, label = 'More actions' }: { items: OverflowItem[]; label?: string } = $props();

  let open = $state(false);
  let rootEl = $state<HTMLElement>();
  $effect(() => {
    if (!open) return;
    const away = (e: Event) => { if (rootEl && !rootEl.contains(e.target as Node)) open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false; };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc); };
  });
</script>

<div class="relative" bind:this={rootEl}>
  <button type="button" onclick={() => (open = !open)} class="btn-icon" aria-label={label} aria-haspopup="menu" aria-expanded={open}>
    <Icon icon="ic:baseline-more-vert" class="text-2xl" />
  </button>
  {#if open}
    <div role="menu" class="absolute right-0 top-full mt-1 z-30 min-w-56 bg-surface-elevated border border-border-strong rounded-control shadow-card overflow-hidden animate-in fade-in slide-in-from-top-2">
      {#each items as item (item.label)}
        <button type="button" role="menuitem" onclick={() => { open = false; item.onclick(); }} class="w-full flex items-center gap-2 px-3 min-h-11 text-label text-content hover:bg-surface transition-colors text-left whitespace-nowrap">
          <Icon icon={item.icon} class="text-base shrink-0" /> {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
