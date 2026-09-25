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
   * `xOf` maps a day to the chart's own x (left edge of that day, 0-100), so
   * the same strip lines up over week columns, month columns or days.
   */
  import Icon from '@iconify/svelte';

  let { segments, goals, xOf }: {
    segments: PhaseSegment[];
    goals: GoalMark[];
    xOf: (day: number) => number;
  } = $props();

  const drawn = $derived(segments.map((s) => {
    const left = xOf(s.startDay);
    const width = Math.max(xOf(s.endDay + 1) - left, 0);
    return { ...s, left, width };
  }).filter((s) => s.width > 0));

  const marks = $derived(goals.map((g) => {
    const left = xOf(g.startDay);
    return { ...g, left, width: Math.max(xOf(g.endDay + 1) - left, 0) };
  }).filter((g) => g.left < 100 && g.left + g.width > 0));
</script>

{#if drawn.length > 0 || marks.length > 0}
  <div class="relative h-4" aria-label="Training blocks and goals">
    {#each drawn as s (s.id + s.startDay)}
      <div
        class="absolute top-0.5 h-3 rounded-[3px] {s.colorClass} opacity-70 overflow-hidden"
        style="left: calc({s.left}% + 1px); width: calc({s.width}% - 2px);"
        title={s.name}
      >
        {#if s.width >= 16}
          <span class="block px-1 text-[9px] leading-3 font-semibold text-white truncate">{s.name}</span>
        {/if}
      </div>
    {/each}
    {#each marks as g (g.id)}
      <div
        class="absolute -top-1 flex items-center"
        style="left: {g.left}%; transform: translateX(-35%);"
        title={g.name}
      >
        <Icon icon={g.kind === 'trip' ? 'ic:baseline-terrain' : 'ic:baseline-emoji-events'} class="text-sm text-content drop-shadow" />
      </div>
      {#if g.kind === 'trip' && g.width > 0}
        <div class="absolute bottom-0 h-0.5 bg-content/60 rounded-full" style="left: {g.left}%; width: {g.width}%;"></div>
      {/if}
    {/each}
  </div>
{/if}
