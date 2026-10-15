<script lang="ts">
  /**
   * Appearance -> General: display units. Everything is stored in °C, kg,
   * km/h and Font grades; these only change what's shown and typed.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { Units } from '../../lib/units';
  import Segmented from '../ui/Segmented.svelte';

  const ROWS: { key: keyof Units; label: string; hint?: string; options: [string, string][] }[] = [
    { key: 'temperature', label: 'Temperature', options: [['C', '°C'], ['F', '°F']] },
    { key: 'weight', label: 'Weight', options: [['kg', 'kg'], ['lb', 'lb']] },
    { key: 'wind', label: 'Wind', options: [['kmh', 'km/h'], ['mph', 'mph']] },
    { key: 'grades', label: 'Boulder grades', hint: 'V-scale groups Font grades into bands (6A and 6A+ are both V3, for example). A V grade you type is saved as the lowest Font grade of its band.', options: [['font', 'Font'], ['v', 'V-scale']] },
  ];
</script>

<div class="card space-y-4 animate-in fade-in">
  <h2 class="text-section uppercase text-content-muted px-1">Units</h2>
  {#each ROWS as row (row.key)}
    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3">
        <p class="text-label text-content px-1">{row.label}</p>
        <Segmented
          variant="setting"
          label={row.label}
          value={trainingState.units[row.key] as string}
          onChange={(v) => trainingState.setUnit(row.key, v as never)}
          options={row.options.map(([value, label]) => ({ value, label }))}
        />
      </div>
      {#if row.hint}<p class="text-caption text-content-subtle px-1">{row.hint}</p>{/if}
    </div>
  {/each}
</div>
