<script lang="ts">
  /** Bodyweight Trend: the last ten readings on a min/max-padded scale. */
  import { trainingState } from '../../lib/state.svelte';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import { loggedMetrics } from '../../lib/analytics/metricValues';
  import { formatWeight } from '../../lib/units';
  import { BODYWEIGHT_METRIC_ID } from '../../lib/constants';
  import Icon from "@iconify/svelte";

  let { tips }: { tips: ChartTips } = $props();

  // --- Bodyweight trend panel - last 10 entries,
  // matching Benchmark Progress's own established "last 10, not window-
  // bound" precedent below. Uses a min/max-padded scale rather than
  // Benchmark Progress's 0-based one: bodyweight has no meaningful "0"
  // floor, and a 0-based scale would flatten a normal few-kg fluctuation
  // into an almost-flat line.
  const bodyweightTrend = $derived.by(() => {
    const entries = loggedMetrics(trainingState.dailyMetrics)
      .filter((m) => m.metricId === BODYWEIGHT_METRIC_ID)
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10);

    if (entries.length === 0) return { history: [], areaPath: '', linePath: '', min: 0, max: 0 };

    const maxValue = Math.max(...entries.map((e) => e.value)) * 1.02;
    const minValue = Math.min(...entries.map((e) => e.value)) * 0.98;
    const range = Math.max(maxValue - minValue, 0.1);

    const history = entries.map((e) => ({ ...e, height: ((e.value - minValue) / range) * 100 }));
    const count = history.length;
    const points = history.map((e, i) => ({ x: (i / Math.max(count - 1, 1)) * 100, y: 100 - e.height }));
    const areaPath = count > 1 ? `M 0,100 ${points.map((p) => `L ${p.x},${p.y}`).join(' ')} L 100,100 Z` : '';
    const linePath = count > 1 ? `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}` : '';

    // `min`/`max` are the *padded* bounds the plot is drawn against, so the
    // axis labels describe the gridlines rather than the raw data range.
    return { history, areaPath, linePath, min: minValue, max: maxValue };
  });

  /**
   * The three bodyweight gridlines, top to bottom. One decimal: the scale
   * spans a few kg at most, so whole kilos would print the same number
   * three times on a stable week.
   */
  const bodyweightTicks = $derived.by(() => {
    const { min, max } = bodyweightTrend;
    if (bodyweightTrend.history.length === 0) return [];
    return [max, (min + max) / 2, min].map((v) => v.toFixed(1));
  });

  // A date axis carries far wider labels than the week charts' "W34", so it
  // is capped at a few evenly spaced labels instead of thinned by width.
  const bodyweightLabelStep = $derived(sparseLabelStep(bodyweightTrend.history.length));
</script>

<div id="section-bodyweight" class="scroll-mt-4 bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-section uppercase text-content-muted">Bodyweight Trend</h3>
      <p class="text-caption text-content-subtle mt-0.5">Last {bodyweightTrend.history.length || 10} entries &middot; {trainingState.units.weight}</p>
    </div>
    <Icon icon="ic:baseline-monitor-weight" class="text-base text-content-subtle" />
  </div>

  {#if bodyweightTrend.history.length > 0}
  <!-- Value gutter beside the plot. The scale is min/max-padded rather
       than 0-based (a few kg of normal fluctuation would be a flat line
       against zero), which makes an unlabelled y-axis genuinely
       unreadable - the same curve means something different every time
       the range shifts. The date axis sits inside the same column as
       the plot so the two stay aligned. -->
  <div class="flex gap-2">
    <div class="w-9 shrink-0 h-36 flex flex-col justify-between items-end text-caption leading-none text-content-subtle/70 tabular-nums">
      {#each bodyweightTicks as tick}
        <span>{tick}</span>
      {/each}
    </div>
    <div class="flex-1 min-w-0 space-y-3">
      <div class="h-36 relative">
        <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
          <div class="border-t border-content-subtle w-full"></div>
          <div class="border-t border-content-subtle w-full"></div>
          <div class="border-t border-content-subtle w-full"></div>
        </div>

        <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="bodyweight-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.16" />
              <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />
            </linearGradient>
          </defs>
          {#if bodyweightTrend.history.length > 1}
            <path d={bodyweightTrend.areaPath} fill="url(#bodyweight-gradient)" />
            <path d={bodyweightTrend.linePath} fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          {/if}
        </svg>

        <div class="absolute inset-0">
          {#each bodyweightTrend.history as entry, i}
            {@const xPos = (i / Math.max(bodyweightTrend.history.length - 1, 1)) * 100}
            <button
              type="button"
              data-tip-trigger
              data-tip-open={tips.isOpen(`bw-${i}`)}
              onclick={() => tips.toggle(`bw-${i}`)}
              aria-label={formatWeight(entry.value, trainingState.units.weight)}
              class="absolute group hover:z-30 {tips.isOpen(`bw-${i}`) ? 'z-30' : ''}"
              style="left: {xPos}%; height: 100%;"
            >
              <div class="chart-tip absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-surface-elevated text-caption text-content rounded-control whitespace-nowrap z-20 border border-border shadow-card pointer-events-none">
                {formatWeight(entry.value, trainingState.units.weight)}
              </div>
              <div class="w-1.5 h-1.5 bg-primary rounded-full group-hover:scale-[2] transition-transform z-10 absolute -translate-x-1/2 translate-y-1/2" style="bottom: {entry.height}%; left: 0;"></div>
            </button>
          {/each}
        </div>
      </div>
      <!-- Horizontal, thinned date axis - the old labels were rotated 45°
           to stop them colliding, which is the tell of an axis with more
           labels than room. -->
      <div class="border-t border-border-strong/60"></div>
      <div class="relative h-4">
        {#each bodyweightTrend.history as entry, i}
          {#if showsLabel(i, bodyweightTrend.history.length, bodyweightLabelStep)}
            {@const xPos = (i / Math.max(bodyweightTrend.history.length - 1, 1)) * 100}
            <span
              class="absolute top-0 text-caption leading-tight text-content-subtle/70 whitespace-nowrap"
              style="left: {xPos}%; transform: translateX({i === 0 ? '0' : i === bodyweightTrend.history.length - 1 ? '-100%' : '-50%'});"
            >
              {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          {/if}
        {/each}
      </div>
    </div>
  </div>
  {:else}
    <p class="text-caption text-content-subtle italic text-center py-4 px-4 leading-relaxed">Log your bodyweight with the + on Home to see your trend</p>
  {/if}
</div>
