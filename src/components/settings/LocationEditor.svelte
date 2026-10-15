<script lang="ts">
  /**
   * One location field (home or trip) for `WeatherSettings.svelte`. City search via `trainingState.geocodeCity` is the
   * convenient path; raw lat/lon entry is always available too, so the
   * feature works with no geocoding call at all.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { WeatherLocation } from '../../lib/preferences/migrate';
  import { showUndo } from '../../lib/toast.svelte';

  let { label, location, onSet, onClear }: {
    label: string;
    location: WeatherLocation | null;
    onSet: (location: WeatherLocation) => void;
    onClear: () => void;
  } = $props();

  let editing = $state(false);
  let showManual = $state(false);
  let query = $state('');
  let searching = $state(false);
  let results = $state<{ name: string; countryCode?: string; latitude: number; longitude: number }[]>([]);
  let manualLat = $state('');
  let manualLon = $state('');
  let manualName = $state('');
  let manualError = $state('');
  let searched = $state(false);

  async function search() {
    if (!query.trim()) {
      results = [];
      return;
    }
    searching = true;
    results = await trainingState.geocodeCity(query);
    searching = false;
    searched = true;
  }

  function pick(r: (typeof results)[number]) {
    onSet({ name: r.countryCode ? `${r.name}, ${r.countryCode}` : r.name, latitude: r.latitude, longitude: r.longitude });
    closeEditor();
  }

  function applyManual() {
    // A decimal comma is accepted; a minus sign is typed as text, so west and south work on every keyboard.
    const lat = parseFloat(manualLat.replace(',', '.'));
    const lon = parseFloat(manualLon.replace(',', '.'));
    if (Number.isNaN(lat) || lat < -90 || lat > 90) { manualError = 'Latitude is a number from -90 to 90 (south is negative).'; return; }
    if (Number.isNaN(lon) || lon < -180 || lon > 180) { manualError = 'Longitude is a number from -180 to 180 (west is negative).'; return; }
    manualError = '';
    onSet({ name: manualName.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, latitude: lat, longitude: lon });
    closeEditor();
  }

  function closeEditor() {
    editing = false;
    showManual = false;
    query = '';
    results = [];
    manualLat = '';
    manualLon = '';
    manualName = '';
    manualError = '';
    searched = false;
  }

  function remove() {
    const before = location;
    onClear();
    if (before) showUndo(`${label} removed`, () => onSet(before));
  }
</script>

<div class="py-3 space-y-3">
  <div class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <p class="text-label text-content-subtle">{label}</p>
      <p class="text-body text-content truncate">{location?.name ?? '— off —'}</p>
    </div>
    <div class="flex items-center gap-3 shrink-0">
      {#if location}
        <button onclick={remove} class="btn-quiet px-2 text-label text-content-muted hover:text-danger">Remove</button>
      {/if}
      <button onclick={() => editing = !editing} class="btn-quiet px-2 text-label text-primary" aria-expanded={editing}>{location ? 'Edit' : 'Add'}</button>
    </div>
  </div>

  {#if editing}
    <div class="space-y-2.5 pt-2 border-t border-border/50 animate-in fade-in">
      {#if !showManual}
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={query}
            placeholder="Search city..."
            class="field flex-1"
            data-own-enter
            onkeydown={(e) => e.key === 'Enter' && search()}
          />
          <button onclick={search} disabled={searching} class="btn btn-primary shrink-0">
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {#if results.length > 0}
          <div class="space-y-1">
            {#each results as r}
              <button onclick={() => pick(r)} class="w-full text-left px-3 py-2 min-h-11 bg-surface-elevated hover:bg-surface-elevated-hover rounded-control text-body text-content transition-colors">
                {r.name}{r.countryCode ? `, ${r.countryCode}` : ''}
              </button>
            {/each}
          </div>
        {:else if query.trim() && searched && !searching}
          <p class="text-caption text-content-subtle italic">Nothing found, or no connection. Try a different search, or enter coordinates directly.</p>
        {/if}
        <button onclick={() => showManual = true} class="btn-quiet px-2 text-label text-content-muted hover:text-primary">Enter coordinates instead</button>
      {:else}
        <div class="grid grid-cols-2 gap-2">
          <input type="text" inputmode="text" autocomplete="off" aria-label="Latitude" bind:value={manualLat} oninput={() => (manualError = '')} placeholder="Latitude, e.g. 47.05" class="field" />
          <input type="text" inputmode="text" autocomplete="off" aria-label="Longitude" bind:value={manualLon} oninput={() => (manualError = '')} placeholder="Longitude, e.g. -8.31" class="field" />
        </div>
        <input type="text" bind:value={manualName} aria-label="Label" placeholder="Label (optional)" class="field" />
        {#if manualError}<p class="text-caption text-danger" role="alert">{manualError}</p>{/if}
        <div class="flex gap-2">
          <button onclick={applyManual} class="btn btn-primary flex-1">Set location</button>
          <button onclick={() => showManual = false} class="btn btn-secondary">Back</button>
        </div>
      {/if}
    </div>
  {/if}
</div>
