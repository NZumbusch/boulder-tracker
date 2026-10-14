<script lang="ts">
  /**
   * The Plan screen's calendar view - an alternative to the block grid and
   * week card, not a replacement. Day and Week show the sessions on an hour
   * grid with their exercises; Month and Year are overviews you tap down
   * from. Everything is drawn from the same plan the block view edits
   * (`getWeekPlanView`), so a finished live session shows up here with the
   * time it actually took.
   */
  import { layout } from '../../lib/navigation/layoutMode.svelte';
  import Icon from '@iconify/svelte';
  import { onDestroy } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { swipePaging, type SwipeDirection } from '../../lib/analytics/swipe';
  import { weekStartDay } from '../../lib/analytics/range';
  import { localDayIndex, dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import {
    DAY_MS, dayNameOf, sessionsByDay, toCalendarSession, weekIdOfDayIndex, type CalendarSession,
  } from '../../lib/planning/calendarEvents';
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';
  import { eventsByDay } from '../../lib/calendar/deviceEvents';
  import CalendarTimeGrid from './CalendarTimeGrid.svelte';
  import CalendarMonth from './CalendarMonth.svelte';
  import CalendarAgenda from './CalendarAgenda.svelte';
  import { phaseMarks } from '../../lib/planning/phaseStrip';
  import { goalBars, goalsByDay } from '../../lib/planning/goalBars';
  import type { DayOfWeek, Workout } from '../../lib/types';

  type Mode = 'day' | 'week' | 'month' | 'year';
  const MODES: { id: Mode; label: string }[] = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'year', label: 'Year' },
  ];
  const MODE_KEY = 'plan.calendarMode';

  let { onAdd, onEditPhase }: { onAdd: (weekId: string, day: DayOfWeek, startTime?: string) => void; onEditPhase?: (isoDate: string) => void } = $props();

  function storedMode(): Mode {
    try {
      const v = localStorage.getItem(MODE_KEY);
      if (v === 'day' || v === 'week' || v === 'month' || v === 'year') return v;
    } catch { /* storage can be unavailable; the default is fine */ }
    return 'week';
  }

  const today = $derived(localDayIndex(trainingState.today));
  let mode = $state<Mode>(storedMode());
  // Opens on the week the block view had selected, else today.
  const selected = trainingState.selectedWeekId;
  let focus = $state(
    selected && selected !== trainingState.currentWeekId ? (weekStartDay(selected) ?? localDayIndex(trainingState.today)) : localDayIndex(trainingState.today),
  );

  // Back in the block view, the week being looked at stays selected.
  // The block grid shows 50 weeks around "now" per page - move it to the page that holds the week.
  onDestroy(() => {
    const id = weekIdOfDayIndex(focus);
    trainingState.selectedWeekId = id;
    const here = weekStartDay(trainingState.currentWeekId);
    const there = weekStartDay(id);
    if (here !== undefined && there !== undefined) trainingState.weekOffset = Math.floor(((there - here) / 7 + 25) / 50);
  });

  function setMode(m: Mode) {
    mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* per-viewer convenience only */ }
  }

  const utc = (day: number) => new Date(day * DAY_MS);
  const focusDate = $derived(utc(focus));
  const weekStart = $derived(focus - ((((focus + 3) % 7) + 7) % 7));
  const year = $derived(focusDate.getUTCFullYear());
  const month = $derived(focusDate.getUTCMonth());
  const firstOfMonth = (y: number, m: number) => Math.floor(Date.UTC(y, m, 1) / DAY_MS);

  /** First and last day the current view needs sessions for. */
  const range = $derived.by((): [number, number] => {
    if (mode === 'day') return [focus, focus];
    if (mode === 'week') return [weekStart, weekStart + 6];
    if (mode === 'month') return [firstOfMonth(year, month), firstOfMonth(year, month + 1) - 1];
    return [firstOfMonth(year, 0), firstOfMonth(year + 1, 0) - 1];
  });

  // A session is fetched by its week but drawn on the day it happened, which
  // can be another week - so look a week either side of what is shown.
  const sessions = $derived.by(() => {
    const [from, to] = range;
    const seen = new Map<string, CalendarSession>();
    const running = trainingState.sessionStore;
    for (let d = from - 7; d <= to + 7; d += 7) {
      for (const w of trainingState.getWeekPlanView(weekIdOfDayIndex(d)).shown) {
        const s = toCalendarSession(w, running.isRunning(w.id) ? running.elapsedMinutes : undefined);
        if (s && s.day >= from && s.day <= to) seen.set(w.id, s);
      }
    }
    return [...seen.values()];
  });
  const faded = (s: CalendarSession) => !!s.workout.planB && !s.workout.planB.active;
  const byDay = $derived(sessionsByDay(sessions));
  /** Overviews count only the sessions that count - the Plan B side not chosen stays out of them. */
  const countedByDay = $derived(sessionsByDay(sessions.filter((s) => !faded(s))));
  const noDayCount = $derived(
    mode === 'week' ? trainingState.getWeekPlanView(weekIdOfDayIndex(weekStart)).shown.filter((w) => w.status === 'planned' && !w.dayOfWeek).length : 0,
  );

  // The phone's calendar, when switched on (Settings -> Phone calendar). The year overview doesn't show events.
  $effect(() => {
    void deviceCalendar.version;
    const [from, to] = range;
    if (mode === 'year') deviceCalendar.events = [];
    else void deviceCalendar.load(from, to);
  });
  const eventDays = $derived(eventsByDay(deviceCalendar.events.filter((e) => e.day >= range[0] && e.day <= range[1])));

  const label = $derived.by(() => {
    const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
    if (mode === 'day') return fmt(focusDate, { weekday: 'short', day: 'numeric', month: 'short', year: year === utc(today).getUTCFullYear() ? undefined : 'numeric' });
    if (mode === 'week') return `${fmt(utc(weekStart), { day: 'numeric', month: 'short' })} – ${fmt(utc(weekStart + 6), { day: 'numeric', month: 'short' })}`;
    if (mode === 'month') return fmt(focusDate, { month: 'long', year: 'numeric' });
    return String(year);
  });
  /** Always something under the title, so the header keeps its height from view to view: the week (Day, Week) or the totals (Month, Year). */
  const sublabel = $derived.by(() => {
    if (mode === 'day' || mode === 'week') return weekIdOfDayIndex(mode === 'day' ? focus : weekStart).replace('-W', ' · week ');
    const counted = sessions.filter((s) => !faded(s));
    const done = counted.filter((s) => s.done).length;
    return counted.length === 0 ? 'Nothing planned' : `${done} done · ${counted.length - done} planned`;
  });

  function step(direction: SwipeDirection) {
    const sign = direction === 'next' ? 1 : -1;
    if (mode === 'day') focus += sign;
    else if (mode === 'week') focus += sign * 7;
    else if (mode === 'month') focus = firstOfMonth(year, month + sign);
    else focus = firstOfMonth(year + sign, month);
  }
  const isHere = $derived(
    mode === 'day' ? focus === today : mode === 'week' ? weekStart === today - ((((today + 3) % 7) + 7) % 7)
      : mode === 'month' ? year === utc(today).getUTCFullYear() && month === utc(today).getUTCMonth() : year === utc(today).getUTCFullYear(),
  );

  function openDay(day: number) { focus = day; setMode('day'); }
  function openMonth(m: number) { focus = firstOfMonth(year, m); setMode('month'); }
  function open(s: CalendarSession, siblings: CalendarSession[]) {
    openWorkout(s.workout, 'view', false, siblings.map((x) => x.workout));
  }
  /** A new session on a day, at a time when the tap was on the hour grid. */
  function addAt(day: number, startMin?: number) {
    const time = startMin === undefined ? undefined : `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
    onAdd(weekIdOfDayIndex(day), dayNameOf(day), time);
  }
  /** A planned session dragged to another day or time: saved there (the session alone - the rest of its week is untouched). */
  async function moveSession(s: CalendarSession, day: number, startMin?: number) {
    const dayName = dayNameOf(day);
    const weekId = weekIdOfDayIndex(day);
    const startTime = startMin === undefined ? s.workout.startTime : `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
    if (s.workout.dayOfWeek === dayName && s.workout.weekId === weekId && s.workout.startTime === startTime) return;
    await trainingState.saveWorkoutQuiet({ ...($state.snapshot(s.workout) as Workout), weekId, dayOfWeek: dayName, startTime });
  }
  /** The floating +: a session on the focused day (the first day shown, when the focus has paged out of the week). */
  export function addAtFocus() {
    addAt(mode === 'week' && !(focus >= weekStart && focus <= weekStart + 6) ? weekStart : focus);
  }
  const agenda = $derived(trainingState.tunableOn('plan.weekAgenda') || (!layout.wide && trainingState.tunableOn('plan.weekListOnPhone')));
  /** The phase on each day shown (Settings -> Plan calendar). Month and Year draw it as a line along each week row. */
  const phases = $derived(
    trainingState.tunableOn('plan.calendarPhases')
      ? phaseMarks(trainingState.trainingBlocks, trainingState.phaseDefs, Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i))
      : new Map(),
  );
  /** Trips and competitions among the days shown (not in the year overview). */
  const shownDays = $derived(Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i));
  const goalsOnDays = $derived(mode === 'year' ? new Map() : goalsByDay(trainingState.goals, shownDays));
  const phaseNames = $derived(trainingState.tunableOn('plan.calendarPhaseNames'));
  const isRunning = (s: CalendarSession) => trainingState.sessionStore.isRunning(s.workout.id);
</script>

<!-- The header keeps its height in every view, so the box below never moves when you switch Day / Week / Month / Year. -->
<div class="space-y-3 short:space-y-2 touch-pan-y" use:swipePaging={step}>
  <!-- On a landscape phone (little height) the two header rows become one, so the calendar gets the screen. -->
  <div class="flex flex-col gap-3 short:flex-row short:items-center short:gap-3">
  <div class="flex items-start justify-between gap-2 min-h-[3rem] short:contents">
    <div class="min-w-0 short:order-1 short:flex-1">
      <h3 class="text-title text-content truncate leading-tight">{label}</h3>
      <p class="text-caption text-content-subtle truncate h-4">{sublabel}</p>
    </div>
    <div class="flex items-center gap-0.5 shrink-0 short:order-3">
      <button onclick={() => step('prev')} class="tap p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors" aria-label="Previous {mode}">
        <Icon icon="ic:baseline-chevron-left" class="text-lg" />
      </button>
      <button onclick={() => (focus = today)} class="px-2 py-1 text-caption rounded-control hover:bg-surface-elevated transition-colors {isHere ? 'text-content-subtle/50' : 'text-primary'}">Today</button>
      <button onclick={() => step('next')} class="tap p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors" aria-label="Next {mode}">
        <Icon icon="ic:baseline-chevron-right" class="text-lg" />
      </button>
    </div>
  </div>

  <div class="flex items-center justify-between gap-2 h-9 short:contents">
    <div class="flex bg-surface-elevated/50 p-0.5 rounded-control short:order-2" role="radiogroup" aria-label="Calendar view">
      {#each MODES as m (m.id)}
        <button
          role="radio"
          aria-checked={mode === m.id}
          onclick={() => setMode(m.id)}
          class="px-2.5 py-1 text-caption rounded-control transition-colors {mode === m.id ? 'bg-surface text-content shadow-sm' : 'text-content-subtle hover:text-content'}"
        >{m.label}</button>
      {/each}
    </div>
    <!-- With the drawer navigation the floating + adds a session (the app shell's); the bottom bar has no such button, so the + stays here. -->
    {#if trainingState.navStyle === 'bar'}
      <button onclick={() => addAt(mode === 'week' && !(focus >= weekStart && focus <= weekStart + 6) ? weekStart : focus)} class="tap p-1.5 rounded-control text-primary hover:bg-surface-elevated transition-colors short:order-4" aria-label="Add a session on {dayNameOf(focus)}">
      <Icon icon="ic:baseline-plus" class="text-lg" />
    </button>
    {/if}
  </div>

  </div>

  <!-- Flat, like a calendar app: the grid runs edge to edge on the page, no panel, no border. -->
  {#if mode === 'week' && agenda}
    <CalendarAgenda
      days={Array.from({ length: 7 }, (_, i) => weekStart + i)}
      {byDay}
      events={eventDays}
      {today}
      exerciseTypes={trainingState.exerciseTypes}
      categories={trainingState.analyticsCategories}
      {isRunning}
      isFaded={faded}
      onOpen={open}
      onAdd={(day) => addAt(day)}
      {phases}
      {phaseNames}
      goals={goalsOnDays}
    />
    {#if noDayCount > 0}
      <p class="text-caption text-content-subtle">{noDayCount} session{noDayCount === 1 ? '' : 's'} this week with no day - set one in the block view.</p>
    {/if}
  {:else if mode === 'day' || mode === 'week'}
    <CalendarTimeGrid
      days={mode === 'day' ? [focus] : Array.from({ length: 7 }, (_, i) => weekStart + i)}
      {byDay}
      events={eventDays}
      {today}
      exerciseTypes={trainingState.exerciseTypes}
      categories={trainingState.analyticsCategories}
      {isRunning}
      isFaded={faded}
      onOpen={open}
      onPickDay={openDay}
      onAdd={addAt}
      {phases}
      {phaseNames}
      onPickPhase={(day) => onEditPhase?.(dayIndexToIso(day))}
      goals={goalBars(trainingState.goals, shownDays)}
      onMove={moveSession}
    />
    {#if sessions.length === 0}
      <p class="text-caption text-content-subtle italic text-center py-4">{mode === 'day' ? 'Nothing planned - tap + to add a session.' : 'Nothing planned this week.'}</p>
    {/if}
    {#if noDayCount > 0}
      <p class="text-caption text-content-subtle">{noDayCount} session{noDayCount === 1 ? '' : 's'} this week with no day - set one in the block view.</p>
    {/if}
  {:else if mode === 'month'}
    <CalendarMonth {year} {month} byDay={countedByDay} events={eventDays} {today} onPickDay={openDay} {phases} goals={goalsOnDays} exerciseTypes={trainingState.exerciseTypes} categories={trainingState.analyticsCategories} />
  {:else}
    <div class="grid grid-cols-3 gap-x-3 gap-y-4 min-[700px]:grid-cols-4">
      {#each Array.from({ length: 12 }, (_, i) => i) as m (m)}
        <CalendarMonth {year} month={m} byDay={countedByDay} {today} mini onPickDay={openDay} onPickMonth={openMonth} {phases} />
      {/each}
    </div>
  {/if}
</div>
