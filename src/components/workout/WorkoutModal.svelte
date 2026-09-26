<script lang="ts">
  /**
   * The one workout modal, full screen like the live session. Opens in
   * `view` by default; Edit switches to the editor in place, and saving or
   * backing out of the editor returns to the view. A brand-new session has
   * nothing to view, so backing out of its editor closes instead.
   * See `lib/workoutModal.svelte.ts`.
   */
  import { workoutModal, closeWorkout } from '../../lib/workoutModal.svelte';
  import WorkoutView from './WorkoutView.svelte';
  import WorkoutEditor from './WorkoutEditor.svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';

  const workout = $derived(workoutModal.workout);
  // Back closes the viewer (the editor registers its own back, which runs first).
  const isOpen = $derived(!!workoutModal.workout);
  backWhile(() => isOpen, closeWorkout);
</script>

<svelte:window onkeydown={(e) => { if (workout && workoutModal.mode === 'view' && e.key === 'Escape') closeWorkout(); }} />

{#if workout}
  <div class="fixed inset-0 z-[110] safe-y bg-app-bg flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label={workout.notes || 'Session'}>
    {#if workoutModal.mode === 'edit'}
      {#key workout.id}
        <WorkoutEditor
          {workout}
          isNew={workoutModal.isNew}
          onSaved={(saved) => { workoutModal.workout = saved; workoutModal.mode = 'view'; workoutModal.isNew = false; }}
          onCancel={() => { if (workoutModal.isNew) closeWorkout(); else workoutModal.mode = 'view'; }}
        />
      {/key}
    {:else}
      <WorkoutView {workout} onEdit={() => workoutModal.mode = 'edit'} onClose={closeWorkout} />
    {/if}
  </div>
{/if}
