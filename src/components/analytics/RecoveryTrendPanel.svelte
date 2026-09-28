<script lang="ts">
  /**
   * Recovery: HRV, sleep score and resting HR day by day over the Analytics
   * window, with readiness, bodyweight and daily load underneath so cause (load) and
   * effect (recovery) sit on one time axis.
   *
   * Two ways to draw the three metrics (a setting - Appearance -> History &
   * Analytics, or the toggle on the card):
   * - overlay: each as % away from its own 28-day baseline on one shared
   *   axis, resting HR flipped so up is always better. The one that makes
   *   correlations visible - three units can't share an axis otherwise.
   * - lanes: one row per metric in its real unit, with the personal normal
   *   range (baseline ± 1 SD) shaded.
   *
   * The maths lives in `lib/analytics/recoverySeries.ts` - see its tests.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { isTapPointer } from '../../lib/analytics/chartTips.svelte';
  import { TapTracker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import {
    recoveryMetrics,
    readingsByDay,
    buildRecoverySeries,
    dailyLoadByDay,
    readinessByDay,
    loadRecoveryInsights,
    dayIndexToIso,
    type RecoveryDay,
  } from '../../lib/analytics/recoverySeries';
  import type { TimelineSegment, TimelineGoal } from '../../lib/analytics/timeline';
  import PhaseBand from './PhaseBand.svelte';
  import { formatWeight } from '../../lib/units';
  import { BODYWEIGHT_METRIC_ID, SLEEP_DURATION_METRIC } from '../../lib/constants';
  import Icon from "@iconify/svelte";
  import ChartEmpty from './ChartEmpty.svelte';

  let { firstDay, lastDay, today, timeline }: {
    /** First and last day index of the window (Monday of the first week, Sunday of the last). */
    firstDay: number;
    lastDay: number;
    /** Today's day index - nothing is drawn after it. */
    today: number;
    /** Blocks and goals for the band over the plot. */
    timeline: { segments: TimelineSegment[]; goals: TimelineGoal[] };
  } = $props();

  const STYLE: Record<string, { short: string; color: string }> = {
    hrv: { short: 'HRV', color: 'var(--color-primary)' },
    'sleep-score': { short: 'Sleep', color: 'var(--color-tertiary)' },
    // The same slot, in hours, when the window has no sleep scores (Health Connect).
    'sleep-duration': { short: 'Sleep', color: 'var(--color-tertiary)' },
    rhr: { short: 'RHR', color: 'var(--color-warning)' },
  };

  const mode = $derived(trainingState.recoveryChartMode);
  let hidden = $state<Set<string>>(new Set());
  function toggleMetric(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    hidden = next;
  }

  const dayCount = $derived(Math.max(lastDay - firstDay + 1, 1));
  const drawnLast = $derived(Math.min(lastDay, today));
  function xOf(day: number): number {
    return ((day - firstDay + 0.5) / dayCount) * 100;
  }

  const metrics = $derived(recoveryMetrics(trainingState.dailyMetrics, firstDay, drawnLast).map((spec) => {
    const def = trainingState.metricDefs.find((d) => d.id === spec.id);
    return {
      ...spec,
      short: STYLE[spec.id].short,
      color: STYLE[spec.id].color,
      unit: def?.unit ?? (spec.id === SLEEP_DURATION_METRIC.id ? SLEEP_DURATION_METRIC.unit : ''),
      series: drawnLast >= firstDay ? buildRecoverySeries(trainingState.dailyMetrics, spec, firstDay, drawnLast) : [],
    };
  }));
  const shown = $derived(metrics.filter((m) => !hidden.has(m.id)));

  // A metric the % view can't draw at all yet, said out loud rather than
  // left blank: a reading only becomes a % once there are 7 readings before
  // it. (Every metric's own first week has none either - that's not worth
  // a note, so only metrics with no % point at all are named.)
  const noPercentYet = $derived(
    shown
      .filter((m) => !m.series.some((d) => d.deviation !== undefined))
      .map((m) => ({ short: m.short, count: m.series.filter((d) => d.value !== undefined).length }))
      .filter((m) => m.count > 0),
  );
  const afterBreak = $derived(shown.some((m) => m.series.some((d) => d.baselineAfterBreak && d.value !== undefined)));

  const loadByDay = $derived(dailyLoadByDay(trainingState.workouts));
  const maxLoad = $derived(Math.max(1, ...Array.from({ length: dayCount }, (_, i) => loadByDay.get(firstDay + i) ?? 0)));
  const readiness = $derived(
    drawnLast >= firstDay
      ? readinessByDay(trainingState.workouts, trainingState.dailyMetrics, firstDay, drawnLast, {
          config: trainingState.readinessConfig,
          halfLife: trainingState.fatigueModel,
        })
      : new Map<number, number>(),
  );
  const insights = $derived(loadRecoveryInsights(trainingState.dailyMetrics, trainingState.workouts, today));

  // --- Path building. Everything is drawn in a 0-100 viewBox stretched to
  // the plot; dots are zero-length round-capped strokes with
  // non-scaling-stroke, so they stay round however the plot is stretched.
  type Pt = { x: number; y: number };
  function segments(points: (Pt | null)[]): string {
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    for (const p of points) {
      if (!p) {
        if (run.length > 1) runs.push(run);
        run = [];
      } else run.push(p);
    }
    if (run.length > 1) runs.push(run);
    return runs.map((r) => `M ${r.map((p) => `${p.x},${p.y}`).join(' L ')}`).join(' ');
  }
  function dots(points: (Pt | null)[]): string {
    return points.filter((p): p is Pt => p !== null).map((p) => `M ${p.x},${p.y} h 0`).join(' ');
  }
  /** The band between two edges, broken wherever either edge is missing. */
  function band(upper: (Pt | null)[], lower: (Pt | null)[]): string {
    const out: string[] = [];
    let top: Pt[] = [];
    let bottom: Pt[] = [];
    const flush = () => {
      if (top.length > 1) out.push(`M ${top.map((p) => `${p.x},${p.y}`).join(' L ')} L ${bottom.reverse().map((p) => `${p.x},${p.y}`).join(' L ')} Z`);
      top = [];
      bottom = [];
    };
    upper.forEach((u, i) => {
      const l = lower[i];
      if (!u || !l) flush();
      else {
        top.push(u);
        bottom.push(l);
      }
    });
    flush();
    return out.join(' ');
  }

  // --- Overlay: one symmetric % axis, rounded out to a multiple of 5.
  const overlayRange = $derived.by(() => {
    let peak = 10;
    for (const m of shown) for (const d of m.series) {
      if (d.deviation !== undefined) peak = Math.max(peak, Math.abs(d.deviation));
      if (d.avgDeviation !== undefined) peak = Math.max(peak, Math.abs(d.avgDeviation));
    }
    return Math.min(Math.ceil(peak / 5) * 5, 60);
  });
  function overlayY(pct: number): number {
    const clamped = Math.max(-overlayRange, Math.min(overlayRange, pct));
    return 50 - (clamped / overlayRange) * 50;
  }
  const overlayPaths = $derived(shown.map((m) => ({
    id: m.id,
    color: m.color,
    line: segments(m.series.map((d) => d.avgDeviation === undefined ? null : { x: xOf(d.day), y: overlayY(d.avgDeviation) })),
    dots: dots(m.series.map((d) => d.deviation === undefined ? null : { x: xOf(d.day), y: overlayY(d.deviation) })),
  })));

  // --- Lanes: each metric on its own padded min/max scale.
  const lanePaths = $derived(shown.map((m) => {
    const values: number[] = [];
    for (const d of m.series) {
      if (d.value !== undefined) values.push(d.value);
      if (d.baseline !== undefined && d.sd !== undefined) values.push(d.baseline + d.sd, d.baseline - d.sd);
    }
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 1;
    const pad = Math.max((hi - lo) * 0.12, 0.5);
    const min = lo - pad;
    const max = hi + pad;
    const y = (v: number) => 100 - ((v - min) / (max - min)) * 100;
    const at = (d: RecoveryDay, v: number | undefined) => (v === undefined ? null : { x: xOf(d.day), y: y(v) });
    return {
      ...m,
      band: band(
        m.series.map((d) => at(d, d.baseline !== undefined && d.sd !== undefined ? d.baseline + d.sd : undefined)),
        m.series.map((d) => at(d, d.baseline !== undefined && d.sd !== undefined ? d.baseline - d.sd : undefined)),
      ),
      line: segments(m.series.map((d) => at(d, d.avg))),
      dots: dots(m.series.map((d) => at(d, d.value))),
    };
  }));

  // --- Bodyweight: its own lane in real units (never a % - "better" has
  // no direction for weight), on a min/max-padded scale.
  const bodyweight = $derived.by(() => {
    if (drawnLast < firstDay) return null;
    const series = buildRecoverySeries(trainingState.dailyMetrics, { id: BODYWEIGHT_METRIC_ID, higherIsBetter: true }, firstDay, drawnLast);
    const values = series.flatMap((d) => (d.value !== undefined ? [d.value] : []));
    if (values.length === 0) return null;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.15, 0.3);
    const y = (v: number) => 100 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
    const latest = [...series].reverse().find((d) => d.value !== undefined);
    return {
      series,
      dots: dots(series.map((d) => (d.value === undefined ? null : { x: xOf(d.day), y: y(d.value) }))),
      line: segments(series.map((d) => (d.avg === undefined ? null : { x: xOf(d.day), y: y(d.avg) }))),
      latest: latest?.value,
    };
  });

  const hasAnyReading = $derived(metrics.some((m) => m.series.some((d) => d.value !== undefined)) || bodyweight !== null);
  /** Whether anything was ever logged - decides the empty note, and keeps the weight lane in windows without a weigh-in. */
  const everLogged = $derived(trainingState.dailyMetrics.length > 0);
  const everWeighed = $derived(trainingState.dailyMetrics.some((m) => m.metricId === BODYWEIGHT_METRIC_ID));

  const readinessLine = $derived(segments(
    Array.from({ length: Math.max(drawnLast - firstDay + 1, 0) }, (_, i) => {
      const score = readiness.get(firstDay + i);
      return score === undefined ? null : { x: xOf(firstDay + i), y: 100 - score };
    }),
  ));

  // --- Readout: the tapped/hovered day, or else the latest day with any reading.
  let selected = $state<number | null>(null);
  let plotEl = $state<HTMLElement | null>(null);
  /** The date axis spans exactly the plots' x extent (the label gutter excluded), so positions are measured against it. */
  let axisEl = $state<HTMLElement | null>(null);
  const latestDay = $derived.by(() => {
    for (let d = drawnLast; d >= firstDay; d--) {
      if (metrics.some((m) => m.series[d - firstDay]?.value !== undefined)) return d;
    }
    return null;
  });
  const readoutDay = $derived(selected ?? latestDay);
  function dayAt(event: PointerEvent): number | null {
    if (!axisEl) return null;
    const rect = axisEl.getBoundingClientRect();
    const day = firstDay + Math.floor(((event.clientX - rect.left) / rect.width) * dayCount);
    return day < firstDay || day > drawnLast ? null : day;
  }
  function onMove(event: PointerEvent) {
    if (!isTapPointer(event)) selected = dayAt(event);
  }
  const taps = new TapTracker();
  function onTap(event: PointerEvent) {
    // A swipe across the chart pages the window; it must not also pick a day.
    if (!isTapPointer(event) || !taps.isTap(event)) return;
    const day = dayAt(event);
    selected = day === selected ? null : day;
  }
  $effect(() => {
    const onDown = (event: PointerEvent) => {
      if (plotEl && !plotEl.contains(event.target as Node)) selected = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });

  function formatPct(pct: number | undefined): string {
    if (pct === undefined) return '';
    const r = Math.round(pct);
    return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}%`;
  }
  /** Whole numbers, except hours (7.2 h). */
  function formatValue(v: number | undefined, unit = ''): string {
    if (v === undefined) return '–';
    return unit === 'h' ? v.toFixed(1) : String(Math.round(v));
  }
  const napsByDay = $derived(readingsByDay(trainingState.dailyMetrics, 'nap-duration'));
  const readout = $derived.by(() => {
    if (readoutDay === null) return null;
    const i = readoutDay - firstDay;
    return {
      date: new Date(`${dayIndexToIso(readoutDay)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      metrics: metrics.map((m) => ({ ...m, day: m.series[i] })),
      readiness: readiness.get(readoutDay),
      load: loadByDay.get(readoutDay) ?? 0,
      weight: bodyweight?.series[i]?.value,
    };
  });

  // Date axis: a few evenly spaced labels, the latest always shown.
  const axisDays = $derived(Array.from({ length: dayCount }, (_, i) => firstDay + i));
  const axisStep = $derived(sparseLabelStep(dayCount, 4));

  /** In words, not signs - resting HR's % is flipped, so "+3%" would read backwards for it. */
  function relative(pct: number): string {
    const r = Math.round(Math.abs(pct));
    if (r === 0) return 'at baseline';
    return `${r}% ${pct > 0 ? 'better' : 'worse'} than baseline`;
  }
  function insightText(metricId: string, afterHard: number, afterRest: number): string {
    const name = STYLE[metricId]?.short ?? metricId;
    return `${name} the morning after your hardest days: ${relative(afterHard)}; after rest days: ${relative(afterRest)}.`;
  }
</script>

<div id="section-recoveryTrend" class="scroll-mt-4 card space-y-3">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h3 class="text-section uppercase text-content-muted">Recovery</h3>
      <p class="text-caption text-content-subtle mt-0.5">
        {mode === 'overlay' ? '% vs your 28-day baseline · up is better' : 'Shaded: your normal range'}
      </p>
    </div>
    <div class="flex bg-surface-elevated/50 p-0.5 rounded-control shrink-0">
      <button
        onclick={() => trainingState.setRecoveryChartMode('overlay')}
        class="p-1.5 rounded-control transition-colors {mode === 'overlay' ? 'bg-surface text-content shadow-sm' : 'text-content-subtle hover:text-content'}"
        aria-label="Overlay as % vs baseline"
        aria-pressed={mode === 'overlay'}
        title="% vs baseline"
      >
        <Icon icon="ic:baseline-stacked-line-chart" class="text-base" />
      </button>
      <button
        onclick={() => trainingState.setRecoveryChartMode('lanes')}
        class="p-1.5 rounded-control transition-colors {mode === 'lanes' ? 'bg-surface text-content shadow-sm' : 'text-content-subtle hover:text-content'}"
        aria-label="Separate rows"
        aria-pressed={mode === 'lanes'}
        title="Separate rows"
      >
        <Icon icon="ic:baseline-view-agenda" class="text-base" />
      </button>
    </div>
  </div>

    <!-- Legend doubles as the metric filter. -->
    <div class="flex flex-wrap gap-1.5">
      {#each metrics as m (m.id)}
        <button
          onclick={() => toggleMetric(m.id)}
          aria-pressed={!hidden.has(m.id)}
          class="flex items-center gap-1.5 px-2 py-0.5 rounded-control border border-border text-caption transition-opacity {hidden.has(m.id) ? 'opacity-40' : ''}"
        >
          <span class="w-2 h-2 rounded-full" style="background: {m.color}"></span>
          <span class="text-content-muted">{m.short}</span>
        </button>
      {/each}
    </div>

    <!-- Readout for the tapped day (or the latest), instead of a floating
         tooltip - it never has to fit beside a finger on a phone. -->
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-caption tabular-nums min-h-[1.25rem]">
      {#if readout}
        <span class="text-content-muted">{readout.date}</span>
        {#each readout.metrics as m (m.id)}
          {#if !hidden.has(m.id)}
            <span>
              <span style="color: {m.color}">●</span>
              <span class="text-content">{formatValue(m.day?.value, m.unit)}</span><span class="text-content-subtle">{m.day?.value !== undefined ? ` ${m.unit}` : ''}</span>
              {#if m.id === 'sleep-duration' && readoutDay !== null && napsByDay.get(readoutDay)}<span class="text-content-subtle"> +{formatValue(napsByDay.get(readoutDay), 'h')} h nap</span>{/if}
              {#if m.day?.deviation !== undefined}<span class="text-content-subtle"> {formatPct(m.day.deviation)}</span>{/if}
            </span>
          {/if}
        {/each}
      {/if}
    </div>

    <div class="flex gap-2">
      <div class="w-8 shrink-0"></div>
      <div class="flex-1 min-w-0">
        <PhaseBand segments={timeline.segments} goals={timeline.goals} xOf={(day) => ((day - firstDay) / dayCount) * 100} />
      </div>
    </div>

    <div
      bind:this={plotEl}
      class="relative cursor-crosshair select-none"
      role="presentation"
      onpointerdown={taps.down}
      onpointermove={onMove}
      onpointerleave={(e) => { if (!isTapPointer(e)) selected = null; }}
      onpointerup={onTap}
    >
      {#if mode === 'overlay'}
        <div class="flex gap-2">
          <div class="w-8 shrink-0 h-40 flex flex-col justify-between items-end text-caption leading-none text-content-subtle/70 tabular-nums">
            <span>+{overlayRange}%</span>
            <span>0</span>
            <span>−{overlayRange}%</span>
          </div>
          <div class="flex-1 min-w-0 h-40 relative">
            <div class="absolute inset-x-0 top-1/2 border-t border-dashed border-content-subtle/30"></div>
            <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
              {#each overlayPaths as p (p.id)}
                <path d={p.dots} stroke={p.color} stroke-opacity="0.35" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" fill="none" />
                <path d={p.line} stroke={p.color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" fill="none" />
              {/each}
            </svg>
            {#if readoutDay !== null}
              <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {xOf(readoutDay)}%"></div>
            {/if}
          </div>
        </div>
        {#if noPercentYet.length || afterBreak}
          <div class="ml-10 mt-1 space-y-0.5">
            {#if noPercentYet.length}
              <p class="text-caption text-content-subtle">
                Not in % yet: {noPercentYet.map((m) => `${m.short} (${m.count} reading${m.count === 1 ? '' : 's'})`).join(', ')} - a % needs 7 earlier readings to compare with. The rows view shows them.
              </p>
            {/if}
            {#if afterBreak}
              <p class="text-caption text-content-subtle">After a break, % is against your readings from before it.</p>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="space-y-2">
          {#each lanePaths as lane (lane.id)}
            {@const latest = [...lane.series].reverse().find((d) => d.avg !== undefined)}
            <div class="flex gap-2">
              <div class="w-8 shrink-0 text-caption leading-tight text-right pt-4" style="color: {lane.color}">{lane.short}</div>
              <div class="flex-1 min-w-0">
                <!-- The 7-day value on its own line above the lane: inside the
                     plot it sat on top of the newest days and hid them. -->
                <p class="h-4 text-right text-caption leading-none text-content-subtle tabular-nums">
                  {#if latest?.avg !== undefined}7d {formatValue(latest.avg, lane.unit)} {lane.unit}{/if}
                </p>
                <div class="h-14 relative">
                  <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d={lane.band} fill={lane.color} fill-opacity="0.1" />
                    <path d={lane.dots} stroke={lane.color} stroke-opacity="0.4" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" fill="none" />
                    <path d={lane.line} stroke={lane.color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" fill="none" />
                  </svg>
                  {#if readoutDay !== null}
                    <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {xOf(readoutDay)}%"></div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Readiness (0-100) and daily load, sharing the same day axis. -->
      <div class="flex gap-2 mt-2">
        <div class="w-8 shrink-0 text-caption leading-tight text-right text-content-subtle">Ready</div>
        <div class="flex-1 min-w-0 h-8 relative">
          <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d={readinessLine} stroke="var(--color-status-good)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" fill="none" />
          </svg>
          {#if readoutDay !== null}
            <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {xOf(readoutDay)}%"></div>
          {/if}
        </div>
      </div>
      {#if bodyweight || everWeighed}
        <div class="flex gap-2 mt-2">
          <div class="w-8 shrink-0 text-caption leading-tight text-right text-content-subtle pt-4">Weight</div>
          <div class="flex-1 min-w-0">
            <p class="h-4 text-right text-caption leading-none text-content-subtle tabular-nums">
              {#if bodyweight?.latest !== undefined}{formatWeight(bodyweight.latest, trainingState.units.weight)}{/if}
            </p>
            <div class="h-10 relative">
              <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d={bodyweight?.dots} stroke="var(--color-content-muted)" stroke-opacity="0.5" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" fill="none" />
                <path d={bodyweight?.line} stroke="var(--color-content-muted)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" fill="none" />
              </svg>
              {#if readoutDay !== null}
                <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {xOf(readoutDay)}%"></div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
      <div class="flex gap-2 mt-1">
        <div class="w-8 shrink-0 text-caption leading-tight text-right text-content-subtle">Load</div>
        <div class="flex-1 min-w-0 h-8 relative">
          <svg class="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            {#each axisDays as day}
              {@const l = loadByDay.get(day) ?? 0}
              {#if l > 0}
                <rect x={xOf(day) - 35 / dayCount} width={70 / dayCount} y={100 - (l / maxLoad) * 100} height={(l / maxLoad) * 100} fill="var(--color-content-subtle)" fill-opacity={day === readoutDay ? 0.7 : 0.3} />
              {/if}
            {/each}
          </svg>
        </div>
      </div>

      <div class="flex gap-2">
        <div class="w-8 shrink-0"></div>
        <div class="flex-1 min-w-0" bind:this={axisEl}>
          <div class="border-t border-border-strong/60"></div>
          <div class="relative h-4">
            {#each axisDays as day, i}
              {#if showsLabel(i, axisDays.length, axisStep)}
                <span
                  class="absolute top-0 text-caption leading-tight text-content-subtle/70 whitespace-nowrap"
                  style="left: {xOf(day)}%; transform: translateX({i === 0 ? '0' : i === axisDays.length - 1 ? '-100%' : '-50%'});"
                >
                  {new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              {/if}
            {/each}
          </div>
        </div>
      </div>
      {#if !hasAnyReading}
        <ChartEmpty>{everLogged ? 'No readings in this window' : 'Log HRV, sleep score, resting HR or bodyweight on Home to see how you recover'}</ChartEmpty>
      {/if}
    </div>

    <p class="text-caption text-content-subtle tabular-nums min-h-[1.25rem]">
      {#if readout && (readout.readiness !== undefined || readout.load > 0 || readout.weight !== undefined)}
        {[
          readout.readiness !== undefined ? `Readiness ${Math.round(readout.readiness)}` : '',
          readout.weight !== undefined ? `Weight ${formatWeight(readout.weight, trainingState.units.weight)}` : '',
          readout.load > 0 ? `Load ${Math.round(readout.load)}` : '',
        ].filter(Boolean).join(' · ')}
      {/if}
    </p>

    {#if insights.length > 0}
      <div class="space-y-1.5 pt-1 border-t border-border">
        {#each insights as insight (insight.metricId)}
          <p class="flex gap-2 text-caption text-content-muted leading-snug">
            <Icon icon="ic:baseline-insights" class="text-sm shrink-0 mt-0.5 text-content-subtle" />
            <span>
              {insightText(insight.metricId, insight.afterHard, insight.afterRest)}
              <span class="text-content-subtle">({insight.hardDays} hard, {insight.restDays} rest days, last 6 months)</span>
            </span>
          </p>
        {/each}
      </div>
    {/if}
</div>
