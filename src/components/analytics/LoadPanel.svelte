<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  /**
   * Rolling Load: weekly rated load as bars (with ramp-rate spike flags) and,
   * in a pane of its own under them on the same x-axis, the acute:chronic
   * ratio with its zone bands - never two scales on one plot - and the training blocks and goals as a band above. Tapping a
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
    planDone,
    windowPlanDone,
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
    /**
     * How much of each column's plan is done, per column id - logged vs
     * planned work from the exercises, like Home's This Week. There is no
     * target line: the bars are rated load, a different scale from the
     * plan's estimate, and drawing one against the other made a week done
     * in full look ~25 % short.
     */
    planDone: Record<string, number>;
    /** The same over the window so far. */
    windowPlanDone?: number;
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
  // A fixed ratio axis, the same for every window: it used to stretch to
  // the window's highest ratio, so one outlier (a 4.0 after a break, not
  // even counted) moved every dot and squashed the zone bands, and the
  // same week sat at a different height in 4W and 6M. 0-ACWR_LINEAR_MAX is
  // linear over the lower ACWR_LINEAR_SHARE of the plot (where the zones
  // live); above it, up to ACWR_AXIS_MAX, is squeezed into the rest, below
  // a little headroom so the top dot doesn't sit on the card's edge.
  // Higher still gets an arrow at the top; the tip gives the real value.
  const ACWR_LINEAR_MAX = 2;
  const ACWR_AXIS_MAX = 5;
  const ACWR_LINEAR_SHARE = 80;
  const ACWR_HEADROOM = 6;
  const acwrMaxRatio = ACWR_AXIS_MAX;
  function ratioToY(ratio: number): number {
    const r = Math.max(0, Math.min(ratio, ACWR_AXIS_MAX));
    if (r <= ACWR_LINEAR_MAX) return 100 - (r / ACWR_LINEAR_MAX) * ACWR_LINEAR_SHARE;
    const squeezed = 100 - ACWR_LINEAR_SHARE - ACWR_HEADROOM;
    return 100 - ACWR_LINEAR_SHARE - ((r - ACWR_LINEAR_MAX) / (ACWR_AXIS_MAX - ACWR_LINEAR_MAX)) * squeezed;
  }
  /** Weeks after the current one haven't happened: no ratio to show. */
  const currentIndex = $derived(chartData.weeks.findIndex((w) => w.isCurrent));
  const acwrOverlayPoints = $derived(acwrResults.map((r, i) => {
    const week = chartData.weeks[i];
    const future = currentIndex >= 0 && i > currentIndex;
    return {
      weekId: r.weekId,
      x: ((i + 0.5) / Math.max(acwrResults.length, 1)) * 100,
      ratioY: r.ratio !== undefined && !future ? ratioToY(r.ratio) : null,
      offScale: r.ratio !== undefined && r.ratio > ACWR_AXIS_MAX,
      ratio: r.ratio,
      sufficient: r.sufficient,
      insufficientReason: r.insufficientReason,
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
  // The line only joins ratios that mean something: after a break the ratio explodes or reads 0, and those points stay as hollow dots without a line through them.
  /** Hairlines at half and all of the window's biggest week (the axis leaves 15 % headroom above it). */
  const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(v)));
  const loadTicks = $derived.by(() => {
    const top = chartData.maxLoad / 1.15;
    return [0.5, 1].map((f) => ({ value: f, y: 100 - ((top * f) / chartData.maxLoad) * 100, label: compact(top * f) }));
  });
  const acwrRatioSegments = $derived(buildLineSegments(acwrOverlayPoints.map((p) => ({ x: p.x, y: p.sufficient ? p.ratioY : null }))));
</script>

<div id="section-load" class="scroll-mt-4 card space-y-3 relative" data-tour="analytics-load">
  <div class="relative z-10">
    <h3 class="text-section uppercase text-content-muted flex items-center gap-1.5">Rolling Load <InfoButton term="load" /></h3>
    <p class="text-caption text-content-subtle mt-0.5">Load per week, and how it compares with your usual · tap a column for details</p>
  </div>

  <!-- pr-5 everywhere below: room for the ratio axis labels right of the plot. -->
  <div class="relative z-10 pr-5">
    <PhaseBand segments={timeline.segments} goals={timeline.goals} xOf={xOfDay} />
  </div>

  <!-- Two panes on one shared x-axis, each with its own scale and nothing drawn over anything else: the week's load as
       bars (top), the acute:chronic ratio under it (a ratio is not a load, so it never shares an axis with the bars).
       The top plot's measured width decides how far every chart's x-axis labels are thinned - see `chartWidth`. -->
  <div class="relative z-10 pr-7 space-y-2">
    <div class="h-36 relative flex items-end justify-between gap-px" bind:clientWidth={chartWidth}>
      <!-- Hairlines at half and full of the window's biggest week, labelled just outside the plot. -->
      <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
        {#each loadTicks as t (t.value)}
          <div class="absolute inset-x-0 border-t border-content-subtle/15" style="top: {t.y}%"></div>
          <span class="absolute right-0 translate-x-full -translate-y-1/2 pl-1 text-[9px] leading-none text-content-subtle/70 tabular-nums" style="top: {t.y}%">{t.label}</span>
        {/each}
      </div>

      {#each chartData.weeks as week, wi}
        <button
          type="button"
          data-tip-trigger
          onclick={() => onSelect(wi)}
          aria-label="{week.label}: {Math.round(week.totalLoad)} load - details"
          class="flex-1 flex flex-col items-center group relative h-full justify-end hover:z-30"
        >
          <!-- Flat fill, no gradient or glow; the current week is the only one at full strength, which is the whole
               emphasis budget this chart spends. -->
          <div
            class="w-[62%] max-w-[16px] rounded-t-[3px] transition-[height] duration-500 relative {week.isCurrent ? 'bg-primary' : 'bg-primary/45 group-hover:bg-primary/70'}"
            style="height: {(week.totalLoad / chartData.maxLoad) * 100}%"
          >
            <div class="chart-tip absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control whitespace-nowrap z-20 border border-border shadow-card pointer-events-none">
              <span class="block">{week.label} · {Math.round(week.totalLoad)} load</span>
              {#if planDone[week.id] !== undefined}<span class="block text-content-subtle">{Math.round(planDone[week.id] * 100)}% of the plan</span>{/if}
            </div>
          </div>
        </button>
      {/each}

      <!-- Ramp-rate spike flags, over the bar they are about. -->
      <div class="absolute inset-0 pointer-events-none">
        {#each acwrOverlayPoints as p, pi}
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
    <div class="border-t border-border-strong/60"></div>

    <!-- The ratio: its own pane, its zones tinted, its edges labelled. -->
    <p class="text-caption text-content-subtle flex items-center gap-1.5 pt-1">Acute : chronic load <InfoButton term="acwr" /></p>
    <div class="h-20 relative">
      <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y={ratioToY(acwrMaxRatio)} width="100" height={Math.max(ratioToY(acwrZones.highRisk) - ratioToY(acwrMaxRatio), 0)} fill="var(--color-status-risk)" opacity="0.08" />
        <rect x="0" y={ratioToY(acwrZones.highRisk)} width="100" height={Math.max(ratioToY(acwrZones.caution) - ratioToY(acwrZones.highRisk), 0)} fill="var(--color-status-caution)" opacity="0.08" />
        <rect x="0" y={ratioToY(acwrZones.caution)} width="100" height={Math.max(ratioToY(acwrZones.sweetMin) - ratioToY(acwrZones.caution), 0)} fill="var(--color-status-good)" opacity="0.08" />
        {#each acwrRatioSegments as seg}
          <path
            d="M {seg.map((p) => `${p.x} ${p.y}`).join(' L ')}"
            fill="none"
            stroke="var(--color-content-subtle)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
            opacity="0.7"
          />
        {/each}
      </svg>
      <div class="absolute inset-y-0 right-0 pointer-events-none" aria-hidden="true">
        <!-- The caution edge sits too close to the high-risk one to label both; its band says the rest. -->
        {#each [acwrZones.sweetMin, acwrZones.highRisk] as edge (edge)}
          <span class="absolute right-0 translate-x-full -translate-y-1/2 pl-1 text-[9px] leading-none text-content-subtle/70 tabular-nums" style="top: {ratioToY(edge)}%;">{edge.toFixed(1)}</span>
        {/each}
      </div>
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
              {#if p.offScale}
                <!-- Above the axis: an arrow at the top rather than a dot pretending to be at the maximum. -->
                <Icon icon="ic:baseline-arrow-drop-up" class="text-base -my-1.5" style="color: {RATIO_STATUS_VAR[p.status]}; opacity: {p.sufficient ? 1 : 0.6};" />
              {:else}
                <div
                  class="w-2 h-2 rounded-full border-2 transition-transform group-hover:scale-125"
                  style="background: {p.sufficient ? RATIO_STATUS_VAR[p.status] : 'var(--color-surface)'}; border-color: {RATIO_STATUS_VAR[p.status]};"
                ></div>
              {/if}
              <div class="chart-tip absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control whitespace-nowrap z-30 border border-border shadow-card pointer-events-none">
                ACWR {p.ratio?.toFixed(2)}{!p.sufficient ? (p.insufficientReason === 'break' ? ' · after a break, not counted' : ' · building history') : ''}
              </div>
            </button>
          {/if}
        {/each}
      </div>
    </div>

    <!-- The shared x-axis. Labels are thinned to whatever fits (see `axisStep`), counted back from the most recent week
         so it is always the one that keeps its label. -->
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

  <!-- Always there ("–" with nothing completed) so the card keeps its height while paging. -->
  <p class="text-caption text-content-subtle relative z-10">
    Plan: <span class="text-content tabular-nums">{windowPlanDone !== undefined ? `${Math.round(windowPlanDone * 100)}%` : '–'}</span> of the planned work done so far
  </p>

  {#if acwrResults.length === 0}
    <p class="text-caption text-content-subtle italic text-center py-2">No completed sessions yet</p>
  {/if}
</div>
