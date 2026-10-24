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
  import { formatDay } from '../../lib/dateUtils';
  import { isTapPointer } from '../../lib/analytics/chartTips.svelte';
  import { TapTracker } from '../../lib/analytics/columnPicker.svelte';

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

  // --- Readout: the hovered or tapped day, shown in a line above the chart (like Recovery Trends above) rather than a floating tip,
  // so it never has to fit beside a finger.
  let selected = $state<number | null>(null);
  let plotEl = $state<HTMLElement | null>(null);
  function dayAt(event: PointerEvent): number | null {
    if (!plotEl) return null;
    const rect = plotEl.getBoundingClientRect();
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
  /** Arrow keys walk the days from the latest, Home and End jump, Escape clears. */
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { selected = null; return; }
    const from = selected ?? drawnLast;
    const next = event.key === 'ArrowLeft' ? from - 1 : event.key === 'ArrowRight' ? from + 1 : event.key === 'Home' ? firstDay : event.key === 'End' ? drawnLast : null;
    if (next === null) return;
    event.preventDefault();
    selected = Math.max(firstDay, Math.min(drawnLast, next));
  }
  $effect(() => {
    const onDown = (event: PointerEvent) => {
      if (plotEl && !plotEl.contains(event.target as Node)) selected = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });
  // A measure with other days (or none) in its window starts clean.
  $effect(() => { void measure?.id; void firstDay; void lastDay; selected = null; });
  const picked = $derived(selected === null ? null : lines.map((l) => ({ line: l, day: l.days[selected! - firstDay] })));

  const fmt = (v: number | undefined) => (v === undefined ? '–' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (Math.round(v * 10) / 10).toString());
  const POSITION_WORDS: Record<string, string> = { above: 'above your usual range', below: 'below your usual range', within: 'within your usual range' };
</script>

<div id="section-wellness" class="scroll-mt-4 card space-y-3">
  <div class="min-w-0">
    <h3 class="text-section uppercase text-content-muted">Wellness</h3>
    <p class="text-caption text-content-subtle mt-0.5">From your watch, with the 7-day average as a line and your usual range (28-day baseline ± 1 SD) shaded.</p>
  </div>

  {#if !measure}
    <p class="text-caption text-content-subtle italic">No watch data in this window yet. Import a Garmin export under Settings → Data &amp; connections → Import activities.</p>
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

    <!-- The tapped or hovered day, in words: its date and, per line, the reading, its 7-day average and your usual range. -->
    <div class="min-h-[1.25rem] flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-caption tabular-nums" aria-live="polite">
      {#if picked && selected !== null}
        <span class="text-content-muted">{formatDay(dayIndexToIso(selected), { weekday: 'short', year: true })}</span>
        {#each picked as { line, day } (line.id)}
          <span>
            <span class="inline-block w-2 h-2 rounded-full align-middle mr-1" style="background: var(--color-series-{line.colorSlot})"></span>
            <span class="text-content">{fmt(day?.value)}{day?.value !== undefined && measure.unit ? ` ${measure.unit}` : ''}</span>
            {#if day?.avg !== undefined}<span class="text-content-subtle"> · 7-day {fmt(day.avg)}</span>{/if}
            {#if day?.baseline !== undefined && day.sd !== undefined}<span class="text-content-subtle"> · usual {fmt(day.baseline - day.sd)}–{fmt(day.baseline + day.sd)}</span>{/if}
          </span>
        {/each}
      {:else}
        <span class="text-content-subtle">Hover or tap a day to see its values.</span>
      {/if}
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={plotEl}
      class="relative cursor-crosshair select-none"
      role="application"
      tabindex="0"
      aria-label="{measure.label} by day. Left and right arrow keys move between days; the line above gives the values."
      onkeydown={onKey}
      onpointerdown={taps.down}
      onpointermove={onMove}
      onpointerleave={(e) => { if (!isTapPointer(e)) selected = null; }}
      onpointerup={onTap}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full h-40 overflow-visible" role="img" aria-label="{measure.label} over the window">
        {#each lines as l, i (l.id)}
          {#if i === 0}<path d={bandPath(l.days)} fill="var(--color-series-{l.colorSlot})" opacity="0.12" />{/if}
          <path d={dotPath(l.days)} fill="none" stroke="var(--color-series-{l.colorSlot})" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.4" />
          <path d={avgPath(l.days)} fill="none" stroke="var(--color-series-{l.colorSlot})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        {/each}
      </svg>
      {#if selected !== null}
        <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: {x(selected)}%"></div>
      {/if}
    </div>
    <div class="flex justify-between text-caption text-content-subtle tabular-nums">
      <span>{fmt(bounds.min)} – {fmt(bounds.max)}{measure.unit ? ` ${measure.unit}` : ''}</span>
      <span>{formatDay(dayIndexToIso(firstDay), { year: true })} → {formatDay(dayIndexToIso(drawnLast), { year: true })}</span>
    </div>
  {/if}
</div>
