<script lang="ts">
  /**
   * Benchmark overview: every benchmark's results in the window as % change
   * from its first result ever, on one axis - kilos, seconds and reps side
   * by side, so which qualities are moving (and which have stalled) reads
   * at a glance. Maths in `benchmarkChanges` (`lib/analytics/progress.ts`).
   */
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import type { BenchmarkChangeSeries } from '../../lib/analytics/progress';

  let { series, firstDay, lastDay }: { series: BenchmarkChangeSeries[]; firstDay: number; lastDay: number } = $props();

  const PALETTE = ['var(--color-primary)', 'var(--color-tertiary)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-status-risk)', 'var(--color-content-muted)'];
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
  const fmtDay = (day: number) => new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const signed = (pct: number) => `${pct >= 0 ? '+' : '−'}${Math.abs(Math.round(pct))}%`;
</script>

<div id="section-benchmarkOverview" class="scroll-mt-4 card space-y-3">
  <div>
    <h3 class="text-section uppercase text-content-muted">All Benchmarks</h3>
    <p class="text-caption text-content-subtle mt-0.5">% change since your first test of each</p>
  </div>

  {#if colored.length === 0}
    <p class="text-caption text-content-subtle italic text-center py-4">No benchmark results in this window</p>
  {:else}
    <div class="flex flex-wrap gap-x-3 gap-y-1">
      {#each colored as s (s.typeKey)}
        <button
          onclick={() => (selected = selected === s.typeKey ? null : s.typeKey)}
          class="flex items-center gap-1.5 text-caption transition-opacity {selected && selected !== s.typeKey ? 'opacity-40' : ''}"
        >
          <span class="w-2 h-2 rounded-full" style="background: {s.color}"></span>
          <span class="text-content-muted">{s.name}</span>
          <span class="text-content tabular-nums">{signed(s.latest.pct)}</span>
        </button>
      {/each}
    </div>

    <div class="flex gap-2">
      <div class="w-9 shrink-0 h-36 flex flex-col justify-between items-end text-caption leading-none text-content-subtle/70 tabular-nums">
        <span>{signed(bounds.hi)}</span>
        <span>{signed((bounds.hi + bounds.lo) / 2)}</span>
        <span>{signed(bounds.lo)}</span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="h-36 relative">
          <div class="absolute inset-x-0 border-t border-dashed border-content-subtle/30" style="top: {yOf(0)}%"></div>
          <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
            {#each colored as s (s.typeKey)}
              {@const faded = selected && selected !== s.typeKey}
              {#if s.points.length > 1}
                <path d="M {s.points.map((p) => `${xOf(p.day)},${yOf(p.pct)}`).join(' L ')}" fill="none" stroke={s.color} stroke-opacity={faded ? 0.2 : 1} stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              {/if}
              <path d={s.points.map((p) => `M ${xOf(p.day)},${yOf(p.pct)} h 0`).join(' ')} stroke={s.color} stroke-opacity={faded ? 0.2 : 1} stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke" fill="none" />
            {/each}
          </svg>
        </div>
        <div class="border-t border-border-strong/60"></div>
        <div class="relative h-4">
          {#each days as day, i}
            {#if showsLabel(i, days.length, axisStep)}
              <span
                class="absolute top-0 text-caption leading-tight text-content-subtle/70 whitespace-nowrap"
                style="left: {xOf(day)}%; transform: translateX({i === 0 ? '0' : i === days.length - 1 ? '-100%' : '-50%'});"
              >{fmtDay(day)}</span>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
