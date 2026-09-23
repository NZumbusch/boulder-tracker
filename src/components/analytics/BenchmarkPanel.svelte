<script lang="ts">
  /** Benchmark Progress: the last ten results of one benchmark type, picked from a list. */
  import { trainingState } from '../../lib/state.svelte';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import Icon from "@iconify/svelte";

  let { tips }: { tips: ChartTips } = $props();

  let selectedBenchmarkType = $state<string>('');

  /**
   * Derives chart data for the "Benchmark Progress" line graph.
   * Filters the last 10 historical entries for the currently selected benchmark type
   * and calculates SVG paths for the interactive line and area gradient.
   */
  const benchmarkProgress = $derived.by(() => {
    const data = trainingState.benchmarks;
    const benchmarkTypes = trainingState.benchmarkTypes;

    if (benchmarkTypes.length === 0) {
      return { types: [], history: [], maxValue: 1, unit: '', areaPath: '', linePath: '' };
    }

    const availableTypes = benchmarkTypes;

    // Use a local variable for the effective selection to avoid mutating state in derived
    let effectiveTypeId = selectedBenchmarkType;
    if (!effectiveTypeId || !availableTypes.find(t => t.id === effectiveTypeId)) {
      effectiveTypeId = availableTypes[0].id;
    }

    const filtered = data
      .filter(b => b.typeId === effectiveTypeId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10);

    const maxValue = filtered.length > 0 ? Math.max(...filtered.map(b => b.value), 1) * 1.25 : 1;
    const selectedTypeInfo = availableTypes.find(t => t.id === effectiveTypeId);
    const unit = selectedTypeInfo ? selectedTypeInfo.unit : '';

    const history = filtered.map(b => ({
      ...b,
      height: (b.value / maxValue) * 100
    }));

    const count = history.length;
    const points = history.map((b, i) => ({
      x: (i / Math.max(count - 1, 1)) * 100,
      y: 100 - b.height
    }));

    const areaPath = count > 1 ? `M 0,100 ${points.map(p => `L ${p.x},${p.y}`).join(' ')} L 100,100 Z` : '';
    const linePath = count > 1 ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}` : '';

    return {
      types: availableTypes,
      history,
      maxValue,
      unit,
      areaPath,
      linePath
    };
  });

  /** The visible label for the overlaid benchmark picker - resolved, since `selectedBenchmarkType` is an id and may not be set yet. */
  const selectedBenchmarkName = $derived(
    benchmarkProgress.types.find((t) => t.id === selectedBenchmarkType)?.name
      ?? benchmarkProgress.types[0]?.name
      ?? 'Benchmark',
  );

  /**
   * The three gridlines, top to bottom. This scale is 0-based and padded
   * to `max * 1.25`, so the bottom line really is zero - the labels come
   * from the same `maxValue` the plot is drawn against rather than from
   * the raw data, or they would disagree with the line.
   */
  const benchmarkTicks = $derived.by(() => {
    if (benchmarkProgress.history.length === 0) return [];
    const max = benchmarkProgress.maxValue;
    return [max, max / 2, 0].map((v) => {
      // Trims a pointless ".0" while keeping a real fraction: the padded
      // top of the scale is rarely a round number.
      const rounded = Number(v.toFixed(1));
      return String(rounded);
    });
  });

  // A date axis carries far wider labels than the week charts' "W34", so it
  // is capped at a few evenly spaced labels instead of thinned by width.
  const benchmarkLabelStep = $derived(sparseLabelStep(benchmarkProgress.history.length));

  $effect(() => {
    const benchmarkTypes = trainingState.benchmarkTypes;
    if (benchmarkTypes.length > 0) {
      if (!selectedBenchmarkType || !benchmarkTypes.find(t => t.id === selectedBenchmarkType)) {
        selectedBenchmarkType = benchmarkTypes[0].id;
      }
    }
  });
</script>

{#if benchmarkProgress.types.length > 0}
  <div id="section-benchmarks" class="scroll-mt-4 bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-section uppercase text-content-muted">Benchmark Progress</h3>
        <!-- A native <select> sizes itself to its *longest* option, so
             an arrow pinned to its right edge floated far past a short
             name like "Pull-ups". The visible control is therefore the
             text and the arrow as an inline pair that shrinks to the
             selected name, with the real select laid transparently over
             it so the native picker (and keyboard, and a11y) still do
             the work. -->
        <div class="relative inline-flex items-center gap-0.5 mt-1">
          <span class="text-label text-primary">{selectedBenchmarkName}</span>
          <Icon icon="ic:baseline-arrow-drop-down" class="text-primary shrink-0" />
          <select
            bind:value={selectedBenchmarkType}
            aria-label="Benchmark type"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {#each benchmarkProgress.types as type}
              <option value={type.id}>{type.name}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        {#if benchmarkProgress.unit}
          <span class="text-caption text-content-subtle">{benchmarkProgress.unit}</span>
        {/if}
        <Icon icon="ic:baseline-insights" class="text-base text-content-subtle" />
      </div>
    </div>

    <!-- Value gutter beside the plot, same treatment as Bodyweight
         Trend - an unlabelled axis makes the shape of the line readable
         but its magnitude guesswork. -->
    <div class="flex gap-2">
      <div class="w-9 shrink-0 h-36 flex flex-col justify-between items-end text-caption leading-none text-content-subtle/70 tabular-nums">
        {#each benchmarkTicks as tick}
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
              <linearGradient id="line-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.16" />
                <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />
              </linearGradient>
            </defs>

            {#if benchmarkProgress.history.length > 1}
              <path d={benchmarkProgress.areaPath} fill="url(#line-gradient)" />
              <path
                d={benchmarkProgress.linePath}
                fill="none"
                stroke="var(--color-primary)"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            {/if}
          </svg>

          <div class="absolute inset-0">
            {#each benchmarkProgress.history as entry, i}
              {@const xPos = (i / Math.max(benchmarkProgress.history.length - 1, 1)) * 100}
              <button
                type="button"
                data-tip-trigger
                data-tip-open={tips.isOpen(`bench-${i}`)}
                onclick={() => tips.toggle(`bench-${i}`)}
                aria-label="{entry.value} {entry.unit}"
                class="absolute group hover:z-30 {tips.isOpen(`bench-${i}`) ? 'z-30' : ''}"
                style="left: {xPos}%; height: 100%;"
              >
                <div class="chart-tip absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-surface-elevated text-caption text-content rounded-control whitespace-nowrap z-20 border border-border shadow-card pointer-events-none">
                  {entry.value} {entry.unit}
                </div>
                <div
                  class="w-1.5 h-1.5 bg-primary rounded-full group-hover:scale-[2] transition-transform z-10 absolute -translate-x-1/2 translate-y-1/2"
                  style="bottom: {entry.height}%; left: 0;"
                ></div>
              </button>
            {/each}
          </div>

          {#if benchmarkProgress.history.length === 0}
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p class="text-caption text-content-subtle italic text-center px-4 leading-relaxed">
                Log a {benchmarkProgress.types.find(t => t.id === selectedBenchmarkType)?.name || 'benchmark'} to see your progress
              </p>
            </div>
          {/if}
        </div>
        {#if benchmarkProgress.history.length > 0}
          <div class="border-t border-border-strong/60"></div>
          <div class="relative h-4">
            {#each benchmarkProgress.history as entry, i}
              {#if showsLabel(i, benchmarkProgress.history.length, benchmarkLabelStep)}
                {@const xPos = (i / Math.max(benchmarkProgress.history.length - 1, 1)) * 100}
                <span
                  class="absolute top-0 text-caption leading-tight text-content-subtle/70 whitespace-nowrap"
                  style="left: {xPos}%; transform: translateX({i === 0 ? '0' : i === benchmarkProgress.history.length - 1 ? '-100%' : '-50%'});"
                >
                  {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
