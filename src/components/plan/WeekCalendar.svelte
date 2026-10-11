<script lang="ts">
  /**
   * Presentational calendar grid extracted out of `TrainingPlan.svelte` - pure rendering of a row of week cells, with no
   * knowledge of `trainingState`/blocks/phases itself. A week can be
   * covered by more than one overlapping `TrainingBlock` now, so each cell
   * takes an already-resolved `color` (the dominant block's color, via
   * `getDominantBlockForWeek`) plus a plain `hasOverlap` flag rather than
   * the block list itself, keeping this component decoupled from block
   * resolution logic.
   */
  import Icon from "@iconify/svelte";

  interface CalendarWeek {
    id: string;
    label: string;
    year: number;
    isCurrent: boolean;
    color?: string;
    tooltip: string;
    hasOverlap: boolean;
    /** Week still projects its sessions from the phase rather than storing them (see lib/planning/weekProjection.ts). */
    provisional?: boolean;
  }

  let {
    weeks,
    selectedWeekId,
    onSelectWeek,
  }: {
    weeks: CalendarWeek[];
    selectedWeekId: string | null;
    onSelectWeek: (weekId: string) => void;
  } = $props();

  const FALLBACK_COLOR = 'bg-surface-elevated/50 hover:bg-surface-elevated';

  /** Columns in the grid below - the tooltip anchoring needs to know which one a cell is in. */
  const COLUMNS = 10;

  /**
   * Where a cell's tooltip hangs from.
   *
   * A tooltip is `whitespace-nowrap` and can be ~250 characters wide
   * ("2026-W39 - Capacity (overlapping blocks) - not saved yet"), so one
   * centred on an edge cell reaches far outside the card. Cells near
   * either edge anchor to that edge instead of their own centre, which
   * keeps every tooltip inside the grid.
   */
  function tooltipAnchor(index: number): string {
    const column = index % COLUMNS;
    if (column <= 2) return 'left-0';
    if (column >= COLUMNS - 3) return 'right-0';
    return 'left-1/2 -translate-x-1/2';
  }
</script>

<div class="card relative">
  <!-- No min-width: a floor wider than the card's inner width made the
       whole page scroll sideways on a narrow phone. The cells are
       aspect-square and simply get smaller instead. -->
  <div class="grid grid-cols-10 gap-2">
    {#each weeks as week, i}
      {@const showYear = i === 0 || weeks[i].year !== weeks[i - 1].year}
      <button
        onclick={() => onSelectWeek(week.id)}
        aria-label={`${week.tooltip}${week.isCurrent ? ', this week' : ''}`}
        aria-pressed={selectedWeekId === week.id}
        class="aspect-square rounded-control transition-all duration-300 relative group hover:z-20
          {week.color || FALLBACK_COLOR}
          {selectedWeekId === week.id ? 'ring-1 ring-primary ring-offset-1 ring-offset-surface scale-110 z-10 shadow-lg' : 'hover:scale-110'}
          {week.isCurrent ? 'border-2 border-primary' : ''}"
      >
        {#if showYear}<div class="absolute -top-1.5 -left-1.5 z-20 px-1 py-px rounded-control bg-surface-elevated text-content border border-border-strong shadow-sm text-caption font-bold whitespace-nowrap">{week.year}</div>{/if}
        {#if week.isCurrent}<div class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-hover rounded-full border-2 border-app-bg z-20"></div>{/if}
        {#if week.hasOverlap}<div class="absolute -bottom-1 -left-1 w-2 h-2 bg-white rounded-full border border-app-bg z-20" title="Multiple training blocks overlap this week"></div>{/if}
        {#if week.provisional}
          <!-- Deliberately tiny: this is an at-a-glance hint across ~50
               cells, not a label. The Plan panel below spells it out. -->
          <!-- Anchored by its own bottom-right corner at the cell's centre, so
               it sits in the top-left quadrant with even padding rather than
               hugging the rounded corner. -->
          <div class="absolute left-1/2 top-1/2 -translate-x-full -translate-y-full leading-none z-20 text-app-bg" title="Not saved yet - follows the phase">
            <Icon icon="ic:outline-cloud-queue" class="text-[9px]" />
          </div>
        {/if}
        <!-- `hidden` rather than `opacity-0`: an invisible element is still
             laid out, so 50 nowrap tooltips were adding scrollable empty
             space to the right of the page. Hiding it outright costs only
             the fade, and a hover tooltip never shows on touch anyway. -->
        <div class="hidden group-hover:block absolute bottom-full {tooltipAnchor(i)} mb-2 px-2 py-1 bg-surface-elevated text-caption text-content rounded-control pointer-events-none whitespace-nowrap z-30 shadow-card border border-border-strong">{week.tooltip}</div>
      </button>
    {/each}
  </div>
</div>
