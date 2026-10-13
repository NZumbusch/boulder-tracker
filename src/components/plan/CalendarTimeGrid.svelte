<script lang="ts">
  /**
   * The Day and Week calendar views: hours down the side, one column per day,
   * a block per timed session as tall as the session is long. Sessions with
   * no time of day sit in a strip above the hours. Presentational - the data
   * comes in already resolved (see lib/planning/calendarEvents.ts).
   */
  import { layoutDay, visibleHours, exerciseLines, dayNameOf, type CalendarSession } from '../../lib/planning/calendarEvents';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';
  import type { ExerciseTypeDef } from '../../lib/types';
  import type { PhaseMark } from '../../lib/planning/phaseStrip';
  import type { GoalBar } from '../../lib/planning/goalBars';
  import Icon from '@iconify/svelte';
  import { dropTarget, DRAG_HOLD_MS, DRAG_SLOP_PX } from '../../lib/planning/calendarDrag';
  import { onDestroy } from 'svelte';
  import PhaseStrip from './PhaseStrip.svelte';

  let {
    days,
    byDay,
    events,
    today,
    exerciseTypes,
    isRunning,
    isFaded,
    onOpen,
    onPickDay,
    onAdd,
    phases = new Map(),
    phaseNames = false,
    onPickPhase,
    goals = [],
    onMove,
  }: {
    days: number[];
    byDay: Map<number, CalendarSession[]>;
    /** The phone calendar's events - shown muted beside the sessions, never tappable. */
    events: Map<number, DeviceEvent[]>;
    today: number;
    exerciseTypes: ExerciseTypeDef[];
    isRunning: (s: CalendarSession) => boolean;
    isFaded: (s: CalendarSession) => boolean;
    onOpen: (s: CalendarSession, siblings: CalendarSession[]) => void;
    onPickDay?: (day: number) => void;
    /** A tap on an empty stretch of a day: the day and the time (minutes after midnight, to the half hour). */
    onAdd?: (day: number, startMin: number) => void;
    /** The phase on each day, drawn as a thin strip (empty = off). */
    phases?: Map<number, PhaseMark>;
    phaseNames?: boolean;
    /** A tap on the phase strip: the first day of that stretch. */
    onPickPhase?: (day: number) => void;
    /** Trips and competitions among the days, as bars across them. */
    goals?: GoalBar[];
    /** A planned session dropped on a day (and, from the hour grid, a time: minutes after midnight). Absent = sessions can't be dragged. */
    onMove?: (s: CalendarSession, day: number, startMin?: number) => void;
  } = $props();

  const compact = $derived(days.length > 1);
  /** Day gets a taller hour so a session has room for its exercises; Week is seven narrow columns. */
  const HOUR_PX = $derived(compact ? 44 : 80);

  /** A session or a phone-calendar event, placed on the same hour grid so they share its lanes. */
  type Item = { startMin: number; minutes: number } & ({ kind: 'session'; s: CalendarSession } | { kind: 'event'; e: DeviceEvent; key: number });

  const columns = $derived(
    days.map((day) => {
      const all = byDay.get(day) ?? [];
      const dayEvents = events.get(day) ?? [];
      const items: Item[] = [
        ...all.flatMap((s): Item[] => (s.startMin === undefined ? [] : [{ kind: 'session', s, startMin: s.startMin, minutes: s.minutes }])),
        ...dayEvents.flatMap((e, key): Item[] => (e.startMin === undefined ? [] : [{ kind: 'event', e, key, startMin: e.startMin, minutes: e.minutes }])),
      ];
      return {
        day,
        all,
        untimed: all.filter((s) => s.startMin === undefined),
        allDayEvents: dayEvents.filter((e) => e.allDay),
        blocks: layoutDay(items),
      };
    }),
  );
  /** Day with nothing timed leaves the hours out (the + adds one); the Week keeps them so a slot can be tapped. */
  const hasTimed = $derived(compact || columns.some((c) => c.blocks.length > 0));
  /**
   * Sessions decide the hours shown; a phone-calendar event only widens them
   * within 06-23, so one that runs through the night doesn't stretch the day
   * to 24 hours. The part of an event outside the hours is simply clipped.
   */
  const EVENT_FROM = 6 * 60;
  const EVENT_TO = 23 * 60;
  const hours = $derived(
    visibleHours(
      columns.flatMap((c) =>
        c.blocks.flatMap((b) => {
          if (b.item.kind === 'session') return [b];
          return b.bottom > EVENT_FROM && b.top < EVENT_TO ? [{ top: Math.max(b.top, EVENT_FROM), bottom: Math.min(b.bottom, EVENT_TO) }] : [];
        }),
      ),
    ),
  );
  const hourList = $derived(Array.from({ length: hours.to - hours.from }, (_, i) => hours.from + i));
  const gridHeight = $derived((hours.to - hours.from) * HOUR_PX);
  const px = (min: number) => ((min - hours.from * 60) / 60) * HOUR_PX;

  // --- Moving a session by dragging it: hold, then drag; a finger that moves at once is scrolling. ---
  let colEls = $state<HTMLElement[]>([]);
  type Press = { s: CalendarSession; timed: boolean; startX: number; startY: number; x: number; y: number; grabOffsetY: number; active: boolean };
  let press = $state<Press | null>(null);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClickUntil = 0;
  const movable = (s: CalendarSession) => !!onMove && !s.done && s.workout.status === 'planned' && !s.workout.planB && !isRunning(s);

  function beginPress(e: PointerEvent, s: CalendarSession, timed: boolean) {
    if (!movable(s) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    press = { s, timed, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, grabOffsetY: e.clientY - rect.top, active: false };
    holdTimer = setTimeout(() => {
      if (!press) return;
      press.active = true;
      navigator.vibrate?.(15);
    }, DRAG_HOLD_MS);
    window.addEventListener('pointermove', onPressMove);
    window.addEventListener('pointerup', endPress);
    window.addEventListener('pointercancel', cancelPress);
    window.addEventListener('touchmove', blockScroll, { passive: false });
  }
  function onPressMove(e: PointerEvent) {
    if (!press) return;
    if (!press.active) {
      // Moved before the hold finished: it is a scroll or a swipe, not a drag.
      if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) > DRAG_SLOP_PX) cancelPress();
      return;
    }
    press.x = e.clientX;
    press.y = e.clientY;
  }
  /** Once held, the finger moves the block, not the page. */
  function blockScroll(e: TouchEvent) {
    if (press?.active && e.cancelable) e.preventDefault();
  }
  function stopListening() {
    clearTimeout(holdTimer);
    window.removeEventListener('pointermove', onPressMove);
    window.removeEventListener('pointerup', endPress);
    window.removeEventListener('pointercancel', cancelPress);
    window.removeEventListener('touchmove', blockScroll);
  }
  function cancelPress() {
    stopListening();
    press = null;
  }
  function endPress() {
    const p = press;
    stopListening();
    press = null;
    if (!p?.active) return;
    suppressClickUntil = performance.now() + 400; // the click that ends a drag must not open the session
    const hit = dropTarget({
      pointerX: p.x,
      pointerY: p.y,
      grabOffsetY: p.grabOffsetY,
      columns: days.map((_, i) => {
        const r = colEls[i]?.getBoundingClientRect();
        return { left: r?.left ?? -1, right: r?.right ?? -1, top: r?.top ?? 0 };
      }),
      hourPx: HOUR_PX,
      firstHour: hours.from,
      durationMin: p.s.minutes,
    });
    if (hit) onMove?.(p.s, days[hit.column], p.timed ? hit.startMin : undefined);
  }
  onDestroy(stopListening);
  const dragStyle = (s: CalendarSession) => (press?.active && press.s.workout.id === s.workout.id ? `transform: translate(${press.x - press.startX}px, ${press.y - press.startY}px); z-index: 30; touch-action: none;` : '');
  const isDragged = (s: CalendarSession) => !!press?.active && press.s.workout.id === s.workout.id;
  const open = (s: CalendarSession, siblings: CalendarSession[]) => {
    if (performance.now() < suppressClickUntil) return;
    onOpen(s, siblings);
  };

  function addAt(e: MouseEvent, day: number) {
    if (e.target !== e.currentTarget || !onAdd) return;
    const y = e.offsetY;
    const minute = Math.round(((y / HOUR_PX) * 60 + hours.from * 60) / 30) * 30;
    onAdd(day, Math.min(minute, 23 * 60 + 30));
  }

  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const dateOf = (day: number) => new Date(day * 86_400_000).getUTCDate();

  /** The tint is its own layer on a timed block, so the block stays opaque over the hour lines. */
  const tint = (s: CalendarSession) => (s.done ? 'bg-success/15' : 'bg-primary/10');
  function tone(s: CalendarSession): string {
    const border = s.done ? 'border-success' : 'border-primary';
    return `${border} text-content ${s.workout.provisional ? 'border-dashed' : ''} ${isFaded(s) ? 'opacity-40' : ''} ${isRunning(s) ? 'ring-1 ring-success' : ''}`;
  }
  function meta(s: CalendarSession): string {
    const length = `${s.minutes} min${s.plannedMinutes ? ` (${s.plannedMinutes} planned)` : ''}`;
    return s.startMin !== undefined ? `${hhmm(s.startMin)} · ${length}` : length;
  }
</script>

<div class="space-y-1">
  {#if compact}
    <div class="flex pl-8">
      {#each columns as col (col.day)}
        <button
          onclick={() => onPickDay?.(col.day)}
          class="flex-1 min-w-0 flex flex-col items-center py-1 rounded-control hover:bg-surface-elevated/60 transition-colors"
          aria-label="Open {dayNameOf(col.day)} {dateOf(col.day)}"
        >
          <span class="text-caption {col.day === today ? 'text-primary font-bold' : 'text-content-subtle'}">{dayNameOf(col.day).slice(0, 1)}</span>
          <span class="text-label tabular-nums {col.day === today ? 'text-primary font-bold' : 'text-content'}">{dateOf(col.day)}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if phases.size > 0}
    <div class="pl-8"><PhaseStrip {days} marks={phases} names={phaseNames} onPick={onPickPhase} /></div>
  {/if}

  <!-- Trips and competitions: a bar across the days they cover. -->
  {#if goals.length > 0}
    <div class="pl-8 grid gap-y-px" style="grid-template-columns: repeat({days.length}, minmax(0, 1fr))">
      {#each goals as bar (bar.goal.id)}
        <div
          class="flex items-center gap-1 min-w-0 px-1 py-0.5 border-l-2 {bar.goal.kind === 'trip' ? 'bg-primary/10 border-primary' : 'bg-warning/20 border-warning'} {bar.startsBefore ? 'rounded-l-none' : 'rounded-l-control'} {bar.endsAfter ? 'rounded-r-none' : 'rounded-r-control'}"
          style="grid-column: {bar.from + 1} / span {bar.span}; grid-row: {bar.lane + 1}"
          title={bar.goal.name}
        >
          <Icon icon={bar.goal.kind === 'trip' ? 'ic:baseline-terrain' : 'ic:baseline-emoji-events'} class="text-xs shrink-0 text-content-muted" />
          <span class="truncate {compact ? 'text-[10px] leading-tight' : 'text-label'} text-content">{bar.goal.name}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Sessions with no time of day, and all-day events. -->
  {#if columns.some((c) => c.untimed.length || c.allDayEvents.length)}
    <div class="flex pl-8 gap-px">
      {#each columns as col (col.day)}
        <div class="flex-1 min-w-0 space-y-px">
          {#each col.allDayEvents as e, i (`${e.id}:${i}`)}
            <div class="rounded-control border-l-2 border-border-strong bg-surface-elevated px-1 py-0.5 text-content-muted truncate {compact ? 'text-[10px] leading-tight' : 'text-label'}">{e.title}</div>
          {/each}
          {#each col.untimed as s (s.workout.id)}
            <button
              onclick={() => open(s, col.all)}
              onpointerdown={(e) => beginPress(e, s, false)}
              data-no-swipe
              class="w-full text-left rounded-control border-l-2 px-1 py-0.5 select-none {tone(s)} {tint(s)} {isDragged(s) ? 'shadow-card ring-1 ring-primary relative' : ''}"
              style={dragStyle(s)}
            >
              <span class="block truncate {compact ? 'text-[10px] leading-tight' : 'text-label font-semibold'}">{s.workout.notes || 'Session'}</span>
              {#if !compact}
                <span class="block text-caption text-content-subtle">{meta(s)}</span>
                {@const ex = exerciseLines(s.workout, exerciseTypes, 6)}
                {#if ex.names.length}<span class="block text-caption text-content-muted">{ex.names.join(' · ')}{ex.more ? ` +${ex.more}` : ''}</span>{/if}
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  {#if hasTimed}
  <div class="relative flex" style="height: {gridHeight}px">
    <div class="w-8 shrink-0 relative">
      {#each hourList as h (h)}
        <span class="absolute right-1 -translate-y-1/2 text-[10px] leading-none text-content-subtle tabular-nums" style="top: {(h - hours.from) * HOUR_PX}px">{h > hours.from ? String(h).padStart(2, '0') : ''}</span>
      {/each}
    </div>
    <div class="relative flex-1 flex overflow-hidden">
      {#each hourList as h (h)}
        <div class="absolute inset-x-0 border-t border-border/60" style="top: {(h - hours.from) * HOUR_PX}px"></div>
      {/each}
      {#each columns as col (col.day)}
        <!-- A tap on the empty part of a day adds a session there; the + in the Day view is the other way in. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          bind:this={colEls[days.indexOf(col.day)]}
          class="relative flex-1 min-w-0 {col.day === today ? 'bg-primary/5' : ''} {compact ? 'border-l border-border/40' : ''}"
          onclick={(e) => addAt(e, col.day)}
        >
          {#each col.blocks as b (b.item.kind === 'session' ? b.item.s.workout.id : `e${b.item.e.id}:${b.item.key}`)}
            {@const it = b.item}
            {@const place = `top: ${px(b.top)}px; height: ${Math.max(px(b.bottom) - px(b.top) - 1, 14)}px; left: ${(b.lane / b.lanes) * 100}%; width: ${100 / b.lanes}%`}
            {#if it.kind === 'event' && (b.bottom <= hours.from * 60 || b.top >= hours.to * 60)}
              <!-- Entirely outside the hours shown. -->
            {:else if it.kind === 'event'}
              <div
                class="absolute overflow-hidden rounded-control border-l-2 border-border-strong bg-surface px-1 py-0.5 text-content-muted"
                style={place}
              >
                <span class="absolute inset-0 pointer-events-none bg-surface-elevated"></span>
                <span class="relative block">
                  <span class="block truncate {compact ? 'text-[10px] leading-tight' : 'text-label'}">{it.e.title}</span>
                  {#if !compact}<span class="block text-caption text-content-subtle">{hhmm(it.startMin)} – {hhmm(Math.min(1440, it.startMin + it.minutes))}</span>{/if}
                </span>
              </div>
            {:else}
              {@const s = it.s}
              {@const ex = exerciseLines(s.workout, exerciseTypes, compact ? 3 : 8)}
              <button
                onclick={() => open(s, col.all)}
                onpointerdown={(e) => beginPress(e, s, true)}
                data-no-swipe
                class="absolute text-left rounded-control border-l-2 px-1 py-0.5 bg-surface select-none {isDragged(s) ? 'shadow-card ring-1 ring-primary opacity-90' : 'overflow-hidden'} {tone(s)}"
                style="{place}; {dragStyle(s)}"
                aria-label="{s.workout.notes || 'Session'}, {meta(s)}"
              >
                <span class="absolute inset-0 pointer-events-none {tint(s)}"></span>
                <span class="relative block">
                  <span class="block truncate {compact ? 'text-[10px] leading-tight font-semibold' : 'text-label font-semibold'}">{s.workout.notes || 'Session'}</span>
                  {#if !compact}<span class="block text-caption text-content-subtle">{meta(s)}</span>{/if}
                  {#if ex.names.length}
                    <span class="block {compact ? 'text-[9px] leading-tight text-content-muted' : 'text-caption text-content-muted'}">
                      {#each ex.names as name}<span class="block truncate">{name}</span>{/each}
                      {#if ex.more}<span class="block text-content-subtle">+{ex.more} more</span>{/if}
                    </span>
                  {/if}
                </span>
              </button>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
</div>
