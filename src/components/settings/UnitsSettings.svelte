<script lang="ts">
  /**
   * Appearance -> General: display units. Everything is stored in °C, kg,
   * km/h and Font grades; these only change what's shown and typed.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { Units } from '../../lib/units';

  const ROWS: { key: keyof Units; label: string; hint?: string; options: [string, string][] }[] = [
    { key: 'temperature', label: 'Temperature', options: [['C', '°C'], ['F', '°F']] },
    { key: 'weight', label: 'Weight', options: [['kg', 'kg'], ['lb', 'lb']] },
    { key: 'wind', label: 'Wind', options: [['kmh', 'km/h'], ['mph', 'mph']] },
    { key: 'grades', label: 'Boulder grades', hint: 'V-scale groups Font grades into bands (6A and 6A+ are both V3); a V grade you type is saved as the lowest Font grade of its band.', options: [['font', 'Font'], ['v', 'V-scale']] },
  ];
</script>

<div class="card space-y-4 animate-in fade-in">
  <h3 class="text-section uppercase text-content-muted px-1">Units</h3>
  {#each ROWS as row (row.key)}
    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3">
        <p class="text-label text-content-subtle px-1">{row.label}</p>
        <div class="flex bg-surface-elevated/50 p-1 rounded-control shrink-0">
          {#each row.options as [value, label]}
            <button
              onclick={() => trainingState.setUnit(row.key, value as never)}
              class="px-3 py-1.5 text-label rounded-control transition-all {trainingState.units[row.key] === value ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
              aria-pressed={trainingState.units[row.key] === value}
            >{label}</button>
          {/each}
        </div>
      </div>
      {#if row.hint}<p class="text-caption text-content-subtle px-1">{row.hint}</p>{/if}
    </div>
  {/each}
</div>
