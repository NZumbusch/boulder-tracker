<script lang="ts">
  /**
   * The Day and Week calendar views: hours down the side, one column per day,
   * a block per timed session as tall as the session is long. Sessions with
   * no time of day sit in a strip above the hours. Presentational - the data
   * comes in already resolved (see lib/planning/calendarEvents.ts).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { formatClock, formatHourLabel } from '../../lib/timeFormat';
  import { layoutDay, visibleHours, exerciseLines, dayNameOf, weekIdOfDayIndex, DEFAULT_EVENT_COLOR, type CalendarSession } from '../../lib/planning/calendarEvents';
  import { GOAL_STYLE } from '../../lib/planning/goalStyle';
  import { formatWeek } from '../../lib/dateUtils';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';
  import type { AnalyticsCategory, ExerciseTypeDef } from '../../lib/types';
  import { exerciseSegments } from '../../lib/planning/sessionColors';
  import { clampZoom, pinchZoom, wheelZoom, scrollAfterZoom, showsExercises } from '../../lib/planning/calendarZoom';
  import type { PhaseMark } from '../../lib/planning/phaseStrip';
  import { capBars, isBarEvent, type HeaderBar } from '../../lib/planning/headerBars';
  import { calendarSessionColor, sessionStatus } from '../../lib/planning/sessionColors';
  import { swipeGuard } from '../../lib/analytics/swipe';
  import { portal } from '../../lib/ui/portal';
  import Icon from '@iconify/svelte';
  import { dropTarget, DRAG_HOLD_MS, DRAG_SLOP_PX } from '../../lib/planning/calendarDrag';
  import { onDestroy, tick } from 'svelte';
  import PhaseStrip from './PhaseStrip.svelte';

  let {
    days,
    byDay,
    events,
    today,
    exerciseTypes,
    categories,
    isRunning,
    isFaded,
    onOpen,
    onOpenEvent,
    onPickDay,
    onAdd,
    phases = new Map(),
    phaseNames = false,
    onPickPhase,
    bars = [],
    eventColor = () => DEFAULT_EVENT_COLOR,
    byCategory = false,
    phaseTint = false,
    onMove,
  }: {
    days: number[];
    byDay: Map<number, CalendarSession[]>;
    /** The phone calendar's events - shown muted beside the sessions; a tap opens their details. */
    events: Map<number, DeviceEvent[]>;
    today: number;
    exerciseTypes: ExerciseTypeDef[];
    /** The analytics categories: their colours colour the sessions and their exercises. */
    categories: AnalyticsCategory[];
    isRunning: (s: CalendarSession) => boolean;
    isFaded: (s: CalendarSession) => boolean;
    onOpen: (s: CalendarSession, siblings: CalendarSession[]) => void;
    onOpenEvent?: (e: DeviceEvent) => void;
    onPickDay?: (day: number) => void;
    /** A tap on an empty stretch of a day: the day and the time (minutes after midnight, to the half hour). */
    onAdd?: (day: number, startMin: number) => void;
    /** The phase on each day, drawn as a thin strip (empty = off). */
    phases?: Map<number, PhaseMark>;
    phaseNames?: boolean;
    /** A tap on the phase strip: the first day of that stretch. */
    onPickPhase?: (day: number) => void;
    /** Trips, competitions and the phone calendar's all-day and multi-day events, as bars across the days (`headerBars`). */
    bars?: HeaderBar[];
    /** The colour of a phone-calendar event. */
    eventColor?: (e: DeviceEvent) => string;
    /** Sessions take their main category's colour instead of one shared colour. */
    byCategory?: boolean;
    /** A very light wash of the phase's colour behind each day. */
    phaseTint?: boolean;
    /** A planned session dropped on a day (and, from the hour grid, a time: minutes after midnight). Absent = sessions can't be dragged. */
    onMove?: (s: CalendarSession, day: number, startMin?: number) => void;
  } = $props();

  /** More than one column (Week); a single one (Day) is wide and tall. */
  const compact = $derived(days.length > 1);

  // How much a session shows depends on how wide its column really is - seven columns on a phone are narrow,
  // on a tablet or laptop they have room for times and exercises.
  let gridW = $state(0);
  const colW = $derived(gridW / days.length);
  const showMeta = $derived(colW >= 72);
  const showExercises = $derived(colW >= 104);

  // The time scale: an hour is taller where there is room to read (Day most, a narrow Week least), times the zoom
  // you pinch to (or ctrl + wheel). Remembered, so the calendar opens the way you left it.
  const ZOOM_KEY = 'plan.calendarZoom';
  let zoom = $state((() => { try { return clampZoom(Number(localStorage.getItem(ZOOM_KEY)) || 1); } catch { return 1; } })());
  const baseHour = $derived(!compact ? 72 : colW >= 104 ? 60 : 48);
  const HOUR_PX = $derived(baseHour * zoom);

  // The line for "now" on today's column.
  const clock = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  let nowMin = $state(clock());
  const clockTimer = setInterval(() => (nowMin = clock()), 60_000);
  onDestroy(() => clearInterval(clockTimer));

  /** A session or a phone-calendar event, placed on the same hour grid so they share its lanes. */
  type Item = { startMin: number; minutes: number } & ({ kind: 'session'; s: CalendarSession } | { kind: 'event'; e: DeviceEvent; key: number });

  const columns = $derived(
    days.map((day) => {
      const all = byDay.get(day) ?? [];
      // All-day and multi-day events are bars in the header; what is left is on the hour grid.
      const dayEvents = (events.get(day) ?? []).filter((e) => !isBarEvent(e));
      const items: Item[] = [
        ...all.flatMap((s): Item[] => (s.startMin === undefined ? [] : [{ kind: 'session', s, startMin: s.startMin, minutes: s.minutes }])),
        ...dayEvents.flatMap((e, key): Item[] => (e.startMin === undefined ? [] : [{ kind: 'event', e, key, startMin: e.startMin, minutes: e.minutes }])),
      ];
      return {
        day,
        all,
        untimed: all.filter((s) => s.startMin === undefined),
        blocks: layoutDay(items),
      };
    }),
  );
  /** The header bars: three rows at most, the last one "+N" for what doesn't fit, until you open it up. */
  const HEADER_ROWS = 3;
  let headerOpen = $state(false);
  const lanes = $derived(bars.reduce((n, b) => Math.max(n, b.lane + 1), 0));
  const capped = $derived(capBars(bars, days.length, headerOpen ? 0 : HEADER_ROWS));
  const barKey = (b: HeaderBar) => (b.kind === 'goal' ? `g${b.goal.id}` : `e${b.event.id}:${b.event.begin}`);

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
  const showNow = $derived(days.includes(today) && nowMin >= hours.from * 60 && nowMin <= hours.to * 60);

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
      swipeGuard.until = Date.now() + 60_000;
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
    const was = press?.active;
    stopListening();
    press = null;
    if (was) swipeGuard.until = Date.now() + 400;
  }
  function endPress() {
    const p = press;
    stopListening();
    press = null;
    if (p?.active) swipeGuard.until = Date.now() + 400;
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

  // --- Pinch (two fingers) or ctrl + wheel zooms the time scale, keeping the time under the fingers in place. ---
  let gridEl = $state<HTMLElement | null>(null);
  let pinch: { dist: number; zoom: number } | null = null;
  const touchDistance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  async function zoomTo(next: number, focusClientY: number) {
    const before = HOUR_PX;
    const scroller = gridEl?.closest('.overflow-y-auto') as HTMLElement | null;
    const focusY = focusClientY - (gridEl?.getBoundingClientRect().top ?? 0);
    zoom = clampZoom(next);
    try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch { /* per-viewer convenience only */ }
    await tick();
    if (scroller) scroller.scrollTop = scrollAfterZoom({ scrollTop: scroller.scrollTop, focusY, hourPxBefore: before, hourPxAfter: HOUR_PX });
  }
  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      cancelPress();
      pinch = { dist: touchDistance(e.touches), zoom };
    }
  }
  function onTouchMove(e: TouchEvent) {
    if (!pinch || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();
    void zoomTo(pinchZoom(pinch.zoom, pinch.dist, touchDistance(e.touches)), (e.touches[0].clientY + e.touches[1].clientY) / 2);
  }
  const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    void zoomTo(wheelZoom(zoom, e.deltaY), e.clientY);
  }
  /** The listeners need `passive: false` to stop the page zooming or scrolling under a pinch. */
  function gestures(node: HTMLElement) {
    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd, { passive: true });
    node.addEventListener('touchcancel', onTouchEnd, { passive: true });
    node.addEventListener('wheel', onWheel, { passive: false });
    return {
      destroy() {
        node.removeEventListener('touchstart', onTouchStart);
        node.removeEventListener('touchmove', onTouchMove);
        node.removeEventListener('touchend', onTouchEnd);
        node.removeEventListener('touchcancel', onTouchEnd);
        node.removeEventListener('wheel', onWheel);
      },
    };
  }
  const resetZoom = () => void zoomTo(1, gridEl?.getBoundingClientRect().top ?? 0);

  function addAt(e: MouseEvent, day: number) {
    if (e.target !== e.currentTarget || !onAdd) return;
    const y = e.offsetY;
    const minute = Math.round(((y / HOUR_PX) * 60 + hours.from * 60) / 30) * 30;
    onAdd(day, Math.min(minute, 23 * 60 + 30));
  }

  const hhmm = (min: number) => formatClock(min, trainingState.clock12);
  const dateOf = (day: number) => new Date(day * 86_400_000).getUTCDate();

  /** A session's colour: one shared green, or the category that takes most of it (strong on dark, pastel on light - see `.cal-fill`). */
  const colorOf = (s: CalendarSession) => calendarSessionColor(s.workout, exerciseTypes, categories, byCategory, sessionStatus(s, today));
  const soft = (s: CalendarSession) => (s.workout.provisional ? 'cal-soft' : '');
  const tone = (s: CalendarSession) => `${isFaded(s) ? 'opacity-40' : ''} ${isRunning(s) ? 'ring-1 ring-success' : ''}`;
  function meta(s: CalendarSession): string {
    const length = `${s.minutes} min${s.plannedMinutes ? ` (${s.plannedMinutes} planned)` : ''}`;
    return s.startMin !== undefined ? `${hhmm(s.startMin)} · ${length}` : length;
  }
  /** The hour labels' column: slimmer for seven days, so the days get the room. */
  const gutter = $derived(trainingState.clock12 ? 'w-11' : compact ? 'w-7' : 'w-9');

  // --- Easier-to-read text (Settings -> Plan calendar; all off by default) ---
  /** Whole-word wrapping (hyphenated only where a word is too long), no sliced lines, a little less side padding. */
  const wholeWords = $derived(trainingState.tunableOn('plan.gridWholeWords'));
  /** Pixels added to every event and session title (0 = the standard size); all of them stay the same size as each other. */
  const textExtra = $derived(Math.round(trainingState.tunable('plan.gridTextSize')));
  /** The Week grid wider than the screen, scrolling sideways, so each title has room. */
  const wide = $derived(compact && trainingState.tunableOn('plan.gridWide'));
  const peekOn = $derived(trainingState.tunableOn('plan.gridPeek'));
  const lang = typeof navigator === 'undefined' ? 'en' : navigator.language;
  const sizeClass = $derived(textExtra === 0 ? '' : showMeta ? 'cal-tx-label' : 'cal-tx-caption');
  /** How a title wraps in a block `heightPx` tall: with whole words, at most as many lines as fit, the last ending in an ellipsis. */
  function titleStyle(heightPx: number, chrome: number, minLines = 1): string {
    if (!wholeWords) return '';
    const line = (showMeta ? 19 : 14) + textExtra;
    const lines = Math.max(minLines, Math.floor((heightPx - chrome) / line));
    return `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};overflow:hidden;hyphens:auto;overflow-wrap:break-word;word-break:normal;`;
  }

  // Hold an event to see its whole title and time in a bubble (not on a session that a hold would start dragging).
  let peek = $state<{ text: string; sub?: string; x: number; y: number } | null>(null);
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  function peekStart(e: PointerEvent, text: string, sub?: string) {
    if (!peekOn || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = e.currentTarget as HTMLElement;
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      peek = { text, sub, x: Math.min(Math.max(r.left + r.width / 2, 110), window.innerWidth - 110), y: r.top };
      suppressClickUntil = performance.now() + 60_000;
      navigator.vibrate?.(10);
    }, 380);
  }
  function peekEnd() {
    clearTimeout(peekTimer);
    if (!peek) return;
    peek = null;
    suppressClickUntil = performance.now() + 400; // the click that ends a hold must not open the sheet
  }
  onDestroy(() => clearTimeout(peekTimer));
  const padL = $derived(compact ? 'pl-7' : 'pl-9');
  const weekLabel = $derived(formatWeek(weekIdOfDayIndex(days[0]), 'short'));
</script>

<!-- Wider days: the whole grid (header, strips, bars, hours) is 1.5 times the screen and scrolls sideways together; the hour labels stay put. -->
<div class={wide ? 'overflow-x-auto no-scrollbar -mx-4 px-4' : ''} data-no-swipe={wide ? true : undefined}>
<div class="space-y-1.5 short:space-y-1" style="{wide ? 'min-width: 150%; ' : ''}--grid-tx: {textExtra}px">
  {#if compact}
    <div class="flex pb-1 short:pb-0">
      <div class="{gutter} shrink-0 {wide ? 'sticky left-0 z-20 bg-surface' : ''} text-caption leading-tight text-content-subtle text-center pt-2" aria-label={formatWeek(weekIdOfDayIndex(days[0]), 'long')}>{weekLabel}</div>
      {#each columns as col (col.day)}
        <button
          onclick={() => onPickDay?.(col.day)}
          class="flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1 rounded-control transition-colors {col.day === today ? 'ring-1 ring-border-strong' : 'hover:bg-surface-elevated/40'}"
          aria-label="Open {dayNameOf(col.day)} {dateOf(col.day)}"
        >
          <span class="text-caption {col.day === today ? 'text-content font-semibold' : 'text-content-subtle'}">{dayNameOf(col.day).slice(0, colW >= 72 ? 3 : 2)}</span>
          <span class="min-w-6 h-6 px-1 flex items-center justify-center rounded-control text-label tabular-nums {col.day === today ? 'bg-content text-surface font-bold' : 'text-content'}">{dateOf(col.day)}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="flex items-center gap-2 {padL} pb-1">
      <span class="min-w-8 h-8 px-1.5 flex items-center justify-center rounded-control text-title tabular-nums {days[0] === today ? 'bg-content text-surface' : 'text-content'}">{dateOf(days[0])}</span>
      <span class="text-label text-content">{dayNameOf(days[0])}</span>
    </div>
  {/if}

  {#if phases.size > 0}
    <div class={padL}><PhaseStrip {days} marks={phases} names={phaseNames} onPick={onPickPhase} /></div>
  {/if}

  <!-- The bars: trips, competitions and the phone calendar's all-day and multi-day events, one bar across the days they cover. -->
  {#if capped.rows > 0}
    <div class="{padL} grid gap-y-0.5" style="grid-template-columns: repeat({days.length}, minmax(0, 1fr))">
      {#each capped.bars as bar (barKey(bar))}
        {@const edges = `${bar.startsBefore ? 'rounded-l-none' : 'rounded-l-control'} ${bar.endsAfter ? 'rounded-r-none' : 'rounded-r-control'}`}
        {@const place = `grid-column: ${bar.from + 1} / span ${bar.span}; grid-row: ${bar.lane + 1}`}
        {#if bar.kind === 'goal'}
          <div class="relative overflow-hidden flex items-center gap-1 min-w-0 mx-px px-1.5 py-0.5 cal-ink {edges}" style={place} title={bar.goal.name}>
            <span class="absolute inset-0 cal-fill {GOAL_STYLE[bar.goal.kind].fill}"></span>
            <Icon icon={GOAL_STYLE[bar.goal.kind].icon} class="relative text-xs shrink-0" />
            <span class="relative truncate {showMeta ? 'text-label' : 'text-caption leading-tight'}">{bar.goal.name}</span>
          </div>
        {:else}
          <button onclick={() => onOpenEvent?.(bar.event)} class="relative overflow-hidden flex items-center min-w-0 mx-px px-1.5 py-0.5 text-left cal-ink cal-edge {edges}" style="{place}; --cal-edge: {eventColor(bar.event)}" title={bar.event.title}>
            <span class="absolute inset-0 cal-fill cal-soft" style="background: {eventColor(bar.event)}"></span>
            <span class="relative truncate {showMeta ? 'text-label' : 'text-caption leading-tight'}">{bar.event.title}</span>
          </button>
        {/if}
      {/each}
      {#each capped.hidden as n, i (i)}
        {#if n > 0}
          <button onclick={() => (headerOpen = true)} class="mx-px px-1 py-1.5 min-h-8 rounded-control text-left text-caption leading-tight text-content-subtle hover:text-content hover:bg-surface-elevated/60" style="grid-column: {i + 1}; grid-row: {capped.rows}" aria-label="Show {n} more">+{n}</button>
        {/if}
      {/each}
    </div>
    {#if headerOpen && lanes > HEADER_ROWS}
      <button onclick={() => (headerOpen = false)} class="{padL} block min-h-8 text-caption leading-tight text-content-subtle hover:text-content">Show less</button>
    {/if}
  {/if}

  <!-- Sessions with no time of day. -->
  {#if columns.some((c) => c.untimed.length)}
    <div class="flex {padL} gap-px">
      {#each columns as col (col.day)}
        <div class="flex-1 min-w-0 space-y-px px-px">
          {#each col.untimed as s (s.workout.id)}
            <button
              data-session-id={s.workout.id}
              onclick={() => open(s, col.all)}
              onpointerdown={(e) => beginPress(e, s, false)}
              class="relative overflow-hidden w-full text-left rounded-control px-1.5 py-0.5 select-none cal-ink {tone(s)} {isDragged(s) ? 'shadow-card ring-1 ring-primary' : ''}"
              style={dragStyle(s)}
            >
              <span class="absolute inset-0 cal-fill {soft(s)} {colorOf(s)}"></span>
              <span lang={lang} class="relative block {sizeClass} {showMeta ? 'text-label font-medium truncate' : 'text-caption leading-tight font-medium truncate'}">{#if s.done && byCategory}<Icon icon="ic:baseline-check" class="inline text-xs -mt-0.5" /> {/if}{s.workout.notes || 'Session'}</span>
              {#if showMeta && !compact}
                <span class="relative block text-caption opacity-80">{meta(s)}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  {#if hasTimed}
  <div class="relative flex" style="height: {gridHeight}px" ondblclick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.gutter) resetZoom(); }} role="presentation">
    <div class="{gutter} shrink-0 relative {wide ? 'sticky left-0 z-20 bg-surface' : ''}" data-gutter="1">
      {#each hourList as h (h)}
        {#if h > hours.from}<span data-gutter="1" class="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-caption leading-none text-content-subtle tabular-nums" style="top: {(h - hours.from) * HOUR_PX}px">{formatHourLabel(h, trainingState.clock12)}</span>{/if}
      {/each}
      {#if showNow}<span class="absolute right-1.5 -translate-y-1/2 text-caption leading-none font-semibold text-danger tabular-nums bg-surface px-0.5 z-10" style="top: {px(nowMin)}px">{hhmm(nowMin)}</span>{/if}
    </div>
    <div class="relative flex-1 flex" bind:this={gridEl} use:gestures style="touch-action: pan-x pan-y">
      <!-- Pinch zoomed the hours: a small way back, only while zoomed (a double tap on the hour labels does the same). -->
      {#if zoom !== 1}
        <button onclick={resetZoom} class="tap absolute right-1 top-1 z-20 w-8 h-8 grid place-items-center rounded-full bg-surface shadow-card text-content-subtle hover:text-content" aria-label="Reset zoom" title="Reset zoom"><Icon icon="ic:baseline-restart-alt" class="text-lg" /></button>
      {/if}
      <!-- Measures the width only: observing the grid itself would see its height change with the zoom and trip ResizeObserver's loop guard. -->
      <div class="absolute inset-x-0 top-0 h-0 pointer-events-none" bind:clientWidth={gridW}></div>
      {#each hourList as h (h)}
        <div class="absolute inset-x-0 border-t border-border" style="top: {(h - hours.from) * HOUR_PX}px"></div>
        <div class="absolute inset-x-0 border-t border-dotted border-border/60" style="top: {(h - hours.from + 0.5) * HOUR_PX}px"></div>
      {/each}
      {#each columns as col (col.day)}
        <!-- A tap on the empty part of a day adds a session there; the + above is the other way in. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          bind:this={colEls[days.indexOf(col.day)]}
          data-calendar-day={col.day}
          class="relative flex-1 min-w-0 {compact ? 'border-l border-border/70' : ''}"
          onclick={(e) => addAt(e, col.day)}
        >
          {#if col.day === today}<span class="absolute inset-0 pointer-events-none bg-content/[0.05]" aria-hidden="true"></span>{/if}
          {#if phaseTint && phases.get(col.day)?.color}<span class="absolute inset-0 pointer-events-none opacity-[0.05] {phases.get(col.day)?.color}" aria-hidden="true"></span>{/if}
          {#each col.blocks as b (b.item.kind === 'session' ? b.item.s.workout.id : `e${b.item.e.id}:${b.item.key}`)}
            {@const it = b.item}
            <!-- The part of a block outside the hours shown is cut off (an event that runs through the night starts above the grid). -->
            {@const topMin = Math.max(b.top, hours.from * 60)}
            {@const bottomMin = Math.min(b.bottom, hours.to * 60)}
            {@const heightPx = Math.max(px(bottomMin) - px(topMin) - 1.5, 14)}
            {@const place = `top: ${px(topMin) + 0.5}px; height: ${heightPx}px; left: calc(${(b.lane / b.lanes) * 100}% + 1px); width: calc(${100 / b.lanes}% - 2px)`}
            {#if it.kind === 'event' && (b.bottom <= hours.from * 60 || b.top >= hours.to * 60)}
              <!-- Entirely outside the hours shown. -->
            {:else if it.kind === 'event'}
              <button onclick={(ev) => { ev.stopPropagation(); if (performance.now() < suppressClickUntil) return; onOpenEvent?.(it.e); }} onpointerdown={(e) => peekStart(e, it.e.title, `${hhmm(it.startMin)} – ${hhmm(Math.min(1440, it.startMin + it.minutes))}`)} onpointerup={peekEnd} onpointercancel={peekEnd} onpointerleave={peekEnd} oncontextmenu={(e) => { if (peekOn) e.preventDefault(); }} class="absolute overflow-hidden rounded-control bg-surface {showMeta ? 'px-2' : wholeWords ? 'px-0.5' : 'px-1'} py-1 cal-ink cal-edge text-left {peekOn ? 'select-none' : ''}" style="{place}; --cal-edge: {eventColor(it.e)}" aria-label="{it.e.title}, {hhmm(it.startMin)} – {hhmm(Math.min(1440, it.startMin + it.minutes))}">
                <span class="absolute inset-0 cal-fill cal-soft" style="background: {eventColor(it.e)}"></span>
                <span class="relative block">
                  <span lang={lang} class="block {sizeClass} {showMeta ? (wholeWords ? 'text-label' : 'text-label truncate') : 'text-caption leading-[14px] break-words'}" style={titleStyle(heightPx, 8)}>{it.e.title}</span>
                  {#if showMeta && heightPx >= 44}<span class="block text-caption opacity-80">{hhmm(it.startMin)} – {hhmm(Math.min(1440, it.startMin + it.minutes))}</span>{/if}
                </span>
              </button>
            {:else}
              {@const s = it.s}
              {@const segs = exerciseSegments(s.workout, exerciseTypes, categories)}
              {@const detail = showsExercises(heightPx, segs.length)}
              {@const ex = exerciseLines(s.workout, exerciseTypes, !compact ? 8 : showExercises ? 4 : 0)}
              <button
                data-session-id={s.workout.id}
                onclick={() => open(s, col.all)}
                onpointerdown={(e) => { beginPress(e, s, true); if (!movable(s)) peekStart(e, s.workout.notes || 'Session', meta(s)); }}
                onpointerup={peekEnd}
                onpointercancel={peekEnd}
                onpointerleave={peekEnd}
                oncontextmenu={(e) => { if (peekOn) e.preventDefault(); }}
                class="absolute flex flex-col items-stretch justify-start text-left rounded-control bg-surface select-none cal-ink {isDragged(s) ? 'shadow-card ring-1 ring-primary opacity-90' : 'overflow-hidden'} {tone(s)}"
                style="{place}; {dragStyle(s)}"
                aria-label="{s.workout.notes || 'Session'}, {meta(s)}"
                title={s.workout.notes || 'Session'}
              >
                <!-- Zoomed in, the whole card carries a wash of its category's colour, so the exercise blocks sit on a card of the session's own rather than on white. -->
                {#if detail}<span class="absolute inset-0 cal-wash {colorOf(s)}"></span>{/if}
                <!-- The banner: the session in the colour of its main category. -->
                <span class="relative block px-2 py-1.5 {detail ? 'shrink-0' : 'flex-1 min-h-0'}">
                  <span class="absolute inset-0 cal-fill {soft(s)} {colorOf(s)}"></span>
                  <span lang={lang} class="relative block font-medium {sizeClass} {showMeta ? 'text-label leading-snug' : 'text-caption leading-[14px] break-words'}" style={titleStyle(heightPx, showMeta ? 36 : 12, s.done && byCategory ? 2 : 1)}>{#if s.done && byCategory}<Icon icon="ic:baseline-check" class="inline text-xs -mt-0.5" /> {/if}{s.workout.notes || 'Session'}</span>
                  {#if showMeta}<span class="relative block text-caption opacity-80">{meta(s)}</span>{/if}
                  {#if !detail && ex.names.length}
                    <span class="relative block mt-0.5 text-caption opacity-80">
                      {#each ex.names as name}<span class="block truncate">{name}</span>{/each}
                      {#if ex.more}<span class="block">+{ex.more} more</span>{/if}
                    </span>
                  {/if}
                </span>
                <!-- Zoomed in: each exercise a block of its own under the banner, as long as it takes, in its own category's colour. -->
                {#if detail}
                  <span class="relative flex-1 min-h-0 flex flex-col gap-0.5 p-1">
                    {#each segs as seg (seg.slotId)}
                      <span class="relative overflow-hidden rounded-control px-1.5 flex items-start min-h-[14px]" style="flex: {seg.minutes} 1 0">
                        <span class="absolute inset-0 cal-fill {soft(s)} {seg.color ?? colorOf(s)}"></span>
                        <span class="relative truncate text-caption leading-[16px]">{seg.name}</span>
                      </span>
                    {/each}
                  </span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/each}
      {#if showNow}
        <div class="absolute inset-x-0 z-10 pointer-events-none" style="top: {px(nowMin)}px">
          <span class="absolute -left-1 -top-[3px] w-1.5 h-1.5 rounded-full bg-danger"></span>
          <span class="block h-px bg-danger"></span>
        </div>
      {/if}
    </div>
  </div>
{/if}
</div>
</div>

{#if peek}
  <!-- The held event's whole title and time. -->
  <div use:portal class="fixed z-[125] pointer-events-none max-w-[80vw] px-3 py-2 rounded-control bg-surface-elevated text-content shadow-card border border-border-strong/60" style="left: {peek.x}px; top: {peek.y}px; transform: translate(-50%, calc(-100% - 8px))" role="status">
    <p class="text-label font-semibold break-words">{peek.text}</p>
    {#if peek.sub}<p class="text-caption text-content-subtle tabular-nums">{peek.sub}</p>{/if}
  </div>
{/if}
