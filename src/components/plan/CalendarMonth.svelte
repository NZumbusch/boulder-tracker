<script lang="ts">
  /**
   * One month as a Monday-first grid. Full size (the Month view) shows a dot
   * per session on each day; `mini` (twelve of them make the Year view) shades
   * the day by how many there are instead. Presentational.
   */
  import { DAY_MS, type CalendarSession } from '../../lib/planning/calendarEvents';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';
  import type { PhaseMark } from '../../lib/planning/phaseStrip';
  import type { AnalyticsCategory, ExerciseTypeDef, GoalEvent } from '../../lib/types';
  import { calendarSessionColor, sessionStatus } from '../../lib/planning/sessionColors';
  import { formatDay } from '../../lib/dateUtils';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';

  let {
    year,
    month,
    byDay,
    events = new Map(),
    today,
    mini = false,
    onPickDay,
    onPickMonth,
    phases = new Map(),
    goals = new Map(),
    exerciseTypes = [],
    categories = [],
    eventColor = () => '#71717a',
    byCategory = false,
  }: {
    year: number;
    /** 0-11. */
    month: number;
    byDay: Map<number, CalendarSession[]>;
    /** Phone-calendar events: a muted dot each, after the sessions'. */
    events?: Map<number, DeviceEvent[]>;
    today: number;
    mini?: boolean;
    onPickDay: (day: number) => void;
    onPickMonth?: (month: number) => void;
    /** The phase on each day, as one line under the dates along each week row (empty = off). */
    phases?: Map<number, PhaseMark>;
    /** The trips and competitions on each day, as a bar along the top of the day (full size only). */
    goals?: Map<number, GoalEvent[]>;
    /** With the categories, they colour each session by its main category. */
    exerciseTypes?: ExerciseTypeDef[];
    categories?: AnalyticsCategory[];
    /** The colour of a phone-calendar event. */
    eventColor?: (e: DeviceEvent) => string;
    /** Sessions take their main category's colour instead of one shared colour. */
    byCategory?: boolean;
  } = $props();

  const first = $derived(Math.floor(Date.UTC(year, month, 1) / DAY_MS));
  const length = $derived(new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  /** Empty cells before the 1st: the Monday-first weekday of it. */
  const lead = $derived((((first + 3) % 7) + 7) % 7);
  const cells = $derived([...Array.from({ length: lead }, () => null), ...Array.from({ length: length }, (_, i) => first + i)]);
  /**
   * The phase line under a date: one continuous line per phase along a week
   * row (it breaks where the phase changes or the row ends), not a dash per
   * day - phases run for weeks, so the line is quiet and shows where they begin.
   */
  function phaseLine(i: number) {
    const day = cells[i];
    const mark = day === null ? undefined : phases.get(day);
    if (!mark?.color) return undefined;
    const same = (j: number) => j >= 0 && j < cells.length && Math.floor(j / 7) === Math.floor(i / 7) && cells[j] !== null && phases.get(cells[j]!)?.key === mark.key;
    return { color: mark.color, joinsPrev: same(i - 1), joinsNext: same(i + 1) };
  }
  // On a wide screen a day is roomy enough for the sessions' names instead of dots.
  let gridW = $state(0);
  const wide = $derived(!mini && gridW / 7 >= 92);
  const colorOf = (s: CalendarSession) => calendarSessionColor(s.workout, exerciseTypes, categories, byCategory, sessionStatus(s, today));
  /** The full date for a screen reader: weekday, day, month and year. */
  const dayLabel = (day: number) => formatDay(dayIndexToIso(day), { weekday: 'long', year: true });
  const monthName = $derived(new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' }));
</script>

<div>
  {#if mini}
    <button onclick={() => onPickMonth?.(month)} class="tap text-label text-content hover:text-primary transition-colors mb-1">{monthName}</button>
  {:else}
    <div class="grid grid-cols-7 mb-1">
      {#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as d}
        <span class="text-caption uppercase tracking-wide text-content-subtle text-center"><span class="min-[520px]:hidden">{d.slice(0, 1)}</span><span class="hidden min-[520px]:inline">{d}</span></span>
      {/each}
    </div>
  {/if}
  <div class="relative grid grid-cols-7 {mini ? 'gap-px' : 'gap-0.5'}">
    <!-- Measures the width only (see CalendarTimeGrid): the grid's own height changes with it. -->
    <div class="absolute inset-x-0 top-0 h-0 pointer-events-none" bind:clientWidth={gridW}></div>
    {#each cells as day, i (i)}
      {#if day === null}
        <span></span>
      {:else}
        {@const list = byDay.get(day) ?? []}
        {@const date = new Date(day * DAY_MS).getUTCDate()}
        {#if mini}
          <button
            onclick={() => onPickDay(day)}
            aria-label="{dayLabel(day)}{list.length ? `, ${list.length} session${list.length === 1 ? '' : 's'}` : ''}"
            class="aspect-square relative flex items-center justify-center text-caption leading-none tabular-nums rounded-[3px]
              {list.length === 0 ? 'text-content-subtle' : list.length === 1 ? 'bg-primary/20 text-content' : 'bg-primary/45 text-content'}
              {day === today ? 'ring-1 ring-primary font-bold' : ''}"
          >{date}
            {#if phaseLine(i)}{@const line = phaseLine(i)!}<span class="absolute bottom-0 left-0 h-0.5 {line.color} {line.joinsPrev ? '' : 'rounded-l-full'} {line.joinsNext ? '' : 'rounded-r-full'}" style="right: {line.joinsNext ? '-1px' : '0'}" aria-hidden="true"></span>{/if}
          </button>
        {:else}
          <button
            onclick={() => onPickDay(day)}
            aria-label="{dayLabel(day)}{list.length ? `, ${list.length} session${list.length === 1 ? '' : 's'}` : ''}"
            class="{wide ? 'min-h-24 items-stretch px-1 text-left' : 'h-14 items-center'} flex flex-col gap-1 pt-1.5 rounded-control hover:bg-surface/70 transition-colors relative"
          >
            {#if phaseLine(i)}{@const line = phaseLine(i)!}<span class="absolute bottom-0 left-0 h-0.5 {line.color} {line.joinsPrev ? '' : 'rounded-l-full'} {line.joinsNext ? '' : 'rounded-r-full'}" style="right: {line.joinsNext ? '-2px' : '0'}" aria-hidden="true"></span>{/if}
            {#if goals.get(day)}<span class="absolute inset-x-0 top-0 h-1 rounded-t-full {goals.get(day)?.some((g) => g.kind === 'competition') ? 'bg-warning' : 'bg-primary'}" aria-hidden="true"></span>{/if}
            <span class="text-label tabular-nums w-6 h-6 flex items-center justify-center rounded-full {wide ? 'self-start' : ''} {day === today ? 'bg-primary text-white font-bold' : 'text-content'}">{date}</span>
            {#if wide}
              <span class="flex flex-col gap-0.5 min-w-0">
                {#each list.slice(0, 3) as s (s.workout.id)}
                  <span class="relative block overflow-hidden truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight cal-ink"><span class="absolute inset-0 cal-fill {s.workout.provisional ? 'cal-soft' : ''} {colorOf(s)}"></span><span class="relative">{s.done ? '✓ ' : ''}{s.workout.notes || 'Session'}</span></span>
                {/each}
                {#each (events.get(day) ?? []).slice(0, Math.max(0, 3 - list.length)) as e, k (k)}
                  <span class="relative block overflow-hidden truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight cal-ink cal-edge" style="--cal-edge: {eventColor(e)}"><span class="absolute inset-0 cal-fill cal-soft" style="background: {eventColor(e)}"></span><span class="relative">{e.title}</span></span>
                {/each}
                {#if list.length + (events.get(day)?.length ?? 0) > 3}<span class="text-caption leading-none text-content-subtle px-1">+{list.length + (events.get(day)?.length ?? 0) - 3} more</span>{/if}
              </span>
            {:else}
              <span class="flex items-center gap-0.5 h-2">
                {#each list.slice(0, 3) as s (s.workout.id)}
                  <span class="relative w-2 h-2 rounded-full overflow-hidden bg-surface"><span class="absolute inset-0 cal-fill {s.workout.provisional ? 'cal-soft' : ''} {colorOf(s)}"></span></span>
                {/each}
                {#each (events.get(day) ?? []).slice(0, Math.max(0, 3 - list.length)) as e, k (k)}
                  <span class="w-2 h-2 rounded-full opacity-60" style="background: {eventColor(e)}"></span>
                {/each}
                {#if list.length + (events.get(day)?.length ?? 0) > 3}<span class="text-caption leading-none text-content-subtle">+{list.length + (events.get(day)?.length ?? 0) - 3}</span>{/if}
              </span>
            {/if}
          </button>
        {/if}
      {/if}
    {/each}
  </div>
</div>
