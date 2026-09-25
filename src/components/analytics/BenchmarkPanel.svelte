<script lang="ts">
  /**
   * Benchmark Progress: one benchmark's results in the Analytics window,
   * placed by date across the window (so spacing shows how often it was
   * tested), with the change over the window as the headline.
   *
   * Benchmarks are picked from chips - types without a result in this
   * window are dimmed, not hidden. A kg benchmark can be read as % of
   * bodyweight (`relativeStrength`). Tap or hover a result for its value.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { isTapPointer } from '../../lib/analytics/chartTips.svelte';
  import { TapTracker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import { relativeStrength } from '../../lib/analytics/proMetrics';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { toUtcDayIndex } from '../../lib/dateUtils';
  import ChartEmpty from './ChartEmpty.svelte';

  // `tips` is accepted for a uniform panel API; this chart uses its own readout line instead.
  let { firstDay, lastDay }: {
    tips?: ChartTips;
    /** The Analytics window, as day indices - only results inside it are drawn. */
    firstDay: number;
    lastDay: number;
  } = $props();

  let selectedTypeId = $state<string>('');
  /** Relative strength: a kg benchmark as % of bodyweight (see `relativeStrength`). */
  let relative = $state(false);

  const types = $derived(trainingState.benchmarkTypes.filter((t) => !t.archived));
  const inWindow = (date: string) => {
    const day = toUtcDayIndex(date);
    return day >= firstDay && day <= lastDay;
  };
  const typesWithResults = $derived(new Set(trainingState.benchmarks.filter((b) => inWindow(b.date)).map((b) => b.typeId)));
  /** The chosen type, else the first with results in the window, else the first. */
  const typeId = $derived(
    types.find((t) => t.id === selectedTypeId)?.id ?? types.find((t) => typesWithResults.has(t.id))?.id ?? types[0]?.id ?? '',
  );
  const type = $derived(types.find((t) => t.id === typeId));

  const canBeRelative = $derived(type?.unit === 'kg');
  const isRelative = $derived(relative && canBeRelative);
  const valueIsAdded = $derived(!trainingState.benchmarkTotalTypeIds.includes(typeId));
  const unit = $derived(isRelative ? '% BW' : type?.unit ?? '');

  const results = $derived.by(() => {
    const ofType = trainingState.benchmarks
      .filter((b) => b.typeId === typeId && inWindow(b.date))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (isRelative) {
      return relativeStrength(ofType, trainingState.dailyMetrics, valueIsAdded).map((p) => ({
        id: p.date, day: toUtcDayIndex(p.date), value: Math.round(p.ratio * 1000) / 10, note: `${p.value} kg at ${p.bodyweight} kg`,
      }));
    }
    return ofType.map((b) => ({ id: b.id, day: toUtcDayIndex(b.date), value: b.value, note: b.notes ?? '' }));
  });

  // Min/max-padded scale: benchmarks move a few percent at a time, which a
  // 0-based axis flattens into a straight line.
  const bounds = $derived.by(() => {
    if (results.length === 0) return { lo: 0, hi: 1 };
    const values = results.map((r) => r.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.2, Math.abs(hi) * 0.05, 0.5);
    return { lo: lo - pad, hi: hi + pad };
  });
  const dayCount = $derived(Math.max(lastDay - firstDay + 1, 1));
  const xOf = (day: number) => ((day - firstDay + 0.5) / dayCount) * 100;
  const yOf = (v: number) => 100 - ((v - bounds.lo) / (bounds.hi - bounds.lo)) * 100;

  const paths = $derived.by(() => {
    const pts = results.map((r) => ({ x: xOf(r.day), y: yOf(r.value) }));
    if (pts.length === 0) return { line: '', area: '', dots: '' };
    const line = pts.length > 1 ? `M ${pts.map((p) => `${p.x},${p.y}`).join(' L ')}` : '';
    const area = pts.length > 1 ? `${line} L ${pts[pts.length - 1].x},100 L ${pts[0].x},100 Z` : '';
    return { line, area, dots: pts.map((p) => `M ${p.x},${p.y} h 0`).join(' ') };
  });

  const change = $derived.by(() => {
    if (results.length < 2) return undefined;
    const first = results[0].value;
    const last = results[results.length - 1].value;
    return { abs: last - first, pct: first !== 0 ? ((last - first) / first) * 100 : undefined };
  });
  const latest = $derived(results[results.length - 1]);

  const fmt = (v: number) => String(Number(v.toFixed(1)));
  const fmtDay = (day: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
    new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, opts);

  // Readout: the result nearest the pointer, or the latest.
  let selected = $state<number | null>(null);
  const taps = new TapTracker();
  let plotEl = $state<HTMLElement | null>(null);
  function nearest(event: PointerEvent): number | null {
    if (!plotEl || results.length === 0) return null;
    const rect = plotEl.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    let best = 0;
    results.forEach((r, i) => {
      if (Math.abs(xOf(r.day) - x) < Math.abs(xOf(results[best].day) - x)) best = i;
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
  const readout = $derived(selected !== null ? results[selected] : latest);

  const axisDays = $derived(Array.from({ length: dayCount }, (_, i) => firstDay + i));
  const axisStep = $derived(sparseLabelStep(dayCount, 4));
</script>

{#if types.length > 0}
  <div id="section-benchmarks" class="scroll-mt-4 card space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-section uppercase text-content-muted">Benchmark Progress</h3>
        <!-- "–" in an empty window, so the header keeps its height while paging. -->
        <p class="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums">
          {#if !latest}
            <span class="text-title text-content-subtle">–</span>
            <span class="text-caption text-content-subtle">{unit}</span>
          {:else}
            <span class="text-title text-content">{fmt(latest.value)}</span>
            <span class="text-caption text-content-subtle">{unit}</span>
            {#if change}
              <span class="text-caption font-semibold {change.abs > 0 ? 'text-status-good' : change.abs < 0 ? 'text-status-caution' : 'text-content-subtle'}">
                {change.abs > 0 ? '+' : change.abs < 0 ? '−' : '±'}{fmt(Math.abs(change.abs))}{isRelative ? ' pts' : ` ${unit}`}{change.pct !== undefined && !isRelative ? ` (${change.pct > 0 ? '+' : ''}${Math.round(change.pct)}%)` : ''}
              </span>
              <span class="text-caption text-content-subtle">in this range</span>
            {/if}
          {/if}
        </p>
      </div>
      {#if canBeRelative}
        <div class="flex bg-surface-elevated/50 p-0.5 rounded-control shrink-0">
          <button onclick={() => (relative = false)} class="px-2 py-0.5 text-caption rounded-control {!relative ? 'bg-surface text-content shadow-sm' : 'text-content-subtle'}">kg</button>
          <button onclick={() => (relative = true)} class="px-2 py-0.5 text-caption rounded-control {relative ? 'bg-surface text-content shadow-sm' : 'text-content-subtle'}">% BW</button>
        </div>
      {/if}
    </div>

    <!-- Benchmark picker: chips that scroll sideways (and so don't page the window). -->
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" data-no-swipe>
      {#each types as t (t.id)}
        <button
          onclick={() => (selectedTypeId = t.id)}
          aria-pressed={t.id === typeId}
          class="shrink-0 px-2.5 py-1 rounded-control border text-caption transition-colors whitespace-nowrap
            {t.id === typeId ? 'border-primary bg-primary/15 text-content' : 'border-border text-content-subtle hover:text-content'}
            {!typesWithResults.has(t.id) && t.id !== typeId ? 'opacity-50' : ''}"
        >
          {t.name}
        </button>
      {/each}
    </div>

    {#if isRelative}
      <label class="flex items-center gap-2 text-caption text-content-subtle cursor-pointer">
        <input
          type="checkbox"
          class="w-3.5 h-3.5 rounded accent-primary"
          checked={!valueIsAdded}
          onchange={(e) => {
            const others = trainingState.benchmarkTotalTypeIds.filter((id) => id !== typeId);
            trainingState.setBenchmarkTotalTypeIds(e.currentTarget.checked ? [...others, typeId] : others);
          }}
        />
        Result already includes bodyweight (otherwise it's added weight: bodyweight + result)
      </label>
    {/if}

      <div class="text-caption tabular-nums min-h-[1.25rem] text-content-muted">
        {#if readout}
          <span class="text-content-subtle">{fmtDay(readout.day, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          · <span class="text-content">{fmt(readout.value)} {unit}</span>{readout.note ? ` · ${readout.note}` : ''}
        {/if}
      </div>

      <div class="flex gap-2">
        <div class="w-9 shrink-0 h-36 flex flex-col justify-between items-end text-caption leading-none text-content-subtle/70 tabular-nums">
          {#if results.length > 0}
            <span>{fmt(bounds.hi)}</span>
            <span>{fmt((bounds.hi + bounds.lo) / 2)}</span>
            <span>{fmt(bounds.lo)}</span>
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
              <path d={paths.area} fill="url(#benchmark-gradient)" />
              <path d={paths.line} fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              <path d={paths.dots} fill="none" stroke="var(--color-primary)" stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {#if readout}
                <path d="M {xOf(readout.day)},{yOf(readout.value)} h 0" stroke="var(--color-surface)" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {/if}
            </svg>
            {#if readout}
              <div class="absolute inset-y-0 border-l border-content-subtle/30 pointer-events-none" style="left: {xOf(readout.day)}%"></div>
            {/if}
            {#if results.length === 0}
              <ChartEmpty>
                {isRelative
                  ? 'Needs a bodyweight logged within two weeks of a result'
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
                  style="left: {xOf(day)}%; transform: translateX({i === 0 ? '0' : i === axisDays.length - 1 ? '-100%' : '-50%'});"
                >{fmtDay(day)}</span>
              {/if}
            {/each}
          </div>
        </div>
      </div>
  </div>
{/if}
