<script lang="ts">
  /**
   * CRUD for multi-week `TrainingBlock`s - concurrent training emphases
   * that can span (and overlap) more than one week (PLAN.md Phase 4). The
   * single-week "quick assign" phase picker on the calendar itself
   * (`TrainingPlan.svelte`) stays the fast path for the common case; this
   * is the editor for real overlapping/longer blocks.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { TrainingBlock } from '../../lib/types';
  import { sortBlocks, upcomingWindow } from '../../lib/planning/blockPaging';
  import BlockBrowser from './BlockBrowser.svelte';
  import Icon from "@iconify/svelte";

  let { onClose } = $props<{ onClose: () => void }>();

  /**
   * The panel lists the current block and what's next, capped - a long
   * plan's full history scrolled for screens here and buried the blocks
   * that actually matter. Everything else is one tap away in
   * `BlockBrowser`, which pages the whole timeline from today outwards.
   */
  const VISIBLE_LIMIT = 10;

  const blocks = $derived(sortBlocks(trainingState.trainingBlocks));
  const visibleBlocks = $derived(upcomingWindow(blocks, trainingState.currentWeekId, VISIBLE_LIMIT));
  const hiddenCount = $derived(blocks.length - visibleBlocks.length);
  const phaseDefs = $derived([...trainingState.phaseDefs].filter((p) => !p.archived));

  let editingBlock = $state<TrainingBlock | null>(null);
  let showBrowser = $state(false);

  function phaseName(phaseId: string): string {
    return trainingState.phaseDefs.find((p) => p.id === phaseId)?.name ?? 'Unknown Phase';
  }

  function startAdd() {
    const currentWeekId = trainingState.currentWeekId;
    editingBlock = {
      id: generateId(),
      name: 'New Block',
      phaseId: phaseDefs[0]?.id ?? '',
      startWeekId: currentWeekId,
      endWeekId: currentWeekId,
      priority: 0,
    };
  }

  function startEdit(block: TrainingBlock) {
    editingBlock = { ...block };
  }

  async function handleSave() {
    if (!editingBlock) return;
    if (!editingBlock.name.trim() || !editingBlock.phaseId) return;
    if (editingBlock.endWeekId < editingBlock.startWeekId) {
      [editingBlock.startWeekId, editingBlock.endWeekId] = [editingBlock.endWeekId, editingBlock.startWeekId];
    }
    const { notes, ...block } = $state.snapshot(editingBlock);
    await trainingState.saveTrainingBlock(notes?.trim() ? { ...block, notes: notes.trim() } : block);
    editingBlock = null;
  }

  async function handleDelete(id: string) {
    await trainingState.deleteTrainingBlock(id);
  }

  /** Editing from the full browser reuses this panel's one editor form rather than duplicating it there. */
  function handleEditFromBrowser(block: TrainingBlock) {
    showBrowser = false;
    startEdit(block);
  }
</script>

<div class="fixed inset-0 bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-md">
  <div class="bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-5">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-title text-content">Training Blocks</h3>
        <p class="text-caption text-content-subtle mt-0.5">
          {hiddenCount > 0 ? 'Current and upcoming emphases' : 'Concurrent, multi-week emphases'}
        </p>
      </div>
      <button onclick={onClose} class="text-content-subtle hover:text-content transition-colors">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    {#if editingBlock}
      <div class="p-4 bg-surface-elevated/50 border border-primary/30 rounded-card space-y-3">
        <div class="space-y-1">
          <label for="block-name" class="text-label text-content-subtle ml-1">Name</label>
          <input id="block-name" bind:value={editingBlock.name} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm" placeholder="e.g. Finger Strength Block" />
        </div>
        <div class="space-y-1">
          <label for="block-phase" class="text-label text-content-subtle ml-1">Phase</label>
          <select id="block-phase" bind:value={editingBlock.phaseId} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm appearance-none">
            {#each phaseDefs as phase}
              <option value={phase.id}>{phase.name}</option>
            {/each}
          </select>
        </div>
        <div class="flex gap-3">
          <div class="flex-1 space-y-1">
            <label for="block-start" class="text-label text-content-subtle ml-1">Start Week</label>
            <input id="block-start" type="week" bind:value={editingBlock.startWeekId} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
          </div>
          <div class="flex-1 space-y-1">
            <label for="block-end" class="text-label text-content-subtle ml-1">End Week</label>
            <input id="block-end" type="week" bind:value={editingBlock.endWeekId} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
          </div>
        </div>
        <div class="space-y-1">
          <label for="block-notes" class="text-label text-content-subtle ml-1">Notes</label>
          <textarea id="block-notes" bind:value={editingBlock.notes} rows="3" class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm leading-relaxed resize-y" placeholder="What this block is for, how to progress it…"></textarea>
        </div>
        <div class="space-y-1">
          <label for="block-priority" class="text-label text-content-subtle ml-1">Priority (higher wins on overlap)</label>
          <input id="block-priority" type="number" bind:value={editingBlock.priority} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
        </div>
        <div class="flex gap-2 pt-1">
          <button onclick={handleSave} class="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-control">Save</button>
          <button onclick={() => editingBlock = null} class="px-5 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
        </div>
      </div>
    {:else}
      <button onclick={startAdd} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-card flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all">
        <Icon icon="ic:baseline-plus" /><span class="text-label">Add Block</span>
      </button>

      <div class="space-y-2">
        {#each visibleBlocks as block}
          <div class="flex items-center justify-between p-3.5 bg-surface-elevated/50 rounded-control border border-border-strong/50">
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div class="w-2.5 h-2.5 rounded-control flex-shrink-0 {block.color || phaseDefs.find(p => p.id === block.phaseId)?.color || 'bg-status-neutral'}"></div>
              <div class="min-w-0 flex-1">
                <p class="text-body font-bold text-content truncate flex items-center gap-1.5">
                  <span class="truncate">{block.name}</span>
                  {#if block.notes}<Icon icon="ic:baseline-sticky-note-2" class="text-xs text-primary/70 shrink-0" />{/if}
                </p>
                <p class="text-caption text-content-subtle mt-0.5">{phaseName(block.phaseId)} · {block.startWeekId} - {block.endWeekId}{block.priority ? ` · priority ${block.priority}` : ''}</p>
              </div>
            </div>
            <div class="flex items-center gap-1 ml-2">
              <button onclick={() => startEdit(block)} class="p-1.5 text-content-subtle hover:text-content transition-colors"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
              <button onclick={() => handleDelete(block.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
            </div>
          </div>
        {:else}
          <div class="p-4 bg-surface-elevated/20 rounded-control border border-dashed border-border text-center"><p class="text-caption text-content-subtle italic">No training blocks yet</p></div>
        {/each}

        {#if hiddenCount > 0}
          <button
            onclick={() => showBrowser = true}
            class="w-full pt-1 text-caption text-content-subtle hover:text-primary transition-colors flex items-center justify-center gap-1"
          >
            Show all {blocks.length} blocks
            <span class="opacity-70">({hiddenCount} more)</span>
            <Icon icon="ic:baseline-expand-more" class="text-sm" />
          </button>
        {:else if blocks.length > 0}
          <button
            onclick={() => showBrowser = true}
            class="w-full pt-1 text-caption text-content-subtle hover:text-primary transition-colors flex items-center justify-center gap-1"
          >
            Browse full timeline
            <Icon icon="ic:baseline-expand-more" class="text-sm" />
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if showBrowser}
  <BlockBrowser
    onClose={() => showBrowser = false}
    onEdit={handleEditFromBrowser}
    onDelete={handleDelete}
  />
{/if}
