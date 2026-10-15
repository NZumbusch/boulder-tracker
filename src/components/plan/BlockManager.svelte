<script lang="ts">
  import Sheet from '../ui/Sheet.svelte';
  /**
   * The only place phases are edited. A phase is a range of days, so it can
   * start or end mid-week; the Plan's block view and calendar show and work
   * with sessions, and open this with a day when its phase needs changing.
   * Placing a block over days another of the same priority has takes them
   * (that block is shortened, split or removed - the form says which); blocks
   * of a different priority are concurrent emphases and stay as they are.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { TrainingBlock } from '../../lib/types';
  import { sortBlocks, upcomingWindow } from '../../lib/planning/blockPaging';
  import { blockFirstWeekId, phaseOnDay } from '../../lib/planning/trainingBlocks';
  import { placeBlock, startPhaseOn, describeBlockChanges, daysWithoutPhase } from '../../lib/planning/blockEdit';
  import { weekMondayIso, weekSundayIso, weekIdOfIso, formatDay } from '../../lib/dateUtils';
  import BlockBrowser from './BlockBrowser.svelte';
  import { openBlockReview } from '../../lib/analytics/blockReview.svelte';
  import Icon from "@iconify/svelte";

  /** `focusDate` ('YYYY-MM-DD'): opened from a day in the Plan - shows what is there and offers to start another phase on it. */
  let { onClose, focusDate } = $props<{ onClose: () => void; focusDate?: string }>();

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
  // Open/closed is its own flag: nulling `editingBlock` to close the form
  // would make its still-bound inputs read a field of null before it's gone.
  let formOpen = $state(false);
  let showBrowser = $state(false);

  function phaseName(phaseId: string): string {
    return trainingState.phaseDefs.find((p) => p.id === phaseId)?.name ?? 'Unknown Phase';
  }

  function startAdd() {
    const weekId = focusDate ? weekIdOfIso(focusDate) : trainingState.currentWeekId;
    formOpen = true;
    editingBlock = {
      id: generateId(),
      name: 'New Block',
      phaseId: phaseDefs[0]?.id ?? '',
      startDate: focusDate ?? weekMondayIso(weekId),
      endDate: weekSundayIso(weekId),
      priority: 0,
    };
  }

  function startEdit(block: TrainingBlock) {
    editingBlock = { ...block };
    formOpen = true;
  }

  /** The form's block as it would be saved: dates the right way round, notes trimmed; undefined while the form is incomplete. */
  function readyBlock(): TrainingBlock | undefined {
    if (!editingBlock) return undefined;
    const { notes, ...block } = $state.snapshot(editingBlock);
    if (!block.name.trim() || !block.phaseId || !block.startDate || !block.endDate) return undefined;
    const [startDate, endDate] = block.endDate < block.startDate ? [block.endDate, block.startDate] : [block.startDate, block.endDate];
    return { ...block, startDate, endDate, ...(notes?.trim() ? { notes: notes.trim() } : {}) };
  }

  /** What saving would do to the other blocks, and which days it would leave without a phase - shown under the dates. */
  const preview = $derived.by(() => {
    const block = readyBlock();
    if (!block) return undefined;
    const current = $state.snapshot(trainingState.trainingBlocks) as TrainingBlock[];
    const placed = placeBlock(current, block, () => 'preview');
    return { changes: describeBlockChanges(current, placed, block.id), gaps: daysWithoutPhase(current, placed) };
  });

  async function handleSave() {
    const block = readyBlock();
    if (!block) return;
    const current = $state.snapshot(trainingState.trainingBlocks) as TrainingBlock[];
    await trainingState.setTrainingBlocks(placeBlock(current, block, generateId), `"${block.name}" saved`);
    formOpen = false;
  }

  /** The block on `focusDate`, and the phase chosen to start there. */
  const focusBlock = $derived(focusDate ? phaseOnDay(trainingState.trainingBlocks, focusDate) : undefined);
  let startPhaseId = $state('');
  async function handleStartPhase() {
    const phase = phaseDefs.find((p) => p.id === startPhaseId);
    if (!phase || !focusDate) return;
    const current = $state.snapshot(trainingState.trainingBlocks) as TrainingBlock[];
    await trainingState.setTrainingBlocks(startPhaseOn(current, focusDate, phase, generateId), `${phase.name} starts ${formatDay(focusDate)}`);
    onClose();
  }

  const longDay = (iso: string) => formatDay(iso, { weekday: 'long' });
  const dayCount = (b: TrainingBlock) => Math.round((Date.parse(b.endDate) - Date.parse(b.startDate)) / 86_400_000) + 1;

  async function handleDelete(id: string) {
    await trainingState.deleteTrainingBlock(id);
  }

  /** Editing from the full browser reuses this panel's one editor form rather than duplicating it there. */
  function handleEditFromBrowser(block: TrainingBlock) {
    showBrowser = false;
    startEdit(block);
  }
</script>

<Sheet title="Training Blocks" subtitle="Which phase runs on which days" {onClose} level="sheet">
    {#if focusDate && !formOpen}
      <div class="p-4 bg-surface-elevated/50 rounded-card space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-label text-content-subtle">{longDay(focusDate)}</p>
            <p class="text-body font-bold text-content truncate">{focusBlock ? (focusBlock.name === phaseName(focusBlock.phaseId) ? focusBlock.name : `${focusBlock.name} · ${phaseName(focusBlock.phaseId)}`) : 'No phase'}</p>
          </div>
          {#if focusBlock}
            <button onclick={() => startEdit(focusBlock)} class="btn-icon shrink-0" aria-label="Edit this block"><Icon icon="ic:baseline-edit" class="text-base" /></button>
          {/if}
        </div>
        <div class="flex gap-2">
          <select bind:value={startPhaseId} aria-label="Phase to start on this day" class="field flex-1 min-w-0">
            <option value="">Start a phase on {formatDay(focusDate)}…</option>
            {#each phaseDefs as phase}<option value={phase.id}>{phase.name}</option>{/each}
          </select>
          <button onclick={handleStartPhase} disabled={!startPhaseId} class="btn btn-primary">Start</button>
        </div>
      </div>
    {/if}

    {#if formOpen && editingBlock}
      <div class="p-4 bg-surface-elevated/50 rounded-card space-y-3">
        <div class="space-y-1">
          <label for="block-name" class="text-label text-content-subtle ml-1">Name</label>
          <input id="block-name" bind:value={editingBlock.name} class="field" placeholder="e.g. Finger Strength Block" />
        </div>
        <div class="space-y-1">
          <label for="block-phase" class="text-label text-content-subtle ml-1">Phase</label>
          <select id="block-phase" bind:value={editingBlock.phaseId} class="field">
            {#each phaseDefs as phase}
              <option value={phase.id}>{phase.name}</option>
            {/each}
          </select>
        </div>
        <div class="flex gap-3">
          <div class="flex-1 space-y-1">
            <label for="block-start" class="text-label text-content-subtle ml-1">First day</label>
            <input id="block-start" type="date" bind:value={editingBlock.startDate} class="field" />
          </div>
          <div class="flex-1 space-y-1">
            <label for="block-end" class="text-label text-content-subtle ml-1">Last day</label>
            <input id="block-end" type="date" bind:value={editingBlock.endDate} class="field" />
          </div>
        </div>
        {#if preview && (preview.changes.length || preview.gaps.length)}
          <div class="space-y-0.5 text-caption" aria-live="polite">
            {#each preview.changes as line}<p class="text-content-muted">{line}</p>{/each}
            {#each preview.gaps as gap}<p class="text-warning">Leaves {gap.from === gap.to ? formatDay(gap.from) : `${formatDay(gap.from)} – ${formatDay(gap.to)}`} without a phase</p>{/each}
          </div>
        {/if}
        <div class="space-y-1">
          <label for="block-notes" class="text-label text-content-subtle ml-1">Notes</label>
          <textarea id="block-notes" bind:value={editingBlock.notes} rows="3" class="field leading-relaxed resize-y" placeholder="What this block is for, how to progress it…"></textarea>
        </div>
        <details class="group" open={!!editingBlock.priority}>
          <summary class="text-label text-content-subtle cursor-pointer min-h-11 flex items-center">Advanced: priority</summary>
          <div class="space-y-1 pb-1">
            <label for="block-priority" class="text-label text-content-subtle ml-1">Priority (higher wins on overlap)</label>
            <input id="block-priority" type="number" inputmode="numeric" bind:value={editingBlock.priority} class="field" />
            <p class="text-caption text-content-subtle ml-1">Only matters when two blocks cover the same day: the one with the higher number is the phase shown. Leave at 0 for a normal plan.</p>
          </div>
        </details>
        <div class="flex gap-2 pt-1">
          <button onclick={handleSave} class="btn btn-primary flex-1">Save</button>
          <button onclick={() => formOpen = false} class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    {:else}
      <button onclick={startAdd} class="btn btn-secondary w-full">
        <Icon icon="ic:baseline-plus" /><span>Add block</span>
      </button>

      {#if hiddenCount > 0}<p class="text-caption text-content-subtle -mb-2">Showing the current block and what comes next.</p>{/if}
      <div class="space-y-2">
        {#each visibleBlocks as block}
          <div class="flex items-center justify-between p-3.5 bg-surface-elevated/50 rounded-control">
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div class="w-2.5 h-2.5 rounded-control flex-shrink-0 {block.color || phaseDefs.find(p => p.id === block.phaseId)?.color || 'bg-status-neutral'}"></div>
              <div class="min-w-0 flex-1">
                <p class="text-body font-bold text-content truncate flex items-center gap-1.5">
                  <span class="truncate">{block.name}</span>
                  {#if block.notes}<Icon icon="ic:baseline-sticky-note-2" class="text-xs text-primary/70 shrink-0" />{/if}
                </p>
                <p class="text-caption text-content-subtle mt-0.5">{phaseName(block.phaseId)} · {formatDay(block.startDate)} – {formatDay(block.endDate)} · {dayCount(block)} day{dayCount(block) === 1 ? '' : 's'}{block.priority ? ` · priority ${block.priority}` : ''}</p>
              </div>
            </div>
            <div class="flex items-center ml-1 -mr-2">
              {#if blockFirstWeekId(block) <= trainingState.currentWeekId}
                <button onclick={() => openBlockReview(block.id)} class="btn-icon" aria-label="Review {block.name}" title="How the block went"><Icon icon="ic:baseline-insights" class="text-base" /></button>
              {/if}
              <button onclick={() => startEdit(block)} class="btn-icon" aria-label="Edit {block.name}"><Icon icon="ic:baseline-edit" class="text-base" /></button>
              <button onclick={() => handleDelete(block.id)} class="btn-icon hover:text-danger" aria-label="Delete {block.name}"><Icon icon="ic:baseline-delete" class="text-base" /></button>
            </div>
          </div>
        {:else}
          <div class="p-4 bg-surface-elevated/20 rounded-control text-center"><p class="text-caption text-content-subtle italic">No training blocks yet</p></div>
        {/each}

        {#if hiddenCount > 0}
          <button
            onclick={() => showBrowser = true}
            class="btn btn-ghost w-full text-label"
          >
            Show all {blocks.length} blocks
            <span class="opacity-70">({hiddenCount} more)</span>
            <Icon icon="ic:baseline-expand-more" class="text-sm" />
          </button>
        {:else if blocks.length > 0}
          <button
            onclick={() => showBrowser = true}
            class="btn btn-ghost w-full text-label"
          >
            See the full timeline
            <Icon icon="ic:baseline-expand-more" class="text-sm" />
          </button>
        {/if}
      </div>
    {/if}
</Sheet>

{#if showBrowser}
  <BlockBrowser
    onClose={() => showBrowser = false}
    onEdit={handleEditFromBrowser}
    onDelete={handleDelete}
  />
{/if}
