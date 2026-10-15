<script lang="ts">
  /**
   * The mark for one acute:chronic zone, told apart by shape as well as colour: a circle for the sweet spot (and a
   * grey circle for "low"), a diamond for caution, a triangle for high risk. Hollow means "not counted yet" (too
   * little history, or right after a break). Used by the ratio pane's points and its legend.
   */
  import type { AcwrZoneId } from '../../lib/analytics/acwrZone';

  let { zone, filled = true, size = 12 }: { zone: AcwrZoneId; filled?: boolean; size?: number } = $props();

  const COLOR: Record<AcwrZoneId, string> = {
    low: 'var(--color-status-neutral)',
    sweet: 'var(--color-status-good)',
    caution: 'var(--color-status-caution)',
    risk: 'var(--color-status-risk)',
  };
  const color = $derived(COLOR[zone]);
</script>

<svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" class="shrink-0 overflow-visible">
  {#if zone === 'caution'}
    <polygon points="7,0.8 13.2,7 7,13.2 0.8,7" fill={filled ? color : 'var(--color-surface)'} stroke={color} stroke-width="1.6" stroke-linejoin="round" />
  {:else if zone === 'risk'}
    <polygon points="7,1 13.2,12.6 0.8,12.6" fill={filled ? color : 'var(--color-surface)'} stroke={color} stroke-width="1.6" stroke-linejoin="round" />
  {:else}
    <circle cx="7" cy="7" r="5.2" fill={filled ? color : 'var(--color-surface)'} stroke={color} stroke-width="1.6" />
  {/if}
</svg>
