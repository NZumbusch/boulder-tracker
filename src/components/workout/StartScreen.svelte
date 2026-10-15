<script lang="ts">
  /**
   * The "+" tab: start something now, plan something for later, or log a
   * benchmark. Planning opens the workout modal's editor on a blank session
   * (see `lib/workoutModal.svelte.ts`); this screen no longer edits
   * workouts itself.
   */
  import AppBar from '../nav/AppBar.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { Workout } from '../../lib/types';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import BenchmarkForm from '../common/BenchmarkForm.svelte';
  import Icon from "@iconify/svelte";
  import { openQuickTimerSheet } from '../../lib/timer/quickTimer.svelte';
  import { tick } from 'svelte';

  let { plannedWorkouts = [] }: { plannedWorkouts: Workout[] } = $props();

  let isAddingBenchmark = $state(false);

  /** A blank session for right now - the shape both "Start Now" and "Plan a Session" begin from. */
  function blankWorkout(): Workout {
    const d = new Date();
    return {
      id: generateId(),
      status: 'planned',
      date: d.toISOString(),
      weekId: trainingState.currentWeekId,
      notes: 'New Session',
      startTime: d.toTimeString().slice(0, 5),
      loadFactor: 0,
      exercises: [],
    };
  }

  /**
   * Goes live immediately with an empty session - the user adds exercises as they
   * do them, from inside the session modal. This is the spontaneous path;
   * it never touches the plan.
   */
  function handleStartNow() {
    trainingState.startSession(blankWorkout());
  }

  /** The planning path: build a session and save it for later, without starting it. */
  function handlePlanNew() {
    openWorkout(blankWorkout(), 'edit', true);
  }

  /** Starting a planned session goes live straight away, from its own copy. */
  function handleStartPlanned(p: Workout) {
    trainingState.startSession($state.snapshot(p) as Workout);
  }

  let benchmarkForm = $state<HTMLElement>();
  async function handleAddBenchmark() {
    isAddingBenchmark = true;
    // The form opens below the three cards: bring it into view, or the tap looks like it did nothing.
    await tick();
    benchmarkForm?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** At least one planned session cannot be started because another is running. */
  const someBlocked = $derived(trainingState.isSessionActive && plannedWorkouts.some((p) => !trainingState.sessionStore.isRunning(p.id)));
</script>

<div class="w-full max-w-lg space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200 pb-12">
  <AppBar title="Log a workout" />
  <div class="space-y-4">

    <!-- Start Now is the primary, full-width action: going straight into
         a live session is the thing this screen is for, and it used to
         be indistinguishable from the planning path. Planning and
         benchmarks are the quieter pair beneath it. -->
    {#if trainingState.isSessionActive}
      <button
        onclick={() => trainingState.sessionStore.openModal()}
        class="w-full p-4 bg-success hover:bg-success-hover text-on-primary rounded-card transition-all active:scale-[0.99] text-left flex items-center gap-3"
      >
        <Icon icon="ic:baseline-play-circle" class="text-2xl shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="text-label font-bold block truncate">Back to your session</span>
          <span class="text-caption text-on-primary/90 block">
            {trainingState.sessionStore.progress.settled}/{trainingState.sessionStore.progress.total} done · already running
          </span>
        </span>
        <Icon icon="ic:baseline-chevron-right" class="text-lg shrink-0" />
      </button>
    {:else}
      <button
        onclick={handleStartNow}
        data-tour="add-start"
        class="w-full p-4 bg-primary hover:bg-primary-hover text-on-primary rounded-card transition-all active:scale-[0.99] text-left flex items-center gap-3"
      >
        <Icon icon="ic:baseline-play-circle" class="text-2xl shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="text-label font-bold block truncate">Start now</span>
          <span class="text-caption text-on-primary/90 block">Empty session. Add exercises as you go.</span>
        </span>
      </button>
    {/if}

    <div class="grid grid-cols-2 gap-2.5">
      <button
        onclick={handlePlanNew}
        data-tour="add-plan"
        class="p-3.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-card transition-all active:scale-[0.98] text-left flex flex-col gap-2"
      >
        <Icon icon="ic:baseline-edit-calendar" class="text-lg text-content-muted" />
        <span class="min-w-0">
          <span class="text-label font-bold block">Plan a session</span>
          <span class="text-caption text-content-subtle block">Save it for later</span>
        </span>
      </button>

      <button
        onclick={handleAddBenchmark}
        data-tour="add-benchmark"
        class="p-3.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-card transition-all active:scale-[0.98] text-left flex flex-col gap-2"
      >
        <Icon icon="ic:baseline-insights" class="text-lg text-content-muted" />
        <span class="min-w-0">
          <span class="text-label font-bold block">Log a test</span>
          <span class="text-caption text-content-subtle block">Record a result</span>
        </span>
      </button>
    </div>

    <button
      onclick={openQuickTimerSheet}
      data-tour="add-timer"
      class="w-full p-3.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-card transition-all active:scale-[0.99] text-left flex items-center gap-3"
    >
      <Icon icon="ic:baseline-timer" class="text-lg text-content-muted shrink-0" />
      <span class="min-w-0 flex-1">
        <span class="text-label font-bold block truncate">Timer</span>
        <span class="text-caption text-content-subtle block">Intervals, a pacer or a countdown. No session needed.</span>
      </span>
      <Icon icon="ic:baseline-chevron-right" class="text-lg text-content-subtle shrink-0" />
    </button>

    {#if isAddingBenchmark}
      <div bind:this={benchmarkForm} class="scroll-mt-4">
      <BenchmarkForm
        weekId={trainingState.currentWeekId}
        onSave={() => isAddingBenchmark = false}
        onCancel={() => isAddingBenchmark = false}
      />
      </div>
    {/if}

    {#if plannedWorkouts.length === 0}
      <div class="px-1 py-2 space-y-1">
        <h3 class="text-section uppercase text-content-subtle">Planned for this week</h3>
        <p class="text-label text-content-subtle">Nothing planned this week.</p>
        <button onclick={() => trainingState.navigate('plan')} class="btn btn-quiet px-0 text-label font-bold text-primary">Open Plan</button>
      </div>
    {:else}
      <div class="space-y-2">
        <h3 class="text-section uppercase text-content-subtle px-1">Planned for this week</h3>
        {#if someBlocked}<p class="px-1 text-caption text-content-subtle">A session is already running. Finish or discard it to start another.</p>{/if}
        <!-- Ordered by day, then start time - see sortWorkoutsBySchedule,
             which WorkoutStore.getPlannedWorkoutsForWeek applies. -->
        {#each plannedWorkouts as p}
          {@const isThisRunning = trainingState.sessionStore.isRunning(p.id)}
          {@const blocked = trainingState.isSessionActive && !isThisRunning}
          <button
            onclick={() => handleStartPlanned(p)}
            disabled={blocked}
            title={blocked ? 'Finish or discard the running session first' : undefined}
            class="w-full px-3 py-2.5 min-h-14 rounded-control text-left transition-all group flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed {p.provisional ? 'bg-surface-elevated/30 hover:bg-surface-elevated/60' : 'bg-surface-elevated/50 hover:bg-surface-elevated'}"
          >
            <span class="w-10 shrink-0 text-center text-caption font-bold text-primary bg-primary/10 py-1 rounded-control leading-none">
              {p.dayOfWeek ? p.dayOfWeek.slice(0, 3) : '—'}
            </span>
            <span class="min-w-0 flex-1">
              <span class="text-label font-bold text-content block truncate">{p.notes}</span>
              <span class="text-caption text-content-subtle flex items-center gap-1">
                {#if p.provisional}
                  <!-- Still projected from the phase - logging it saves just this session. -->
                  <Icon icon="ic:outline-cloud-queue" class="text-xs text-primary/70 shrink-0" />
                {/if}
                <span class="truncate">
                  {[
                    p.startTime,
                    p.plannedDuration ? `${p.plannedDuration} min` : null,
                    `${p.exercises.length} ${p.exercises.length === 1 ? 'exercise' : 'exercises'}`,
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
            </span>
            {#if isThisRunning}
              <span class="shrink-0 text-caption font-bold text-success px-2 py-1 bg-success/10 rounded-control">Running</span>
            {:else}
              <Icon icon="ic:baseline-play-arrow" class="text-lg text-content-subtle group-hover:text-primary transition-colors shrink-0" />
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
