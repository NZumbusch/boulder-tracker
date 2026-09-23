<script lang="ts">
  /**
   * Settings-tab wrapper hosting the health/outdoor log domain components
   * (PLAN.md Phase 6) - mirrors ExerciseSettings.svelte's
   * "domain component(s) + settings-tab wrapper" pattern.
   */
  import BodyweightLog from '../health/BodyweightLog.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import Icon from '@iconify/svelte';
</script>

<div class="space-y-4">
  <BodyweightLog />
  <button
    onclick={() => trainingState.openSends()}
    class="w-full flex items-center justify-between p-4 bg-surface/50 hover:bg-surface-elevated/50 rounded-card border border-border shadow-card transition-colors"
  >
    <div class="flex items-center gap-3 text-left">
      <Icon icon="ic:baseline-terrain" class="text-xl text-primary" />
      <div>
        <p class="text-body font-bold text-content">Outdoor sends</p>
        <p class="text-caption text-content-subtle">Add, edit and import (8a.nu) under History → Sends</p>
      </div>
    </div>
    <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
  </button>
</div>
