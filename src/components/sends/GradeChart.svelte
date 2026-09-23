<script lang="ts">
  /**
   * Sends per grade - a minimal bar chart in the spirit of the Kilter app's
   * pyramid: every Font grade from your easiest to your hardest send, one
   * step of padding either side, empty grades left empty so gaps show.
   * One series, so one colour and no legend. Only the tallest bar carries
   * its number; tap (or hover) any bar for its readout. Ladder and counts
   * come from `lib/sends/gradeHistogram.ts`.
   */
  import type { OutdoorAscent } from '../../lib/types';
  import { gradeHistogram } from '../../lib/sends/gradeHistogram';
  import { toUtcDayIndex } from '../../lib/dateUtils';

  let { ascents }: { ascents: OutdoorAscent[] } = $props();

  type Period = 'all' | 'year';
  let period = $state<Period>('all');
  const todayIndex = toUtcDayIndex(new Date().toISOString());
  const inPeriod = $derived(
    period === 'all' ? ascents : ascents.filter((a) => a.date && todayIndex - toUtcDayIndex(a.date) <= 365),
  );
  const histogram = $derived(gradeHistogram(inPeriod));
  const maxCount = $derived(Math.max(1, ...histogram.bars.map((b) => b.count)));
  const tallest = $derived(histogram.bars.findIndex((b) => b.count === maxCount));
  const total = $derived(histogram.bars.reduce((s, b) => s + b.count, 0));

  let active = $state<number | null>(null);
  const activeBar = $derived(active !== null ? histogram.bars[active] : undefined);

  /** With many steps, label only the whole grades ("6A", not "6A+") so labels never collide. */
  const thinLabels = $derived(histogram.bars.length > 12);

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
          onclick={() => { period = id as Period; active = null; }}
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
      <div class="flex items-end gap-0.5 border-b border-border-strong/60" style="height: {PLOT_HEIGHT + 16}px" onmouseleave={() => active = null} role="group" aria-label="Sends per grade">
        {#each histogram.bars as bar, i (bar.grade)}
          <button
            class="flex-1 h-full flex flex-col justify-end items-center min-w-0 group"
            onclick={() => active = active === i ? null : i}
            onmouseenter={() => active = i}
            aria-label="{bar.grade}: {bar.count} send{bar.count === 1 ? '' : 's'}{bar.flashed ? `, ${bar.flashed} flashed` : ''}"
          >
            {#if i === tallest && active === null}
              <span class="text-caption text-content-muted tabular-nums leading-none mb-1">{bar.count}</span>
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
          <span class="flex-1 min-w-0 text-center text-[10px] leading-tight tabular-nums truncate {active === i ? 'text-content' : 'text-content-subtle'}">
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
        Tap a bar for its count
      {/if}
    </p>

    <table class="sr-only">
      <caption>Sends by grade</caption>
      <thead><tr><th>Grade</th><th>Sends</th><th>Flashed</th></tr></thead>
      <tbody>
        {#each histogram.bars as bar}<tr><td>{bar.grade}</td><td>{bar.count}</td><td>{bar.flashed}</td></tr>{/each}
      </tbody>
    </table>
  {/if}
</div>
