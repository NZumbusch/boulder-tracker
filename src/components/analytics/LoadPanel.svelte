<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  /**
   * Rolling Load: weekly rated load as bars (with a flag on weeks that jumped on the one before) and, in a pane of
   * its own under them on the same x-axis, the acute:chronic ratio with its zone bands - never two scales on one plot -
   * and the training blocks and goals as a band above.
   *
   * The two panes are one target: hover, tap or the arrow keys pick a column and its numbers print in the line above
   * the plot (a tooltip is hover-only and a finger covers it). The readout's "Details" opens the column's sheet; a
   * tap no longer jumps straight there. The plot's measured width sets how far the x-axis labels are thinned - see
   * `chartWidth` in Analytics.svelte.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { AcwrResult } from '../../lib/analytics/loadAnalytics';
  import { acwrZone, ACWR_ZONE_LABEL, type AcwrZoneId } from '../../lib/analytics/acwrZone';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { isTapPointer } from '../../lib/analytics/chartTips.svelte';
  import { TapTracker, columnAt, stepColumn } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel } from '../../lib/analytics/chartWindow';
  import { outlineHeights } from '../../lib/analytics/plannedOutline';
  import type { ChartData } from './chartTypes';
  import type { TimelineSegment, TimelineGoal } from '../../lib/analytics/timeline';
  import PhaseBand from './PhaseBand.svelte';
  import ZoneMark from './ZoneMark.svelte';
  import ChartEmpty from './ChartEmpty.svelte';
  import ChartTable from './ChartTable.svelte';
  import Icon from "@iconify/svelte";

  let {
    chartData,
    acwrResults,
    axisStep,
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
    /** Accepted for a uniform panel API; this chart reads out through its own line. */
    tips?: ChartTips;
    /** Blocks and goals for the band over the plot. */
    timeline: { segments: TimelineSegment[]; goals: TimelineGoal[] };
    /** A day's x on this chart's columns (0-100). */
    xOfDay: (day: number) => number;
    /** The readout's "Details" was pressed - Analytics opens the column's sheet. */
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

  // A fixed ratio axis, the same for every window: it used to stretch to
  // the window's highest ratio, so one outlier (a 4.0 after a break, not
  // even counted) moved every dot and squashed the zone bands, and the
  // same week sat at a different height in 4W and 6M. 0-ACWR_LINEAR_MAX is
  // linear over the lower ACWR_LINEAR_SHARE of the plot (where the zones
  // live); above it, up to ACWR_AXIS_MAX, is squeezed into the rest, below
  // a little headroom so the top dot doesn't sit on the card's edge.
  // Higher still gets an arrow at the top; the readout gives the real value.
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
      zone: r.ratio === undefined ? null : acwrZone(r.ratio, acwrZones),
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
  // The line only joins ratios that mean something: after a break the ratio explodes or reads 0, and those points stay as hollow marks without a line through them.
  /** Hairlines at half and all of the window's biggest week (the axis leaves 15 % headroom above it). */
  const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(v)));
  const loadTicks = $derived.by(() => {
    const top = chartData.maxLoad / 1.15;
    return [0.5, 1].map((f) => ({ value: f, y: 100 - ((top * f) / chartData.maxLoad) * 100, label: compact(top * f) }));
  });
  const acwrRatioSegments = $derived(buildLineSegments(acwrOverlayPoints.map((p) => ({ x: p.x, y: p.sufficient ? p.ratioY : null }))));

  // Planned load as an outline behind each bar: its own scale (see `plannedOutline.ts`), a setting, no comparison text anywhere.
  const showPlanned = $derived(trainingState.tunableOn('analytics.plannedOutline'));
  const outlines = $derived(outlineHeights(chartData.weeks.map((w) => w.plannedLoad ?? 0)));
  const anyOutline = $derived(showPlanned && outlines.some((h) => h !== null));

  const monthly = $derived(chartData.weeks.length > 0 && !/^W\d+$/.test(chartData.weeks[0].label));
  const before = $derived(monthly ? 'month' : 'week');
  const hasLoad = $derived(chartData.weeks.some((w) => w.totalLoad > 0));
  /** No ratio is counted anywhere in the window yet: say what it needs rather than leave the pane bare. */
  const noRatioYet = $derived(acwrResults.length > 0 && hasLoad && !acwrResults.some((r) => r.sufficient));
  const afterBreakOnly = $derived(noRatioYet && acwrResults.some((r) => r.insufficientReason === 'break'));

  // --- One target for both panes: hover (mouse), tap or keys pick a column. Hover is temporary; a tap or key press
  // keeps the column until you tap it again or touch outside the card, so the Details button stays reachable.
  let picked = $state<number | null>(null);
  let hovered = $state<number | null>(null);
  const active = $derived(hovered ?? picked);
  let plotEl = $state<HTMLElement | null>(null);
  let cardEl = $state<HTMLElement | null>(null);
  const taps = new TapTracker();
  const colAt = (e: PointerEvent) => (plotEl ? columnAt(e.clientX, plotEl.getBoundingClientRect(), chartData.weeks.length) : null);
  function onKey(e: KeyboardEvent) {
    const next = stepColumn(picked, chartData.weeks.length, e.key);
    if (next === undefined) return;
    e.preventDefault();
    picked = next;
  }
  $effect(() => {
    const onDown = (e: PointerEvent) => {
      if (cardEl && !cardEl.contains(e.target as Node)) picked = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });
  // Paging to another window must not leave a stale column picked.
  $effect(() => {
    void chartData.weeks[0]?.id;
    picked = null;
    hovered = null;
  });

  const readout = $derived.by(() => {
    if (active === null) return null;
    const week = chartData.weeks[active];
    const p = acwrOverlayPoints[active];
    if (!week || !p) return null;
    return { index: active, week, p, plan: planDone[week.id] };
  });
  const zoneText = (zone: AcwrZoneId | null) => (zone ? ACWR_ZONE_LABEL[zone] : '');
  const rampText = (p: { rampRate: number }) => `${p.rampRate > 0 ? '+' : p.rampRate < 0 ? '−' : ''}${Math.abs(Math.round(p.rampRate * 100))}%`;
</script>

<div id="section-load" class="scroll-mt-4 card space-y-3 relative" data-tour="analytics-load" bind:this={cardEl}>
  <div class="relative z-10">
    <h3 class="text-section uppercase text-content-muted flex items-center gap-1.5">Rolling Load <InfoButton term="load" /></h3>
    <p class="text-caption text-content-subtle mt-0.5">Training load per {before} (points), and how it compares with your usual</p>
  </div>

  <!-- The picked column's numbers. A reserved two lines, so paging and picking never move the chart. -->
  <div class="relative z-10 min-h-[2.5rem] flex items-start justify-between gap-2" aria-live="polite">
    {#if readout}
      <p class="text-caption tabular-nums text-content-muted leading-snug">
        <span class="text-content font-semibold">{readout.week.label}</span>
        <span class="text-content-subtle">&nbsp;·&nbsp;</span><span class="text-content">{Math.round(readout.week.totalLoad)}</span> load
        {#if readout.plan !== undefined}<span class="text-content-subtle"> · {Math.round(readout.plan * 100)}% of the plan</span>{/if}
        <br />
        {#if readout.p.ratio !== undefined && readout.p.ratioY !== null}
          <span class="inline-flex items-center gap-1 align-middle"><ZoneMark zone={readout.p.zone!} filled={readout.p.sufficient} size={11} /><span class="text-content-subtle">ACWR</span> <span class="text-content">{readout.p.ratio.toFixed(2)}</span>
            <span class="text-content-subtle">{readout.p.sufficient ? zoneText(readout.p.zone) : readout.p.insufficientReason === 'break' ? 'after a break, not counted' : 'building history, not counted'}</span></span>
        {/if}
        {#if readout.p.rampRate}
          <span class="{readout.p.spike ? 'text-status-caution' : 'text-content-subtle'}">
            {#if readout.p.ratioY !== null}<span class="text-content-subtle">&nbsp;·&nbsp;</span>{/if}{#if readout.p.spike}<Icon icon="ic:baseline-warning" class="inline text-sm align-text-bottom" /> {/if}load {rampText(readout.p)} on the {before} before
          </span>
        {/if}
      </p>
      <button onclick={() => onSelect(readout.index)} class="btn-quiet shrink-0 px-3 text-label text-primary hover:bg-surface-elevated/60">Details</button>
    {:else}
      <p class="text-caption text-content-subtle leading-snug py-1" class:invisible={!hasLoad}>Tap a {before} for its numbers, then Details for its sessions.</p>
    {/if}
  </div>

  <!-- One padding for the band and both panes (36 px: the axis labels sit in it), so the band lines up with the plot. -->
  <div class="relative z-10 pr-9 space-y-2">
    <PhaseBand segments={timeline.segments} goals={timeline.goals} xOf={xOfDay} />

    <!-- Two panes on one shared x-axis, each with its own scale and nothing drawn over anything else: the week's load as
         bars (top), the acute:chronic ratio under it (a ratio is not a load, so it never shares an axis with the bars).
         The top plot's measured width decides how far every chart's x-axis labels are thinned - see `chartWidth`. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={plotEl}
      class="relative select-none outline-offset-4"
      role="application"
      tabindex="0"
      aria-label="Rolling load by {before} with its acute to chronic ratio. Left and right arrow keys move between {before}s; a table of the numbers follows."
      onkeydown={onKey}
      onpointerdown={taps.down}
      onpointermove={(e) => { if (!isTapPointer(e)) hovered = colAt(e); }}
      onpointerleave={(e) => { if (!isTapPointer(e)) hovered = null; }}
      onpointerup={(e) => { if (taps.isTap(e)) { const i = colAt(e); picked = i === picked ? null : i; } }}
    >
      <div class="h-36 relative flex items-end justify-between gap-px cursor-pointer" bind:clientWidth={chartWidth}>
        <!-- Hairlines at half and full of the window's biggest week, labelled just outside the plot. -->
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
          {#each loadTicks as t (t.value)}
            <div class="absolute inset-x-0 border-t border-content-subtle/15" style="top: {t.y}%"></div>
            <span class="absolute right-0 translate-x-full -translate-y-1/2 pl-1 text-caption leading-none text-content-subtle tabular-nums" style="top: {t.y}%">{t.label}</span>
          {/each}
        </div>

        {#each chartData.weeks as week, wi}
          <div class="flex-1 flex flex-col items-center relative h-full justify-end">
            {#if showPlanned && outlines[wi] !== null}
              <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[86%] max-w-[22px] rounded-t-[4px] border-[1.5px] border-b-0 border-series-1 pointer-events-none transition-opacity {active !== null && active !== wi ? 'opacity-40' : ''}" style="height: {outlines[wi]}%" aria-hidden="true"></div>
            {/if}
            <!-- Flat fill, no gradient or glow; the current week is the only one at full strength, which is the whole
                 emphasis budget this chart spends. -->
            <div
              class="w-[62%] max-w-[16px] rounded-t-[3px] transition-[height,opacity] duration-500 {week.isCurrent ? 'bg-series-1' : 'bg-series-1/55'} {active !== null && active !== wi ? 'opacity-40' : ''}"
              style="height: {(week.totalLoad / chartData.maxLoad) * 100}%"
            ></div>
          </div>
        {/each}

        <!-- A flag over a bar that jumped on the one before it (the readout says by how much). -->
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
          {#each acwrOverlayPoints as p}
            {#if p.spike}
              <Icon icon="ic:baseline-warning" class="absolute text-status-caution text-sm" style="left: {p.x}%; top: {Math.max(p.barTopY - 8, 2)}%; transform: translate(-50%, -50%);" />
            {/if}
          {/each}
        </div>
        {#if !hasLoad}<ChartEmpty>No completed sessions in this window</ChartEmpty>{/if}
      </div>
      <div class="border-t border-border-strong/60 my-2"></div>

      <!-- The ratio: its own pane, its zones tinted and named in the legend below. -->
      <p class="text-caption text-content-subtle flex items-center gap-1.5 pb-1">Acute : chronic load (ACWR) <InfoButton term="acwr" /></p>
      <div class="h-20 relative cursor-pointer">
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <rect x="0" y={ratioToY(acwrMaxRatio)} width="100" height={Math.max(ratioToY(acwrZones.highRisk) - ratioToY(acwrMaxRatio), 0)} fill="var(--color-status-risk)" opacity="0.15" />
          <rect x="0" y={ratioToY(acwrZones.highRisk)} width="100" height={Math.max(ratioToY(acwrZones.caution) - ratioToY(acwrZones.highRisk), 0)} fill="var(--color-status-caution)" opacity="0.15" />
          <rect x="0" y={ratioToY(acwrZones.caution)} width="100" height={Math.max(ratioToY(acwrZones.sweetMin) - ratioToY(acwrZones.caution), 0)} fill="var(--color-status-good)" opacity="0.15" />
          <rect x="0" y={ratioToY(acwrZones.sweetMin)} width="100" height={Math.max(100 - ratioToY(acwrZones.sweetMin), 0)} fill="var(--color-status-neutral)" opacity="0.12" />
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
            <span class="absolute right-0 translate-x-full -translate-y-1/2 pl-1 text-caption leading-none text-content-subtle tabular-nums" style="top: {ratioToY(edge)}%;">{edge.toFixed(1)}</span>
          {/each}
        </div>
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
          {#each acwrOverlayPoints as p, pi}
            {#if p.ratioY !== null}
              <div class="absolute transition-opacity {active !== null && active !== pi ? 'opacity-40' : ''}" style="left: {p.x}%; top: {p.ratioY}%; transform: translate(-50%, -50%);">
                {#if p.offScale}
                  <!-- Above the axis: an arrow at the top rather than a mark pretending to be at the maximum. -->
                  <Icon icon="ic:baseline-arrow-drop-up" class="text-base -my-1.5 text-status-risk" style="opacity: {p.sufficient ? 1 : 0.6};" />
                {:else}
                  <ZoneMark zone={p.zone ?? 'low'} filled={p.sufficient} size={active === pi ? 14 : 11} />
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>

      {#if active !== null}
        <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {((active + 0.5) / Math.max(chartData.weeks.length, 1)) * 100}%"></div>
      {/if}

      <!-- The shared x-axis. Labels are thinned to whatever fits (see `axisStep`), counted back from the most recent week
           so it is always the one that keeps its label. -->
      <div class="flex justify-between gap-px mt-1">
        {#each chartData.weeks as week, i}
          <div class="flex-1 flex justify-center">
            {#if showsLabel(i, chartData.weeks.length, axisStep)}
              <span class="text-caption leading-tight tabular-nums {week.isCurrent ? 'text-primary' : active === i ? 'text-content' : 'text-content-subtle'}">{week.label}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- What the marks mean: zone, by shape and colour, with the edges as set in Settings. Hollow = not counted yet. -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-content-subtle">
      {#if anyOutline}
        <span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-3 rounded-t-[2px] bg-series-1/70" aria-hidden="true"></span>logged load</span>
        <span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-3.5 rounded-t-[3px] border-[1.5px] border-b-0 border-series-1" aria-hidden="true"></span>planned load, on its own scale <InfoButton term="load" /></span>
      {/if}
      <span class="inline-flex items-center gap-1"><ZoneMark zone="low" size={10} />low &lt;{acwrZones.sweetMin.toFixed(1)}</span>
      <span class="inline-flex items-center gap-1"><ZoneMark zone="sweet" size={10} />sweet spot</span>
      <span class="inline-flex items-center gap-1"><ZoneMark zone="caution" size={10} />caution &gt;{acwrZones.caution.toFixed(1)}</span>
      <span class="inline-flex items-center gap-1"><ZoneMark zone="risk" size={10} />high risk &gt;{acwrZones.highRisk.toFixed(1)}</span>
      <span class="inline-flex items-center gap-1"><ZoneMark zone="low" filled={false} size={10} />not counted yet</span>
      <span class="inline-flex items-center gap-1"><Icon icon="ic:baseline-warning" class="text-sm text-status-caution" />load jumped on the {before} before <InfoButton term="rampRate" /></span>
    </div>
  </div>

  {#if noRatioYet}
    <p class="text-caption text-content-subtle relative z-10">{afterBreakOnly ? 'The ratio is not counted right after a break.' : 'The ratio needs about 4 weeks of logged sessions before it is counted.'}</p>
  {/if}

  <!-- Always there ("–" with nothing completed) so the card keeps its height while paging. -->
  <p class="text-caption text-content-subtle relative z-10">
    Plan: <span class="text-content tabular-nums">{windowPlanDone !== undefined ? `${Math.round(windowPlanDone * 100)}%` : '–'}</span> of the planned work done so far
  </p>

  <ChartTable
    caption="Rolling load by {before}"
    columns={[before === 'week' ? 'Week' : 'Month', 'Load', ...(showPlanned ? ['Planned load (own scale)'] : []), '% of the plan', 'ACWR', 'ACWR zone', `Load change on the ${before} before`]}
    rows={chartData.weeks.map((w, i) => {
      const p = acwrOverlayPoints[i];
      return [
        w.label,
        Math.round(w.totalLoad),
        ...(showPlanned ? [w.plannedLoad ? Math.round(w.plannedLoad) : '–'] : []),
        planDone[w.id] !== undefined ? `${Math.round(planDone[w.id] * 100)}%` : '–',
        p?.ratio !== undefined ? p.ratio.toFixed(2) : '–',
        p?.zone ? (p.sufficient ? ACWR_ZONE_LABEL[p.zone] : 'not counted yet') : '–',
        p?.rampRate ? rampText(p) : '–',
      ];
    })}
  />
</div>
