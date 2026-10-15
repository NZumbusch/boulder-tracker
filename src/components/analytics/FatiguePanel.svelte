<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  import { RATING_AXES } from '../../lib/constants';
  /**
   * Analytics' Fatigue panel. Home already shows fatigue "as of now" -
   * following the "Home = now, Analytics = history, no duplicated panels"
   * rule, this panel instead samples the same shared `computeFatigueDecay`
   * model at each column's end, so it shows a trend rather than repeating
   * Home's single snapshot.
   *
   * The four axes share one fixed 0-10 plot (the same scale as the rating
   * sliders), as lines with a dot per column, so they can be compared
   * directly - which area is carrying the fatigue, and whether they rise
   * together. The legend filters; tap or hover a column for its values.
   */
  import { ColumnPicker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel, labelStep } from '../../lib/analytics/chartWindow';
  import ChartEmpty from './ChartEmpty.svelte';
  import ChartTable from './ChartTable.svelte';

  export interface FatigueWeekSample {
    weekId: string;
    fingers?: number;
    arms?: number;
    core?: number;
    systemic?: number;
  }
  export interface FatigueCoverage {
    total: number;
    fingers: number;
    arms: number;
    core: number;
    systemic: number;
  }

  let { samples, weekLabels, coverage }: {
    samples: FatigueWeekSample[];
    weekLabels: Record<string, string>;
    coverage: FatigueCoverage;
  } = $props();

  // Thinned for this plot's own width - the value gutter makes it narrower than the Load chart's.
  let plotWidth = $state(0);
  const axisStep = $derived(labelStep(samples.length, plotWidth));

  type AxisKey = (typeof RATING_AXES)[number]['key'];
  // Series colours (src/series.css) and a dash each, so the four lines are told apart without colour.
  const COLORS: Record<AxisKey, string> = {
    fingers: 'var(--color-series-3)',
    arms: 'var(--color-series-5)',
    core: 'var(--color-series-4)',
    systemic: 'var(--color-series-6)',
  };
  const DASH: Record<AxisKey, string | undefined> = { fingers: undefined, arms: '7 3', core: '2 3', systemic: '10 3 2 3' };
  /** Ratings at or above this read as high fatigue - shaded faintly. */
  const HIGH = 7;

  let hidden = $state<Set<AxisKey>>(new Set());
  function toggle(key: AxisKey) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    hidden = next;
  }

  const n = $derived(samples.length);
  const xOf = (i: number) => ((i + 0.5) / Math.max(n, 1)) * 100;
  const yOf = (v: number) => 100 - (v / 10) * 100;

  const series = $derived(RATING_AXES.map((axis) => {
    const values = samples.map((s) => s[axis.key]);
    const runs: string[] = [];
    let run: string[] = [];
    values.forEach((v, i) => {
      if (v === undefined) {
        if (run.length > 1) runs.push(`M ${run.join(' L ')}`);
        run = [];
      } else run.push(`${xOf(i)},${yOf(v)}`);
    });
    if (run.length > 1) runs.push(`M ${run.join(' L ')}`);
    const latest = [...values].reverse().find((v) => v !== undefined);
    return {
      key: axis.key as AxisKey,
      label: axis.label,
      color: COLORS[axis.key as AxisKey],
      dash: DASH[axis.key as AxisKey],
      values,
      line: runs.join(' '),
      dots: values.map((v, i) => (v === undefined ? '' : `M ${xOf(i)},${yOf(v)} h 0`)).join(' '),
      latest,
      rated: coverage[axis.key as AxisKey],
    };
  }));
  const hasAny = $derived(series.some((s) => s.latest !== undefined));

  const picker = new ColumnPicker(() => n);
  $effect(() => picker.listen());
  /** The latest column with any value - future columns are empty. */
  const lastWithData = $derived.by(() => {
    for (let i = n - 1; i >= 0; i--) if (series.some((s) => s.values[i] !== undefined)) return i;
    return null;
  });
  const readoutIndex = $derived(picker.selected ?? lastWithData);
</script>

<div class="card space-y-3">
  <div>
    <h3 class="text-section uppercase text-content-muted flex items-center gap-1.5">Fatigue <InfoButton term="fatigue" /></h3>
    <p class="text-caption text-content-subtle mt-0.5">Estimated fatigue now, per area (0–10). The shaded zone ({HIGH}+) is high.</p>
  </div>

    <!-- Legend doubles as the filter; each chip carries the latest value and the line's dash. -->
    <div class="flex flex-wrap gap-1.5">
      {#each series as s (s.key)}
        <button
          onclick={() => toggle(s.key)}
          aria-pressed={!hidden.has(s.key)}
          class="chip transition-opacity {hidden.has(s.key) ? 'opacity-40 line-through' : ''}"
        >
          <svg width="16" height="6" aria-hidden="true" class="shrink-0"><line x1="0" y1="3" x2="16" y2="3" stroke={s.color} stroke-width="2.5" stroke-dasharray={s.dash} /></svg>
          <span class="text-content-muted">{s.label}</span>
          {#if s.latest !== undefined}<span class="text-content tabular-nums">{s.latest.toFixed(1)}</span>{/if}
        </button>
      {/each}
    </div>

    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-caption tabular-nums min-h-[1.25rem]" aria-live="polite">
      {#if picker.selected !== null && readoutIndex !== null}
        <span class="text-content-muted">{weekLabels[samples[readoutIndex].weekId] ?? ''}</span>
        {#each series as s (s.key)}
          {#if !hidden.has(s.key)}
            <span class="inline-flex items-center gap-1"><svg width="12" height="6" aria-hidden="true"><line x1="0" y1="3" x2="12" y2="3" stroke={s.color} stroke-width="2.5" stroke-dasharray={s.dash} /></svg><span class="text-content-subtle">{s.label}</span> <span class="text-content">{s.values[readoutIndex]?.toFixed(1) ?? '–'}</span></span>
          {/if}
        {/each}
      {:else}
        <span class="text-content-subtle" class:invisible={!hasAny}>Tap a column for that week's values</span>
      {/if}
    </div>

    <div class="flex gap-2">
      <div class="w-6 shrink-0 h-40 flex flex-col justify-between items-end text-caption leading-none text-content-subtle tabular-nums">
        <span>10</span><span>5</span><span>0</span>
      </div>
      <div class="flex-1 min-w-0" bind:clientWidth={plotWidth}>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div
          bind:this={picker.el}
          class="h-40 relative cursor-crosshair select-none"
          role="application"
          tabindex="0"
          aria-label="Fatigue by column. Left and right arrow keys move between columns; a table of the numbers follows."
          onkeydown={picker.key}
          onpointerdown={picker.down}
          onpointermove={picker.move}
          onpointerleave={picker.leave}
          onpointerup={picker.tap}
        >
          <div class="absolute inset-x-0 top-0 bg-status-caution/[0.12] pointer-events-none" style="height: {yOf(HIGH)}%"><span class="absolute right-1 top-0.5 text-caption leading-none text-content-subtle">high</span></div>
          <div class="absolute inset-x-0 top-1/2 border-t border-dashed border-content-subtle/20 pointer-events-none"></div>
          <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {#each series as s (s.key)}
              {#if !hidden.has(s.key)}
                <path d={s.line} fill="none" stroke={s.color} stroke-dasharray={s.dash} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
                <path d={s.dots} fill="none" stroke={s.color} stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {/if}
            {/each}
          </svg>
          {#if readoutIndex !== null}
            <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {xOf(readoutIndex)}%"></div>
          {/if}
          {#if !hasAny}
            <ChartEmpty>{coverage.total > 0 ? 'Rate fatigue after sessions to see it here' : 'No completed sessions in this window'}</ChartEmpty>
          {/if}
        </div>
        <div class="border-t border-border-strong/60"></div>
        <div class="flex gap-px">
          {#each samples as s, i (s.weekId)}
            <div class="flex-1 flex justify-center">
              {#if showsLabel(i, samples.length, axisStep)}
                <span class="text-caption leading-tight tabular-nums {i === readoutIndex && picker.selected !== null ? 'text-content' : 'text-content-subtle'}">{weekLabels[s.weekId] ?? ''}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>

    <ChartTable
      caption="Fatigue by column, 0 to 10"
      columns={['Column', ...series.map((s) => s.label)]}
      rows={samples.map((smp, i) => [weekLabels[smp.weekId] ?? '', ...series.map((s) => s.values[i]?.toFixed(1) ?? '–')])}
    />

    {#if coverage.total > 0 && coverage.arms < coverage.total}
      <p class="text-caption text-content-subtle">Arms rated on {coverage.arms} of {coverage.total} sessions in this window</p>
    {/if}
</div>
