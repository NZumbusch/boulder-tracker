<script lang="ts">
  /** Today's planned sessions (tap to open, Start to go live), and this week's missed ones. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import type { Workout } from '../../../lib/types';
  import { openWorkout } from '../../../lib/workoutModal.svelte';
  import { summarizeSession } from '../../../lib/planning/sessionSummary';
  import { missedWorkouts } from '../../../lib/planning/weekStatus';
  import { joinParts } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const todaysWorkouts = $derived(
    trainingState.getPlannedWorkoutsForWeek(data.currentWeekId).filter((w) => w.dayOfWeek === data.todayName),
  );
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

<div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
  <SectionHeader icon="ic:baseline-today" label="Today" subtitle={todaysWorkouts.length > 0 ? `${todaysWorkouts.length} session${todaysWorkouts.length === 1 ? '' : 's'} planned` : undefined} />
  {#each todaysWorkouts as workout}
    {@const isThisRunning = trainingState.sessionStore.isRunning(workout.id)}
    {@const summary = summarizeSession(workout, trainingState.exerciseTypes)}
    {@const showTime = trainingState.homeDetails['today.time']}
    {@const showLoad = trainingState.homeDetails['today.load'] && summary.plannedLoad > 0}
    <div class="flex items-center justify-between p-3.5 rounded-control {workout.provisional ? 'bg-surface-elevated/20 border border-dashed border-border-strong/60' : 'bg-surface-elevated/50 border border-border-strong/50'}">
      <div
        class="min-w-0 flex-1 cursor-pointer"
        role="button"
        tabindex="0"
        onclick={() => openWorkout(workout)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWorkout(workout); } }}
      >
        <p class="text-body font-bold text-content truncate">{workout.notes}</p>
        <p class="text-caption text-content-subtle flex items-center gap-1">
          {#if workout.provisional}
            <Icon icon="ic:outline-cloud-queue" class="text-xs text-primary/70 shrink-0" />
          {/if}
          <span class="truncate">
            {joinParts(
              showTime && summary.startTime,
              showTime && `${summary.estimated ? '~' : ''}${summary.minutes} min`,
              `${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`,
              showLoad && `load ${summary.plannedLoad}`,
            )}
          </span>
        </p>
        {#if trainingState.homeDetails['today.exercises'] && summary.exerciseNames.length > 0}
          <p class="text-caption text-content-subtle truncate mt-0.5">
            {summary.exerciseNames.join(' · ')}{summary.moreExercises > 0 ? ` +${summary.moreExercises} more` : ''}
          </p>
        {/if}
      </div>
      <!-- Start goes live: it begins the session and opens the session
           modal, rather than opening the workout in the planning form.
           While a session is running, the only session that can be
           opened from here is that one. -->
      <button
        onclick={() => trainingState.startSession(workout)}
        disabled={trainingState.isSessionActive && !isThisRunning}
        title={trainingState.isSessionActive && !isThisRunning ? 'Finish or discard the running session first' : undefined}
        class="flex items-center gap-1 px-3 py-1.5 text-white text-label font-bold rounded-control shrink-0 ml-3 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed {isThisRunning
          ? 'bg-success hover:bg-success-hover'
          : 'bg-primary hover:bg-primary-hover shadow-[0_4px_14px_-4px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]'}"
      >
        <Icon icon="ic:baseline-play-arrow" class="text-sm" /> {isThisRunning ? 'Resume' : 'Start'}
      </button>
    </div>
  {:else}
    <div class="flex items-center justify-between gap-3">
      <p class="text-caption text-content-subtle italic">Nothing planned for today.</p>
      <button onclick={() => trainingState.navigate('add')} class="text-label text-primary shrink-0">Start a session</button>
    </div>
  {/each}
  {#if trainingState.homeDetails['today.missed'] && missed.length > 0}
    <div class="pt-1 border-t border-border/60">
      <button onclick={() => showMissed = !showMissed} class="w-full flex items-center gap-1 pt-2 text-label text-content-muted hover:text-content" aria-expanded={showMissed}>
        <Icon icon="ic:baseline-chevron-right" class="text-base transition-transform {showMissed ? 'rotate-90' : ''}" />
        Missed this week ({missed.length})
      </button>
      {#if showMissed}
        <div class="space-y-1.5 mt-2">
          {#each missed as workout (workout.id)}
            <div class="flex items-center gap-2 p-2.5 rounded-control bg-surface-elevated/30 border border-border-strong/40">
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
