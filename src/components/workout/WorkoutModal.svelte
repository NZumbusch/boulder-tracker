<script lang="ts">
  /**
   * The one workout modal, full screen like the live session. Opens in
   * `view` by default; Edit switches to the editor in place, and saving or
   * backing out of the editor returns to the view. A brand-new session has
   * nothing to view, so backing out of its editor closes instead.
   * See `lib/workoutModal.svelte.ts`.
   */
  import { workoutModal, closeWorkout, stepWorkout, siblingPosition, updateSibling } from '../../lib/workoutModal.svelte';
  import { swipePaging, type SwipeDirection } from '../../lib/analytics/swipe';
  import { motionReduced } from '../../lib/motion';
  import { haptic } from '../../lib/native/haptics';
  import WorkoutView from './WorkoutView.svelte';
  import WorkoutEditor from './WorkoutEditor.svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';

  const workout = $derived(workoutModal.workout);
  // Back closes the viewer (the editor registers its own back, which runs first).
  const isOpen = $derived(!!workoutModal.workout);
  backWhile(() => isOpen, closeWorkout);

  // Swiping the viewer walks the list it was opened from (a Plan week,
  // History, Today) - left for the next session, right for the previous.
  const position = $derived(workoutModal.workout ? siblingPosition() : null);
  let viewEl = $state<HTMLElement | null>(null);
  function step(direction: SwipeDirection) {
    if (!stepWorkout(direction === 'next' ? 1 : -1)) return;
    haptic('tap');
    if (viewEl?.animate && !motionReduced()) {
      viewEl.animate(
        [{ transform: `translateX(${direction === 'prev' ? -32 : 32}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (workout && workoutModal.mode === 'view' && e.key === 'Escape') closeWorkout(); }} />

{#if workout}
  <div class="fixed inset-0 z-[110] safe-y bg-app-bg flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label={workout.notes || 'Session'}>
    {#if workoutModal.mode === 'edit'}
      {#key workout.id}
        <WorkoutEditor
          {workout}
          isNew={workoutModal.isNew}
          onSaved={(saved) => { workoutModal.workout = saved; updateSibling(saved); workoutModal.mode = 'view'; workoutModal.isNew = false; }}
          onCancel={() => { if (workoutModal.isNew) closeWorkout(); else workoutModal.mode = 'view'; }}
        />
      {/key}
    {:else}
      <div class="flex-1 min-h-0 flex flex-col touch-pan-y" bind:this={viewEl} use:swipePaging={step}>
        {#key workout.id}
          <WorkoutView {workout} {position} onStep={(d) => step(d === 1 ? 'next' : 'prev')} onEdit={() => workoutModal.mode = 'edit'} onClose={closeWorkout} />
        {/key}
      </div>
    {/if}
  </div>
{/if}
