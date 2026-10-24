<script lang="ts">
  /**
   * An activity's route over a real map: street, terrain or satellite
   * pictures from free public tile servers (`lib/activity/mapTiles.ts`), the
   * route drawn on top in the same projection. Static - no panning - and only
   * the few tiles under the route are fetched. The credit the provider asks
   * for is always on the map; if no tile loads (offline, or the server
   * refuses) it says so and the route is still there.
   */
  import { decodeTrack } from '../../lib/activity/track';
  import { fitView, providerOf, tilesFor, tileUrl, toView, type MapStyle } from '../../lib/activity/mapTiles';

  let { track, style, height = 220, label = 'Route map' }: { track: string; style: MapStyle; height?: number; label?: string } = $props();

  let clientWidth = $state(320);
  const width = $derived(Math.max(200, Math.round(clientWidth)));
  const provider = $derived(providerOf(style));
  const line = $derived(decodeTrack(track));
  const view = $derived(fitView(line, width, height, provider.maxZoom));
  const tiles = $derived(tilesFor(view));
  const pts = $derived(line.map((p) => toView(p, view)));
  const path = $derived(pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));

  // Tiles that failed, by address; all of them failing means no map.
  let failed = $state<Record<string, true>>({});
  let loaded = $state(0);
  $effect(() => {
    style;
    track;
    failed = {};
    loaded = 0;
  });
  const key = (t: { z: number; x: number; y: number }) => `${t.z}/${t.x}/${t.y}`;
  const noMap = $derived(tiles.length > 0 && Object.keys(failed).length >= tiles.length && loaded === 0);
</script>

<div class="relative overflow-hidden rounded-card bg-surface-sunken" style="height: {height}px;" bind:clientWidth role="img" aria-label={label}>
  {#each tiles as t (provider.id + key(t))}
    <img
      src={tileUrl(provider, t)}
      alt=""
      width="256"
      height="256"
      draggable="false"
      referrerpolicy="strict-origin-when-cross-origin"
      class="absolute max-w-none select-none"
      style="left: {t.left}px; top: {t.top}px;"
      style:visibility={failed[key(t)] ? 'hidden' : 'visible'}
      onload={() => (loaded += 1)}
      onerror={() => (failed[key(t)] = true)}
    />
  {/each}

  {#if pts.length > 1}
    <svg class="absolute inset-0 pointer-events-none" viewBox="0 0 {width} {height}" {width} {height} aria-hidden="true">
      <path d={path} fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />
      <path d={path} fill="none" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={pts[0].x} cy={pts[0].y} r="5.5" fill="#16a34a" stroke="white" stroke-width="2" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="5.5" fill="#dc2626" stroke="white" stroke-width="2" />
    </svg>
  {/if}

  {#if noMap}
    <p class="absolute bottom-5 inset-x-2 text-center text-caption bg-white/90 text-black rounded px-2 py-1">The map could not load (offline, or the map service said no). The route is still shown.</p>
  {/if}

  <a href={provider.link} target="_blank" rel="noopener noreferrer" class="absolute bottom-0 right-0 max-w-full bg-white/80 text-[11px] leading-tight text-black px-1.5 py-0.5 truncate">{provider.attribution}</a>
</div>
