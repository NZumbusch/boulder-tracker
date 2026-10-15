<script lang="ts">
  /**
   * The Day and Week calendar views: hours down the side, one column per day,
   * a block per timed session as tall as the session is long. Sessions with
   * no time of day sit in a strip above the hours. Presentational - the data
   * comes in already resolved (see lib/planning/calendarEvents.ts).
   */
  import { layoutDay, visibleHours, exerciseLines, dayNameOf, weekIdOfDayIndex, type CalendarSession } from '../../lib/planning/calendarEvents';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';
  import type { AnalyticsCategory, ExerciseTypeDef } from '../../lib/types';
  import { sessionColor, exerciseSegments } from '../../lib/planning/sessionColors';
  import { clampZoom, pinchZoom, wheelZoom, scrollAfterZoom, showsExercises } from '../../lib/planning/calendarZoom';
  import type { PhaseMark } from '../../lib/planning/phaseStrip';
  import type { GoalBar } from '../../lib/planning/goalBars';
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
    goals = [],
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
    /** Trips and competitions among the days, as bars across them. */
    goals?: GoalBar[];
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

  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const dateOf = (day: number) => new Date(day * 86_400_000).getUTCDate();

  /** A session's colour: the category that takes most of it (strong on dark, pastel on light - see `.cal-fill`); the app's blue when none is known. */
  const colorOf = (s: CalendarSession) => sessionColor(s.workout, exerciseTypes, categories) ?? 'bg-primary';
  const soft = (s: CalendarSession) => (s.workout.provisional ? 'cal-soft' : '');
  const tone = (s: CalendarSession) => `${isFaded(s) ? 'opacity-40' : ''} ${isRunning(s) ? 'ring-1 ring-success' : ''}`;
  function meta(s: CalendarSession): string {
    const length = `${s.minutes} min${s.plannedMinutes ? ` (${s.plannedMinutes} planned)` : ''}`;
    return s.startMin !== undefined ? `${hhmm(s.startMin)} · ${length}` : length;
  }
  const weekLabel = $derived(weekIdOfDayIndex(days[0]).split('-W')[1]);
</script>

<div class="space-y-1.5 short:space-y-1">
  {#if compact}
    <div class="flex pb-1 short:pb-0">
      <div class="w-9 shrink-0 text-[9px] leading-tight text-content-subtle text-center pt-1.5 tracking-wide">WK<br />{weekLabel}</div>
      {#each columns as col (col.day)}
        <button
          onclick={() => onPickDay?.(col.day)}
          class="flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1 rounded-lg transition-colors {col.day === today ? 'ring-1 ring-border-strong' : 'hover:bg-surface-elevated/40'}"
          aria-label="Open {dayNameOf(col.day)} {dateOf(col.day)}"
        >
          <span class="text-[11px] {col.day === today ? 'text-content font-semibold' : 'text-content-subtle'}">{dayNameOf(col.day).slice(0, colW >= 72 ? 3 : 1)}</span>
          <span class="min-w-6 h-6 px-1 flex items-center justify-center rounded-md text-label tabular-nums {col.day === today ? 'bg-content text-surface font-bold' : 'text-content'}">{dateOf(col.day)}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="flex items-center gap-2 pl-9 pb-1">
      <span class="min-w-8 h-8 px-1.5 flex items-center justify-center rounded-lg text-title tabular-nums {days[0] === today ? 'bg-content text-surface' : 'text-content'}">{dateOf(days[0])}</span>
      <span class="text-label text-content">{dayNameOf(days[0])}</span>
    </div>
  {/if}

  {#if phases.size > 0}
    <div class="pl-9"><PhaseStrip {days} marks={phases} names={phaseNames} onPick={onPickPhase} /></div>
  {/if}

  <!-- Trips and competitions: a bar across the days they cover. -->
  {#if goals.length > 0}
    <div class="pl-9 grid gap-y-px" style="grid-template-columns: repeat({days.length}, minmax(0, 1fr))">
      {#each goals as bar (bar.goal.id)}
        <div
          class="relative overflow-hidden flex items-center gap-1 min-w-0 px-1.5 py-0.5 cal-ink {bar.startsBefore ? 'rounded-l-none' : 'rounded-l-md'} {bar.endsAfter ? 'rounded-r-none' : 'rounded-r-md'}"
          style="grid-column: {bar.from + 1} / span {bar.span}; grid-row: {bar.lane + 1}"
          title={bar.goal.name}
        >
          <span class="absolute inset-0 cal-fill {bar.goal.kind === 'trip' ? 'bg-sky-500' : 'bg-amber-500'}"></span>
          <Icon icon={bar.goal.kind === 'trip' ? 'ic:baseline-terrain' : 'ic:baseline-emoji-events'} class="relative text-xs shrink-0" />
          <span class="relative truncate {showMeta ? 'text-label' : 'text-[10px] leading-tight'}">{bar.goal.name}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Sessions with no time of day, and all-day events. -->
  {#if columns.some((c) => c.untimed.length || c.allDayEvents.length)}
    <div class="flex pl-9 gap-px">
      {#each columns as col (col.day)}
        <div class="flex-1 min-w-0 space-y-px px-px">
          {#each col.allDayEvents as e, i (`${e.id}:${i}`)}
            <div class="relative overflow-hidden rounded-md px-1.5 py-0.5 cal-ink truncate {showMeta ? 'text-label' : 'text-[10px] leading-tight'}"><span class="absolute inset-0 cal-fill bg-zinc-500" style={e.color ? `background: ${e.color}` : undefined}></span><span class="relative">{e.title}</span></div>
          {/each}
          {#each col.untimed as s (s.workout.id)}
            <button
              onclick={() => open(s, col.all)}
              onpointerdown={(e) => beginPress(e, s, false)}
              data-no-swipe
              class="relative overflow-hidden w-full text-left rounded-md px-1.5 py-0.5 select-none cal-ink {tone(s)} {isDragged(s) ? 'shadow-card ring-1 ring-primary' : ''}"
              style={dragStyle(s)}
            >
              <span class="absolute inset-0 cal-fill {soft(s)} {colorOf(s)}"></span>
              <span class="relative block {showMeta ? 'text-label font-medium truncate' : 'text-[10px] leading-tight font-medium truncate'}">{#if s.done}<Icon icon="ic:baseline-check" class="inline text-xs -mt-0.5" /> {/if}{s.workout.notes || 'Session'}</span>
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
    <div class="w-9 shrink-0 relative" data-gutter="1">
      {#each hourList as h (h)}
        {#if h > hours.from}<span data-gutter="1" class="absolute right-1.5 -translate-y-1/2 text-[10px] leading-none text-content-subtle tabular-nums" style="top: {(h - hours.from) * HOUR_PX}px">{h}</span>{/if}
      {/each}
      {#if showNow}<span class="absolute right-1.5 -translate-y-1/2 text-[10px] leading-none font-semibold text-danger tabular-nums bg-surface px-0.5 z-10" style="top: {px(nowMin)}px">{hhmm(nowMin)}</span>{/if}
    </div>
    <div class="relative flex-1 flex" bind:this={gridEl} use:gestures style="touch-action: pan-x pan-y">
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
          class="relative flex-1 min-w-0 {compact ? 'border-l border-border/70' : ''}"
          onclick={(e) => addAt(e, col.day)}
        >
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
              <button onclick={(ev) => { ev.stopPropagation(); onOpenEvent?.(it.e); }} data-no-swipe class="absolute overflow-hidden rounded-lg bg-surface px-2 py-1 cal-ink text-left" style={place} aria-label="{it.e.title}, {hhmm(it.startMin)} – {hhmm(Math.min(1440, it.startMin + it.minutes))}">
                <span class="absolute inset-0 cal-fill cal-soft bg-zinc-500" style={it.e.color ? `background: ${it.e.color}` : undefined}></span>
                <span class="relative block">
                  <span class="block {showMeta ? 'text-label truncate' : 'text-[11px] leading-[14px] break-words'}">{it.e.title}</span>
                  {#if showMeta}<span class="block text-caption opacity-80">{hhmm(it.startMin)} – {hhmm(Math.min(1440, it.startMin + it.minutes))}</span>{/if}
                </span>
              </button>
            {:else}
              {@const s = it.s}
              {@const segs = exerciseSegments(s.workout, exerciseTypes, categories)}
              {@const detail = showsExercises(heightPx, segs.length)}
              {@const ex = exerciseLines(s.workout, exerciseTypes, !compact ? 8 : showExercises ? 4 : 0)}
              <button
                onclick={() => open(s, col.all)}
                onpointerdown={(e) => beginPress(e, s, true)}
                data-no-swipe
                class="absolute flex flex-col items-stretch justify-start text-left rounded-lg bg-surface select-none cal-ink {isDragged(s) ? 'shadow-card ring-1 ring-primary opacity-90' : 'overflow-hidden'} {tone(s)}"
                style="{place}; {dragStyle(s)}"
                aria-label="{s.workout.notes || 'Session'}, {meta(s)}"
                title={s.workout.notes || 'Session'}
              >
                <!-- The banner: the session in the colour of its main category. -->
                <span class="relative block px-2 py-1.5 {detail ? 'shrink-0' : 'flex-1 min-h-0'}">
                  <span class="absolute inset-0 cal-fill {soft(s)} {colorOf(s)}"></span>
                  <span class="relative block font-medium {showMeta ? 'text-label leading-snug' : 'text-[11px] leading-[14px] break-words'}">{#if s.done}<Icon icon="ic:baseline-check" class="inline text-xs -mt-0.5" /> {/if}{s.workout.notes || 'Session'}</span>
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
                  <span class="flex-1 min-h-0 flex flex-col gap-0.5 p-0.5">
                    {#each segs as seg (seg.slotId)}
                      <span class="relative overflow-hidden rounded-md px-1.5 flex items-start min-h-[14px]" style="flex: {seg.minutes} 1 0">
                        <span class="absolute inset-0 cal-fill {soft(s)} {seg.color ?? colorOf(s)}"></span>
                        <span class="relative truncate text-[11px] leading-[16px]">{seg.name}</span>
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
