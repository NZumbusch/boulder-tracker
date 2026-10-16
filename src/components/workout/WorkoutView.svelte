<script lang="ts">
  import { formatClockText } from '../../lib/timeFormat';
  import { askAboutSession } from '../../lib/ai/askAbout.svelte';
  import SessionReviewCard from './SessionReviewCard.svelte';
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
  import { formatDay } from '../../lib/dateUtils';
  import ExerciseCard from './ExerciseCard.svelte';
  import GroupCard from './GroupCard.svelte';
  import { workoutItems, groupMinutes } from '../../lib/exercise/groups';
  import { occurrenceOnDay, dayIndexOf } from '../../lib/planning/planB';
  import WorkoutShareImage from '../history/WorkoutShareImage.svelte';
  import PainHeadsUp from '../health/PainHeadsUp.svelte';
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
      if (workout.date) parts.push(formatDay(workout.date, { weekday: 'short' }));
      const mins = sessionDuration(workout);
      if (mins > 0) parts.push(formatMinutes(mins));
      if (workout.loadFactor) parts.push(`load ${Math.round(workout.loadFactor)} pts`);
    } else {
      if (workout.dayOfWeek) parts.push(workout.dayOfWeek);
      if (workout.startTime) parts.push(formatClockText(workout.startTime, trainingState.clock12));
      if (workout.plannedDuration) parts.push(`~${formatMinutes(workout.plannedDuration)}`);
    }
    if (workout.location) parts.push(workout.location);
    parts.push(`${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`);
    return parts.join(' · ');
  });

  let menuOpen = $state(false);
  let menuEl = $state<HTMLElement>();
  // A tap anywhere else (or Escape) closes the menu. The header is blurred, which turns a fixed scrim inside it into a header-sized one.
  $effect(() => {
    if (!menuOpen) return;
    const away = (e: Event) => { if (menuEl && !menuEl.contains(e.target as Node)) menuOpen = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') menuOpen = false; };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc); };
  });

  // "Swipe to flip through" is a hint: shown the first few times, then left out.
  const HINT_KEY = 'bt.hint.flipSessions';
  const HINT_SHOWS = 3;
  let flipHint = $state(false);
  let hintCounted = false;
  $effect(() => {
    if (!position || hintCounted) return;
    hintCounted = true;
    try {
      const n = Number(localStorage.getItem(HINT_KEY) ?? 0);
      if (n < HINT_SHOWS) { flipHint = true; localStorage.setItem(HINT_KEY, String(n + 1)); }
    } catch { /* no storage: no hint */ }
  });

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
    <button onclick={onClose} class="btn-icon -ml-2 shrink-0" aria-label="Close">
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
        <div class="flex items-center gap-1 text-caption text-content-subtle tabular-nums">
          <button onclick={() => onStep(-1)} disabled={position.index === 0} class="btn-icon -ml-3 disabled:opacity-30" aria-label="Previous session">
            <Icon icon="ic:baseline-chevron-left" class="text-lg" />
          </button>
          <span>{position.index + 1} / {position.total}</span>
          <button onclick={() => onStep(1)} disabled={position.index === position.total - 1} class="btn-icon disabled:opacity-30" aria-label="Next session">
            <Icon icon="ic:baseline-chevron-right" class="text-lg" />
          </button>
          {#if flipHint}<span>· swipe to flip through</span>{/if}
        </div>
      {/if}
    </div>
    <div class="relative shrink-0" bind:this={menuEl}>
      <button onclick={() => menuOpen = !menuOpen} class="btn-icon -mr-2" aria-label="More actions" aria-expanded={menuOpen}>
        <Icon icon="ic:baseline-more-vert" class="text-2xl" />
      </button>
      {#if menuOpen}
        <div class="absolute right-0 top-full mt-1 z-20 w-52 bg-surface-elevated border border-border-strong rounded-control shadow-card overflow-hidden animate-in fade-in slide-in-from-top-2">
          <button onclick={() => { menuOpen = false; askAboutSession(workout.id); }} class="w-full flex items-center gap-2 px-3 min-h-11 text-label text-content hover:bg-surface transition-colors text-left">
            <Icon icon="ic:baseline-auto-awesome" class="text-sm" /> Ask the AI about it
          </button>
          <button onclick={duplicate} class="w-full flex items-center gap-2 px-3 min-h-11 text-label text-content hover:bg-surface transition-colors text-left">
            <Icon icon="ic:baseline-content-copy" class="text-sm" /> Duplicate
          </button>
          {#if canPlanB}
            <button onclick={planB} class="w-full flex items-center gap-2 px-3 min-h-11 text-label text-content hover:bg-surface transition-colors text-left">
              <Icon icon="ic:baseline-call-split" class="text-sm" /> {planBHere ? 'Edit Plan B' : 'Make a Plan B'}
            </button>
          {/if}
          {#if workout.planB?.side === 'B' && !isCompleted}
            <button onclick={sameAsPlanA} class="w-full flex items-center gap-2 px-3 min-h-11 text-label text-content hover:bg-surface transition-colors text-left">
              <Icon icon="ic:baseline-undo" class="text-sm" /> Same as Plan A
            </button>
          {/if}
          {#if isCompleted}
            <button onclick={() => { menuOpen = false; sharing = true; }} class="w-full flex items-center gap-2 px-3 min-h-11 text-label text-content hover:bg-surface transition-colors text-left">
              <Icon icon="ic:baseline-share" class="text-sm" /> Share
            </button>
          {/if}
          <button onclick={remove} class="w-full flex items-center gap-2 px-3 min-h-11 text-label text-danger hover:bg-surface transition-colors text-left">
            <Icon icon="ic:baseline-delete" class="text-sm" /> Delete
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>

<div class="flex-1 overflow-y-auto no-scrollbar">
  <div class="max-w-lg mx-auto w-full px-4 py-4 pb-32 space-y-2.5">
    <PainHeadsUp {workout} variant="line" />
    {#if workout.description}
      <p class="p-3.5 bg-surface-elevated/50 rounded-card text-body text-content-muted leading-relaxed whitespace-pre-wrap break-words">{workout.description}</p>
    {/if}

    {#if isCompleted && workout.logNotes}
      <div class="p-3.5 bg-surface-elevated/50 rounded-card space-y-1">
        <p class="text-caption uppercase text-content-subtle">How it went</p>
        <p class="text-body text-content leading-relaxed whitespace-pre-wrap break-words">{workout.logNotes}</p>
      </div>
    {/if}

    {#if isCompleted}
      <div class="p-3.5 bg-surface-elevated/50 rounded-card flex items-center gap-3">
        <div class="flex-1 grid grid-cols-4 gap-2">
          {#each RATING_AXES as r}
            <div class="min-w-0 text-center">
              <p class="text-caption text-content-subtle truncate">{r.label}</p>
              <p class="text-label font-bold text-content tabular-nums" aria-label="{r.label}: {workout[r.key] ?? 'not rated'}">{workout[r.key] ?? '–'}</p>
            </div>
          {/each}
        </div>
        <button
          onclick={() => trainingState.openFatigueModal(workout)}
          class="btn btn-quiet shrink-0 px-3 text-label text-primary bg-primary/10 hover:bg-primary/20"
        >Re-rate</button>
      </div>
    {/if}

    {#if isCompleted}
      <SessionReviewCard {workout} />
    {/if}

    {#each items as item (item.kind === 'slot' ? item.slot.id : `group:${item.group.id}`)}
      {#if item.kind === 'slot'}
        <ExerciseCard
          slot={item.slot}
          index={item.index}
          values={isCompleted ? item.slot.logged : undefined}
          showLog={isCompleted}
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
              showLog={isCompleted}
              status={isCompleted ? (m.slot.logged ? 'done' : 'skipped') : 'pending'}
            />
          {/each}
        </GroupCard>
      {/if}
    {:else}
      <div class="py-10 border-2 border-dashed border-border rounded-card text-center space-y-2">
        <p class="text-label text-content-subtle">No exercises in this session.</p>
        <button onclick={onEdit} class="btn btn-quiet px-3 text-label font-bold text-primary">Add exercises</button>
      </div>
    {/each}
  </div>
</div>

<footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
  <div class="max-w-lg mx-auto w-full px-4 py-3 space-y-1.5">
    {#if blocked && !isCompleted}
      <p class="text-caption text-content-subtle" role="status">Another session is running. Finish or discard it to start this one.</p>
    {:else if !isCompleted && !isThisRunning && workout.exercises.length > 0}
      <p class="text-caption text-content-subtle">Log as planned marks every exercise done as planned, then asks how it went.</p>
    {/if}
    <div class="flex items-center gap-2">
      <button onclick={onEdit} class="btn btn-ghost px-3">
        <Icon icon="ic:baseline-edit" class="text-base" /> Edit
      </button>
      {#if !isCompleted && !isThisRunning && workout.exercises.length > 0}
        <button onclick={logAsPlanned} class="btn btn-ghost px-3">
          <Icon icon="ic:baseline-done-all" class="text-base" /> Log as planned
        </button>
      {/if}
      <div class="flex-1"></div>
      {#if !isCompleted}
        <button
          onclick={start}
          disabled={blocked}
          class="btn px-5 {isThisRunning ? 'bg-success hover:bg-success-hover text-on-primary' : 'btn-primary'}"
        >
          <Icon icon="ic:baseline-play-arrow" class="text-base" /> {isThisRunning ? 'Resume' : 'Start'}
        </button>
      {/if}
    </div>
  </div>
</footer>

{#if sharing}
  <WorkoutShareImage {workout} onClose={() => sharing = false} />
{/if}
