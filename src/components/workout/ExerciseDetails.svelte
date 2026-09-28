<script lang="ts">
  /** What an exercise asks for (label/value grid) and its notes - shared by the workout modal's cards and the live session's current exercise. */
  import type { ExerciseSlot, ExerciseValues } from '../../lib/types';
  import { detailPairs, valuesLine } from '../../lib/session/slotDetails';
  import type { LastTime } from '../../lib/exercise/lastTime';
  import { trainingState } from '../../lib/state.svelte';
  import Icon from '@iconify/svelte';

  let { slot, values, inGroup = false, showHowTo = false, lastTime = null }: {
    slot: ExerciseSlot;
    values?: ExerciseValues;
    inGroup?: boolean;
    /** The exercise's library how-to, folded behind a tap (the live session shows it). */
    showHowTo?: boolean;
    /** What was logged the last time this exercise was done (the live session passes it). */
    lastTime?: LastTime | null;
  } = $props();
  const lastLine = $derived(lastTime ? valuesLine(lastTime.values) : '');

  const pairs = $derived(detailPairs(slot, values, { inGroup }));
  const notes = $derived((values ?? slot.prescribed ?? slot.logged)?.notes);
  const howTo = $derived(showHowTo ? trainingState.exerciseTypes.find((t) => t.id === slot.typeId)?.description : undefined);
  let howToOpen = $state(false);
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
{#if lastTime && lastLine}
  <p class="px-1 text-caption text-content-subtle flex items-center gap-1.5 min-w-0">
    <Icon icon="ic:baseline-history" class="text-sm shrink-0" />
    <span class="truncate">Last time <span class="tabular-nums">{new Date(lastTime.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>: <span class="text-content-muted font-bold">{lastLine}</span></span>
  </p>
{/if}
{#if notes}
  <p class="text-caption text-content-muted italic px-1 whitespace-pre-wrap break-words">{notes}</p>
{/if}
{#if howTo}
  <button onclick={() => howToOpen = !howToOpen} class="w-full text-left px-1 text-caption text-content-subtle hover:text-content transition-colors">
    <span class="flex items-center gap-1 font-bold">
      <Icon icon={howToOpen ? 'ic:baseline-expand-more' : 'ic:baseline-chevron-right'} class="text-sm" /> How to
    </span>
    {#if howToOpen}<span class="block mt-1 whitespace-pre-wrap break-words text-content-muted">{howTo}</span>{/if}
  </button>
{/if}
