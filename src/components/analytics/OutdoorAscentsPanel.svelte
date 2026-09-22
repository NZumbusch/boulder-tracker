<script lang="ts">
  /**
   * Outdoor ascent grade distribution over the displayed week window
   * (UI_PLAN.md §4.6, Stage 5) - `outdoorAscents` are imported and stored
   * (Phase 6) but nothing charted them until now. Each ascent is plotted
   * as a dot: x = the week it fell in, y = its grade rank (see
   * `../../lib/analytics/grades.ts`) - a scatter, not a bar chart, so the
   * spread of grades climbed each week ("distribution") is visible
   * directly rather than collapsed into a single per-week number.
   */
  import { formatDate } from '../../lib/dateUtils';
  import { showsLabel, pickAxisTicks } from '../../lib/analytics/chartWindow';
  import { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import Icon from "@iconify/svelte";

  export interface WeekAscentPoint {
    id: string;
    grade: string;
    rank: number;
    date: string;
    name?: string;
    style?: string;
  }
  export interface WeekAscentGroup {
    weekId: string;
    ascents: WeekAscentPoint[];
  }

  let { weeks, weekLabels, unparsedCount, labelStep = 1 }: {
    weeks: WeekAscentGroup[];
    weekLabels: Record<string, string>;
    unparsedCount: number;
    /** Axis thinning step, shared with the other week charts so all their x-axes agree - see `lib/analytics/chartWindow.ts`. */
    labelStep?: number;
  } = $props();

  // Hover doesn't exist on a phone, so each ascent also opens on tap.
  const tips = new ChartTips();
  $effect(() => tips.listen());

  const allRanks = $derived(weeks.flatMap((w) => w.ascents.map((a) => a.rank)));
  const hasAscents = $derived(allRanks.length > 0);
  const minRank = $derived(Math.min(...allRanks));
  const maxRank = $derived(Math.max(...allRanks));

  // 8% top/bottom padding so a single-grade window doesn't plot flush against the edges.
  function yPercent(rank: number): number {
    if (maxRank === minRank) return 50;
    return 8 + ((rank - minRank) / (maxRank - minRank)) * 84;
  }

  /**
   * The y-axis labels: grades, not the ranks they are plotted by.
   *
   * A rank is an internal sort key (`lib/analytics/grades.ts`), so an axis
   * labelled with it would be unreadable - "7B" is the thing that means
   * something. There is no rank-to-grade function to call, and there
   * shouldn't be: the mapping is derived from the ascents themselves, so
   * the axis can only ever show grades that were actually climbed.
   *
   * Capped at four labels, always including the lowest and highest, so a
   * window spanning a dozen grades doesn't stack unreadable text down the
   * side of a 144px-tall chart.
   */
  const gradeTicks = $derived.by(() => {
    if (!hasAscents) return [];

    const byRank = new Map<number, string>();
    for (const week of weeks) {
      for (const ascent of week.ascents) byRank.set(ascent.rank, ascent.grade);
    }

    const ranks = [...byRank.keys()].sort((a, b) => a - b);
    // Spaced by where each label actually lands, not by its index: grade
    // ranks are unevenly spaced (7A and 7B are ten apart, 6C and 7A
    // eighty), so even sampling of the list printed adjacent grades on top
    // of one another.
    return pickAxisTicks(ranks, yPercent).map((rank) => ({ rank, grade: byRank.get(rank)! }));
  });
</script>

<div class="bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-section uppercase text-content-muted">Outdoor Ascents</h3>
      <p class="text-caption text-content-subtle mt-0.5">Grade distribution, by week</p>
    </div>
    <Icon icon="ic:baseline-terrain" class="text-base text-content-subtle" />
  </div>

  {#if hasAscents}
    <!-- Grade gutter beside the plot. Labels sit at the same `bottom` the
         dots use, so they line up with the scale exactly rather than being
         spaced evenly down a container whose plot area is inset by 8%. -->
    <div class="flex gap-2">
      <div class="w-9 shrink-0 h-36 relative">
        {#each gradeTicks as tick (tick.rank)}
          <span
            class="absolute right-0 -translate-y-1/2 text-caption leading-none text-content-subtle/70 tabular-nums whitespace-nowrap"
            style="bottom: {yPercent(tick.rank)}%;"
          >
            {tick.grade}
          </span>
        {/each}
      </div>
      <div class="flex-1 min-w-0 space-y-3">
        <div class="h-36 relative border-b border-border-strong/60">
          {#each weeks as week, i}
            {@const xPercent = ((i + 0.5) / weeks.length) * 100}
            {#each week.ascents as ascent}
              <button
                type="button"
                data-tip-trigger
                data-tip-open={tips.isOpen(ascent.id)}
                onclick={() => tips.toggle(ascent.id)}
                aria-label="{ascent.grade}{ascent.name ? `, ${ascent.name}` : ''}"
                class="absolute -translate-x-1/2 group"
                style="left: {xPercent}%; bottom: {yPercent(ascent.rank)}%;"
              >
                <div class="w-1.5 h-1.5 bg-tertiary rounded-full group-hover:scale-[2] transition-transform"></div>
                <div class="chart-tip absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control whitespace-nowrap z-20 border border-border shadow-card pointer-events-none">
                  {ascent.grade}{ascent.name ? ` · ${ascent.name}` : ''}{ascent.style ? ` · ${ascent.style}` : ''} · {formatDate(ascent.date)}
                </div>
              </button>
            {/each}
          {/each}
        </div>
        <div class="flex justify-between gap-px">
          {#each weeks as week, i}
            <span class="flex-1 text-center text-caption leading-tight text-content-subtle/70 tabular-nums">
              {showsLabel(i, weeks.length, labelStep) ? (weekLabels[week.weekId] ?? week.weekId) : ''}
            </span>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <p class="text-caption text-content-subtle italic text-center py-4">No outdoor ascents logged in this window</p>
  {/if}

  {#if unparsedCount > 0}
    <p class="text-caption text-content-subtle italic">{unparsedCount} ascent{unparsedCount === 1 ? '' : 's'} in this window {unparsedCount === 1 ? 'has' : 'have'} a grade format that couldn't be plotted.</p>
  {/if}
</div>
