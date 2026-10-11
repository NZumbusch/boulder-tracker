<script lang="ts">
  /**
   * Outdoor ascent grade distribution over the displayed week window - `outdoorAscents` are imported and stored
   * but nothing charted them until now. Each ascent is plotted
   * as a dot: x = the week it fell in, y = its grade rank (see
   * `../../lib/analytics/grades.ts`) - a scatter, not a bar chart, so the
   * spread of grades climbed each week ("distribution") is visible
   * directly rather than collapsed into a single per-week number.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { displayGrade } from '../../lib/sends/gradeScale';
  import { showsLabel, pickAxisTicks, labelStep as labelStepFor } from '../../lib/analytics/chartWindow';
  import { ColumnPicker } from '../../lib/analytics/columnPicker.svelte';
  import ChartEmpty from './ChartEmpty.svelte';

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

  let { weeks, weekLabels, unparsedCount }: {
    weeks: WeekAscentGroup[];
    weekLabels: Record<string, string>;
    unparsedCount: number;
  } = $props();

  // Axis thinned for this plot's own width (the grade gutter makes it narrower than the Load chart).
  let plotWidth = $state(0);
  const labelStep = $derived(labelStepFor(weeks.length, plotWidth));

  // One target for the whole plot: tap or hover a column to list its sends.
  const picker = new ColumnPicker(() => weeks.length);
  $effect(() => picker.listen());

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

  const xOf = (i: number) => ((i + 0.5) / Math.max(weeks.length, 1)) * 100;
  const isFlash = (style?: string) => !!style && /flash|onsight|on-sight/i.test(style);

  /**
   * Dots, nudged sideways when several sends of one grade share a column
   * so they don't sit on top of each other, and the hardest send per
   * column joined up as the trend line.
   */
  const plotted = $derived.by(() => {
    const spread = 38 / Math.max(weeks.length, 1);
    const dots = weeks.flatMap((week, i) => {
      const seen = new Map<number, number>();
      return week.ascents.map((a) => {
        const k = seen.get(a.rank) ?? 0;
        seen.set(a.rank, k + 1);
        const offset = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * Math.min(spread / 2, 1.2);
        return { ...a, column: i, x: xOf(i) + offset, y: 100 - yPercent(a.rank), flash: isFlash(a.style) };
      });
    });
    const tops = weeks
      .map((w, i) => (w.ascents.length ? { i, rank: Math.max(...w.ascents.map((a) => a.rank)) } : null))
      .filter((t): t is { i: number; rank: number } => t !== null);
    const topLine = tops.length > 1 ? `M ${tops.map((t) => `${xOf(t.i)},${100 - yPercent(t.rank)}`).join(' L ')}` : '';
    return { dots, topLine };
  });
  const total = $derived(weeks.reduce((a, w) => a + w.ascents.length, 0));
  const hardest = $derived.by(() => {
    let best: WeekAscentPoint | undefined;
    for (const w of weeks) for (const a of w.ascents) if (!best || a.rank > best.rank) best = a;
    return best;
  });
  const selected = $derived(picker.selected !== null ? weeks[picker.selected] : null);

  /** A stored (Font) grade in the chosen display scale. */
  const G = (grade: string | undefined) => (grade ? displayGrade(grade, trainingState.units.grades) : '');
</script>

<div class="card space-y-3">
  <div>
    <h3 class="text-section uppercase text-content-muted">Outdoor Ascents</h3>
    <p class="text-caption text-content-subtle mt-0.5">
      {#if hasAscents}{total} send{total === 1 ? '' : 's'} · hardest <span class="text-content">{G(hardest?.grade)}</span>{hardest?.name ? ` (${hardest.name})` : ''}{:else}Sends by grade{/if}
    </p>
  </div>

    <div class="text-caption min-h-[1.25rem] text-content-muted">
      {#if selected && hasAscents}
        <span>{weekLabels[selected.weekId] ?? ''}</span>
        {#if selected.ascents.length === 0}
          <span class="text-content-subtle"> · no sends</span>
        {:else}
          {#each [...selected.ascents].sort((a, b) => b.rank - a.rank) as a (a.id)}
            <span class="ml-2"><span class="text-content font-semibold">{G(a.grade)}</span>{a.name ? ` ${a.name}` : ''}{a.style ? ` · ${a.style}` : ''}</span>
          {/each}
        {/if}
      {:else if hasAscents}
        <span class="text-content-subtle/70">Tap a column for its sends</span>
      {/if}
    </div>

    <!-- Grade gutter beside the plot. Labels sit at the same height the
         dots use, so they line up with the scale exactly. -->
    <div class="flex gap-2">
      <div class="w-9 shrink-0 h-36 relative">
        {#each gradeTicks as tick (tick.rank)}
          <span
            class="absolute right-0 -translate-y-1/2 text-caption leading-none text-content-subtle/70 tabular-nums whitespace-nowrap"
            style="bottom: {yPercent(tick.rank)}%;"
          >
            {G(tick.grade)}
          </span>
        {/each}
      </div>
      <div class="flex-1 min-w-0" bind:clientWidth={plotWidth}>
        <div
          bind:this={picker.el}
          class="h-36 relative cursor-crosshair select-none"
          role="presentation"
          onpointerdown={picker.down}
          onpointermove={picker.move}
          onpointerleave={picker.leave}
          onpointerup={picker.tap}
        >
          {#each gradeTicks as tick (tick.rank)}
            <div class="absolute inset-x-0 border-t border-content-subtle/10 pointer-events-none" style="bottom: {yPercent(tick.rank)}%"></div>
          {/each}
          <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={plotted.topLine} fill="none" stroke="var(--color-tertiary)" stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="3 3" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
            {#each plotted.dots as d (d.id)}
              {@const dim = picker.selected !== null && picker.selected !== d.column}
              <path d="M {d.x},{d.y} h 0" stroke="var(--color-tertiary)" stroke-opacity={dim ? 0.3 : 1} stroke-width="8" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {#if !d.flash}
                <path d="M {d.x},{d.y} h 0" stroke="var(--color-surface)" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {/if}
            {/each}
          </svg>
          {#if picker.selected !== null}
            <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {xOf(picker.selected)}%"></div>
          {/if}
          {#if !hasAscents}<ChartEmpty>No outdoor ascents logged in this window</ChartEmpty>{/if}
        </div>
        <div class="border-t border-border-strong/60"></div>
        <div class="flex gap-px">
          {#each weeks as week, i (week.weekId)}
            <span class="flex-1 text-center text-caption leading-tight text-content-subtle/70 tabular-nums">
              {showsLabel(i, weeks.length, labelStep) ? (weekLabels[week.weekId] ?? week.weekId) : ''}
            </span>
          {/each}
        </div>
      </div>
    </div>

    <div class="flex items-center gap-x-4 gap-y-1 flex-wrap">
      <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-tertiary"></span><span class="text-caption text-content-subtle">Flash / onsight</span></div>
      <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full border-2 border-tertiary"></span><span class="text-caption text-content-subtle">Redpoint / other</span></div>
      <div class="flex items-center gap-1.5"><span class="w-3.5 h-0 border-t border-dashed border-tertiary"></span><span class="text-caption text-content-subtle">Hardest</span></div>
    </div>

  {#if unparsedCount > 0}
    <p class="text-caption text-content-subtle italic">{unparsedCount} ascent{unparsedCount === 1 ? '' : 's'} in this window {unparsedCount === 1 ? 'has' : 'have'} a grade format that couldn't be plotted.</p>
  {/if}
</div>
