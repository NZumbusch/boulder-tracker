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
    /** Only for a week split between phases: one coloured segment per run of days (0 = Monday ... 6 = Sunday), drawn side by side. */
    runs?: { color?: string; from: number; to: number }[];
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

  /** "42" from "2026-W42": the number printed in each cell, so a cell can be read without its colour. */
  const weekNumber = (id: string) => String(Number(id.slice(-2)));
  const yearsLabel = $derived.by(() => {
    if (!weeks.length) return '';
    const first = weeks[0].year, last = weeks[weeks.length - 1].year;
    return first === last ? `${first}` : `${first} to ${last}`;
  });
  const anyOverlap = $derived(weeks.some((w) => w.hasOverlap));

  const FALLBACK_COLOR = 'bg-surface-elevated/40 hover:bg-surface-elevated';

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

<div class="relative px-1">
  <!-- No min-width: a floor wider than the card's inner width made the
       whole page scroll sideways on a narrow phone. The cells are
       aspect-square and simply get smaller instead. -->
  <div class="grid grid-cols-10 gap-1.5" role="group" aria-label="Weeks, {yearsLabel}">
    {#each weeks as week, i}
      {@const showYear = i === 0 || weeks[i].year !== weeks[i - 1].year}
      <button
        onclick={() => onSelectWeek(week.id)}
        aria-label={`${week.tooltip}${week.isCurrent ? ', this week' : ''}`}
        aria-pressed={selectedWeekId === week.id}
        class="tap week-cell aspect-square rounded-md transition-all duration-200 relative group hover:z-20
          {week.runs || week.color ? '' : FALLBACK_COLOR}
          {selectedWeekId === week.id ? 'ring-2 ring-content z-10' : ''}"
      >
        {#if week.color && !week.runs}<span class="absolute inset-0 rounded-md {week.color} opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" aria-hidden="true"></span>{/if}
        {#if week.runs}
          <!-- A week split between phases: a segment as wide as its days, per phase. Phase colours are classes, so these are children, not a gradient. -->
          <span class="absolute inset-0 flex overflow-hidden rounded-md opacity-80 pointer-events-none" aria-hidden="true">
            {#each week.runs as run}
              <span class="{run.color || FALLBACK_COLOR.split(' ')[0]} h-full" style="flex: {run.to - run.from + 1} 1 0"></span>
            {/each}
          </span>
        {/if}
        {#if showYear}<div class="absolute top-0.5 left-0.5 z-10 leading-none text-content text-caption font-bold pointer-events-none">{week.year}</div>{/if}
        <span class="absolute inset-0 z-10 flex justify-center pointer-events-none tabular-nums text-caption leading-none text-content {showYear ? 'items-end pb-0.5' : 'items-center'} {week.isCurrent ? 'font-black underline decoration-2 underline-offset-2' : 'font-medium'}" aria-hidden="true">{weekNumber(week.id)}</span>
        {#if week.hasOverlap}<div class="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-content ring-1 ring-surface rounded-full z-20" title="Multiple training blocks overlap this week"></div>{/if}
        <!-- `hidden` rather than `opacity-0`: an invisible element is still
             laid out, so 50 nowrap tooltips were adding scrollable empty
             space to the right of the page. Hiding it outright costs only
             the fade, and a hover tooltip never shows on touch anyway. -->
        <div class="hidden group-hover:block absolute bottom-full {tooltipAnchor(i)} mb-2 px-2 py-1 bg-surface-elevated text-caption text-content rounded-control pointer-events-none whitespace-nowrap z-30 shadow-card">{week.tooltip}</div>
      </button>
    {/each}
  </div>
  {#if anyOverlap}
    <p class="mt-2 flex items-center gap-1.5 text-caption text-content-subtle"><span class="w-1.5 h-1.5 bg-content ring-1 ring-surface rounded-full shrink-0" aria-hidden="true"></span>Two blocks cover this week</p>
  {/if}
</div>

<style>
  /* The cells sit 6px apart, so the finger-sized area grows only to meet the next cell (36px), not the usual 8px each side. */
  .week-cell::after { inset: -3px; }
</style>
