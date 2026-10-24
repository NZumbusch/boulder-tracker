<script lang="ts">
  /**
   * Training calendar: a year of days, shaded by that day's load (quartiles
   * of the training days shown), ending with the week the Analytics window
   * ends in. Consistency and rest patterns at a glance; tap a day for its
   * sessions.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { heatmap } from '../../lib/analytics/proMetrics';
  import { dailyLoadByDay, dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { toUtcDayIndex } from '../../lib/dateUtils';
  import { isTapPointer } from '../../lib/analytics/chartTips.svelte';
  import { formatDay } from '../../lib/dateUtils';
  import Segmented from '../ui/Segmented.svelte';
  import ChartEmpty from './ChartEmpty.svelte';

  let { endDay, today }: { endDay: number; today: number } = $props();

  const lastDay = $derived(Math.min(endDay, today));
  const grid = $derived(heatmap(dailyLoadByDay(trainingState.workoutsForLoad), lastDay));
  // Half a year by default: a year's 53 columns leave ~5 px cells on a phone, too small to read or tap.
  let wholeYear = $state(false);
  const shown = $derived(wholeYear ? grid : grid.slice(-26));
  const trainingDays = $derived(shown.flat().filter((d) => d.load > 0 && d.day <= lastDay).length);

  // Load is data, so the cells take the load series colour (src/series.css), not the action colour.
  const LEVEL_CLASS = ['bg-surface-elevated', 'bg-series-1/25', 'bg-series-1/45', 'bg-series-1/70', 'bg-series-1'];

  /**
   * A month label over the first column of each month. The first column's
   * month is only labelled if it has room before the next label.
   */
  const monthLabels = $derived.by(() => {
    const labels = shown.map((week, i) => {
      const d = new Date(week[0].day * 86400000);
      const prev = i > 0 ? new Date(shown[i - 1][0].day * 86400000) : null;
      return !prev || prev.getUTCMonth() !== d.getUTCMonth()
        ? d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }).slice(0, 3)
        : '';
    });
    const next = labels.findIndex((l, i) => i > 0 && l);
    if (next !== -1 && next < 3) labels[0] = '';
    return labels;
  });

  let selected = $state<number | null>(null);
  let gridEl = $state<HTMLElement | null>(null);
  const firstShown = $derived(shown[0]?.[0].day ?? 0);

  /** The cell under a pointer: the grid is one widget, so a finger dragged across it reads day after day. */
  function cellAt(e: PointerEvent): number | null {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-day]') as HTMLElement | null;
    if (!el || !gridEl?.contains(el)) return null;
    const day = Number(el.dataset.day);
    return day > lastDay ? null : day;
  }
  function onPointer(e: PointerEvent) {
    // Hover only selects for a mouse; touch and pen select on a press or drag.
    if (!isTapPointer(e) || e.buttons > 0 || e.type === 'pointerdown') {
      const day = cellAt(e);
      if (day !== null) selected = e.type === 'pointerdown' && selected === day ? null : day;
    }
  }
  /** Arrow keys: left/right a week, up/down a day; Home/End the ends; Escape clears. */
  function onKey(e: KeyboardEvent) {
    const step = e.key === 'ArrowLeft' ? -7 : e.key === 'ArrowRight' ? 7 : e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (e.key === 'Escape') { selected = null; return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); selected = e.key === 'Home' ? firstShown : lastDay; return; }
    if (!step) return;
    e.preventDefault();
    selected = Math.max(firstShown, Math.min(lastDay, (selected ?? lastDay + (step > 0 ? 0 : 0)) + (selected === null ? 0 : step)));
  }
  /** What the shades stand for: the training days' loads in quarters (see `heatmap`). */
  const cuts = $derived.by(() => {
    const top = [0, 0, 0, 0, 0];
    for (const d of shown.flat()) if (d.day <= lastDay && d.load > top[d.level]) top[d.level] = d.load;
    return top;
  });
  const selectedInfo = $derived.by(() => {
    if (selected === null) return null;
    const day = selected;
    const sessions = trainingState.workouts.filter((w) => w.status === 'completed' && w.date && toUtcDayIndex(w.date) === day);
    const load = sessions.reduce((s, w) => s + (w.loadFactor || 0), 0);
    return {
      date: formatDay(dayIndexToIso(day), { weekday: 'short' }),
      sessions: sessions.map((w) => w.notes || 'Session'),
      load,
    };
  });
</script>

<div id="section-heatmap" class="scroll-mt-4 card space-y-3">
  <div class="flex items-start justify-between gap-3">
   <div>
    <h3 class="text-section uppercase text-content-muted">Training Days</h3>
    <p class="text-caption text-content-subtle mt-0.5">{trainingDays} training day{trainingDays === 1 ? '' : 's'} · last {wholeYear ? 'year' : '6 months'}, whatever range is chosen above</p>
   </div>
   <Segmented label="Calendar length" options={[{ value: 'half', label: '6M' }, { value: 'year', label: '1Y' }]} value={wholeYear ? 'year' : 'half'} onChange={(v) => (wholeYear = v === 'year')} />
  </div>

  <div class="space-y-1" data-no-swipe>
    <div class="flex gap-[2px]">
      <div class="w-4 shrink-0"></div>
      {#each monthLabels as label, i (i)}
        <div class="flex-1 min-w-0 relative h-4">
          {#if label}<span class="absolute left-0 text-micro leading-4 text-content-subtle whitespace-nowrap">{label}</span>{/if}
        </div>
      {/each}
    </div>
    <!-- One widget: arrow keys walk the days, a finger dragged across reads them. The cells are not focusable. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={gridEl}
      class="flex gap-[2px] relative select-none touch-pan-y"
      role="application"
      tabindex="0"
      aria-label="Training days, one square per day, a column per week. Arrow keys move between days: left and right by a week, up and down by a day."
      onkeydown={onKey}
      onpointerdown={onPointer}
      onpointermove={onPointer}
    >
      <div class="w-4 shrink-0 flex flex-col gap-[2px]" aria-hidden="true">
        {#each ['M', '', 'W', '', 'F', '', ''] as d}<span class="flex-1 text-micro leading-none text-content-subtle flex items-center">{d}</span>{/each}
      </div>
      {#each shown as week, wi (wi)}
        <div class="flex-1 min-w-0 flex flex-col gap-[2px]" aria-hidden="true">
          {#each week as cell (cell.day)}
            <div
              data-day={cell.day}
              class="w-full aspect-square rounded-[2px] {cell.day > lastDay ? 'opacity-0 pointer-events-none' : LEVEL_CLASS[cell.level]} {selected === cell.day ? 'ring-1 ring-content' : ''}"
            ></div>
          {/each}
        </div>
      {/each}
      {#if trainingDays === 0}<ChartEmpty>No training days yet</ChartEmpty>{/if}
    </div>
  </div>

  <div class="min-h-[1.25rem]" aria-live="polite">
    <p class="text-caption text-content-muted">
      {#if selectedInfo}
        <span class="text-content-subtle">{selectedInfo.date}</span>
        · {selectedInfo.sessions.length ? `${selectedInfo.sessions.join(', ')} · ${Math.round(selectedInfo.load)} load` : 'Rest'}
      {:else}
        <span class="text-content-subtle">Tap or drag across the squares for a day</span>
      {/if}
    </p>
  </div>
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-content-subtle">
    <span class="flex items-center gap-1">Less {#each LEVEL_CLASS as cls}<span class="w-3 h-3 rounded-[2px] {cls}"></span>{/each} More</span>
    {#if trainingDays > 0}<span>Shades are quarters of your training days: lightest up to {Math.round(cuts[1])}, darkest above {Math.round(cuts[3])}</span>{/if}
  </div>
</div>
