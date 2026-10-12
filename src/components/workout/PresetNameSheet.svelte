<script lang="ts">
  /** Names a timer preset: one field and Save. */
  import { trainingState } from '../../lib/state.svelte';
  import { toast } from '../../lib/toast.svelte';
  import { generateId } from '../../lib/utils';
  import { variantOf } from '../../lib/timer/presets';
  import type { ExerciseValues } from '../../lib/types';

  let { values, leadIn, suggestion = '', onDone }: { values: ExerciseValues; leadIn: number; suggestion?: string; onDone: () => void } = $props();
  // svelte-ignore state_referenced_locally
  let name = $state(suggestion);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    trainingState.saveTimerPreset({ id: generateId(), name: trimmed, variant: variantOf(values), values, leadIn });
    toast.show(`Saved "${trimmed}"`);
    onDone();
  }
</script>

<div class="fixed inset-0 z-[120] bg-black/50 flex items-end sm:items-center justify-center">
  <div class="absolute inset-0" onclick={onDone} role="presentation"></div>
  <form onsubmit={(e) => { e.preventDefault(); save(); }} class="relative w-full max-w-lg bg-surface rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 pb-8 space-y-3 shadow-2xl">
    <label class="block space-y-1.5">
      <span class="text-label text-content-subtle">Name this preset</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input autofocus bind:value={name} maxlength="40" class="w-full px-3 py-3 bg-surface-elevated text-content rounded-control border border-border-strong text-body outline-none focus:border-primary/50" />
    </label>
    <button type="submit" disabled={!name.trim()} class="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-control text-label font-bold disabled:opacity-40">Save</button>
  </form>
</div>
