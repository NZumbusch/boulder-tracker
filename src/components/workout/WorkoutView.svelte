<script lang="ts">
  import { RATING_AXES } from '../../lib/constants';
  /**
   * The workout modal's default mode: a read-only look at a session, laid
   * out like the running session minus everything live. Planned sessions
   * can be started or edited from here; completed ones are marked as such
   * and can be edited or re-rated, never started.
   */
  import type { Workout } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { formatMinutes } from '../../lib/session/formatSession';
  import { sessionDuration } from '../../lib/planning/sessionDuration';
  import { loggedDateFor } from '../../lib/planning/scheduledDate';
  import ExerciseCard from './ExerciseCard.svelte';
  import GroupCard from './GroupCard.svelte';
  import { workoutItems, groupMinutes } from '../../lib/exercise/groups';
  import { occurrenceOnDay, dayIndexOf } from '../../lib/planning/planB';
  import WorkoutShareImage from '../history/WorkoutShareImage.svelte';
  import Icon from '@iconify/svelte';

  let { workout, onEdit, onClose, position = null, onStep }: {
    workout: Workout;
    onEdit: () => void;
    onClose: () => void;
    /** Its place in the list it was opened from - shows "2 / 5" with arrows (swiping does the same). */
    position?: { index: number; total: number } | null;
    onStep?: (dir: 1 | -1) => void;
  } = $props();

  const isCompleted = $derived(workout.status === 'completed');
  const isThisRunning = $derived(trainingState.sessionStore.isRunning(workout.id));
  const blocked = $derived(trainingState.isSessionActive && !isThisRunning);

  const subtitle = $derived.by(() => {
    const parts: string[] = [];
    if (isCompleted) {
      if (workout.date) parts.push(new Date(workout.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
      const mins = sessionDuration(workout);
      if (mins > 0) parts.push(formatMinutes(mins));
      if (workout.loadFactor) parts.push(`load ${Math.round(workout.loadFactor)} pts`);
    } else {
      if (workout.dayOfWeek) parts.push(workout.dayOfWeek);
      if (workout.startTime) parts.push(workout.startTime);
      if (workout.plannedDuration) parts.push(`~${formatMinutes(workout.plannedDuration)}`);
    }
    parts.push(`${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`);
    return parts.join(' · ');
  });

  let menuOpen = $state(false);

  const items = $derived(workoutItems(workout));
  const minutesByGroup = $derived(groupMinutes(workout, isCompleted ? 'actual' : 'estimate'));

  // --- Plan B ---
  /** The Plan B stretch this session's day is in, if any. */
  const planBHere = $derived(
    workout.dayOfWeek ? occurrenceOnDay(trainingState.planAlternatives, dayIndexOf(workout.weekId, workout.dayOfWeek)) : undefined,
  );
  const canPlanB = $derived(!isCompleted && !!workout.dayOfWeek && !trainingState.planBEditing);
  // Every action that closes the viewer takes its copy of the session
  // first: closing clears the modal's workout, and this component's
  // `workout` prop reads straight through to it - after onClose() it is
  // null, which made Delete (and these) throw before doing anything.
  function planB() {
    menuOpen = false;
    const w = $state.snapshot(workout) as Workout;
    onClose();
    trainingState.editPlanBAt(w.weekId, w.dayOfWeek);
  }
  async function sameAsPlanA() {
    menuOpen = false;
    const w = $state.snapshot(workout) as Workout;
    if (!w.planB) return;
    onClose();
    await trainingState.revertPlanBSession(w.planB.altId, w);
  }
  let sharing = $state(false);

  async function duplicate() {
    menuOpen = false;
    await trainingState.duplicateWorkout(workout);
  }

  async function remove() {
    menuOpen = false;
    const id = workout.id;
    onClose();
    await trainingState.deleteWorkout(id);
  }

  function start() {
    const w = $state.snapshot(workout) as Workout;
    onClose();
    trainingState.startSession(w);
  }

  /** Marks a planned session done exactly as prescribed, then asks for the rating. */
  function logAsPlanned() {
    const w = $state.snapshot(workout) as Workout;
    w.exercises = w.exercises.map((e) => e.logged ? e : { ...e, logged: { ...(e.prescribed ?? {}) } });
    w.status = 'completed';
    // A missed session is recorded on its planned day, not today.
    w.date = loggedDateFor(w);
    trainingState.openFatigueModal(w);
  }
</script>

<header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
  <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 flex items-start gap-3">
    <button onclick={onClose} class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
      <Icon icon="ic:baseline-close" class="text-2xl" />
    </button>
    <div class="min-w-0 flex-1">
      {#if isCompleted}
        <p class="text-caption uppercase text-success flex items-center gap-1">
          <Icon icon="ic:baseline-check-circle" class="text-sm" /> Completed
        </p>
      {:else}
        <p class="text-caption uppercase text-primary flex items-center gap-1">
          {#if workout.provisional}<Icon icon="ic:outline-cloud-queue" class="text-sm" />{/if}
          Planned
          {#if workout.planB}
            <span class="flex items-center gap-0.5 normal-case text-content-subtle">· <Icon icon="ic:baseline-call-split" class="text-sm" />Plan {workout.planB.side}{workout.planB.decided && !workout.planB.active ? ', not chosen' : ''}</span>
          {/if}
        </p>
      {/if}
      <h2 class="text-title text-content break-words">{workout.notes || 'Session'}</h2>
      <p class="text-caption text-content-subtle mt-0.5">{subtitle}</p>
      {#if position && onStep}
        <div class="mt-1.5 flex items-center gap-1 text-caption text-content-subtle tabular-nums">
          <button onclick={() => onStep(-1)} disabled={position.index === 0} class="p-0.5 -ml-1 rounded-control hover:text-content disabled:opacity-30" aria-label="Previous session">
            <Icon icon="ic:baseline-chevron-left" class="text-lg" />
          </button>
          <span>{position.index + 1} / {position.total}</span>
          <button onclick={() => onStep(1)} disabled={position.index === position.total - 1} class="p-0.5 rounded-control hover:text-content disabled:opacity-30" aria-label="Next session">
            <Icon icon="ic:baseline-chevron-right" class="text-lg" />
          </button>
          <span class="text-content-subtle/70">· swipe to flip through</span>
        </div>
      {/if}
    </div>
    <div class="relative shrink-0">
      <button onclick={() => menuOpen = !menuOpen} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors" aria-label="More actions" aria-expanded={menuOpen}>
        <Icon icon="ic:baseline-more-vert" class="text-2xl" />
      </button>
      {#if menuOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed inset-0 z-10" onclick={() => menuOpen = false}></div>
        <div class="absolute right-0 top-full mt-1 z-20 w-44 bg-surface-elevated border border-border-strong rounded-control shadow-card overflow-hidden animate-in fade-in slide-in-from-top-2">
          <button onclick={duplicate} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-content hover:bg-surface transition-colors text-left">
            <Icon icon="ic:baseline-content-copy" class="text-sm" /> Duplicate
          </button>
          {#if canPlanB}
            <button onclick={planB} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-content hover:bg-surface transition-colors text-left">
              <Icon icon="ic:baseline-call-split" class="text-sm" /> {planBHere ? 'Edit Plan B' : 'Make a Plan B'}
            </button>
          {/if}
          {#if workout.planB?.side === 'B' && !isCompleted}
            <button onclick={sameAsPlanA} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-content hover:bg-surface transition-colors text-left">
              <Icon icon="ic:baseline-undo" class="text-sm" /> Same as Plan A
            </button>
          {/if}
          {#if isCompleted}
            <button onclick={() => { menuOpen = false; sharing = true; }} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-content hover:bg-surface transition-colors text-left">
              <Icon icon="ic:baseline-share" class="text-sm" /> Share
            </button>
          {/if}
          <button onclick={remove} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-danger hover:bg-surface transition-colors text-left">
            <Icon icon="ic:baseline-delete" class="text-sm" /> Delete
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>

<div class="flex-1 overflow-y-auto no-scrollbar">
  <div class="max-w-lg mx-auto w-full px-4 py-4 pb-32 space-y-2.5">
    {#if workout.description}
      <p class="p-3.5 bg-surface/40 border border-border rounded-card text-body text-content-muted leading-relaxed whitespace-pre-wrap break-words">{workout.description}</p>
    {/if}

    {#if isCompleted}
      <div class="p-3.5 bg-surface/40 border border-border rounded-card flex items-center gap-3">
        <div class="flex-1 grid grid-cols-4 gap-2">
          {#each RATING_AXES as r}
            <div class="min-w-0 text-center">
              <p class="text-caption text-content-subtle truncate">{r.label}</p>
              <p class="text-label font-bold text-content tabular-nums">{workout[r.key] ?? '—'}</p>
            </div>
          {/each}
        </div>
        <button
          onclick={() => trainingState.openFatigueModal(workout)}
          class="shrink-0 px-2.5 py-1.5 text-label text-primary bg-primary/10 hover:bg-primary/20 rounded-control transition-colors"
        >Re-rate</button>
      </div>
    {/if}

    {#each items as item (item.kind === 'slot' ? item.slot.id : `group:${item.group.id}`)}
      {#if item.kind === 'slot'}
        <ExerciseCard
          slot={item.slot}
          index={item.index}
          values={isCompleted ? item.slot.logged : undefined}
          status={isCompleted ? (item.slot.logged ? 'done' : 'skipped') : 'pending'}
        />
      {:else}
        <GroupCard group={item.group} minutes={minutesByGroup.get(item.group.id)}>
          {#each item.members as m (m.slot.id)}
            <ExerciseCard
              slot={m.slot}
              index={m.index}
              inGroup
              values={isCompleted ? m.slot.logged : undefined}
              status={isCompleted ? (m.slot.logged ? 'done' : 'skipped') : 'pending'}
            />
          {/each}
        </GroupCard>
      {/if}
    {:else}
      <p class="py-12 border-2 border-dashed border-border rounded-card text-center text-caption text-content-subtle italic">No exercises in this session.</p>
    {/each}
  </div>
</div>

<footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
  <div class="max-w-lg mx-auto w-full px-4 py-3 flex items-center gap-2">
    <button onclick={onEdit} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center gap-1.5">
      <Icon icon="ic:baseline-edit" class="text-base" /> Edit
    </button>
    {#if !isCompleted && !isThisRunning && workout.exercises.length > 0}
      <button
        onclick={logAsPlanned}
        class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center gap-1.5"
        title="Mark it done exactly as planned, then rate it"
      >
        <Icon icon="ic:baseline-done-all" class="text-base" /> Log as planned
      </button>
    {/if}
    <div class="flex-1"></div>
    {#if !isCompleted}
      <button
        onclick={start}
        disabled={blocked}
        title={blocked ? 'Finish or discard the running session first' : undefined}
        class="px-5 py-2.5 text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed {isThisRunning ? 'bg-success hover:bg-success-hover' : 'bg-primary hover:bg-primary-hover'}"
      >
        <Icon icon="ic:baseline-play-arrow" class="text-base" /> {isThisRunning ? 'Resume' : 'Start'}
      </button>
    {/if}
  </div>
</footer>

{#if sharing}
  <WorkoutShareImage {workout} onClose={() => sharing = false} />
{/if}
