<script lang="ts">
  /**
   * Weather - the Settings UI over the
   * weather store/preferences. Off by default until a location is set.
   * A home location drives Home's Weather card; every saved crag gets its
   * conditions on the Crags card.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { WeatherLocation } from '../../lib/preferences/migrate';
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

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Weather</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Open-Meteo, no account needed. A home location shows current conditions on Home; each crag you add gets its own climbing conditions and forecast on the Crags card.
    </p>
  </div>

  <div class="divide-y divide-border">
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
    {#key trainingState.crags.length}
      <LocationEditor
        label={trainingState.crags.length === 0 ? 'Crag' : 'Add another crag'}
        location={null}
        onSet={(loc: WeatherLocation) => addCrag(loc)}
        onClear={() => {}}
      />
    {/key}
  </div>
</div>
