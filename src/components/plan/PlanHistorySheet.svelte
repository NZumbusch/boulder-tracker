<script lang="ts">
  /**
   * The plan changes that can still be rolled back - AI changes and copied
   * weeks, newest first, each with what was asked for and what it did. "Go
   * back" restores the plan as it was before that change (and so also takes
   * back the ones after it); sessions logged since always stay.
   */
  import Sheet from '../ui/Sheet.svelte';
  import { formatDay } from '../../lib/dateUtils';
  import { trainingState } from '../../lib/state.svelte';
  import type { PlanHistoryEntry } from '../../lib/storage';

  let { onClose }: { onClose: () => void } = $props();

  let entries = $state<PlanHistoryEntry[]>([]);
  async function load() { entries = await trainingState.getPlanHistory(); }
  $effect(() => { trainingState.planUndoVersion; void load(); });

  const when = (iso: string) => `${formatDay(iso, { weekday: 'short' })}, ${new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  async function goBack(entry: PlanHistoryEntry) {
    if (await trainingState.undoPlanTo(entry.index)) onClose();
  }
</script>

<Sheet title="Plan changes" subtitle="The last {entries.length || 'few'} AI changes and copied weeks. Going back to one also takes back the ones after it." {onClose} level="top">
  {#each entries as entry (entry.index)}
    <div class="rounded-card p-3.5 space-y-2 bg-surface-elevated/40">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-label text-content">{entry.source === 'copy' ? 'Copied a week' : 'AI change'} · <span class="text-content-subtle font-normal">{when(entry.appliedAt)}</span></p>
          {#if entry.goal}<p class="text-caption text-content-subtle mt-0.5 break-words">"{entry.goal.length > 140 ? `${entry.goal.slice(0, 140)}…` : entry.goal}"</p>{/if}
        </div>
        <button onclick={() => goBack(entry)} class="btn btn-secondary text-primary shrink-0">Go back</button>
      </div>
      {#if entry.lines.length}
        <ul class="text-caption text-content-muted space-y-0.5">
          {#each entry.lines.slice(0, 5) as line}<li class="break-words">{line}</li>{/each}
          {#if entry.lines.length > 5}<li class="text-content-subtle">and {entry.lines.length - 5} more</li>{/if}
        </ul>
      {/if}
    </div>
  {:else}
    <p class="text-caption text-content-subtle px-1">Nothing to go back to yet.</p>
  {/each}
</Sheet>
