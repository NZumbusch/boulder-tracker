<script lang="ts">
  /**
   * Wellness: the measures only a watch gives (Body Battery, stress, steps,
   * breathing rate, VO2max) day by day over the Analytics window, each with
   * its 7-day average and your own normal range (the 28-day baseline ± 1 SD,
   * shaded). Imported from a Garmin export (Settings → Data & connections).
   * The maths is `lib/analytics/recoverySeries.ts` and `wellnessSeries.ts`.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { dayIndexToIso, type RecoveryDay } from '../../lib/analytics/recoverySeries';
  import { measuresWithData, summariseSeries, type WellnessMeasure } from '../../lib/analytics/wellnessSeries';
  import Segmented from '../ui/Segmented.svelte';
  import ChartEmpty from './ChartEmpty.svelte';
  import { formatDay } from '../../lib/dateUtils';

  let { firstDay, lastDay, today }: { firstDay: number; lastDay: number; today: number } = $props();

  const drawnLast = $derived(Math.min(lastDay, today));
  const available = $derived(drawnLast >= firstDay ? measuresWithData(trainingState.readingsModel, firstDay, drawnLast) : []);
  let pickedId = $state<string | null>(null);
  const measure = $derived<WellnessMeasure | undefined>(available.find((m) => m.id === pickedId) ?? available[0]);

  const dayCount = $derived(Math.max(drawnLast - firstDay + 1, 1));
  const x = (day: number) => ((day - firstDay + 0.5) / dayCount) * 100;

  const lines = $derived(
    measure
      ? measure.series.map((s) => ({
          ...s,
          days: trainingState.readingsModel.recoveryRange({ id: s.id, higherIsBetter: measure.higherIsBetter ?? true }, firstDay, drawnLast),
        }))
      : [],
  );

  // One shared vertical scale over every value, average and normal-range edge drawn.
  const bounds = $derived.by(() => {
    const vals: number[] = [];
    for (const l of lines) for (const d of l.days) {
      if (d.value !== undefined) vals.push(d.value);
      if (d.avg !== undefined) vals.push(d.avg);
      if (d.baseline !== undefined && d.sd !== undefined) vals.push(d.baseline - d.sd, d.baseline + d.sd);
    }
    if (vals.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min || Math.abs(max) || 1) * 0.08;
    // Nothing here is ever negative, so the axis doesn't pad below zero.
    return { min: min >= 0 ? Math.max(0, min - pad) : min - pad, max: max + pad };
  });
  const y = (v: number) => 100 - ((v - bounds.min) / (bounds.max - bounds.min)) * 100;

  type Pt = { x: number; y: number } | null;
  function path(points: Pt[]): string {
    const runs: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    for (const p of points) {
      if (!p) { if (run.length > 1) runs.push(run); run = []; } else run.push(p);
    }
    if (run.length > 1) runs.push(run);
    return runs.map((r) => `M ${r.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ')}`).join(' ');
  }
  const avgPath = (days: RecoveryDay[]) => path(days.map((d) => (d.avg === undefined ? null : { x: x(d.day), y: y(d.avg) })));
  const dotPath = (days: RecoveryDay[]) => days.filter((d) => d.value !== undefined).map((d) => `M ${x(d.day).toFixed(2)},${y(d.value!).toFixed(2)} h 0`).join(' ');
  function bandPath(days: RecoveryDay[]): string {
    const ok = days.filter((d) => d.baseline !== undefined && d.sd !== undefined);
    if (ok.length < 2) return '';
    const top = ok.map((d) => `${x(d.day).toFixed(2)},${y(d.baseline! + d.sd!).toFixed(2)}`);
    const bottom = ok.map((d) => `${x(d.day).toFixed(2)},${y(d.baseline! - d.sd!).toFixed(2)}`).reverse();
    return `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`;
  }

  const fmt = (v: number | undefined) => (v === undefined ? '–' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (Math.round(v * 10) / 10).toString());
  const POSITION_WORDS: Record<string, string> = { above: 'above your usual range', below: 'below your usual range', within: 'within your usual range' };
</script>

<div id="section-wellness" class="scroll-mt-4 card space-y-3">
  <div class="min-w-0">
    <h3 class="text-section uppercase text-content-muted">Wellness</h3>
    <p class="text-caption text-content-subtle mt-0.5">From your watch, with the 7-day average as a line and your usual range (28-day baseline ± 1 SD) shaded.</p>
  </div>

  {#if !measure}
    <ChartEmpty>No watch data in this window yet. Import a Garmin export under Settings → Data &amp; connections → Import activities.</ChartEmpty>
  {:else}
    {#if available.length > 1}
      <Segmented label="Measure" options={available.map((m) => ({ value: m.id, label: m.label }))} value={measure.id} onChange={(v) => (pickedId = v)} />
    {/if}

    <div class="space-y-1">
      {#each lines as l (l.id)}
        {@const s = summariseSeries(l.days)}
        <p class="text-caption tabular-nums">
          <span class="inline-block w-2 h-2 rounded-full align-middle mr-1.5" style="background: var(--color-series-{l.colorSlot})"></span>
          <span class="text-content-muted">{l.label}</span>
          {#if s.latest}
            <span class="text-content font-semibold"> {fmt(s.latest.value)}{measure.unit ? ` ${measure.unit}` : ''}</span>
            <span class="text-content-subtle"> on {formatDay(s.latest.date)}</span>
          {/if}
          {#if s.avg !== undefined}<span class="text-content-subtle"> · 7-day average {fmt(s.avg)}{s.position ? `, ${POSITION_WORDS[s.position]}` : ''}</span>{/if}
          {#if s.range}<span class="text-content-subtle"> ({fmt(s.range.low)}–{fmt(s.range.high)})</span>{/if}
        </p>
      {/each}
    </div>

    <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full h-40 overflow-visible" role="img" aria-label="{measure.label} over the window">
      {#each lines as l, i (l.id)}
        {#if i === 0}<path d={bandPath(l.days)} fill="var(--color-series-{l.colorSlot})" opacity="0.12" />{/if}
        <path d={dotPath(l.days)} fill="none" stroke="var(--color-series-{l.colorSlot})" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.4" />
        <path d={avgPath(l.days)} fill="none" stroke="var(--color-series-{l.colorSlot})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      {/each}
    </svg>
    <div class="flex justify-between text-caption text-content-subtle tabular-nums">
      <span>{fmt(bounds.min)} – {fmt(bounds.max)}{measure.unit ? ` ${measure.unit}` : ''}</span>
      <span>{formatDay(dayIndexToIso(firstDay), { year: true })} → {formatDay(dayIndexToIso(drawnLast), { year: true })}</span>
    </div>
  {/if}
</div>
