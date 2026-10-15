<script lang="ts">
  /**
   * The plan changes that can still be rolled back - AI changes and copied
   * weeks, newest first, each with what was asked for and what it did. "Go
   * back" restores the plan as it was before that change (and so also takes
   * back the ones after it); sessions logged since always stay.
   */
  import Icon from '@iconify/svelte';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import type { PlanHistoryEntry } from '../../lib/storage';

  let { onClose }: { onClose: () => void } = $props();
  backWhile(() => true, () => onClose());

  let entries = $state<PlanHistoryEntry[]>([]);
  async function load() { entries = await trainingState.getPlanHistory(); }
  $effect(() => { trainingState.planUndoVersion; void load(); });

  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  async function goBack(entry: PlanHistoryEntry) {
    if (await trainingState.undoPlanTo(entry.index)) onClose();
  }
</script>

<div class="fixed inset-0 z-[150] pb-safe bg-app-bg/90 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-150">
  <div class="absolute inset-0" role="presentation" onclick={onClose}></div>
  <div class="relative bg-surface w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={onClose} role="dialog" aria-modal="true" aria-label="Plan changes">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="text-title text-content">Plan changes</h3>
        <p class="text-caption text-content-subtle">The last {entries.length || 'few'} AI changes and copied weeks. Going back to one also takes back the ones after it.</p>
      </div>
      <button onclick={onClose} class="text-content-subtle hover:text-content shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
    </div>

    {#each entries as entry (entry.index)}
      <div class="rounded-card p-3.5 space-y-2 bg-surface-elevated/40">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-label text-content">{entry.source === 'copy' ? 'Copied a week' : 'AI change'} · <span class="text-content-subtle font-normal">{when(entry.appliedAt)}</span></p>
            {#if entry.goal}<p class="text-caption text-content-subtle mt-0.5 break-words">"{entry.goal.length > 140 ? `${entry.goal.slice(0, 140)}…` : entry.goal}"</p>{/if}
          </div>
          <button onclick={() => goBack(entry)} class="shrink-0 px-3 py-1.5 text-label font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-control transition-colors">Go back</button>
        </div>
        {#if entry.lines.length}
          <ul class="text-caption text-content-muted space-y-0.5">
            {#each entry.lines.slice(0, 5) as line}<li class="break-words">{line}</li>{/each}
            {#if entry.lines.length > 5}<li class="text-content-subtle">and {entry.lines.length - 5} more</li>{/if}
          </ul>
        {/if}
      </div>
    {:else}
      <p class="text-caption text-content-subtle italic px-1">Nothing to go back to yet.</p>
    {/each}
  </div>
</div>
