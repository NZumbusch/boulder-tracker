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
  // Hover is mouse-only: on touch, an emulated hover would select the cell
  // just before the tap's click toggled it off again.
  import { isTapPointer, isKeyboardActivation } from '../../lib/analytics/chartTips.svelte';

  let { endDay, today }: { endDay: number; today: number } = $props();

  const lastDay = $derived(Math.min(endDay, today));
  const grid = $derived(heatmap(dailyLoadByDay(trainingState.workouts), lastDay));
  // Half a year by default: a year's 53 columns leave ~5 px cells on a phone, too small to read or tap.
  let wholeYear = $state(false);
  const shown = $derived(wholeYear ? grid : grid.slice(-26));
  const trainingDays = $derived(shown.flat().filter((d) => d.load > 0 && d.day <= lastDay).length);

  const LEVEL_CLASS = ['bg-surface-elevated', 'bg-primary/25', 'bg-primary/45', 'bg-primary/70', 'bg-primary'];

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
  const selectedInfo = $derived.by(() => {
    if (selected === null) return null;
    const day = selected;
    const sessions = trainingState.workouts.filter((w) => w.status === 'completed' && w.date && toUtcDayIndex(w.date) === day);
    const load = sessions.reduce((s, w) => s + (w.loadFactor || 0), 0);
    return {
      date: new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      sessions: sessions.map((w) => w.notes || 'Session'),
      load,
    };
  });
</script>

<div id="section-heatmap" class="scroll-mt-4 card space-y-3">
  <div class="flex items-start justify-between gap-3">
   <div>
    <h3 class="text-section uppercase text-content-muted">Training Calendar</h3>
    <p class="text-caption text-content-subtle mt-0.5">{trainingDays} training days in the {wholeYear ? 'year' : 'six months'} to {new Date(`${dayIndexToIso(lastDay)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
   </div>
   <div class="seg shrink-0" role="group" aria-label="Calendar length">
     <button class="seg-item px-2 py-1 text-caption {!wholeYear ? 'bg-primary text-white' : ''}" aria-pressed={!wholeYear} onclick={() => (wholeYear = false)}>6 mo</button>
     <button class="seg-item px-2 py-1 text-caption {wholeYear ? 'bg-primary text-white' : ''}" aria-pressed={wholeYear} onclick={() => (wholeYear = true)}>Year</button>
   </div>
  </div>

  <div class="space-y-1" data-no-swipe>
    <div class="flex gap-[2px]">
      {#each monthLabels as label, i (i)}
        <div class="flex-1 min-w-0 relative h-3">
          {#if label}<span class="absolute left-0 text-[9px] leading-3 text-content-subtle/70 whitespace-nowrap">{label}</span>{/if}
        </div>
      {/each}
    </div>
    <div class="flex gap-[2px]">
      {#each shown as week, wi (wi)}
        <div class="flex-1 min-w-0 flex flex-col gap-[2px]">
          {#each week as cell (cell.day)}
            <button
              type="button"
              onpointerup={(e) => { if (isTapPointer(e)) selected = selected === cell.day ? null : cell.day; }}
              onclick={(e) => { if (isKeyboardActivation(e)) selected = selected === cell.day ? null : cell.day; }}
              onpointerenter={(e) => { if (!isTapPointer(e)) selected = cell.day; }}
              aria-label="{dayIndexToIso(cell.day)}: load {Math.round(cell.load)}"
              class="w-full aspect-square rounded-[2px] {cell.day > lastDay ? 'opacity-0 pointer-events-none' : LEVEL_CLASS[cell.level]} {selected === cell.day ? 'ring-1 ring-content' : ''}"
            ></button>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <div class="flex items-center justify-between gap-3 min-h-[1.25rem]">
    <p class="text-caption text-content-muted truncate">
      {#if selectedInfo}
        <span class="text-content-subtle">{selectedInfo.date}</span>
        · {selectedInfo.sessions.length ? `${selectedInfo.sessions.join(', ')} · ${Math.round(selectedInfo.load)}` : 'Rest'}
      {/if}
    </p>
    <div class="flex items-center gap-1 shrink-0 text-caption text-content-subtle">
      Less
      {#each LEVEL_CLASS as cls}<span class="w-2.5 h-2.5 rounded-[2px] {cls}"></span>{/each}
      More
    </div>
  </div>
</div>
