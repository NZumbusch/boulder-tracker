<script lang="ts">
  /**
   * One month as a Monday-first grid. Full size (the Month view) shows a dot
   * per session on each day; `mini` (twelve of them make the Year view) shades
   * the day by how many there are instead. Presentational.
   */
  import { DAY_MS, type CalendarSession } from '../../lib/planning/calendarEvents';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';

  let {
    year,
    month,
    byDay,
    events = new Map(),
    today,
    mini = false,
    onPickDay,
    onPickMonth,
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
  } = $props();

  const first = $derived(Math.floor(Date.UTC(year, month, 1) / DAY_MS));
  const length = $derived(new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  /** Empty cells before the 1st: the Monday-first weekday of it. */
  const lead = $derived((((first + 3) % 7) + 7) % 7);
  const cells = $derived([...Array.from({ length: lead }, () => null), ...Array.from({ length: length }, (_, i) => first + i)]);
  const monthName = $derived(new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' }));
</script>

<div>
  {#if mini}
    <button onclick={() => onPickMonth?.(month)} class="text-label text-content hover:text-primary transition-colors mb-1">{monthName}</button>
  {:else}
    <div class="grid grid-cols-7 mb-1">
      {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d}
        <span class="text-caption text-content-subtle text-center">{d}</span>
      {/each}
    </div>
  {/if}
  <div class="grid grid-cols-7 {mini ? 'gap-px' : 'gap-0.5'}">
    {#each cells as day, i (i)}
      {#if day === null}
        <span></span>
      {:else}
        {@const list = byDay.get(day) ?? []}
        {@const date = new Date(day * DAY_MS).getUTCDate()}
        {#if mini}
          <button
            onclick={() => onPickDay(day)}
            aria-label="{date} {monthName}{list.length ? `, ${list.length} session${list.length === 1 ? '' : 's'}` : ''}"
            class="aspect-square flex items-center justify-center text-[9px] leading-none tabular-nums rounded-[3px]
              {list.length === 0 ? 'text-content-subtle' : list.length === 1 ? 'bg-primary/20 text-content' : 'bg-primary/45 text-content'}
              {day === today ? 'ring-1 ring-primary font-bold' : ''}"
          >{date}</button>
        {:else}
          <button
            onclick={() => onPickDay(day)}
            aria-label="{date} {monthName}{list.length ? `, ${list.length} session${list.length === 1 ? '' : 's'}` : ''}"
            class="h-14 flex flex-col items-center gap-1 pt-1.5 rounded-control hover:bg-surface-elevated/60 transition-colors"
          >
            <span class="text-label tabular-nums w-6 h-6 flex items-center justify-center rounded-full {day === today ? 'bg-primary text-white font-bold' : 'text-content'}">{date}</span>
            <span class="flex gap-0.5 h-1.5">
              {#each list.slice(0, 3) as s (s.workout.id)}
                <span class="w-1.5 h-1.5 rounded-full {s.done ? 'bg-success' : s.workout.provisional ? 'border border-dashed border-primary' : 'border border-primary bg-primary/30'}"></span>
              {/each}
              {#each (events.get(day) ?? []).slice(0, Math.max(0, 3 - list.length)) as _e, i (i)}
                <span class="w-1.5 h-1.5 rounded-full bg-content-subtle/40"></span>
              {/each}
              {#if list.length + (events.get(day)?.length ?? 0) > 3}<span class="text-[9px] leading-none text-content-subtle">+</span>{/if}
            </span>
          </button>
        {/if}
      {/if}
    {/each}
  </div>
</div>
