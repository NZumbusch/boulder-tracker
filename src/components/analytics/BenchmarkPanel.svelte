<script lang="ts">
  /**
   * Benchmark Progress: one test's results in the Analytics window.
   *
   * A test is picked from chips, and - when it was done in different ways
   * (edge depths, loads) - the way, so results are only compared like with
   * like ("All" mixes them on purpose). Two views:
   * - Over time: one metric, or two side by side (each on its own scale),
   *   placed by date across the window so the spacing shows how often it
   *   was tested;
   * - Against: one metric plotted against another - reps against weight -
   *   joined in the order they happened, so the path of the progress shows
   *   (more weight at the same reps, or more reps at the same weight).
   * A metric is a field of the test, or a score formed from several (an
   * estimated one-rep max, a load as % of bodyweight) - see `lib/benchmarks/series.ts`.
   * Tap or hover a result for its readout.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { isTapPointer } from '../../lib/analytics/chartTips.svelte';
  import { TapTracker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { toUtcDayIndex } from '../../lib/dateUtils';
  import { bodyweightsOf, buildSeries, isImprovement, metricPoints, metricsOf, type Metric, type MetricPoint, type Series } from '../../lib/benchmarks/series';
  import { conditionsText } from '../../lib/benchmarks/model';
  import ChartEmpty from './ChartEmpty.svelte';

  // `tips` is accepted for a uniform panel API; this chart uses its own readout line instead.
  let { firstDay, lastDay }: {
    tips?: ChartTips;
    /** The Analytics window, as day indices - only results inside it are drawn. */
    firstDay: number;
    lastDay: number;
  } = $props();

  const COLOR_A = 'var(--color-primary)';
  const COLOR_B = 'var(--color-tertiary)';

  let selectedTypeId = $state<string>('');
  /** A series key's conditions text, or "all". Empty = the default. */
  let selectedWay = $state<string>('');
  let mode = $state<'time' | 'against'>('time');
  let metricAId = $state('');
  let metricBId = $state(''); // '' = none
  let xId = $state('');
  let yId = $state('');

  const weight = $derived(trainingState.units.weight);
  const types = $derived(trainingState.benchmarkTypes.filter((t) => !t.archived));
  const bodyweights = $derived(bodyweightsOf(trainingState.dailyMetrics));
  const allSeries = $derived(buildSeries(trainingState.benchmarks, trainingState.benchmarkTypes, trainingState.valueDefs, weight));
  const inWindow = (date: string) => {
    const day = toUtcDayIndex(date);
    return day >= firstDay && day <= lastDay;
  };
  const typesWithResults = $derived(new Set(allSeries.filter((s) => s.results.some((b) => inWindow(b.date))).map((s) => s.type.id)));
  /** The chosen test, else the first with results in the window, else the first. */
  const typeId = $derived(
    types.find((t) => t.id === selectedTypeId)?.id ?? types.find((t) => typesWithResults.has(t.id))?.id ?? types[0]?.id ?? '',
  );
  const type = $derived(types.find((t) => t.id === typeId));

  // --- The way it was done ---
  const ways = $derived(allSeries.filter((s) => s.type.id === typeId));
  const waysWithResults = $derived(ways.filter((s) => s.results.some((b) => inWindow(b.date))));
  /** The chosen way, else the one most recently tested in the window, else the first; "all" when asked. */
  const way = $derived(
    selectedWay === 'all' && ways.length > 1 ? 'all'
      : ways.find((s) => s.conditions === selectedWay)?.conditions ?? waysWithResults[0]?.conditions ?? ways[0]?.conditions ?? '',
  );
  /** The series shown: the chosen way, or every way merged. */
  const series = $derived<Series | undefined>(
    way === 'all' && ways.length > 0
      ? { ...ways[0], key: 'all', conditions: 'all', label: ways[0].type.name, results: ways.flatMap((s) => s.results).sort((a, b) => a.date.localeCompare(b.date)) }
      : ways.find((s) => s.conditions === way),
  );

  // --- Metrics ---
  const metrics = $derived<Metric[]>(series ? metricsOf(series.type, series.fields, weight) : []);
  const metricA = $derived(metrics.find((m) => m.id === metricAId) ?? metrics[0]);
  const metricB = $derived(metrics.find((m) => m.id === metricBId && m.id !== metricA?.id));
  const canCompare = $derived(metrics.length > 1);
  // Against starts from the logged fields (reps against weight), not a score computed from one of them.
  const rawMetrics = $derived(metrics.filter((m) => m.field));
  const yMetric = $derived(metrics.find((m) => m.id === yId) ?? rawMetrics[0] ?? metrics[0]);
  const xMetric = $derived(
    metrics.find((m) => m.id === xId) ?? rawMetrics.find((m) => m.id !== yMetric?.id) ?? metrics.find((m) => m.id !== yMetric?.id) ?? metrics[0],
  );

  const pointsIn = (m: Metric | undefined): MetricPoint[] =>
    m && series ? metricPoints(m, series, weight, bodyweights).filter((p) => inWindow(p.result.date)) : [];
  const pointsA = $derived(pointsIn(metricA));
  const pointsB = $derived(metricB ? pointsIn(metricB) : []);

  // Min/max-padded scales: benchmarks move a few percent at a time, which a
  // 0-based axis flattens into a straight line.
  function scale(values: number[]): { lo: number; hi: number } {
    if (values.length === 0) return { lo: 0, hi: 1 };
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.2, Math.abs(hi) * 0.05, 0.5);
    return { lo: lo - pad, hi: hi + pad };
  }
  const boundsA = $derived(scale(pointsA.map((p) => p.value)));
  const boundsB = $derived(scale(pointsB.map((p) => p.value)));
  const dayCount = $derived(Math.max(lastDay - firstDay + 1, 1));
  const xOfDay = (day: number) => ((day - firstDay + 0.5) / dayCount) * 100;
  const yIn = (b: { lo: number; hi: number }, v: number) => 100 - ((v - b.lo) / (b.hi - b.lo)) * 100;

  function pathsOf(points: MetricPoint[], b: { lo: number; hi: number }) {
    const pts = points.map((p) => ({ x: xOfDay(p.day), y: yIn(b, p.value) }));
    if (pts.length === 0) return { line: '', area: '', dots: '' };
    const line = pts.length > 1 ? `M ${pts.map((p) => `${p.x},${p.y}`).join(' L ')}` : '';
    const area = pts.length > 1 ? `${line} L ${pts[pts.length - 1].x},100 L ${pts[0].x},100 Z` : '';
    return { line, area, dots: pts.map((p) => `M ${p.x},${p.y} h 0`).join(' ') };
  }
  const pathsA = $derived(pathsOf(pointsA, boundsA));
  const pathsB = $derived(pathsOf(pointsB, boundsB));

  // --- Against: one metric on each axis ---
  const against = $derived.by(() => {
    const xs = pointsIn(xMetric);
    const ys = new Map(pointsIn(yMetric).map((p) => [p.id, p]));
    return xs.flatMap((x) => {
      const y = ys.get(x.id);
      return y ? [{ id: x.id, x: x.value, y: y.value, day: x.day, result: x.result }] : [];
    });
  });
  const xBounds = $derived(scale(against.map((p) => p.x)));
  const yBounds = $derived(scale(against.map((p) => p.y)));
  const xPct = (v: number) => ((v - xBounds.lo) / (xBounds.hi - xBounds.lo)) * 100;
  const yPct = (v: number) => 100 - ((v - yBounds.lo) / (yBounds.hi - yBounds.lo)) * 100;
  const againstPath = $derived(against.length > 1 ? `M ${against.map((p) => `${xPct(p.x)},${yPct(p.y)}`).join(' L ')}` : '');

  // --- Headline ---
  const latest = $derived(pointsA[pointsA.length - 1]);
  const change = $derived.by(() => {
    if (pointsA.length < 2) return undefined;
    const first = pointsA[0].value;
    const last = pointsA[pointsA.length - 1].value;
    return { abs: last - first, pct: first !== 0 ? ((last - first) / first) * 100 : undefined };
  });
  const gain = $derived(change && type ? isImprovement(change.abs, type) : undefined);

  const fmt = (v: number) => String(Number(v.toFixed(1)));
  const fmtDay = (day: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
    new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, opts);

  // --- Readout: the result nearest the pointer, or the latest ---
  let selected = $state<number | null>(null);
  const taps = new TapTracker();
  let plotEl = $state<HTMLElement | null>(null);
  const shown = $derived(mode === 'time' ? pointsA : against);

  function nearest(event: PointerEvent): number | null {
    if (!plotEl || shown.length === 0) return null;
    const rect = plotEl.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    let best = 0;
    let bestDistance = Infinity;
    shown.forEach((p, i) => {
      const dx = (mode === 'time' ? xOfDay(p.day) : xPct((p as (typeof against)[number]).x)) - px;
      const dy = mode === 'time' ? 0 : yPct((p as (typeof against)[number]).y) - py;
      const d = dx * dx + dy * dy;
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    return best;
  }
  $effect(() => {
    const onDown = (e: PointerEvent) => {
      if (plotEl && !plotEl.contains(e.target as Node)) selected = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });
  // A new test, way or view starts without a stale selection.
  $effect(() => {
    void [typeId, way, mode, metricA?.id, metricB?.id, xMetric?.id, yMetric?.id];
    selected = null;
  });

  const readoutIndex = $derived(selected !== null && selected < shown.length ? selected : shown.length - 1);
  const readoutPoint = $derived(shown[readoutIndex]);
  const readoutResult = $derived(readoutPoint?.result);
  /** The other metric's value at the same result, for the two-line view. */
  const readoutB = $derived(mode === 'time' && readoutPoint ? pointsB.find((p) => p.id === readoutPoint.id) : undefined);
  const readoutWay = $derived(readoutResult && series && way === 'all' ? conditionsText(readoutResult, series.fields, weight) : '');

  const axisDays = $derived(Array.from({ length: dayCount }, (_, i) => firstDay + i));
  const axisStep = $derived(sparseLabelStep(dayCount, 4));

  const chip = (on: boolean, dim = false) =>
    `shrink-0 px-2.5 py-1 rounded-control border text-caption transition-colors whitespace-nowrap ${on ? 'border-primary bg-primary/15 text-content' : 'border-border text-content-subtle hover:text-content'} ${dim && !on ? 'opacity-50' : ''}`;
  const selectClass = 'min-w-0 bg-surface-elevated text-content rounded-control border border-border-strong text-caption px-2 py-1 outline-none';
</script>

{#if types.length > 0}
  <div id="section-benchmarks" class="scroll-mt-4 card space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-section uppercase text-content-muted">Benchmark Progress</h3>
        <!-- "–" in an empty window, so the header keeps its height while paging. -->
        <p class="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums">
          {#if !latest || !metricA}
            <span class="text-title text-content-subtle">–</span>
            <span class="text-caption text-content-subtle">{metricA?.unit ?? ''}</span>
          {:else}
            <span class="text-title text-content">{fmt(latest.value)}</span>
            <span class="text-caption text-content-subtle">{metricA.unit}</span>
            {#if change}
              <span class="text-caption font-semibold {gain === true ? 'text-status-good' : gain === false ? 'text-status-caution' : 'text-content-subtle'}">
                {change.abs > 0 ? '+' : change.abs < 0 ? '−' : '±'}{fmt(Math.abs(change.abs))}{metricA.id === 'relative' ? ' pts' : ` ${metricA.unit}`}{change.pct !== undefined && metricA.id !== 'relative' ? ` (${change.pct > 0 ? '+' : ''}${Math.round(change.pct)}%)` : ''}
              </span>
              <span class="text-caption text-content-subtle">in this range</span>
            {/if}
          {/if}
        </p>
      </div>
      {#if canCompare}
        <div class="flex bg-surface-elevated/50 p-0.5 rounded-control shrink-0">
          <button onclick={() => (mode = 'time')} class="px-2 py-0.5 text-caption rounded-control {mode === 'time' ? 'bg-surface text-content shadow-sm' : 'text-content-subtle'}">Over time</button>
          <button onclick={() => (mode = 'against')} class="px-2 py-0.5 text-caption rounded-control {mode === 'against' ? 'bg-surface text-content shadow-sm' : 'text-content-subtle'}">Against</button>
        </div>
      {/if}
    </div>

    <!-- The test: chips that scroll sideways (and so don't page the window). Dimmed = nothing in this window. -->
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" data-no-swipe>
      {#each types as t (t.id)}
        <button onclick={() => { selectedTypeId = t.id; selectedWay = ''; metricAId = ''; metricBId = ''; xId = ''; yId = ''; }} aria-pressed={t.id === typeId} class={chip(t.id === typeId, !typesWithResults.has(t.id))}>{t.name}</button>
      {/each}
    </div>

    <!-- The way it was done, when it has been done more than one way. -->
    {#if ways.length > 1}
      <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" data-no-swipe>
        {#each ways as w (w.key)}
          <button onclick={() => (selectedWay = w.conditions)} aria-pressed={w.conditions === way} class={chip(w.conditions === way, !waysWithResults.includes(w))}>{w.conditions || 'Not noted'}</button>
        {/each}
        <button onclick={() => (selectedWay = 'all')} aria-pressed={way === 'all'} class={chip(way === 'all')}>All</button>
      </div>
    {/if}

    <!-- What to chart. -->
    {#if mode === 'time'}
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption">
        <label class="flex items-center gap-1.5 min-w-0 text-content-subtle"><span class="w-2 h-2 rounded-full shrink-0" style="background: {COLOR_A}"></span>
          <select class={selectClass} value={metricA?.id ?? ''} onchange={(e) => (metricAId = e.currentTarget.value)} aria-label="Metric">
            {#each metrics as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
          </select>
        </label>
        {#if canCompare}
          <label class="flex items-center gap-1.5 min-w-0 text-content-subtle"><span class="w-2 h-2 rounded-full shrink-0" style="background: {metricB ? COLOR_B : 'transparent'}; border: 1px solid {COLOR_B}"></span>
            <select class={selectClass} value={metricB?.id ?? ''} onchange={(e) => (metricBId = e.currentTarget.value)} aria-label="Second metric">
              <option value="">and… (optional)</option>
              {#each metrics.filter((m) => m.id !== metricA?.id) as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
    {:else}
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-caption text-content-subtle">
        <select class={selectClass} value={yMetric?.id ?? ''} onchange={(e) => (yId = e.currentTarget.value)} aria-label="Up">
          {#each metrics as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
        <span>against</span>
        <select class={selectClass} value={xMetric?.id ?? ''} onchange={(e) => (xId = e.currentTarget.value)} aria-label="Across">
          {#each metrics as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
      </div>
    {/if}

    <div class="text-caption tabular-nums min-h-[1.25rem] text-content-muted">
      {#if readoutPoint && readoutResult}
        <span class="text-content-subtle">{fmtDay(readoutPoint.day, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        {#if mode === 'time' && metricA}
          · <span class="text-content" style="color: {COLOR_A}">{fmt((readoutPoint as MetricPoint).value)} {metricA.unit}</span>
          {#if readoutB && metricB}· <span style="color: {COLOR_B}">{fmt(readoutB.value)} {metricB.unit}</span>{/if}
        {:else if yMetric && xMetric}
          · <span class="text-content">{fmt((readoutPoint as (typeof against)[number]).y)} {yMetric.unit}</span>
          at <span class="text-content">{fmt((readoutPoint as (typeof against)[number]).x)} {xMetric.unit}</span>
        {/if}
        {readoutWay ? ` · ${readoutWay}` : ''}{readoutResult.notes ? ` · ${readoutResult.notes}` : ''}
      {/if}
    </div>

    {#if mode === 'time'}
      <div class="flex gap-2">
        <div class="w-9 shrink-0 h-36 flex flex-col justify-between items-end text-caption leading-none tabular-nums" style="color: {COLOR_A}">
          {#if pointsA.length > 0}
            <span>{fmt(boundsA.hi)}</span>
            <span>{fmt((boundsA.hi + boundsA.lo) / 2)}</span>
            <span>{fmt(boundsA.lo)}</span>
          {/if}
        </div>
        <div class="flex-1 min-w-0">
          <div
            bind:this={plotEl}
            class="h-36 relative cursor-crosshair select-none"
            role="presentation"
            onpointerdown={taps.down}
            onpointermove={(e) => { if (!isTapPointer(e)) selected = nearest(e); }}
            onpointerleave={(e) => { if (!isTapPointer(e)) selected = null; }}
            onpointerup={(e) => { if (isTapPointer(e) && taps.isTap(e)) selected = nearest(e); }}
          >
            <div class="absolute inset-0 flex flex-col justify-between pointer-events-none">
              <div class="border-t border-content-subtle/10"></div>
              <div class="border-t border-content-subtle/10"></div>
              <div class="border-t border-content-subtle/10"></div>
            </div>
            <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="benchmark-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.18" />
                  <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />
                </linearGradient>
              </defs>
              {#if !metricB}<path d={pathsA.area} fill="url(#benchmark-gradient)" />{/if}
              <path d={pathsA.line} fill="none" stroke={COLOR_A} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              <path d={pathsA.dots} fill="none" stroke={COLOR_A} stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {#if metricB}
                <path d={pathsB.line} fill="none" stroke={COLOR_B} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
                <path d={pathsB.dots} fill="none" stroke={COLOR_B} stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {/if}
              {#if readoutPoint}
                <path d="M {xOfDay(readoutPoint.day)},{yIn(boundsA, (readoutPoint as MetricPoint).value)} h 0" stroke="var(--color-surface)" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {/if}
            </svg>
            {#if readoutPoint}
              <div class="absolute inset-y-0 border-l border-content-subtle/30 pointer-events-none" style="left: {xOfDay(readoutPoint.day)}%"></div>
            {/if}
            {#if pointsA.length === 0}
              <ChartEmpty>
                {metricA?.id === 'relative'
                  ? 'Needs a bodyweight logged within two weeks of a result'
                  : metricA?.id === 'estimatedMax'
                    ? 'Needs both weight and reps on a result'
                    : `No ${type?.name ?? 'benchmark'} results in this range - try 6M or 1Y`}
              </ChartEmpty>
            {/if}
          </div>
          <div class="border-t border-border-strong/60"></div>
          <div class="relative h-4">
            {#each axisDays as day, i}
              {#if showsLabel(i, axisDays.length, axisStep)}
                <span
                  class="absolute top-0 text-caption leading-tight text-content-subtle/70 whitespace-nowrap"
                  style="left: {xOfDay(day)}%; transform: translateX({i === 0 ? '0' : i === axisDays.length - 1 ? '-100%' : '-50%'});"
                >{fmtDay(day)}</span>
              {/if}
            {/each}
          </div>
        </div>
        {#if metricB}
          <div class="w-9 shrink-0 h-36 flex flex-col justify-between items-start text-caption leading-none tabular-nums" style="color: {COLOR_B}">
            {#if pointsB.length > 0}
              <span>{fmt(boundsB.hi)}</span>
              <span>{fmt((boundsB.hi + boundsB.lo) / 2)}</span>
              <span>{fmt(boundsB.lo)}</span>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex gap-2">
        <div class="w-9 shrink-0 h-40 flex flex-col justify-between items-end text-caption leading-none text-content-subtle/70 tabular-nums">
          {#if against.length > 0}
            <span>{fmt(yBounds.hi)}</span>
            <span>{fmt((yBounds.hi + yBounds.lo) / 2)}</span>
            <span>{fmt(yBounds.lo)}</span>
          {/if}
        </div>
        <div class="flex-1 min-w-0">
          <div
            bind:this={plotEl}
            class="h-40 relative cursor-crosshair select-none border-l border-b border-border-strong/60"
            role="presentation"
            onpointerdown={taps.down}
            onpointermove={(e) => { if (!isTapPointer(e)) selected = nearest(e); }}
            onpointerleave={(e) => { if (!isTapPointer(e)) selected = null; }}
            onpointerup={(e) => { if (isTapPointer(e) && taps.isTap(e)) selected = nearest(e); }}
          >
            <div class="absolute inset-0 flex flex-col justify-between pointer-events-none">
              <div class="border-t border-content-subtle/10"></div>
              <div class="border-t border-content-subtle/10"></div>
              <div class="border-t border-content-subtle/10"></div>
            </div>
            <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
              {#if againstPath}<path d={againstPath} fill="none" stroke={COLOR_A} stroke-opacity="0.4" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />{/if}
              {#each against as p, i (p.id)}
                <!-- Older results fade, the latest is solid: the path reads in time order. -->
                <path d="M {xPct(p.x)},{yPct(p.y)} h 0" stroke={COLOR_A} stroke-opacity={0.3 + 0.7 * ((i + 1) / against.length)} stroke-width={i === against.length - 1 ? 10 : 7} stroke-linecap="round" vector-effect="non-scaling-stroke" fill="none" />
              {/each}
              {#if readoutPoint}
                <path d="M {xPct((readoutPoint as (typeof against)[number]).x)},{yPct((readoutPoint as (typeof against)[number]).y)} h 0" stroke="var(--color-surface)" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {/if}
            </svg>
            {#if against.length === 0}
              <ChartEmpty>Needs results with both values - log the {xMetric?.label.toLowerCase() ?? 'second value'} too</ChartEmpty>
            {/if}
          </div>
          <div class="flex justify-between pt-0.5 text-caption leading-none text-content-subtle/70 tabular-nums">
            {#if against.length > 0}
              <span>{fmt(xBounds.lo)}</span>
              <span>{xMetric?.label} ({xMetric?.unit})</span>
              <span>{fmt(xBounds.hi)}</span>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
