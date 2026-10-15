<script lang="ts">
  /** Names a timer preset: one field and Save. */
  import Sheet from '../ui/Sheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { toast } from '../../lib/toast.svelte';
  import { generateId } from '../../lib/utils';
  import { variantOf } from '../../lib/timer/presets';
  import type { ExerciseValues } from '../../lib/types';

  let { values, leadIn, suggestion = '', onDone }: { values: ExerciseValues; leadIn: number; suggestion?: string; onDone: () => void } = $props();
  // svelte-ignore state_referenced_locally
  let name = $state(suggestion);
  const trimmed = $derived(name.trim());
  const duplicate = $derived(trimmed !== '' && trainingState.timerPresets.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()));

  function save() {
    if (!trimmed) return;
    trainingState.saveTimerPreset({ id: generateId(), name: trimmed, variant: variantOf(values), values, leadIn });
    toast.show(`Saved "${trimmed}"`);
    onDone();
  }
</script>

<Sheet title="Save as preset" level="nested" onClose={onDone}>
  <form id="preset-name-form" onsubmit={(e) => { e.preventDefault(); save(); }} class="space-y-1.5">
    <label class="block space-y-1.5">
      <span class="text-label text-content-subtle">Name this preset</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input autofocus bind:value={name} maxlength="40" enterkeyhint="done" class="field" />
    </label>
    {#if !trimmed}
      <p class="text-caption text-content-subtle">Give it a name to save it.</p>
    {:else if duplicate}
      <p class="text-caption text-warning">You already have a preset with this name - saving adds another.</p>
    {/if}
  </form>
  {#snippet footer()}
    <button type="submit" form="preset-name-form" disabled={!trimmed} class="btn btn-primary flex-1">Save</button>
    <button type="button" onclick={onDone} class="btn btn-ghost">Cancel</button>
  {/snippet}
</Sheet>
