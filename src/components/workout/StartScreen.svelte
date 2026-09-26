<script lang="ts">
  /**
   * The "+" tab: start something now, plan something for later, or log a
   * benchmark. Planning opens the workout modal's editor on a blank session
   * (see `lib/workoutModal.svelte.ts`); this screen no longer edits
   * workouts itself.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { Workout } from '../../lib/types';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import BenchmarkForm from '../common/BenchmarkForm.svelte';
  import Icon from "@iconify/svelte";

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
   * Goes live immediately with an empty session - you add exercises as you
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

  function handleAddBenchmark() {
    isAddingBenchmark = true;
  }
</script>

<div class="w-full max-w-lg space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200 pb-12">
  <div class="space-y-4">
    <div class="flex items-center justify-between px-1">
      <h2 class="text-title text-content">Start Session</h2>
      <div class="h-1 w-8 bg-primary-hover rounded-full"></div>
    </div>

    <!-- Start Now is the primary, full-width action: going straight into
         a live session is the thing this screen is for, and it used to
         be indistinguishable from the planning path. Planning and
         benchmarks are the quieter pair beneath it. -->
    {#if trainingState.isSessionActive}
      <button
        onclick={() => trainingState.sessionStore.openModal()}
        class="w-full p-4 bg-success hover:bg-success-hover text-white rounded-card transition-all active:scale-[0.99] text-left flex items-center gap-3"
      >
        <Icon icon="ic:baseline-play-circle" class="text-2xl shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="text-label font-bold block truncate">Back to your session</span>
          <span class="text-caption text-white/75 block truncate">
            {trainingState.sessionStore.progress.settled}/{trainingState.sessionStore.progress.total} done &middot; already running
          </span>
        </span>
        <Icon icon="ic:baseline-chevron-right" class="text-lg shrink-0" />
      </button>
    {:else}
      <button
        onclick={handleStartNow}
        data-tour="add-start"
        class="w-full p-4 bg-primary hover:bg-primary-hover text-white rounded-card transition-all active:scale-[0.99] text-left flex items-center gap-3 shadow-[0_4px_18px_-6px_color-mix(in_srgb,var(--color-primary)_70%,transparent)]"
      >
        <Icon icon="ic:baseline-play-circle" class="text-2xl shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="text-label font-bold block truncate">Start Now</span>
          <span class="text-caption text-white/75 block truncate">Empty session &mdash; add exercises as you go</span>
        </span>
      </button>
    {/if}

    <div class="grid grid-cols-2 gap-2.5">
      <button
        onclick={handlePlanNew}
        data-tour="add-plan"
        class="p-3.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-card border border-border-strong/50 transition-all active:scale-[0.98] text-left flex flex-col gap-2"
      >
        <Icon icon="ic:baseline-edit-calendar" class="text-lg text-content-muted" />
        <span class="min-w-0">
          <span class="text-label font-bold block truncate">Plan a Session</span>
          <span class="text-caption text-content-subtle block truncate">Save it for later</span>
        </span>
      </button>

      <button
        onclick={handleAddBenchmark}
        data-tour="add-benchmark"
        class="p-3.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-card border border-border-strong/50 transition-all active:scale-[0.98] text-left flex flex-col gap-2"
      >
        <Icon icon="ic:baseline-insights" class="text-lg text-content-muted" />
        <span class="min-w-0">
          <span class="text-label font-bold block truncate">Log Benchmark</span>
          <span class="text-caption text-content-subtle block truncate">Record a test</span>
        </span>
      </button>
    </div>

    {#if isAddingBenchmark}
      <BenchmarkForm
        weekId={trainingState.currentWeekId}
        onSave={() => isAddingBenchmark = false}
        onCancel={() => isAddingBenchmark = false}
      />
    {/if}

    {#if plannedWorkouts.length > 0}
      <div class="space-y-2">
        <h3 class="text-section uppercase text-content-subtle px-1">Planned for this week</h3>
        <!-- Ordered by day, then start time - see sortWorkoutsBySchedule,
             which WorkoutStore.getPlannedWorkoutsForWeek applies. -->
        {#each plannedWorkouts as p}
          {@const isThisRunning = trainingState.sessionStore.isRunning(p.id)}
          {@const blocked = trainingState.isSessionActive && !isThisRunning}
          <button
            onclick={() => handleStartPlanned(p)}
            disabled={blocked}
            title={blocked ? 'Finish or discard the running session first' : undefined}
            class="w-full px-3 py-2.5 rounded-control text-left transition-all group flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed {p.provisional ? 'bg-surface/30 border border-dashed border-border hover:border-border-strong' : 'bg-surface/50 border border-border hover:bg-surface-elevated hover:border-border-strong'}"
          >
            <span class="w-9 shrink-0 text-center text-caption font-bold text-primary-hover bg-primary-hover/10 py-1 rounded-control leading-none">
              {p.dayOfWeek ? p.dayOfWeek.slice(0, 3) : '—'}
            </span>
            <span class="min-w-0 flex-1">
              <span class="text-label font-bold text-content block truncate">{p.notes}</span>
              <span class="text-caption text-content-subtle flex items-center gap-1">
                {#if p.provisional}
                  <!-- Still projected from the phase - logging it materialises the week. -->
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
