<script lang="ts">
  /**
   * The Week view as a list (Settings -> Plan calendar): a row per day with
   * the day's sessions in full - name, length, exercises - and the phone
   * calendar's events muted among them, all in the order the day happens
   * (`dayAgenda`), each with its start time in a column of its own. The
   * alternative to seven narrow columns, where names truncate. Presentational.
   */
  import Icon from '@iconify/svelte';
  import { dayNameOf, dayAgenda, DEFAULT_EVENT_COLOR, type CalendarSession } from '../../lib/planning/calendarEvents';
  import { groupChips } from '../../lib/planning/exerciseChips';
  import { GOAL_STYLE } from '../../lib/planning/goalStyle';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';
  import type { ExerciseTypeDef } from '../../lib/types';
  import type { PhaseMark } from '../../lib/planning/phaseStrip';
  import type { AnalyticsCategory, GoalEvent } from '../../lib/types';
  import { calendarSessionColor, exerciseSegments } from '../../lib/planning/sessionColors';

  let {
    days,
    byDay,
    events,
    today,
    exerciseTypes,
    isRunning,
    isFaded,
    onOpen,
    onOpenEvent,
    onAdd,
    phases = new Map(),
    phaseNames = false,
    goals = new Map(),
    categories = [],
    exerciseList = false,
    eventColor = () => DEFAULT_EVENT_COLOR,
    byCategory = false,
  }: {
    days: number[];
    byDay: Map<number, CalendarSession[]>;
    events: Map<number, DeviceEvent[]>;
    today: number;
    exerciseTypes: ExerciseTypeDef[];
    isRunning: (s: CalendarSession) => boolean;
    isFaded: (s: CalendarSession) => boolean;
    onOpen: (s: CalendarSession, siblings: CalendarSession[]) => void;
    /** A phone-calendar event was tapped. */
    onOpenEvent?: (e: DeviceEvent) => void;
    onAdd: (day: number) => void;
    /** The phase on each day, drawn as a bar down the row's edge (empty = off). */
    phases?: Map<number, PhaseMark>;
    phaseNames?: boolean;
    /** The trips and competitions on each day. */
    goals?: Map<number, GoalEvent[]>;
    categories?: AnalyticsCategory[];
    /** Each session's exercises as lines with a colour dot instead of coloured chips. */
    exerciseList?: boolean;
    /** The colour of a phone-calendar event. */
    eventColor?: (e: DeviceEvent) => string;
    /** Sessions take their main category's colour instead of one shared colour. */
    byCategory?: boolean;
  } = $props();

  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const dateOf = (day: number) => new Date(day * 86_400_000).getUTCDate();

  function meta(s: CalendarSession): string {
    const length = `${s.minutes} min${s.plannedMinutes ? ` (${s.plannedMinutes} planned)` : ''}`;
    return s.startMin !== undefined ? `${hhmm(s.startMin)} · ${length}` : length;
  }
</script>

<div class="divide-y divide-border/60">
  {#each days as day (day)}
    {@const sessions = byDay.get(day) ?? []}
    {@const dayEvents = events.get(day) ?? []}
    {@const agenda = dayAgenda(sessions, dayEvents)}
    {@const mark = phases.get(day)}
    {@const startsHere = mark && phases.get(day - 1)?.key !== mark.key}
    {@const endsHere = !mark || phases.get(day + 1)?.key !== mark.key}
    <div class="flex gap-3 py-3.5">
      <!-- One bar down the edge for as long as the phase lasts (it rounds only where the phase starts or ends). -->
      {#if phases.size > 0}<span class="w-1 shrink-0 self-stretch -my-3.5 {startsHere ? 'rounded-t-full' : ''} {endsHere ? 'rounded-b-full' : ''} {mark?.color ?? 'bg-transparent'}" aria-hidden="true"></span>{/if}
      <div class="w-9 shrink-0 text-center pt-1">
        <p class="text-caption {day === today ? 'text-primary font-bold' : 'text-content-subtle'}">{dayNameOf(day).slice(0, 3)}</p>
        <p class="text-title tabular-nums {day === today ? 'text-primary' : 'text-content'}">{dateOf(day)}</p>
      </div>
      <div class="flex-1 min-w-0 space-y-2">
        {#if phaseNames && startsHere}<p class="text-caption text-content-subtle">{mark?.name}</p>{/if}
        {#each goals.get(day) ?? [] as g (g.id)}
          <p class="relative overflow-hidden flex items-center gap-1.5 rounded-control px-3 py-1.5 text-label cal-ink"><span class="absolute inset-0 cal-fill {GOAL_STYLE[g.kind].fill}"></span>
            <Icon icon={GOAL_STYLE[g.kind].icon} class="relative text-base" /><span class="relative">{g.name}</span>
          </p>
        {/each}
        {#each agenda as item, i (item.kind === 'session' ? item.session.workout.id : `${item.event.id}:${i}`)}
          {#if item.kind === 'session'}
            {@const s = item.session}
            {@const chips = groupChips(exerciseSegments(s.workout, exerciseTypes, categories), s.workout.notes || 'Session')}
            {@const shown = chips.slice(0, 8)}
            {@const more = chips.length - shown.length}
              <button
                onclick={() => onOpen(s, sessions)}
                class="relative overflow-hidden block w-full text-left rounded-card px-3.5 py-3 cal-ink active:scale-[0.99] transition-transform {isFaded(s) ? 'opacity-40' : ''} {isRunning(s) ? 'ring-2 ring-success' : ''}"
              >
                <span class="absolute inset-0 cal-fill {s.workout.provisional ? 'cal-soft' : ''} {calendarSessionColor(s.workout, exerciseTypes, categories, byCategory)}"></span>
                <span class="relative block text-body font-semibold leading-snug break-words">{#if s.done}<Icon icon="ic:baseline-check" class="inline text-base -mt-0.5" /> {/if}{s.workout.notes || 'Session'}</span>
                <span class="relative block text-caption opacity-80 mt-0.5">{meta(s)}</span>
                {#if shown.length}
                  {#if exerciseList}
                    <!-- Plain lines, each with a dot in its category's colour: nothing boxed. -->
                    <span class="relative block mt-2.5 space-y-1">
                      {#each shown as chip (chip.first.slotId)}
                        <span class="flex items-center gap-2 text-label leading-snug">
                          <span class="relative shrink-0 w-2.5 h-2.5 rounded-full overflow-hidden ring-1 ring-current/50"><span class="absolute inset-0 cal-fill bg-surface"></span><span class="absolute inset-0 cal-fill {chip.first.color ?? 'bg-primary'}"></span></span>
                          <span class="min-w-0 truncate">{chip.label}</span>
                        </span>
                      {/each}
                      {#if more > 0}<span class="block text-caption opacity-80 pl-4">+{more} more</span>{/if}
                    </span>
                  {:else}
                    <!-- Each exercise as a soft pill in its own category's colour. -->
                    <span class="relative flex flex-wrap gap-1.5 mt-2.5">
                      {#each shown as chip (chip.first.slotId)}
                        <span class="relative overflow-hidden rounded-full px-2.5 py-0.5 text-label"><span class="absolute inset-0 cal-fill bg-surface"></span><span class="absolute inset-0 cal-fill {chip.first.color ?? 'bg-primary'}"></span><span class="relative">{chip.label}</span></span>
                      {/each}
                      {#if more > 0}<span class="text-label py-0.5 opacity-80">+{more}</span>{/if}
                    </span>
                  {/if}
                {/if}
              </button>
          {:else}
            {@const e = item.event}
            <button onclick={() => onOpenEvent?.(e)} class="tap ev-row relative overflow-hidden w-full text-left flex items-baseline gap-2 rounded-control px-3 py-1.5 text-label cal-ink cal-edge" style="--cal-edge: {eventColor(e)}"><span class="absolute inset-0 cal-fill cal-soft" style="background: {eventColor(e)}"></span>
              <span class="relative min-w-0 flex-1 truncate">{e.title}</span>
              <span class="relative shrink-0 text-caption tabular-nums opacity-70">{e.allDay ? 'All day' : `${hhmm(e.startMin ?? 0)} – ${hhmm(Math.min(1440, (e.startMin ?? 0) + e.minutes))}`}</span>
            </button>
          {/if}
        {/each}
        {#if agenda.length === 0 && !goals.get(day)}
          <p class="text-caption text-content-subtle pt-1.5">Rest</p>
        {/if}
      </div>
      <!-- A + on every row said "add" seven times: it stays on days with nothing planned and on today (the header's add covers the rest). -->
      {#if agenda.length === 0 || day === today}
        <button onclick={() => onAdd(day)} class="btn-icon self-start -mt-0.5 hover:text-primary" aria-label="Add a session on {dayNameOf(day)}" title="Add a session">
          <Icon icon="ic:baseline-plus" class="text-lg" />
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* Rows are 8px apart: the touch area grows to 40px tall and meets the next row. */
  .ev-row::after { inset: -5px 0; }
</style>
