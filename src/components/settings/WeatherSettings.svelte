<script lang="ts">
  /**
   * Weather (UI_PLAN.md §4.7/§5.5, Stage 8) - the Settings UI over the
   * weather store/preferences. Off by default until a location is set.
   * A home location drives Home's Weather card; up to `MAX_CRAGS` crags
   * each get their conditions on the Crags card.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { MAX_CRAGS, type WeatherLocation } from '../../lib/preferences/migrate';
  import LocationEditor from './LocationEditor.svelte';

  function setCrag(index: number, location: WeatherLocation) {
    const next = [...trainingState.crags];
    next[index] = location;
    trainingState.setCrags(next);
  }
  function removeCrag(index: number) {
    trainingState.setCrags(trainingState.crags.filter((_, i) => i !== index));
  }
  function addCrag(location: WeatherLocation) {
    trainingState.setCrags([...trainingState.crags, location]);
  }
</script>

<div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Weather</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Open-Meteo, no account needed. A home location shows current conditions on Home; up to {MAX_CRAGS} crags each get their own climbing conditions and forecast on the Crags card.
    </p>
  </div>

  <div class="space-y-3">
    <LocationEditor
      label="Home location"
      location={trainingState.homeLocation}
      onSet={(loc: WeatherLocation) => trainingState.setHomeLocation(loc)}
      onClear={() => trainingState.setHomeLocation(null)}
    />
    {#each trainingState.crags as crag, i (crag.name)}
      <LocationEditor
        label="Crag {i + 1}"
        location={crag}
        onSet={(loc: WeatherLocation) => setCrag(i, loc)}
        onClear={() => removeCrag(i)}
      />
    {/each}
    {#if trainingState.crags.length < MAX_CRAGS}
      {#key trainingState.crags.length}
        <LocationEditor
          label={trainingState.crags.length === 0 ? 'Crag' : 'Add another crag'}
          location={null}
          onSet={(loc: WeatherLocation) => addCrag(loc)}
          onClear={() => {}}
        />
      {/key}
    {/if}
  </div>
</div>
