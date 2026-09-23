<script lang="ts">
  /**
   * Sends per grade - a minimal bar chart in the spirit of the Kilter app's
   * pyramid: every Font grade from your easiest to your hardest send, one
   * step of padding either side, empty grades left empty so gaps show.
   * One series, so one colour and no legend. Every bar with sends carries
   * its count (as in Kilter's pyramid) while the bars are wide enough to
   * hold one - unless turned off in Settings (`sendsChartCounts`); hover a bar for its readout, tap it to filter the sends
   * list to that grade (tap again to clear). Ladder and counts come from
   * `lib/sends/gradeHistogram.ts`; the period and the selected grade are
   * owned by the list (`SendsLog`), so both follow the same filter.
   */
  import type { OutdoorAscent } from '../../lib/types';
  import { gradeHistogram } from '../../lib/sends/gradeHistogram';
  import type { SendPeriod } from '../../lib/sends/filter';
  import { trainingState } from '../../lib/state.svelte';

  let { ascents, period = $bindable('all'), selectedGrade = $bindable(null) }: {
    /** Already filtered to `period` by the owner. */
    ascents: OutdoorAscent[];
    period?: SendPeriod;
    selectedGrade?: string | null;
  } = $props();

  const histogram = $derived(gradeHistogram(ascents, 1, trainingState.units.grades));
  const maxCount = $derived(Math.max(1, ...histogram.bars.map((b) => b.count)));
  const total = $derived(histogram.bars.reduce((s, b) => s + b.count, 0));

  /** The bar under the pointer (hover preview); falls back to the selected one for the readout. */
  let hovered = $state<number | null>(null);
  const selectedIndex = $derived(selectedGrade ? histogram.bars.findIndex((b) => b.grade === selectedGrade) : -1);
  const active = $derived(hovered ?? (selectedIndex >= 0 ? selectedIndex : null));
  const activeBar = $derived(active !== null ? histogram.bars[active] : undefined);

  function toggle(grade: string) {
    selectedGrade = selectedGrade === grade ? null : grade;
  }

  // Every grade gets its label when there's room: a label ("6A+") needs
  // about this many px at the axis's 10px size. Narrower than that, only
  // whole grades are labelled so neighbours never overlap.
  const LABEL_MIN_PX = 22;
  let plotWidth = $state(0);
  const thinLabels = $derived(plotWidth > 0 && plotWidth / Math.max(1, histogram.bars.length) < LABEL_MIN_PX);
  /** Counts above the bars need less room than grade names, but still some. */
  const COUNT_MIN_PX = 14;
  const showCounts = $derived(
    trainingState.sendsChartCounts && (plotWidth === 0 || plotWidth / Math.max(1, histogram.bars.length) >= COUNT_MIN_PX),
  );

  const PLOT_HEIGHT = 112;
</script>

<div class="bg-surface/50 border border-border rounded-card p-4 shadow-card space-y-3">
  <div class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <h3 class="text-section uppercase text-content-muted">Sends by grade</h3>
      <p class="text-caption text-content-subtle mt-0.5 tabular-nums">
        {total} send{total === 1 ? '' : 's'}{histogram.unplotted ? ` · ${histogram.unplotted} with other grades not shown` : ''}
      </p>
    </div>
    <div class="flex bg-surface-elevated/50 p-0.5 rounded-control shrink-0">
      {#each [['all', 'All time'], ['year', '12 months']] as [id, label]}
        <button
          onclick={() => { period = id as SendPeriod; selectedGrade = null; }}
          class="px-2.5 py-1 text-caption rounded-control transition-colors {period === id ? 'bg-primary text-white' : 'text-content-muted hover:text-content'}"
          aria-pressed={period === id}
        >{label}</button>
      {/each}
    </div>
  </div>

  {#if histogram.bars.length === 0}
    <p class="text-caption text-content-subtle italic py-6 text-center">No Font-graded sends {period === 'year' ? 'in the last 12 months' : 'yet'}.</p>
  {:else}
    <div>
      <!-- Plot: one full-height hit target per grade; the bar sits on the baseline. -->
      <div bind:clientWidth={plotWidth} class="flex items-end gap-0.5 border-b border-border-strong/60" style="height: {PLOT_HEIGHT + 16}px" onmouseleave={() => hovered = null} role="group" aria-label="Sends per grade - tap a grade to filter the list">
        {#each histogram.bars as bar, i (bar.grade)}
          <button
            class="flex-1 h-full flex flex-col justify-end items-center min-w-0 group"
            onclick={() => toggle(bar.grade)}
            onmouseenter={() => hovered = i}
            aria-pressed={selectedGrade === bar.grade}
            aria-label="{bar.grade}: {bar.count} send{bar.count === 1 ? '' : 's'}{bar.flashed ? `, ${bar.flashed} flashed` : ''}"
          >
            {#if showCounts && bar.count > 0}
              <span class="text-[10px] tabular-nums leading-none mb-1 {active === i ? 'text-content font-bold' : 'text-content-subtle'}">{bar.count}</span>
            {/if}
            {#if bar.count > 0}
              <span
                class="w-full max-w-7 rounded-t-[4px] transition-colors {active === null || active === i ? 'bg-primary' : 'bg-primary/35'}"
                style="height: {(bar.count / maxCount) * PLOT_HEIGHT}px"
              ></span>
            {/if}
          </button>
        {/each}
      </div>
      <!-- Grade axis -->
      <div class="flex gap-0.5 mt-1" aria-hidden="true">
        {#each histogram.bars as bar, i (bar.grade)}
          <span class="flex-1 min-w-0 text-center text-[10px] leading-tight tabular-nums whitespace-nowrap {active === i || selectedGrade === bar.grade ? 'text-content font-bold' : 'text-content-subtle'}">
            {!thinLabels || !bar.grade.endsWith('+') ? bar.grade : ''}
          </span>
        {/each}
      </div>
    </div>

    <p class="text-caption tabular-nums h-4 {activeBar ? 'text-content' : 'text-content-subtle'}">
      {#if activeBar}
        {[
          activeBar.grade,
          `${activeBar.count} send${activeBar.count === 1 ? '' : 's'}`,
          activeBar.flashed > 0 && `${activeBar.flashed} flashed`,
        ].filter(Boolean).join(' · ')}
      {:else}
        Tap a grade to show only those sends
      {/if}
    </p>

    <!-- sr-only goes on a wrapper: a <table> ignores the 1px box it relies
         on, so a table carrying the class itself renders in full. -->
    <div class="sr-only">
      <table>
        <caption>Sends by grade</caption>
        <thead><tr><th>Grade</th><th>Sends</th><th>Flashed</th></tr></thead>
        <tbody>
          {#each histogram.bars as bar}<tr><td>{bar.grade}</td><td>{bar.count}</td><td>{bar.flashed}</td></tr>{/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
