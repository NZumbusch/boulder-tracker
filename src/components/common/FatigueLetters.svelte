<script lang="ts">
  /**
   * A session's four post-session ratings as letters and numbers (F7 A7 C6
   * S6), each letter in its area's colour - the same colours as Home's
   * Fatigue card and the Analytics fatigue chart. `FatigueLegend` explains the
   * letters once above a list; the screen-reader text spells them out.
   */
  import { RATING_AXES, FATIGUE_AXIS_COLORS } from '../../lib/constants';

  let { ratings }: { ratings: Partial<Record<(typeof RATING_AXES)[number]['key'], number | undefined>> } = $props();
  const shown = $derived(RATING_AXES.filter((a) => ratings[a.key] !== undefined));
</script>

{#if shown.length > 0}
  <span class="inline-flex gap-2 tabular-nums">
    <span class="sr-only">Felt in: {shown.map((a) => `${a.label} ${ratings[a.key]}`).join(', ')} of 10</span>
    {#each shown as a (a.key)}
      <span aria-hidden="true"><span class="font-semibold" style="color: {FATIGUE_AXIS_COLORS[a.key]}">{a.label[0]}</span>{ratings[a.key]}</span>
    {/each}
  </span>
{/if}
