<script lang="ts">
  /** What an exercise asks for (label/value grid) and its notes - shared by the workout modal's cards and the live session's current exercise. */
  import type { ExerciseSlot, ExerciseValues } from '../../lib/types';
  import { detailPairs } from '../../lib/session/slotDetails';

  let { slot, values, inGroup = false }: { slot: ExerciseSlot; values?: ExerciseValues; inGroup?: boolean } = $props();

  const pairs = $derived(detailPairs(slot, values, { inGroup }));
  const notes = $derived((values ?? slot.prescribed ?? slot.logged)?.notes);
</script>

{#if pairs.length > 0}
  <div class="grid grid-cols-2 gap-x-3 gap-y-2 p-3 bg-surface-elevated/40 rounded-control border border-border-strong/30">
    {#each pairs as pair}
      <div class="min-w-0">
        <p class="text-caption text-content-subtle truncate">{pair.label}</p>
        <p class="text-label font-bold text-content tabular-nums break-words">{pair.value}</p>
      </div>
    {/each}
  </div>
{/if}
{#if notes}
  <p class="text-caption text-content-muted italic px-1 whitespace-pre-wrap break-words">{notes}</p>
{/if}
