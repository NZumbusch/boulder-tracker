<script lang="ts">
  /**
   * One exercise as the workout modal shows it: numbered pip, name, and a
   * grid of what it asks for. Shared by view and edit mode so switching
   * between them barely moves anything - edit just makes the card tappable
   * and adds its actions.
   */
  import type { Snippet } from 'svelte';
  import type { ExerciseSlot, ExerciseValues } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { detailPairs } from '../../lib/session/slotDetails';
  import { planNote, logNote } from '../../lib/exerciseSlot';
  import ExerciseDetails from './ExerciseDetails.svelte';
  import Icon from '@iconify/svelte';

  let {
    slot,
    index,
    values,
    status = 'pending',
    onclick,
    actions,
    inGroup = false,
    showLog = false,
  }: {
    slot: ExerciseSlot;
    index: number;
    /** The bucket to show; defaults to the prescription. */
    values?: ExerciseValues;
    /** A completed session marks each exercise done or skipped. */
    status?: 'pending' | 'done' | 'skipped';
    /** Makes the name area tappable (edit mode opens the exercise form). */
    onclick?: () => void;
    actions?: Snippet;
    /** A circuit member: drawn flatter, inside its group's card, without its own set rest. */
    inGroup?: boolean;
    /** Shows the plan's note and the "how it went" note apart (a finished session). */
    showLog?: boolean;
  } = $props();

  const pairs = $derived(detailPairs(slot, values, { inGroup }));
  const notes = $derived(showLog ? planNote(slot) || logNote(slot) : (values ?? slot.prescribed ?? slot.logged)?.notes);
</script>

<div class="rounded-card border transition-colors {status === 'skipped' ? 'bg-surface/20 border-border/60' : inGroup ? 'bg-surface/60 border-border/70' : 'bg-surface/40 border-border'} {onclick ? 'hover:border-border-strong' : ''}">
  <div class="flex items-center gap-3 p-3.5">
    <span class="shrink-0 w-8 h-8 rounded-full grid place-items-center text-caption font-bold {status === 'done' ? 'bg-success/15 text-success' : 'bg-surface-elevated text-content-subtle'}">
      {#if status === 'done'}
        <Icon icon="ic:baseline-check" class="text-base" />
      {:else if status === 'skipped'}
        <Icon icon="ic:baseline-remove" class="text-base" />
      {:else}
        {index + 1}
      {/if}
    </span>
    {#if onclick}
      <button {onclick} class="min-w-0 flex-1 text-left flex items-center gap-1.5">
        <span class="text-body font-bold text-content break-words min-w-0">{slotTypeName(slot, trainingState.exerciseTypes)}</span>
        <Icon icon="ic:baseline-chevron-right" class="text-lg text-content-subtle shrink-0" />
      </button>
    {:else}
      <div class="min-w-0 flex-1">
        <p class="text-body font-bold break-words {status === 'skipped' ? 'text-content-muted' : 'text-content'}">{slotTypeName(slot, trainingState.exerciseTypes)}</p>
        {#if status === 'skipped'}<p class="text-caption text-content-subtle">Skipped</p>{/if}
      </div>
    {/if}
    {@render actions?.()}
  </div>
  {#if status !== 'skipped' && (pairs.length > 0 || notes)}
    <div class="px-3.5 pb-3.5 space-y-2">
      <ExerciseDetails {slot} {values} {inGroup} {showLog} />
    </div>
  {/if}
</div>
