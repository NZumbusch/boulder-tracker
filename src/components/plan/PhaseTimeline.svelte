<script lang="ts">
  /**
   * The phases on a scrolling timeline: one bar per block, as wide as its days, overlapping blocks stacked in lanes,
   * unplanned stretches inside the plan as dashed gaps you can tap to fill. Tap a bar to select it; the selected bar
   * grows handles - drag an end to change the first or last day, drag the body to move it - and the change is handed
   * out as a draft while the finger is down (so the page can say what it would do to the neighbours) and as a commit
   * on release. Presentational: the page decides what a commit does.
   */
  import { onMount, untrack } from 'svelte';
  import type { PhaseDef, TrainingBlock } from '../../lib/types';
  import { addDaysIso, toUtcDayIndex } from '../../lib/dateUtils';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { assignLanes, blockLength, dragDays, daysBetween, snapToWeek } from '../../lib/planning/phaseTimeline';
  import { swipeGuard } from '../../lib/analytics/swipe';

  let {
    blocks,
    phaseDefs,
    today,
    pxPerDay,
    selectedId = null,
    gaps = [],
    focusDate,
    onSelect,
    onDraft,
    onCommit,
    onPickDay,
  }: {
    blocks: TrainingBlock[];
    phaseDefs: PhaseDef[];
    today: string;
    pxPerDay: number;
    selectedId?: string | null;
    /** Days still ahead that no phase covers (see `openGaps`), drawn as dashed bars. */
    gaps?: { from: string; to: string; days: number }[];
    /** A day to bring into view (when it changes, the timeline scrolls there). */
    focusDate?: string;
    onSelect: (id: string | null) => void;
    onDraft?: (draft: { id: string; start: string; end: string } | null) => void;
    onCommit: (id: string, start: string, end: string) => void;
    /** A tap on empty timeline (a gap or the background): the day. */
    onPickDay: (iso: string) => void;
  } = $props();

  const LANE_H = 40;
  const RULER_H = 28;
  const HANDLE = 22;

  // The range drawn: a month before the first block (or today) to a few months after the last.
  const bounds = $derived.by(() => {
    const starts = [today, ...blocks.map((b) => b.startDate)].sort();
    const ends = [addDaysIso(today, 150), ...blocks.map((b) => b.endDate)].sort();
    const first = starts[0].slice(0, 8) + '01';
    return { from: toUtcDayIndex(addDaysIso(first, -31)), to: toUtcDayIndex(ends[ends.length - 1]) + 62 };
  });
  const totalDays = $derived(bounds.to - bounds.from + 1);
  const width = $derived(totalDays * pxPerDay);
  const xOf = (iso: string) => (toUtcDayIndex(iso) - bounds.from) * pxPerDay;
  const isoAt = (x: number) => dayIndexToIso(bounds.from + Math.floor(x / pxPerDay));

  const lanes = $derived(assignLanes(blocks));
  const laneCount = $derived(Math.max(1, ...[...lanes.values()].map((l) => l + 1)));

  // Month labels (and week ticks when zoomed in far enough to read them).
  const months = $derived.by(() => {
    const out: { iso: string; x: number; label: string; year: boolean }[] = [];
    const start = dayIndexToIso(bounds.from).slice(0, 8) + '01';
    let iso = start;
    for (let guard = 0; guard < 80; guard++) {
      const idx = toUtcDayIndex(iso);
      if (idx > bounds.to) break;
      if (idx >= bounds.from) {
        const d = new Date(idx * 86_400_000);
        out.push({ iso, x: xOf(iso), label: d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }), year: d.getUTCMonth() === 0 });
      }
      const [y, m] = iso.split('-').map(Number);
      iso = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    }
    return out;
  });
  const weeks = $derived.by(() => {
    if (pxPerDay < 12) return [];
    const out: number[] = [];
    for (let idx = bounds.from; idx <= bounds.to; idx++) if ((((idx + 3) % 7) + 7) % 7 === 0) out.push((idx - bounds.from) * pxPerDay);
    return out;
  });

  // --- Dragging ---
  type Mode = 'start' | 'end' | 'move';
  let suppressClickUntil = 0;
  let drag = $state<{ id: string; mode: Mode; x0: number; delta: number } | null>(null);

  /** Zoomed out (Quarter, Year) a day is a few pixels wide: dragging snaps to whole weeks instead of asking for a steady finger. */
  const snap = $derived(pxPerDay <= 6);
  function draftOf(b: TrainingBlock, mode: Mode, delta: number): { start: string; end: string } {
    const length = daysBetween(b.startDate, b.endDate);
    if (mode === 'move') {
      const start = addDaysIso(b.startDate, delta);
      const placed = snap ? snapToWeek(start, 'start') : start;
      return { start: placed, end: addDaysIso(placed, length) };
    }
    if (mode === 'start') {
      const start = addDaysIso(b.startDate, Math.min(delta, length));
      return { start: snap ? snapToWeek(start, 'start') : start, end: b.endDate };
    }
    const end = addDaysIso(b.endDate, Math.max(delta, -length));
    return { start: b.startDate, end: snap ? snapToWeek(end, 'end') : end };
  }
  /** The blocks as drawn: the one being dragged already where the finger has put it. */
  const shown = $derived(
    blocks.map((b) => {
      if (!drag || drag.id !== b.id) return b;
      const d = draftOf(b, drag.mode, drag.delta);
      return { ...b, startDate: d.start, endDate: d.end };
    }),
  );

  function begin(e: PointerEvent, b: TrainingBlock, mode: Mode) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { id: b.id, mode, x0: e.clientX, delta: 0 };
    swipeGuard.until = Date.now() + 60_000;
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const delta = dragDays(e.clientX - drag.x0, pxPerDay);
    if (delta === drag.delta) return;
    drag.delta = delta;
    const b = blocks.find((x) => x.id === drag!.id);
    if (b) { const d = draftOf(b, drag.mode, delta); onDraft?.({ id: b.id, start: d.start, end: d.end }); }
  }
  function end() {
    if (!drag) return;
    const { id, mode, delta } = drag;
    drag = null;
    swipeGuard.until = 0;
    onDraft?.(null);
    if (delta !== 0) suppressClickUntil = Date.now() + 300;
    const b = blocks.find((x) => x.id === id);
    if (b && delta !== 0) { const d = draftOf(b, mode, delta); if (d.start !== b.startDate || d.end !== b.endDate) onCommit(id, d.start, d.end); }
  }
  function cancel() {
    drag = null;
    swipeGuard.until = 0;
    onDraft?.(null);
  }

  // --- Scrolling ---
  let scroller = $state<HTMLElement>();
  function scrollToDay(iso: string, smooth = true) {
    if (!scroller) return;
    scroller.scrollTo({ left: Math.max(0, xOf(iso) - scroller.clientWidth * 0.3), behavior: smooth ? 'smooth' : 'auto' });
  }
  onMount(() => scrollToDay(focusDate ?? today, false));
  let lastFocus = untrack(() => focusDate);
  $effect(() => {
    if (focusDate && focusDate !== lastFocus) { lastFocus = focusDate; scrollToDay(focusDate); }
  });

  function background(e: MouseEvent) {
    if (e.target !== e.currentTarget) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onPickDay(isoAt(e.clientX - rect.left));
    onSelect(null);
  }

  const colorOf = (b: TrainingBlock) => b.color || phaseDefs.find((p) => p.id === b.phaseId)?.color || 'bg-status-neutral';
  const todayX = $derived(xOf(today) + pxPerDay / 2);
</script>

<!-- The sideways scroll must not page the calendar or the screen. -->
<div bind:this={scroller} class="overflow-x-auto no-scrollbar -mx-4 px-4" data-no-swipe>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="relative select-none" style="width: {width}px; height: {RULER_H + laneCount * LANE_H + 12}px" onclick={background}>
    <!-- The ruler -->
    {#each weeks as x (x)}<span class="absolute top-[18px] w-px h-2 bg-border pointer-events-none" style="left: {x}px"></span>{/each}
    {#each months as m (m.iso)}
      <span class="absolute top-0 bottom-0 w-px bg-border/60 pointer-events-none" style="left: {m.x}px"></span>
      <span class="absolute top-0 pl-1.5 text-caption leading-[22px] pointer-events-none {m.year ? 'text-content font-semibold' : 'text-content-subtle'}" style="left: {m.x}px">{m.label}{m.year ? ` ${m.iso.slice(0, 4)}` : ''}</span>
    {/each}

    <!-- Today -->
    <span class="absolute top-[22px] bottom-0 w-px bg-danger/70 pointer-events-none z-[1]" style="left: {todayX}px"></span>
    <span class="absolute top-[19px] w-1.5 h-1.5 -ml-[2.5px] rounded-full bg-danger pointer-events-none z-[1]" style="left: {todayX}px"></span>

    <!-- Days inside the plan that have no phase -->
    {#each gaps as g (g.from)}
      <button
        onclick={(e) => { e.stopPropagation(); onPickDay(g.from); }}
        class="absolute rounded-control border border-dashed border-warning/60 text-warning text-caption leading-tight flex items-center justify-center overflow-hidden hover:bg-warning/10 transition-colors"
        style="left: {xOf(g.from)}px; width: {g.days * pxPerDay}px; top: {RULER_H}px; height: {LANE_H - 6}px"
        aria-label="{g.days} day{g.days === 1 ? '' : 's'} without a phase from {g.from} - start one"
      >{#if g.days * pxPerDay >= 56}No phase{/if}</button>
    {/each}

    <!-- The blocks -->
    {#each shown as b (b.id)}
      {@const lane = lanes.get(b.id) ?? 0}
      {@const selected = selectedId === b.id}
      {@const dragging = drag?.id === b.id}
      {@const w = blockLength(b) * pxPerDay}
      <div
        class="absolute {selected ? 'z-[2]' : ''}"
        style="left: {xOf(b.startDate)}px; width: {w}px; top: {RULER_H + lane * LANE_H}px; height: {LANE_H - 6}px"
      >
        <button
          onclick={(e) => { e.stopPropagation(); if (Date.now() >= suppressClickUntil) onSelect(selected ? null : b.id); }}
          onpointerdown={selected ? (e) => begin(e, b, 'move') : undefined}
          onpointermove={move}
          onpointerup={end}
          onpointercancel={cancel}
          class="relative overflow-hidden w-full h-full rounded-control text-left px-2 flex items-center cal-ink {selected ? 'ring-2 ring-content/70 shadow-card' : ''} {dragging ? 'opacity-90' : ''}"
          style={selected ? 'touch-action: none' : undefined}
          aria-label="{b.name}, {b.startDate} to {b.endDate}{selected ? '. Drag to move' : ''}"
          aria-pressed={selected}
        >
          <span class="absolute inset-0 cal-fill {colorOf(b)}"></span>
          <span class="relative truncate text-label font-medium">{#if w >= 44}{b.name}{/if}</span>
        </button>
        {#if selected}
          <!-- Handles sit just inside each end, wide enough for a thumb. -->
          {#each ['start', 'end'] as const as side (side)}
            <span
              role="slider"
              tabindex="-1"
              aria-label={side === 'start' ? 'First day: drag to change' : 'Last day: drag to change'}
              aria-valuenow={side === 'start' ? toUtcDayIndex(b.startDate) : toUtcDayIndex(b.endDate)}
              onpointerdown={(e) => begin(e, blocks.find((x) => x.id === b.id) ?? b, side)}
              onpointermove={move}
              onpointerup={end}
              onpointercancel={cancel}
              class="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize z-[3]"
              style="{side === 'start' ? `left: -${HANDLE / 2}px` : `right: -${HANDLE / 2}px`}; width: {HANDLE}px; touch-action: none"
            ><span class="block w-1.5 h-5 rounded-full bg-content shadow-card"></span></span>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>
