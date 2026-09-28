<script lang="ts">
  /**
   * Quick actions for a session, from a long-press on its row: open,
   * start, log as planned, move to another day, duplicate, Plan B, delete
   * - without opening it first. The same actions as the viewer's.
   */
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { sessionActions, closeSessionActions } from '../../lib/sessionActions.svelte';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import { loggedDateFor } from '../../lib/planning/scheduledDate';
  import { occurrenceOnDay, dayIndexOf } from '../../lib/planning/planB';
  import type { DayOfWeek, Workout } from '../../lib/types';
  import Icon from '@iconify/svelte';

  const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const workout = $derived(sessionActions.workout);
  const isCompleted = $derived(workout?.status === 'completed');
  const isThisRunning = $derived(!!workout && trainingState.sessionStore.isRunning(workout.id));
  const blocked = $derived(trainingState.isSessionActive && !isThisRunning);
  const canPlanB = $derived(!!workout && !isCompleted && !!workout.dayOfWeek && !trainingState.planBEditing);
  const planBHere = $derived(
    workout?.dayOfWeek ? occurrenceOnDay(trainingState.planAlternatives, dayIndexOf(workout.weekId, workout.dayOfWeek)) : undefined,
  );

  /** Each action takes its copy first - closing clears `workout`. */
  function run(fn: (w: Workout) => unknown) {
    const w = workout;
    if (!w) return;
    closeSessionActions();
    void fn(w);
  }

  const open = () => run((w) => openWorkout(w, 'view', false, sessionActions.siblings));
  const start = () => run((w) => trainingState.startSession(w));
  const logAsPlanned = () => run((w) => {
    const done = { ...w, exercises: w.exercises.map((e) => e.logged ? e : { ...e, logged: { ...(e.prescribed ?? {}) } }), status: 'completed' as const };
    done.date = loggedDateFor(done);
    trainingState.openFatigueModal(done);
  });
  const moveTo = (day: DayOfWeek) => run((w) => w.dayOfWeek !== day && trainingState.saveWorkoutQuiet({ ...w, dayOfWeek: day }));
  const duplicate = () => run((w) => trainingState.duplicateWorkout(w));
  const planB = () => run((w) => trainingState.editPlanBAt(w.weekId, w.dayOfWeek));
  const remove = () => run((w) => trainingState.deleteWorkout(w.id));

  backWhile(() => !!sessionActions.workout, closeSessionActions);
</script>

{#snippet action(icon: string, label: string, onclick: () => void, tone = 'text-content')}
  <button {onclick} class="w-full flex items-center gap-3 px-2 py-3 rounded-control hover:bg-surface-elevated/60 transition-colors text-left {tone}">
    <Icon {icon} class="text-xl shrink-0 opacity-80" />
    <span class="text-body font-semibold">{label}</span>
  </button>
{/snippet}

{#if workout}
  <div class="fixed inset-0 pb-safe z-[115] flex items-end sm:items-center justify-center bg-app-bg/70 backdrop-blur-sm" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeSessionActions(); }}>
    <div use:sheetDrag={closeSessionActions} class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[85vh] overflow-y-auto no-scrollbar px-4 pt-5 pb-4 animate-in slide-in-from-bottom-4 duration-200">
      <div class="px-2 pb-2">
        <p class="text-caption uppercase text-content-subtle">{isCompleted ? 'Completed' : 'Planned'}{workout.dayOfWeek ? ` · ${workout.dayOfWeek}` : ''}</p>
        <h3 class="text-title text-content truncate">{workout.notes || 'Session'}</h3>
      </div>
      <div class="divide-y divide-border/60">
        {@render action('ic:baseline-open-in-new', 'Open', open)}
        {#if !isCompleted && !blocked}
          {@render action('ic:baseline-play-arrow', isThisRunning ? 'Resume' : 'Start', start, 'text-primary')}
        {/if}
        {#if !isCompleted && !isThisRunning}
          {@render action('ic:baseline-done-all', 'Log as planned', logAsPlanned)}
        {/if}
        {#if !isCompleted && !isThisRunning}
          <div class="px-2 py-3 space-y-2">
            <p class="flex items-center gap-3 text-body font-semibold text-content"><Icon icon="ic:baseline-event" class="text-xl opacity-80" /> Move to</p>
            <div class="grid grid-cols-7 gap-1">
              {#each DAYS as day}
                <button
                  onclick={() => moveTo(day)}
                  class="py-2 rounded-control text-label font-bold transition-colors {workout.dayOfWeek === day ? 'bg-primary text-white' : 'bg-surface-elevated/60 text-content-muted hover:text-content'}"
                  aria-label="Move to {day}"
                >{day.slice(0, 2)}</button>
              {/each}
            </div>
          </div>
        {/if}
        {@render action('ic:baseline-content-copy', 'Duplicate', duplicate)}
        {#if canPlanB}
          {@render action('ic:baseline-call-split', planBHere ? 'Edit Plan B' : 'Make a Plan B', planB)}
        {/if}
        {#if !isThisRunning}
          {@render action('ic:baseline-delete', 'Delete', remove, 'text-danger')}
        {/if}
      </div>
    </div>
  </div>
{/if}
