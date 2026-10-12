<script lang="ts">
  /** Saved timers, one tap from Home. Shows nothing until a timer has been saved (Timer sheet -> Save as a preset). */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../../lib/state.svelte';
  import { describePreset } from '../../../lib/timer/presets';
  import { openQuickTimerSheet, startQuickRun } from '../../../lib/timer/quickTimer.svelte';
  import SectionHeader from './SectionHeader.svelte';

  const presets = $derived(trainingState.timerPresets);
</script>

{#if presets.length > 0}
  <div class="card space-y-1">
    <SectionHeader label="Timer" />
    <div class="divide-y divide-border">
      {#each presets.slice(0, 4) as p (p.id)}
        <button onclick={() => startQuickRun({ title: p.name, variant: p.variant, values: p.values, leadIn: p.leadIn })} class="w-full flex items-center gap-3 py-2.5 text-left" aria-label="Start {p.name}">
          <span class="min-w-0 flex-1">
            <span class="block text-body text-content truncate">{p.name}</span>
            <span class="block text-caption text-content-subtle truncate">{describePreset(p)}</span>
          </span>
          <Icon icon="ic:baseline-play-circle" class="text-2xl text-primary shrink-0" />
        </button>
      {/each}
    </div>
    <button onclick={openQuickTimerSheet} class="w-full pt-2 text-label font-bold text-primary text-left px-0.5">{presets.length > 4 ? `All ${presets.length} timers…` : 'Another timer…'}</button>
  </div>
{/if}
