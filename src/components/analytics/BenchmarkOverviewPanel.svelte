<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  /**
   * Benchmark overview: every benchmark's results in the window as % change
   * from its first result ever, on one axis - kilos, seconds and reps side
   * by side, so which qualities are moving (and which have stalled) reads
   * at a glance. Maths in `benchmarkChanges` (`lib/analytics/progress.ts`).
   */
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import type { BenchmarkChangeSeries } from '../../lib/analytics/progress';
  import ChartEmpty from './ChartEmpty.svelte';
  import { formatDay } from '../../lib/dateUtils';
  import { isTapPointer } from '../../lib/analytics/chartTips.svelte';
  import { TapTracker } from '../../lib/analytics/columnPicker.svelte';

  let { series, firstDay, lastDay }: { series: BenchmarkChangeSeries[]; firstDay: number; lastDay: number } = $props();

  const PALETTE = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)', 'var(--color-series-5)', 'var(--color-series-6)'];
  /** Past the sixth line the colours repeat, so the repeats are dashed. */
  const dashOf = (i: number) => (i >= PALETTE.length ? '5 3' : undefined);
  const colored = $derived(series.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length], latest: s.points[s.points.length - 1] })));

  const dayCount = $derived(Math.max(lastDay - firstDay + 1, 1));
  const xOf = (day: number) => ((day - firstDay + 0.5) / dayCount) * 100;
  const bounds = $derived.by(() => {
    const pcts = series.flatMap((s) => s.points.map((p) => p.pct));
    const hi = Math.max(10, ...pcts);
    const lo = Math.min(0, ...pcts);
    const pad = (hi - lo) * 0.1;
    return { hi: hi + pad, lo: lo - (lo < 0 ? pad : 0) };
  });
  const yOf = (pct: number) => 100 - ((pct - bounds.lo) / (bounds.hi - bounds.lo)) * 100;

  let selected = $state<string | null>(null);
  const days = $derived(Array.from({ length: dayCount }, (_, i) => firstDay + i));
  const axisStep = $derived(sparseLabelStep(dayCount, 4));
  const fmtDay = (day: number) => formatDay(dayIndexToIso(day));
  /** One point sitting on the baseline is the first test itself - nothing to compare yet. */
  const firstOnly = (s: { points: { pct: number }[] }) => s.points.length === 1 && s.points[0].pct === 0;
  const allFirst = $derived(colored.length > 0 && colored.every(firstOnly));
  // --- Readout: the result nearest to the pointer (hover on a mouse, a tap on touch), printed above the chart.
  let plotEl = $state<HTMLElement | null>(null);
  let hit = $state<{ typeKey: string; i: number } | null>(null);
  const taps = new TapTracker();
  /** Nearest result to the pointer, by distance on the plot (both axes as a share of their length). Only the highlighted test's, when one is. */
  function nearest(event: PointerEvent) {
    if (!plotEl) return null;
    const rect = plotEl.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    let best: { typeKey: string; i: number } | null = null;
    let bestD = Infinity;
    for (const s of colored) {
      if (selected && selected !== s.typeKey) continue;
      for (let i = 0; i < s.points.length; i++) {
        const d = Math.hypot(xOf(s.points[i].day) - px, (yOf(s.points[i].pct) - py) * 0.6);
        if (d < bestD) { bestD = d; best = { typeKey: s.typeKey, i }; }
      }
    }
    return best;
  }
  const readout = $derived.by(() => {
    if (!hit) return null;
    const s = colored.find((c) => c.typeKey === hit!.typeKey);
    const p = s?.points[hit.i];
    return s && p ? { s, p } : null;
  });
  $effect(() => {
    const onDown = (event: PointerEvent) => {
      if (plotEl && !plotEl.contains(event.target as Node)) hit = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });
  $effect(() => { void series; void firstDay; void lastDay; hit = null; });
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { hit = null; return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const s = colored.find((c) => c.typeKey === (hit?.typeKey ?? selected)) ?? colored.find((c) => c.points.length > 0);
    if (!s || s.points.length === 0) return;
    event.preventDefault();
    const from = hit && hit.typeKey === s.typeKey ? hit.i : s.points.length - 1;
    hit = { typeKey: s.typeKey, i: Math.max(0, Math.min(s.points.length - 1, from + (event.key === 'ArrowRight' ? 1 : -1))) };
  }
  const signed = (pct: number) => `${pct >= 0 ? '+' : '−'}${Math.abs(Math.round(pct))}%`;
</script>

<div id="section-benchmarkOverview" class="scroll-mt-4 card space-y-3">
  <div>
    <h3 class="text-section uppercase text-content-muted flex items-center gap-1.5">All tests <InfoButton term="tests" /></h3>
    <p class="text-caption text-content-subtle mt-0.5">% change since the first result of each test</p>
  </div>

    {#if allFirst}<p class="text-caption text-content-subtle">Test again to see how each one changes - the chart compares against the first result.</p>{/if}
    <div class="flex flex-wrap gap-x-3 gap-y-1 min-h-[1.25rem]">
      {#each colored as s (s.typeKey)}
        <button
          onclick={() => (selected = selected === s.typeKey ? null : s.typeKey)}
          aria-pressed={selected === s.typeKey} class="chip transition-opacity {selected && selected !== s.typeKey ? 'opacity-40' : ''}"
        >
          <span class="w-2 h-2 rounded-full" style="background: {s.color}"></span>
          <span class="text-content-muted">{s.name}</span>
          <span class="text-content tabular-nums">{firstOnly(s) ? 'first test' : signed(s.latest.pct)}</span>
        </button>
      {/each}
    </div>

    <div class="min-h-[1.25rem] text-caption tabular-nums text-content-muted" aria-live="polite">
      {#if readout}
        <span class="inline-block w-2 h-2 rounded-full align-middle mr-1" style="background: {readout.s.color}"></span>
        <span class="text-content">{readout.s.name}</span>
        · <span class="text-content-subtle">{fmtDay(readout.p.day)}</span>
        · <span class="text-content">{firstOnly(readout.s) ? 'first test' : signed(readout.p.pct)}</span>
        <span class="text-content-subtle"> (result {Math.round(readout.p.value * 100) / 100})</span>
      {:else if colored.length > 0}
        <span class="text-content-subtle">Hover or tap a result to see it.</span>
      {/if}
    </div>

    <div class="flex gap-2">
      <!-- The scale is labelled at the top, at 0 (the dashed line: no change since the first result) and at the bottom. -->
      <div class="w-10 shrink-0 h-36 relative text-caption leading-none text-content-subtle tabular-nums">
        {#if colored.length > 0}
          <span class="absolute right-0 top-0">{signed(bounds.hi)}</span>
          <span class="absolute right-0 -translate-y-1/2 text-content" style="top: {yOf(0)}%">0%</span>
          {#if bounds.lo < 0}<span class="absolute right-0 bottom-0">{signed(bounds.lo)}</span>{/if}
        {/if}
      </div>
      <div class="flex-1 min-w-0">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div
          bind:this={plotEl}
          class="h-36 relative cursor-crosshair select-none"
          role="application"
          tabindex="0"
          aria-label="All tests, change since the first result. Left and right arrow keys move between results; the line above gives the values."
          onkeydown={onKey}
          onpointerdown={taps.down}
          onpointermove={(e) => { if (!isTapPointer(e)) hit = nearest(e); }}
          onpointerleave={(e) => { if (!isTapPointer(e)) hit = null; }}
          onpointerup={(e) => { if (isTapPointer(e) && taps.isTap(e)) hit = nearest(e); }}
        >
          <div class="absolute inset-x-0 border-t border-dashed border-content-subtle/30" style="top: {yOf(0)}%"></div>
          <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
            {#each colored as s (s.typeKey)}
              {@const faded = selected && selected !== s.typeKey}
              {#if s.points.length > 1}
                <path d="M {s.points.map((p) => `${xOf(p.day)},${yOf(p.pct)}`).join(' L ')}" fill="none" stroke={s.color} stroke-dasharray={dashOf(colored.indexOf(s))} stroke-opacity={faded ? 0.2 : 1} stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              {/if}
              <path d={s.points.map((p) => `M ${xOf(p.day)},${yOf(p.pct)} h 0`).join(' ')} stroke={s.color} stroke-opacity={faded ? 0.2 : 1} stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke" fill="none" />
            {/each}
            {#if readout}
              <path d="M {xOf(readout.p.day)},{yOf(readout.p.pct)} h 0" stroke={readout.s.color} stroke-width="11" stroke-linecap="round" stroke-opacity="0.3" vector-effect="non-scaling-stroke" fill="none" />
            {/if}
          </svg>
          {#if readout}
            <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {xOf(readout.p.day)}%"></div>
          {/if}
          {#if colored.length === 0}<ChartEmpty>No test results in this window</ChartEmpty>{/if}
        </div>
        <div class="border-t border-border-strong/60"></div>
        <div class="relative h-4">
          {#each days as day, i}
            {#if showsLabel(i, days.length, axisStep)}
              <span
                class="absolute top-0 text-caption leading-tight text-content-subtle whitespace-nowrap"
                style="left: {xOf(day)}%; transform: translateX({i === 0 ? '0' : i === days.length - 1 ? '-100%' : '-50%'});"
              >{fmtDay(day)}</span>
            {/if}
          {/each}
        </div>
      </div>
    </div>
</div>
