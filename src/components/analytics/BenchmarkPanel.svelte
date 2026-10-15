<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  /**
   * Test progress: one test's results in the Analytics window.
   *
   * Everything a test records is kept; this decides what to look at. A test is
   * picked from chips, then a view of it: everything, "like your latest" (the
   * usual set-up fields match the latest result, so like is compared with
   * like), or a saved one. "Adjust" opens the controls - what to plot (over
   * time, or one metric against another), which results count (a filter per
   * field: none, one value, a range), one line per value of a field, and
   * every result or the best/average per week, month or value (the curve of
   * best reps at each weight). A view can be saved with the test and shown on
   * Home. Maths in `lib/benchmarks/{views,explore,series}.ts`; tap or hover a
   * point for its readout.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { isTapPointer } from '../../lib/analytics/chartTips.svelte';
  import { TapTracker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { toUtcDayIndex } from '../../lib/dateUtils';
  import { generateId } from '../../lib/utils';
  import type { BenchmarkView } from '../../lib/types';
  import { bodyweightsOf, isImprovement, metricsOf } from '../../lib/benchmarks/series';
  import { detailsText, resolveFields } from '../../lib/benchmarks/model';
  import { explore, type ExPoint } from '../../lib/benchmarks/explore';
  import { ALL_VIEW_ID, LATEST_VIEW_ID, filtersText, likeLatestView, sameView } from '../../lib/benchmarks/views';
  import { resultsOf } from '../../lib/benchmarks/testSlot';
  import ChartEmpty from './ChartEmpty.svelte';
  import BenchmarkViewControls from './BenchmarkViewControls.svelte';

  // `tips` is accepted for a uniform panel API; this chart uses its own readout line instead.
  let { firstDay, lastDay }: {
    tips?: ChartTips;
    /** The Analytics window, as day indices - only results inside it are drawn. */
    firstDay: number;
    lastDay: number;
  } = $props();

  /** One colour per line when a view draws several. */
  const PALETTE = ['var(--color-primary)', 'var(--color-tertiary)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', 'var(--color-status-neutral)'];
  const COLOR_B = 'var(--color-tertiary)';

  let selectedTypeId = $state<string>('');
  let selectedViewId = $state<string>('');
  let adjusting = $state(false);
  let draft = $state<BenchmarkView>({ id: ALL_VIEW_ID, name: 'Everything' });
  let draftFor = '';
  let naming = $state(false);
  let nameText = $state('');

  const weight = $derived(trainingState.units.weight);
  const types = $derived(trainingState.benchmarkTypes.filter((t) => !t.archived));
  const bodyweights = $derived(bodyweightsOf(trainingState.dailyMetrics));
  const inWindow = (date: string) => {
    const day = toUtcDayIndex(date);
    return day >= firstDay && day <= lastDay;
  };
  const typesWithResults = $derived(new Set(trainingState.benchmarks.filter((b) => inWindow(b.date)).map((b) => b.typeId)));
  /** The chosen test, else the first with results in the window, else the first. */
  const typeId = $derived(
    types.find((t) => t.id === selectedTypeId)?.id ?? types.find((t) => typesWithResults.has(t.id))?.id ?? types[0]?.id ?? '',
  );
  const type = $derived(types.find((t) => t.id === typeId));
  const fields = $derived(type ? resolveFields(type, trainingState.valueDefs) : []);
  const allResults = $derived(type ? resultsOf(trainingState.benchmarks, type.id) : []);
  const metrics = $derived(type ? metricsOf(type, fields, weight) : []);

  // --- The views on offer: everything, like the latest, the saved ones ---
  const saved = $derived(type?.views ?? []);
  const hasSetup = $derived(fields.some((f) => f.role === 'condition' && f.fixed === undefined));
  const latestView = $derived(likeLatestView(fields, allResults[0]));
  const everything: BenchmarkView = { id: ALL_VIEW_ID, name: 'Everything' };
  const offered = $derived<BenchmarkView[]>([...(hasSetup ? [latestView] : []), everything, ...saved]);
  /** The chosen view, else the first saved one, else like-the-latest, else everything. */
  const base = $derived(offered.find((v) => v.id === selectedViewId) ?? saved[0] ?? (hasSetup ? latestView : everything));
  const savedBase = $derived(saved.find((v) => v.id === base.id));
  const dirty = $derived(!sameView(draft, base));

  // A new test or view starts from its own settings.
  $effect(() => {
    const key = `${typeId}|${base.id}`;
    if (key === draftFor) return;
    draftFor = key;
    draft = $state.snapshot(base) as BenchmarkView;
    naming = false;
  });
  // A latest result changes "like your latest"; follow it unless the athlete has edited.
  $effect(() => {
    if (base.id === LATEST_VIEW_ID && !dirty) draft = $state.snapshot(base) as BenchmarkView;
  });

  // --- The chart ---
  const exp = $derived(
    type
      ? explore({ type, fields, results: allResults.filter((b) => inWindow(b.date)), view: draft, weight, bodyweights })
      : { results: [], lines: [] },
  );
  const yMetric = $derived('y' in exp ? exp.y : undefined);
  const y2Metric = $derived('y2' in exp ? exp.y2 : undefined);
  const xMetric = $derived('x' in exp ? exp.x : undefined);
  const overDate = $derived(!xMetric);
  const lines = $derived(exp.lines.filter((l) => l.points.length > 0));
  const points = $derived(lines.flatMap((l, li) => l.points.map((p) => ({ ...p, li }))));

  // Min/max-padded scales: results move a few percent at a time, which a 0-based axis flattens into a straight line.
  function scale(values: number[]): { lo: number; hi: number } {
    if (values.length === 0) return { lo: 0, hi: 1 };
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.2, Math.abs(hi) * 0.05, 0.5);
    return { lo: lo - pad, hi: hi + pad };
  }
  const yBounds = $derived(scale(points.map((p) => p.y)));
  const y2Bounds = $derived(scale(points.flatMap((p) => (p.y2 !== undefined ? [p.y2] : []))));
  const xBounds = $derived(scale(points.map((p) => p.x)));
  const dayCount = $derived(Math.max(lastDay - firstDay + 1, 1));
  const xPct = (p: ExPoint) => (overDate ? ((p.day - firstDay + 0.5) / dayCount) * 100 : ((p.x - xBounds.lo) / (xBounds.hi - xBounds.lo)) * 100);
  const yPct = (v: number, b: { lo: number; hi: number }) => 100 - ((v - b.lo) / (b.hi - b.lo)) * 100;

  function pathsOf(list: ExPoint[], valueOf: (p: ExPoint) => number | undefined, b: { lo: number; hi: number }) {
    const pts = list.flatMap((p) => {
      const v = valueOf(p);
      return v === undefined ? [] : [{ x: xPct(p), y: yPct(v, b) }];
    });
    if (pts.length === 0) return { line: '', area: '', dots: '' };
    const line = pts.length > 1 ? `M ${pts.map((p) => `${p.x},${p.y}`).join(' L ')}` : '';
    const area = pts.length > 1 && overDate ? `${line} L ${pts[pts.length - 1].x},100 L ${pts[0].x},100 Z` : '';
    return { line, area, dots: pts.map((p) => `M ${p.x},${p.y} h 0`).join(' ') };
  }
  const paths = $derived(lines.map((l) => pathsOf(l.points, (p) => p.y, yBounds)));
  const paths2 = $derived(y2Metric && lines[0] ? pathsOf(lines[0].points, (p) => p.y2, y2Bounds) : undefined);
  /** A lone scatter line fades older results so the path reads in time order. */
  const fades = $derived(!overDate && lines.length === 1 && draft.agg !== 'each');

  // --- Headline: the latest value, and the change over the range when there is one line ---
  const latest = $derived(points.length ? points.reduce((a, b) => (b.day >= a.day ? b : a)) : undefined);
  const change = $derived.by(() => {
    if (!overDate || lines.length !== 1 || lines[0].points.length < 2) return undefined;
    const first = lines[0].points[0].y;
    const last = lines[0].points[lines[0].points.length - 1].y;
    return { abs: last - first, pct: first !== 0 ? ((last - first) / first) * 100 : undefined };
  });
  const gain = $derived(change && type && yMetric?.id === (fields.find((f) => f.role === 'result')?.valueId) ? isImprovement(change.abs, type) : change ? isImprovement(change.abs, {}) : undefined);

  const fmt = (v: number) => String(Number(v.toFixed(1)));
  const fmtDay = (day: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
    new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, opts);

  // --- Readout: the point nearest the pointer, or the latest ---
  let selected = $state<number | null>(null);
  const taps = new TapTracker();
  let plotEl = $state<HTMLElement | null>(null);

  function nearest(event: PointerEvent): number | null {
    if (!plotEl || points.length === 0) return null;
    const rect = plotEl.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    let best = 0;
    let bestDistance = Infinity;
    points.forEach((p, i) => {
      const dx = xPct(p) - px;
      // Over time with one line only the date matters; with several, the height tells the lines apart.
      const dy = overDate && lines.length === 1 ? 0 : yPct(p.y, yBounds) - py;
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
  // A new test or view starts without a stale selection.
  $effect(() => {
    void [typeId, base.id, JSON.stringify(draft)];
    selected = null;
  });

  const readoutPoint = $derived(selected !== null && selected < points.length ? points[selected] : latest);
  const readoutResult = $derived(readoutPoint?.result);

  const axisDays = $derived(Array.from({ length: dayCount }, (_, i) => firstDay + i));
  const axisStep = $derived(sparseLabelStep(dayCount, 4));

  // --- Saving a view ---
  async function saveViews(next: BenchmarkView[]) {
    if (type) await trainingState.saveBenchmarkViews(type.id, next);
  }
  async function saveAsNew() {
    const name = nameText.trim();
    if (!name || !type) return;
    const view: BenchmarkView = { ...($state.snapshot(draft) as BenchmarkView), id: generateId(), name };
    await saveViews([...saved, view]);
    selectedViewId = view.id;
    naming = false;
    nameText = '';
  }
  async function updateSaved() {
    if (!savedBase) return;
    const next = { ...($state.snapshot(draft) as BenchmarkView), id: savedBase.id, name: savedBase.name, ...(savedBase.onHome ? { onHome: true } : {}) };
    await saveViews(saved.map((v) => (v.id === savedBase.id ? next : v)));
  }
  async function toggleHome() {
    if (!savedBase) return;
    await saveViews(saved.map((v) => (v.id === savedBase.id ? { ...v, onHome: v.onHome ? undefined : true } : v)));
  }
  async function removeSaved() {
    if (!savedBase) return;
    await saveViews(saved.filter((v) => v.id !== savedBase.id));
    selectedViewId = '';
  }
  const hint = $derived(filtersText(draft.filters, fields, weight));

  const chip = (on: boolean, dim = false) =>
    `shrink-0 px-2.5 py-1 rounded-control border text-caption transition-colors whitespace-nowrap ${on ? 'border-primary bg-primary/15 text-content' : 'border-border text-content-subtle hover:text-content'} ${dim && !on ? 'opacity-50' : ''}`;
</script>

{#if types.length > 0}
  <div id="section-benchmarks" class="scroll-mt-4 card space-y-3">
    <div class="min-w-0">
      <h3 class="text-section uppercase text-content-muted flex items-center gap-1.5">Test progress <InfoButton term="tests" /></h3>
      <!-- "–" in an empty window, so the header keeps its height while paging. -->
      <p class="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums">
        {#if !latest || !yMetric}
          <span class="text-title text-content-subtle">–</span>
          <span class="text-caption text-content-subtle">{yMetric?.unit ?? ''}</span>
        {:else}
          <span class="text-title text-content">{fmt(latest.y)}</span>
          <span class="text-caption text-content-subtle">{yMetric.unit}</span>
          {#if change}
            <span class="text-caption font-semibold {gain === true ? 'text-status-good' : gain === false ? 'text-status-caution' : 'text-content-subtle'}">
              {change.abs > 0 ? '+' : change.abs < 0 ? '−' : '±'}{fmt(Math.abs(change.abs))}{yMetric.id === 'relative' ? ' pts' : ` ${yMetric.unit}`}{change.pct !== undefined && yMetric.id !== 'relative' ? ` (${change.pct > 0 ? '+' : ''}${Math.round(change.pct)}%)` : ''}
            </span>
            <span class="text-caption text-content-subtle">in this range</span>
          {/if}
        {/if}
      </p>
    </div>

    <!-- The test: chips that scroll sideways (and so don't page the window). Dimmed = nothing in this window. -->
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" data-no-swipe>
      {#each types as t (t.id)}
        <button onclick={() => { selectedTypeId = t.id; selectedViewId = ''; }} aria-pressed={t.id === typeId} class={chip(t.id === typeId, !typesWithResults.has(t.id))}>{t.name}</button>
      {/each}
    </div>

    <!-- How to look at it: everything, like the latest, or a saved view; Adjust opens the controls. -->
    <div class="flex items-center gap-1.5" data-no-swipe>
      <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 min-w-0 flex-1">
        {#each offered as v (v.id)}
          <button onclick={() => (selectedViewId = v.id)} aria-pressed={v.id === base.id} class={chip(v.id === base.id)}>{v.name}{#if v.onHome}<span class="text-content-subtle">&nbsp;· Home</span>{/if}</button>
        {/each}
      </div>
      <button onclick={() => (adjusting = !adjusting)} aria-expanded={adjusting} class="shrink-0 flex items-center gap-1 px-2 py-1 text-caption rounded-control {adjusting || dirty ? 'text-primary' : 'text-content-subtle hover:text-content'}">
        <Icon icon="ic:baseline-tune" class="text-base" />Adjust{#if dirty}&nbsp;·&nbsp;edited{/if}
      </button>
    </div>
    {#if hint && !adjusting}<p class="text-caption text-content-subtle px-1 -mt-1.5">Only {hint}</p>{/if}

    {#if adjusting && type}
      <BenchmarkViewControls bind:view={draft} {fields} results={allResults} {metrics} {weight} />
      <div class="flex flex-wrap items-center gap-2 text-caption" data-no-swipe>
        {#if naming}
          <input bind:value={nameText} placeholder="Name this view" aria-label="View name" class="min-w-0 flex-1 bg-surface-elevated text-content rounded-control border border-border-strong px-2 py-1 outline-none" onkeydown={(e) => { if (e.key === 'Enter') saveAsNew(); }} />
          <button onclick={saveAsNew} disabled={!nameText.trim()} class="px-2.5 py-1 rounded-control bg-primary text-white font-bold disabled:opacity-40">Save</button>
          <button onclick={() => (naming = false)} class="px-2 py-1 text-content-subtle">Cancel</button>
        {:else}
          {#if savedBase && dirty}<button onclick={updateSaved} class="px-2.5 py-1 rounded-control bg-primary text-white font-bold">Update “{savedBase.name}”</button>{/if}
          <button onclick={() => { naming = true; nameText = ''; }} class="px-2.5 py-1 rounded-control border border-border text-content-muted hover:text-content">Save as a new view</button>
          {#if savedBase}
            <button onclick={toggleHome} class="px-2.5 py-1 rounded-control border border-border text-content-muted hover:text-content">{savedBase.onHome ? 'Remove from Home' : 'Show on Home'}</button>
            <button onclick={removeSaved} class="px-2 py-1 text-danger">Delete view</button>
          {/if}
          {#if dirty}<button onclick={() => (draft = $state.snapshot(base) as BenchmarkView)} class="px-2 py-1 text-content-subtle hover:text-content">Reset</button>{/if}
        {/if}
      </div>
    {/if}

    {#if lines.length > 1}
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-caption text-content-subtle">
        {#each lines as l, i (l.key)}
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full shrink-0" style="background: {PALETTE[i % PALETTE.length]}"></span>{l.label}</span>
        {/each}
      </div>
    {:else if y2Metric}
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-caption text-content-subtle">
        <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background: {PALETTE[0]}"></span>{yMetric?.label}</span>
        <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background: {COLOR_B}"></span>{y2Metric.label}</span>
      </div>
    {/if}

    <div class="text-caption tabular-nums min-h-[1.25rem] text-content-muted">
      {#if readoutPoint && readoutResult && yMetric}
        <span class="text-content-subtle">{fmtDay(readoutPoint.day, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        · <span class="text-content">{fmt(readoutPoint.y)} {yMetric.unit}</span>
        {#if readoutPoint.y2 !== undefined && y2Metric}· <span style="color: {COLOR_B}">{fmt(readoutPoint.y2)} {y2Metric.unit}</span>{/if}
        {#if xMetric}at <span class="text-content">{fmt(readoutPoint.x)} {xMetric.unit}</span>{/if}
        {readoutPoint.n > 1 ? ` · ${draft.stat === 'average' ? 'average' : 'best'} of ${readoutPoint.n}` : ''}
        {@const more = detailsText(readoutResult, fields, weight, yMetric.id)}
        {more ? ` · ${more}` : ''}{readoutResult.notes ? ` · ${readoutResult.notes}` : ''}
      {/if}
    </div>

    <div class="flex gap-2">
      <div class="w-9 shrink-0 {overDate ? 'h-36' : 'h-40'} flex flex-col justify-between items-end text-caption leading-none tabular-nums" style="color: {lines.length > 1 || !overDate ? 'var(--color-content-subtle)' : PALETTE[0]}">
        {#if points.length > 0}
          <span>{fmt(yBounds.hi)}</span>
          <span>{fmt((yBounds.hi + yBounds.lo) / 2)}</span>
          <span>{fmt(yBounds.lo)}</span>
        {/if}
      </div>
      <div class="flex-1 min-w-0">
        <div
          bind:this={plotEl}
          class="{overDate ? 'h-36' : 'h-40 border-l border-b border-border-strong/60'} relative cursor-crosshair select-none"
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
            {#each lines as l, i (l.key)}
              {@const color = PALETTE[i % PALETTE.length]}
              {#if lines.length === 1 && !paths2 && paths[i].area}<path d={paths[i].area} fill="url(#benchmark-gradient)" />{/if}
              <path d={paths[i].line} fill="none" stroke={color} stroke-opacity={fades ? 0.4 : 1} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              {#if fades}
                {#each l.points as p, k (p.id)}
                  <path d="M {xPct(p)},{yPct(p.y, yBounds)} h 0" stroke={color} stroke-opacity={0.3 + 0.7 * ((k + 1) / l.points.length)} stroke-width={k === l.points.length - 1 ? 10 : 7} stroke-linecap="round" vector-effect="non-scaling-stroke" fill="none" />
                {/each}
              {:else}
                <path d={paths[i].dots} fill="none" stroke={color} stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {/if}
            {/each}
            {#if paths2}
              <path d={paths2.line} fill="none" stroke={COLOR_B} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              <path d={paths2.dots} fill="none" stroke={COLOR_B} stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke" />
            {/if}
            {#if readoutPoint}
              <path d="M {xPct(readoutPoint)},{yPct(readoutPoint.y, yBounds)} h 0" stroke="var(--color-surface)" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
            {/if}
          </svg>
          {#if readoutPoint && overDate}
            <div class="absolute inset-y-0 border-l border-content-subtle/30 pointer-events-none" style="left: {xPct(readoutPoint)}%"></div>
          {/if}
          {#if points.length === 0}
            <ChartEmpty>
              {yMetric?.id === 'relative'
                ? 'Needs a bodyweight logged within two weeks of a result'
                : yMetric?.id === 'estimatedMax'
                  ? 'Needs both weight and reps on a result'
                  : !overDate
                    ? `Needs results with both ${yMetric?.label.toLowerCase() ?? 'values'} and ${xMetric?.label.toLowerCase() ?? 'the second value'}`
                    : dirty || hint
                      ? 'No results match this view in this range'
                      : `No ${type?.name ?? 'test'} results in this range - try 6M or 1Y`}
            </ChartEmpty>
          {/if}
        </div>
        {#if overDate}
          <div class="border-t border-border-strong/60"></div>
          <div class="relative h-4">
            {#each axisDays as day, i}
              {#if showsLabel(i, axisDays.length, axisStep)}
                <span
                  class="absolute top-0 text-caption leading-tight text-content-subtle whitespace-nowrap"
                  style="left: {((day - firstDay + 0.5) / dayCount) * 100}%; transform: translateX({i === 0 ? '0' : i === axisDays.length - 1 ? '-100%' : '-50%'});"
                >{fmtDay(day)}</span>
              {/if}
            {/each}
          </div>
        {:else}
          <div class="flex justify-between pt-0.5 text-caption leading-none text-content-subtle tabular-nums">
            {#if points.length > 0}
              <span>{fmt(xBounds.lo)}</span>
              <span>{xMetric?.label} ({xMetric?.unit})</span>
              <span>{fmt(xBounds.hi)}</span>
            {/if}
          </div>
        {/if}
      </div>
      {#if paths2}
        <div class="w-9 shrink-0 h-36 flex flex-col justify-between items-start text-caption leading-none tabular-nums" style="color: {COLOR_B}">
          <span>{fmt(y2Bounds.hi)}</span>
          <span>{fmt((y2Bounds.hi + y2Bounds.lo) / 2)}</span>
          <span>{fmt(y2Bounds.lo)}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}
