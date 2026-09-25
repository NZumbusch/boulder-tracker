<script lang="ts" module>
  export interface PhaseSegment {
    id: string;
    name: string;
    /** Tailwind background class, as Plan colours blocks. */
    colorClass: string;
    startDay: number;
    endDay: number;
  }
  export interface GoalMark {
    id: string;
    name: string;
    kind: 'competition' | 'trip';
    startDay: number;
    endDay: number;
  }
</script>

<script lang="ts">
  /**
   * A thin timeline strip over a chart: which training block each stretch
   * of the window belonged to, and where competitions and trips fell - the
   * context a bare "W34" axis never gave.
   *
   * Names too narrow to print inside their block, and every goal's name,
   * appear on a line under the strip when tapped (or hovered) - there is no
   * hover on a phone, so a tooltip-only label would be unreachable there.
   *
   * `xOf` maps a day to the chart's own x (left edge of that day, 0-100), so
   * the same strip lines up over week columns, month columns or days.
   */
  import Icon from '@iconify/svelte';
  import { isTapPointer, isKeyboardActivation } from '../../lib/analytics/chartTips.svelte';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';

  let { segments, goals, xOf }: {
    segments: PhaseSegment[];
    goals: GoalMark[];
    xOf: (day: number) => number;
  } = $props();

  const drawn = $derived(segments.map((s) => {
    const left = xOf(s.startDay);
    const width = Math.max(xOf(s.endDay + 1) - left, 0);
    return { ...s, key: `b-${s.id}-${s.startDay}`, left, width };
  }).filter((s) => s.width > 0));

  const marks = $derived(goals.map((g) => {
    const left = xOf(g.startDay);
    return { ...g, key: `g-${g.id}`, left, width: Math.max(xOf(g.endDay + 1) - left, 0) };
  }).filter((g) => g.left < 100 && g.left + g.width > 0));

  let active = $state<string | null>(null);
  let el = $state<HTMLElement | null>(null);
  $effect(() => {
    const onDown = (e: PointerEvent) => {
      if (el && !el.contains(e.target as Node)) active = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });

  const fmt = (day: number) => new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const activeInfo = $derived.by(() => {
    const seg = drawn.find((s) => s.key === active);
    if (seg) return { icon: 'ic:baseline-view-week', text: `${seg.name} · ${fmt(seg.startDay)} – ${fmt(seg.endDay)}` };
    const goal = marks.find((g) => g.key === active);
    if (goal) return {
      icon: goal.kind === 'trip' ? 'ic:baseline-terrain' : 'ic:baseline-emoji-events',
      text: `${goal.name} · ${fmt(goal.startDay)}${goal.endDay !== goal.startDay ? ` – ${fmt(goal.endDay)}` : ''}`,
    };
    return null;
  });
</script>

<!-- Always takes its row, even with no blocks or goals in the window, so
     the chart under it doesn't jump while paging into unplanned weeks. -->
<div bind:this={el} class="space-y-0.5">
    <div class="relative h-5" aria-label="Training blocks and goals">
      {#each drawn as s (s.key)}
        <button
          type="button"
          onpointerup={(e) => { if (isTapPointer(e)) active = active === s.key ? null : s.key; }}
          onclick={(e) => { if (isKeyboardActivation(e)) active = active === s.key ? null : s.key; }}
          onpointerenter={(e) => { if (!isTapPointer(e)) active = s.key; }}
          onpointerleave={(e) => { if (!isTapPointer(e) && active === s.key) active = null; }}
          aria-label="{s.name}, {fmt(s.startDay)} to {fmt(s.endDay)}"
          class="absolute top-1 h-3 rounded-[3px] {s.colorClass} overflow-hidden text-left transition-opacity {active && active !== s.key ? 'opacity-40' : 'opacity-70'}"
          style="left: calc({s.left}% + 1px); width: calc({s.width}% - 2px);"
        >
          {#if s.width >= 16}
            <span class="block px-1 text-[9px] leading-3 font-semibold text-white truncate">{s.name}</span>
          {/if}
        </button>
      {/each}
      {#each marks as g (g.key)}
        {#if g.kind === 'trip' && g.width > 0}
          <div class="absolute bottom-0 h-0.5 bg-content/60 rounded-full pointer-events-none" style="left: {g.left}%; width: {g.width}%;"></div>
        {/if}
        <!-- A 24px target around a 14px flag. -->
        <button
          type="button"
          onpointerup={(e) => { if (isTapPointer(e)) active = active === g.key ? null : g.key; }}
          onclick={(e) => { if (isKeyboardActivation(e)) active = active === g.key ? null : g.key; }}
          onpointerenter={(e) => { if (!isTapPointer(e)) active = g.key; }}
          onpointerleave={(e) => { if (!isTapPointer(e) && active === g.key) active = null; }}
          aria-label={g.name}
          class="absolute -top-1.5 w-6 h-6 flex items-center justify-center -translate-x-1/2"
          style="left: {g.left}%;"
        >
          <Icon icon={g.kind === 'trip' ? 'ic:baseline-terrain' : 'ic:baseline-emoji-events'} class="text-sm text-content drop-shadow" />
        </button>
      {/each}
    </div>
    {#if activeInfo}
      <p class="flex items-center gap-1 text-caption text-content-muted">
        <Icon icon={activeInfo.icon} class="text-sm shrink-0" />{activeInfo.text}
      </p>
    {/if}
</div>
