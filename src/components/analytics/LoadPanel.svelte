<script lang="ts">
  /**
   * Rolling Load: weekly actual load as bars, the target as a dashed line,
   * and the acute:chronic ratio (with its zone bands and ramp-rate spikes)
   * on top, and the training blocks and goals as a band above. Tapping a
   * column opens its detail sheet; its plot's measured width sets how far
   * the x-axis labels are thinned - see `chartWidth` in Analytics.svelte.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { AcwrResult } from '../../lib/analytics/loadAnalytics';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { showsLabel } from '../../lib/analytics/chartWindow';
  import type { ChartData } from './chartTypes';
  import type { TimelineSegment, TimelineGoal } from '../../lib/analytics/timeline';
  import PhaseBand from './PhaseBand.svelte';
  import Icon from "@iconify/svelte";

  let {
    chartData,
    acwrResults,
    axisStep,
    tips,
    timeline,
    xOfDay,
    onSelect,
    adherence,
    windowAdherence,
    chartWidth = $bindable(0),
  }: {
    chartData: ChartData;
    acwrResults: AcwrResult[];
    axisStep: number;
    tips: ChartTips;
    /** Blocks and goals for the band over the plot. */
    timeline: { segments: TimelineSegment[]; goals: TimelineGoal[] };
    /** A day's x on this chart's columns (0-100). */
    xOfDay: (day: number) => number;
    /** A column was tapped - Analytics opens its detail sheet. */
    onSelect: (index: number) => void;
    /** Share of planned exercises logged, per column id (only columns with completed sessions). */
    adherence: Record<string, number>;
    /** The same over the whole window, if anything was completed in it. */
    windowAdherence?: number;
    chartWidth?: number;
  } = $props();

  // ACWR zone edges - adjustable under Settings -> Training model.
  const acwrZones = $derived(trainingState.acwrZones);

  type RatioStatus = 'good' | 'caution' | 'risk' | 'neutral';
  const RATIO_STATUS_VAR: Record<RatioStatus, string> = {
    good: 'var(--color-status-good)',
    caution: 'var(--color-status-caution)',
    risk: 'var(--color-status-risk)',
    neutral: 'var(--color-status-neutral)',
  };
  function ratioStatus(r: AcwrResult): RatioStatus {
    if (r.ratio === undefined || !r.sufficient) return 'neutral';
    if (r.ratio >= acwrZones.highRisk) return 'risk';
    if (r.ratio >= acwrZones.caution) return 'caution';
    return 'good';
  }
  const acwrDefinedRatios = $derived(acwrResults.filter((r) => r.ratio !== undefined).map((r) => r.ratio as number));
  const acwrMaxRatio = $derived(Math.max(...acwrDefinedRatios, acwrZones.highRisk) * 1.15);
  function ratioToY(ratio: number): number {
    return 100 - (ratio / acwrMaxRatio) * 100;
  }
  const acwrOverlayPoints = $derived(acwrResults.map((r, i) => {
    const week = chartData.weeks[i];
    return {
      weekId: r.weekId,
      x: ((i + 0.5) / Math.max(acwrResults.length, 1)) * 100,
      ratioY: r.ratio !== undefined ? ratioToY(r.ratio) : null,
      ratio: r.ratio,
      sufficient: r.sufficient,
      status: ratioStatus(r),
      spike: r.spike,
      rampRate: r.rampRate,
      barTopY: week ? 100 - (week.totalLoad / chartData.maxLoad) * 100 : 100,
    };
  }));
  function buildLineSegments(points: { x: number; y: number | null }[]): { x: number; y: number }[][] {
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];
    for (const p of points) {
      if (p.y === null) {
        if (current.length > 1) segments.push(current);
        current = [];
      } else {
        current.push({ x: p.x, y: p.y });
      }
    }
    if (current.length > 1) segments.push(current);
    return segments;
  }
  const acwrRatioSegments = $derived(buildLineSegments(acwrOverlayPoints.map((p) => ({ x: p.x, y: p.ratioY }))));
</script>

<div id="section-load" class="scroll-mt-4 bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card relative">
  <div class="relative z-10">
    <h3 class="text-section uppercase text-content-muted">Rolling Load</h3>
    <p class="text-caption text-content-subtle mt-0.5">Target vs actual, with acute:chronic ratio · tap a column for details</p>
  </div>

  <div class="relative z-10">
    <PhaseBand segments={timeline.segments} goals={timeline.goals} xOf={xOfDay} />
  </div>

  <!-- The plot area's measured width decides how far every chart's
       x-axis labels are thinned - see `chartWidth`. -->
  <div class="h-48 flex flex-col gap-2 relative z-10">
    <div class="flex-1 relative flex items-end justify-between gap-px" bind:clientWidth={chartWidth}>
      <!-- Hairline gridlines: three, at 10% opacity. Enough to read a
           height against, quiet enough to disappear behind the data. -->
      <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
        <div class="border-t border-content-subtle w-full"></div>
        <div class="border-t border-content-subtle w-full"></div>
        <div class="border-t border-content-subtle w-full"></div>
      </div>

      <!-- ACWR sweet-spot / caution / risk bands, barely tinted -->
      <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y={ratioToY(acwrMaxRatio)} width="100" height={Math.max(ratioToY(acwrZones.highRisk) - ratioToY(acwrMaxRatio), 0)} fill="var(--color-status-risk)" opacity="0.06" />
        <rect x="0" y={ratioToY(acwrZones.highRisk)} width="100" height={Math.max(ratioToY(acwrZones.caution) - ratioToY(acwrZones.highRisk), 0)} fill="var(--color-status-caution)" opacity="0.06" />
        <rect x="0" y={ratioToY(acwrZones.caution)} width="100" height={Math.max(ratioToY(acwrZones.sweetMin) - ratioToY(acwrZones.caution), 0)} fill="var(--color-status-good)" opacity="0.06" />
      </svg>

      <!-- Planned Load Line (SVG) -->
      <svg
        class="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {#if chartData.weeks.length > 1}
          {@const planPoints = chartData.weeks.map((w, i) => ({
            x: ((i + 0.5) / chartData.weeks.length) * 100,
            y: 100 - (w.totalPlannedLoad / chartData.maxLoad) * 100,
            val: w.totalPlannedLoad
          }))}

          {@const connectedPoints = planPoints.filter(p => p.val > 0)}

          {#if connectedPoints.length > 1}
            <path
              d="M {connectedPoints.map(p => `${p.x} ${p.y}`).join(' L ')}"
              fill="none"
              stroke="var(--color-success)"
              stroke-width="1.5"
              stroke-dasharray="3 3"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
              opacity="0.85"
            />
          {/if}
        {/if}
      </svg>

      {#each chartData.weeks as week, wi}
        <button
          type="button"
          data-tip-trigger
          onclick={() => onSelect(wi)}
          aria-label="{week.label}: {Math.round(week.totalLoad)} load - details"
          class="flex-1 flex flex-col items-center group relative h-full justify-end hover:z-30"
        >
          <!-- Flat fill, no gradient or glow; the current week is the
               only one at full strength, which is the whole emphasis
               budget this chart spends. -->
          <div
            class="w-[62%] max-w-[16px] rounded-[2px] transition-[height] duration-500 relative {week.isCurrent ? 'bg-primary' : 'bg-primary/45 group-hover:bg-primary/70'}"
            style="height: {(week.totalLoad / chartData.maxLoad) * 100}%"
          >
            <div class="chart-tip absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control whitespace-nowrap z-20 border border-border shadow-card pointer-events-none">
              <span class="block">{week.label} · {Math.round(week.totalLoad)} actual</span>
              <span class="block text-content-subtle">{Math.round(week.totalPlannedLoad)} target{adherence[week.id] !== undefined ? ` · ${Math.round(adherence[week.id] * 100)}% of exercises done` : ''}</span>
            </div>
          </div>
        </button>
      {/each}

      <!-- ACWR ratio line (SVG, on top of the bars) -->
      <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {#each acwrRatioSegments as seg}
          <path
            d="M {seg.map((p) => `${p.x} ${p.y}`).join(' L ')}"
            fill="none"
            stroke="var(--color-content-subtle)"
            stroke-width="1"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
            opacity="0.6"
          />
        {/each}
      </svg>

      <!-- ACWR ratio dots + ramp-rate spike flags (HTML, so they get the same hover-tooltip treatment as the bars/dashed line above) -->
      <div class="absolute inset-0 pointer-events-none">
        {#each acwrOverlayPoints as p, pi}
          {#if p.ratioY !== null}
            <button
              type="button"
              data-tip-trigger
              data-tip-open={tips.isOpen(`acwr-${pi}`)}
              onclick={() => tips.toggle(`acwr-${pi}`)}
              aria-label="ACWR {p.ratio?.toFixed(2) ?? 'unavailable'}"
              class="absolute pointer-events-auto group hover:z-40 {tips.isOpen(`acwr-${pi}`) ? 'z-40' : 'z-20'}"
              style="left: {p.x}%; top: {p.ratioY}%; transform: translate(-50%, -50%);"
            >
              <div
                class="w-1.5 h-1.5 rounded-full border transition-transform group-hover:scale-150"
                style="background: {p.sufficient ? RATIO_STATUS_VAR[p.status] : 'transparent'}; border-color: {RATIO_STATUS_VAR[p.status]};"
              ></div>
              <div class="chart-tip absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control whitespace-nowrap z-30 border border-border shadow-card pointer-events-none">
                ACWR {p.ratio?.toFixed(2)}{!p.sufficient ? ' · building history' : ''}
              </div>
            </button>
          {/if}
          {#if p.spike}
            <button
              type="button"
              data-tip-trigger
              data-tip-open={tips.isOpen(`spike-${pi}`)}
              onclick={() => tips.toggle(`spike-${pi}`)}
              aria-label="Ramp-rate spike"
              class="absolute pointer-events-auto group hover:z-40 {tips.isOpen(`spike-${pi}`) ? 'z-40' : 'z-20'}"
              style="left: {p.x}%; top: {Math.max(p.barTopY - 8, 2)}%; transform: translate(-50%, -50%);"
            >
              <Icon icon="ic:baseline-warning" class="text-status-risk text-xs" />
              <div class="chart-tip absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control whitespace-nowrap z-30 border border-border shadow-card pointer-events-none">
                Ramp-rate spike: +{Math.round(p.rampRate * 100)}%
              </div>
            </button>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Baseline + x-axis. Labels are thinned to whatever fits (see
         `axisStep`), counted back from the most recent week so it is
         always the one that keeps its label. -->
    <div class="border-t border-border-strong/60"></div>
    <div class="flex justify-between gap-px">
      {#each chartData.weeks as week, i}
        <div class="flex-1 flex justify-center">
          {#if showsLabel(i, chartData.weeks.length, axisStep)}
            <span class="text-caption leading-tight tabular-nums {week.isCurrent ? 'text-primary' : 'text-content-subtle/70'}">{week.label}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="flex items-center gap-x-4 gap-y-1.5 pt-1 relative z-10 flex-wrap">
    <div class="flex items-center gap-1.5">
      <div class="w-2 h-2 rounded-[2px] bg-primary"></div>
      <span class="text-caption text-content-subtle">Actual</span>
    </div>
    <div class="flex items-center gap-1.5">
      <div class="w-3.5 h-0 border-t border-dashed border-success"></div>
      <span class="text-caption text-content-subtle">Target</span>
    </div>
    <div class="flex items-center gap-1.5">
      <div class="w-1.5 h-1.5 rounded-full border" style="border-color: var(--color-status-good);"></div>
      <span class="text-caption text-content-subtle">ACWR</span>
    </div>
  </div>

  {#if windowAdherence !== undefined}
    <p class="text-caption text-content-subtle relative z-10">
      Adherence: <span class="text-content tabular-nums">{Math.round(windowAdherence * 100)}%</span> of planned exercises logged in completed sessions
    </p>
  {/if}

  {#if acwrResults.length === 0}
    <p class="text-caption text-content-subtle italic text-center py-2">No completed sessions yet</p>
  {/if}
</div>
