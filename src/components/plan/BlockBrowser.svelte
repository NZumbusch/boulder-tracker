<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * Full-screen browser for every training block - past, current and
   * future - paged in chronological order and opening on the page that
   * holds the current week rather than at the start of history.
   *
   * `BlockManager`'s own list is deliberately a short window (the current
   * block and what's next); this is the "show all" surface behind it. All
   * of the windowing/paging arithmetic lives in
   * `../../lib/planning/blockPaging.ts` so it's testable without a DOM.
   *
   * Editing is not duplicated here: the edit button hands the block back to
   * `BlockManager`, which owns the one editor form.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { TrainingBlock } from '../../lib/types';
  import { getWeekDates } from '../../lib/dateUtils';
  import {
    sortBlocks,
    classifyBlock,
    pageCount,
    initialPage,
    clampPage,
    pageSlice,
    type BlockTimeframe,
  } from '../../lib/planning/blockPaging';
  import Icon from "@iconify/svelte";

  let { onClose, onEdit, onDelete }: {
    onClose: () => void;
    onEdit: (block: TrainingBlock) => void;
    onDelete: (id: string) => void;
  } = $props();

  const PAGE_SIZE = 10;

  const blocks = $derived(sortBlocks(trainingState.trainingBlocks));
  const currentWeekId = $derived(trainingState.currentWeekId);
  const totalPages = $derived(pageCount(blocks.length, PAGE_SIZE));

  let page = $state(0);
  let initialised = false;

  // Open on the page holding today, once - after that the user's own paging
  // wins and must not be yanked back by a re-derive.
  $effect(() => {
    if (initialised) return;
    page = initialPage(blocks, currentWeekId, PAGE_SIZE);
    initialised = true;
  });

  // Deleting the last block on a page would otherwise leave us past the end.
  $effect(() => {
    const clamped = clampPage(page, blocks.length, PAGE_SIZE);
    if (clamped !== page) page = clamped;
  });

  const visible = $derived(pageSlice(blocks, page, PAGE_SIZE));
  const todayPage = $derived(initialPage(blocks, currentWeekId, PAGE_SIZE));

  const phaseDefById = $derived(new Map(trainingState.phaseDefs.map((p) => [p.id, p])));
  const phaseName = (phaseId: string) => phaseDefById.get(phaseId)?.name ?? 'Unknown Phase';
  const phaseColor = (block: TrainingBlock) =>
    block.color || phaseDefById.get(block.phaseId)?.color || 'bg-status-neutral';

  const TIMEFRAME_LABEL: Record<BlockTimeframe, string> = {
    past: 'Past',
    current: 'Now',
    upcoming: 'Next',
  };
  const TIMEFRAME_CLASS: Record<BlockTimeframe, string> = {
    past: 'text-content-subtle bg-surface-elevated/60',
    current: 'text-primary bg-primary/10',
    upcoming: 'text-content-muted bg-surface-elevated/60',
  };

  /**
   * The block's real calendar span: the Monday its first week starts on to
   * the Sunday its last week ends on. Deliberately not two
   * `getWeekDateRange` calls glued together - that would print two week
   * ranges ("Jun 16 - Jun 22 – Sep 1 - Sep 7") rather than one span.
   */
  function blockDateRange(block: TrainingBlock): string {
    const start = getWeekDates(block.startWeekId);
    const end = getWeekDates(block.endWeekId);
    if (!start || !end) return '';
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.start.toLocaleDateString(undefined, opts)} – ${end.end.toLocaleDateString(undefined, opts)}`;
  }

  function go(direction: -1 | 1) {
    page = clampPage(page + direction, blocks.length, PAGE_SIZE);
  }

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onClose());
</script>

<div class="fixed inset-0 z-[110] safe-y bg-app-bg flex flex-col">
  <header class="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between gap-3">
    <div class="min-w-0">
      <h3 class="text-title text-content truncate">All Training Blocks</h3>
      <p class="text-caption text-content-subtle mt-0.5">
        {blocks.length} block{blocks.length === 1 ? '' : 's'} · page {page + 1} of {totalPages}
      </p>
    </div>
    <button onclick={onClose} class="p-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
      <Icon icon="ic:baseline-close" class="text-xl" />
    </button>
  </header>

  <div class="flex-1 overflow-y-auto no-scrollbar px-4 py-4">
    <div class="w-full max-w-lg mx-auto space-y-2">
      {#each visible as block (block.id)}
        {@const timeframe = classifyBlock(block, currentWeekId)}
        <div
          class="flex items-center justify-between gap-2 p-3.5 rounded-control border transition-colors
            {timeframe === 'current'
              ? 'bg-primary/5 border-primary/30'
              : 'bg-surface-elevated/40 border-border-strong/40'}
            {timeframe === 'past' ? 'opacity-70' : ''}"
        >
          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <div class="w-2.5 h-2.5 rounded-control shrink-0 {phaseColor(block)}"></div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-body font-bold text-content truncate">{block.name}</p>
                <span class="shrink-0 px-1.5 py-0.5 rounded-control text-caption leading-none {TIMEFRAME_CLASS[timeframe]}">
                  {TIMEFRAME_LABEL[timeframe]}
                </span>
              </div>
              <p class="text-caption text-content-subtle mt-0.5 truncate">
                {phaseName(block.phaseId)} · {block.startWeekId} – {block.endWeekId}{block.priority ? ` · priority ${block.priority}` : ''}
              </p>
              <p class="text-caption text-content-subtle/70 truncate">
                {blockDateRange(block)}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick={() => onEdit(block)} class="p-1.5 text-content-subtle hover:text-content transition-colors" aria-label="Edit block">
              <Icon icon="ic:baseline-edit" class="text-sm" />
            </button>
            <button onclick={() => onDelete(block.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" aria-label="Delete block">
              <Icon icon="ic:baseline-delete" class="text-sm" />
            </button>
          </div>
        </div>
      {:else}
        <div class="p-6 bg-surface-elevated/20 rounded-card border border-dashed border-border text-center">
          <p class="text-caption text-content-subtle italic">No training blocks yet</p>
        </div>
      {/each}
    </div>
  </div>

  <footer class="shrink-0 border-t border-border px-4 py-3">
    <div class="w-full max-w-lg mx-auto flex items-center justify-between gap-3">
      <button
        onclick={() => go(-1)}
        disabled={page === 0}
        class="flex items-center gap-1 px-3 py-2 rounded-control border border-border-strong/50 text-label text-content-muted hover:text-content hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <Icon icon="ic:baseline-chevron-left" class="text-base" />
        Earlier
      </button>

      <button
        onclick={() => page = todayPage}
        disabled={page === todayPage}
        class="px-3 py-2 rounded-control border border-border-strong/50 text-label text-content-muted hover:text-content hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        Today
      </button>

      <button
        onclick={() => go(1)}
        disabled={page >= totalPages - 1}
        class="flex items-center gap-1 px-3 py-2 rounded-control border border-border-strong/50 text-label text-content-muted hover:text-content hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        Later
        <Icon icon="ic:baseline-chevron-right" class="text-base" />
      </button>
    </div>
  </footer>
</div>
