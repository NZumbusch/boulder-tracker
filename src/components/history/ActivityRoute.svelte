<script lang="ts">
  /**
   * A route drawn from an activity's stored line. No map tiles: the app works
   * offline and a tile server would learn where you ran, so this is the
   * shape of the route alone (north up, proportions kept). `detail` adds the
   * start and finish dots and a bigger stroke.
   */
  import { decodeTrack, projectTrack } from '../../lib/activity/track';

  let { track, width = 64, height = 44, detail = false, label = 'Route' }: {
    track: string;
    width?: number;
    height?: number;
    detail?: boolean;
    label?: string;
  } = $props();

  const points = $derived(projectTrack(decodeTrack(track), width, height, detail ? 14 : 5));
  const path = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));
</script>

{#if points.length > 1}
  <svg viewBox="0 0 {width} {height}" class="text-primary" style="width: {width}px; height: {height}px;" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet" style:max-width="100%">
    <path d={path} fill="none" stroke="currentColor" stroke-width={detail ? 3 : 1.75} stroke-linecap="round" stroke-linejoin="round" />
    {#if detail}
      <circle cx={points[0].x} cy={points[0].y} r="5" class="fill-status-good" stroke="white" stroke-width="1.5" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="5" class="fill-danger" stroke="white" stroke-width="1.5" />
    {/if}
  </svg>
{/if}
