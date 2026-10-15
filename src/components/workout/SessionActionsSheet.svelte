<script lang="ts">
  /**
   * Quick actions for a session, from a long-press on its row: open,
   * start, log as planned, move to another day, duplicate, Plan B, delete
   * - without opening it first. The same actions as the viewer's.
   */
  import Sheet from '../ui/Sheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { sessionActions, closeSessionActions } from '../../lib/sessionActions.svelte';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import { askAboutSession } from '../../lib/ai/askAbout.svelte';
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
  const askAi = () => run((w) => askAboutSession(w.id));
  const remove = () => run((w) => trainingState.deleteWorkout(w.id));
</script>

{#snippet action(icon: string, label: string, onclick: () => void, tone = 'text-content')}
  <button {onclick} class="w-full flex items-center gap-3 px-2 min-h-12 rounded-control hover:bg-surface-elevated/60 transition-colors text-left {tone}">
    <Icon {icon} class="text-xl shrink-0 opacity-80" />
    <span class="text-body font-semibold">{label}</span>
  </button>
{/snippet}

{#if workout}
  <Sheet title={workout.notes || 'Session'} subtitle="{isCompleted ? 'Completed' : 'Planned'}{workout.dayOfWeek ? ` · ${workout.dayOfWeek}` : ''}" level="nested" onClose={closeSessionActions}>
    <div class="divide-y divide-border/60 -mt-2">
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
                class="min-h-11 rounded-control text-label font-bold transition-colors {workout.dayOfWeek === day ? 'bg-primary text-on-primary' : 'bg-surface-elevated/60 text-content-muted hover:text-content'}"
                aria-label="Move to {day}"
                aria-pressed={workout.dayOfWeek === day}
              >{day.slice(0, 3)}</button>
            {/each}
          </div>
        </div>
      {/if}
      {@render action('ic:baseline-auto-awesome', 'Ask the AI about it', askAi)}
      {@render action('ic:baseline-content-copy', 'Duplicate', duplicate)}
      {#if canPlanB}
        {@render action('ic:baseline-call-split', planBHere ? 'Edit Plan B' : 'Make a Plan B', planB)}
      {/if}
      {#if !isThisRunning}
        <!-- Deleting shows an Undo toast that puts the session back (trainingState.deleteWorkout). -->
        {@render action('ic:baseline-delete', 'Delete', remove, 'text-danger')}
      {/if}
    </div>
  </Sheet>
{/if}
