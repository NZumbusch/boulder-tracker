<script lang="ts">
  import { openSessionActions } from '../../../lib/sessionActions.svelte';
  /** Today's planned sessions (tap to open, Start to go live), and this week's missed ones. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import type { Workout } from '../../../lib/types';
  import { openWorkout } from '../../../lib/workoutModal.svelte';
  import { summarizeSession } from '../../../lib/planning/sessionSummary';
  import { missedWorkouts } from '../../../lib/planning/weekStatus';
  import { sortWorkoutsBySchedule } from '../../../lib/planning/sortWorkouts';
  import { joinParts } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import ListRow from '../../common/ListRow.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  // An undecided Plan B offers both plans today - whichever you start or
  // log decides it. A decided one shows only the chosen plan.
  const todaysWorkouts = $derived(
    sortWorkoutsBySchedule(
      trainingState.getWeekPlanView(data.currentWeekId).shown.filter(
        (w) => w.status === 'planned' && w.dayOfWeek === data.todayName && (!w.planB || w.planB.active || !w.planB.decided),
      ),
    ),
  );
  const undecidedToday = $derived(todaysWorkouts.some((w) => w.planB && !w.planB.decided));
  // Earlier sessions this week that were neither logged nor skipped.
  const missed = $derived(missedWorkouts(data.weekWorkouts, data.todayName));
  let showMissed = $state(false);
  /** "Skip": keeps the session in the plan (and its planned load) but marks every slot skipped, so it stops counting as missed. */
  async function skipWorkout(workout: Workout) {
    await trainingState.saveWorkout({
      ...$state.snapshot(workout) as Workout,
      exercises: workout.exercises.map((slot) => ({ ...slot, skipped: true })),
    });
  }
</script>

<div class="card space-y-1">
  <SectionHeader
    label="Today"
    subtitle={undecidedToday ? 'Plan A or Plan B - start either one' : todaysWorkouts.length > 0 ? `${todaysWorkouts.length} session${todaysWorkouts.length === 1 ? '' : 's'} planned` : undefined}
  />
  <div class="divide-y divide-border">
  {#each todaysWorkouts as workout}
    {@const isThisRunning = trainingState.sessionStore.isRunning(workout.id)}
    {@const summary = summarizeSession(workout, trainingState.exerciseTypes)}
    {@const showTime = trainingState.homeDetails['today.time']}
    {@const showLoad = trainingState.homeDetails['today.load'] && summary.plannedLoad > 0}
    <ListRow
      title={workout.notes || 'Session'}
      meta={joinParts(
        workout.planB && `Plan ${workout.planB.side}`,
        showTime && summary.startTime,
        showTime && `${summary.estimated ? '~' : ''}${summary.minutes} min`,
        `${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`,
        showLoad && `load ${summary.plannedLoad} pts`,
      )}
      detail={trainingState.homeDetails['today.exercises'] && summary.exerciseNames.length > 0
        ? `${summary.exerciseNames.join(' · ')}${summary.moreExercises > 0 ? ` +${summary.moreExercises} more` : ''}`
        : undefined}
      muted={workout.provisional || (!!workout.planB && !workout.planB.active)}
      onclick={() => openWorkout(workout, 'view', false, todaysWorkouts)}
      onlongpress={() => openSessionActions(workout, todaysWorkouts)}
    >
      {#snippet trailing()}
        <!-- Start goes live: it begins the session and opens the session
             modal. While a session is running, only that one can be
             resumed from here. -->
        <button
          onclick={() => trainingState.startSession(workout)}
          disabled={trainingState.isSessionActive && !isThisRunning}
          title={trainingState.isSessionActive && !isThisRunning ? 'Finish or discard the running session first' : undefined}
          class="flex items-center gap-1 px-3.5 py-2 text-white text-label font-bold rounded-control shrink-0 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed {isThisRunning ? 'bg-success hover:bg-success-hover' : 'bg-primary hover:bg-primary-hover'}"
        >
          <Icon icon="ic:baseline-play-arrow" class="text-sm" /> {isThisRunning ? 'Resume' : 'Start'}
        </button>
      {/snippet}
    </ListRow>
  {:else}
    <div class="flex items-center justify-between gap-3">
      <p class="text-caption text-content-subtle italic">Nothing planned for today.</p>
      <button onclick={() => trainingState.navigate('add')} class="text-label text-primary shrink-0">Start a session</button>
    </div>
  {/each}
  </div>
  {#if trainingState.homeDetails['today.missed'] && missed.length > 0}
    <div class="pt-1 border-t border-border/60">
      <button onclick={() => showMissed = !showMissed} class="w-full flex items-center gap-1 pt-2 text-label text-content-muted hover:text-content" aria-expanded={showMissed}>
        <Icon icon="ic:baseline-chevron-right" class="text-base transition-transform {showMissed ? 'rotate-90' : ''}" />
        Missed this week ({missed.length})
      </button>
      {#if showMissed}
        <div class="divide-y divide-border mt-1">
          {#each missed as workout (workout.id)}
            <div class="flex items-center gap-2 py-1.5">
              <div class="min-w-0 flex-1">
                <p class="text-label text-content truncate">{workout.notes || 'Session'}</p>
                <p class="text-caption text-content-subtle">{workout.dayOfWeek}</p>
              </div>
              <button onclick={() => openWorkout(workout)} class="px-2.5 py-1 text-label text-primary bg-primary/10 hover:bg-primary/20 rounded-control shrink-0">Open</button>
              <button onclick={() => skipWorkout(workout)} class="px-2.5 py-1 text-label text-content-subtle hover:text-content bg-surface-elevated rounded-control shrink-0">Skip</button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
