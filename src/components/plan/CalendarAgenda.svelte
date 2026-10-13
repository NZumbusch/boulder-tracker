<script lang="ts">
  /**
   * The Week view as a list (Settings -> Plan calendar): a row per day with
   * the day's sessions in full - name, time and length, exercises - and the
   * phone calendar's events muted beneath. The alternative to seven narrow
   * columns, where names truncate. Presentational.
   */
  import Icon from '@iconify/svelte';
  import { dayNameOf, exerciseLines, type CalendarSession } from '../../lib/planning/calendarEvents';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';
  import type { ExerciseTypeDef } from '../../lib/types';
  import type { PhaseMark } from '../../lib/planning/phaseStrip';

  let {
    days,
    byDay,
    events,
    today,
    exerciseTypes,
    isRunning,
    isFaded,
    onOpen,
    onAdd,
    phases = new Map(),
    phaseNames = false,
  }: {
    days: number[];
    byDay: Map<number, CalendarSession[]>;
    events: Map<number, DeviceEvent[]>;
    today: number;
    exerciseTypes: ExerciseTypeDef[];
    isRunning: (s: CalendarSession) => boolean;
    isFaded: (s: CalendarSession) => boolean;
    onOpen: (s: CalendarSession, siblings: CalendarSession[]) => void;
    onAdd: (day: number) => void;
    /** The phase on each day, drawn as a bar down the row's edge (empty = off). */
    phases?: Map<number, PhaseMark>;
    phaseNames?: boolean;
  } = $props();

  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const dateOf = (day: number) => new Date(day * 86_400_000).getUTCDate();

  function meta(s: CalendarSession): string {
    const length = `${s.minutes} min${s.plannedMinutes ? ` (${s.plannedMinutes} planned)` : ''}`;
    return s.startMin !== undefined ? `${hhmm(s.startMin)} · ${length}` : length;
  }
</script>

<div class="divide-y divide-border">
  {#each days as day (day)}
    {@const sessions = byDay.get(day) ?? []}
    {@const dayEvents = events.get(day) ?? []}
    {@const mark = phases.get(day)}
    {@const startsHere = mark && phases.get(day - 1)?.key !== mark.key}
    <div class="flex gap-3 py-2.5">
      {#if phases.size > 0}<span class="w-1 shrink-0 self-stretch rounded-full {mark?.color ?? 'bg-transparent'}" aria-hidden="true"></span>{/if}
      <div class="w-9 shrink-0 text-center pt-0.5">
        <p class="text-caption {day === today ? 'text-primary font-bold' : 'text-content-subtle'}">{dayNameOf(day).slice(0, 3)}</p>
        <p class="text-label tabular-nums {day === today ? 'text-primary font-bold' : 'text-content'}">{dateOf(day)}</p>
      </div>
      <div class="flex-1 min-w-0 space-y-1.5">
        {#if phaseNames && startsHere}<p class="text-caption text-content-subtle">{mark?.name}</p>{/if}
        {#each sessions as s (s.workout.id)}
          {@const ex = exerciseLines(s.workout, exerciseTypes, 8)}
          <button
            onclick={() => onOpen(s, sessions)}
            class="w-full text-left rounded-control border-l-2 pl-2 pr-1 py-0.5 {s.done ? 'border-success' : 'border-primary'} {s.workout.provisional ? 'border-dashed' : ''} {isFaded(s) ? 'opacity-40' : ''} {isRunning(s) ? 'ring-1 ring-success' : ''}"
          >
            <span class="block text-label font-semibold text-content truncate">{s.workout.notes || 'Session'}</span>
            <span class="block text-caption text-content-subtle">{meta(s)}</span>
            {#if ex.names.length}<span class="block text-caption text-content-muted">{ex.names.join(' · ')}{ex.more ? ` +${ex.more}` : ''}</span>{/if}
          </button>
        {/each}
        {#each dayEvents as e, i (`${e.id}:${i}`)}
          <p class="border-l-2 border-border-strong pl-2 text-caption text-content-muted truncate">
            {e.title}<span class="text-content-subtle"> · {e.allDay ? 'all day' : `${hhmm(e.startMin ?? 0)} – ${hhmm(Math.min(1440, (e.startMin ?? 0) + e.minutes))}`}</span>
          </p>
        {/each}
        {#if sessions.length === 0 && dayEvents.length === 0}
          <p class="text-caption text-content-subtle/60 pt-1">Free</p>
        {/if}
      </div>
      <button onclick={() => onAdd(day)} class="p-1 self-start text-content-subtle hover:text-primary rounded-control transition-colors" aria-label="Add a session on {dayNameOf(day)}">
        <Icon icon="ic:baseline-plus" class="text-base" />
      </button>
    </div>
  {/each}
</div>
