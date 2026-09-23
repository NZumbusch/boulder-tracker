<script lang="ts">
  import { WEEK_DAYS } from '../../lib/constants';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekDateRange, getWeekDates, incrementWeekId, decrementWeekId } from '../../lib/dateUtils';
  import { generateId } from '../../lib/utils';
  import { getBlocksForWeek, getDominantBlockForWeek } from '../../lib/planning/trainingBlocks';
  import { sortWorkoutsBySchedule } from '../../lib/planning/sortWorkouts';
  import type { Workout, Benchmark, DayOfWeek } from '../../lib/types';
  import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action';
  import Icon from "@iconify/svelte";
  import BenchmarkForm from '../common/BenchmarkForm.svelte';
  import AICoachModal from './AICoachModal.svelte';
  import WeekShareImage from './WeekShareImage.svelte';
  import WeekCalendar from './WeekCalendar.svelte';
  import BlockManager from './BlockManager.svelte';
  import GoalsCalendar from './GoalsCalendar.svelte';
  import { formatGoalDates, goalEnd } from '../../lib/goals/goals';
  import { sessionsDuringTrip } from '../../lib/goals/tripConflicts';
  import NoteSheet from '../common/NoteSheet.svelte';

  // --- Theme ---
  const FALLBACK_PHASE_COLOR = 'bg-status-neutral';

  /** Only non-archived phases are offered for new assignment; archived ones stay resolvable for display via phaseDefById. */
  const selectablePhases = $derived(
    [...trainingState.phaseDefs]
      .filter((p) => !p.archived)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );

  const phaseDefById = $derived(new Map(trainingState.phaseDefs.map((p) => [p.id, p])));
  const phaseColor = (phaseId?: string) => (phaseId && phaseDefById.get(phaseId)?.color) || FALLBACK_PHASE_COLOR;
  const phaseName = (phaseId?: string) => (phaseId && phaseDefById.get(phaseId)?.name) || undefined;

  // --- State ---

  let showPhaseDropdown = $state(false);
  let isAddingBenchmark = $state(false);
  let editingBenchmark = $state<Benchmark | null>(null);
  let showAICoach = $state(false);
  let showBlockManager = $state(false);
  let showWeekNote = $state(false);

  // --- Copy / repeat a week ---
  let showCopy = $state(false);
  let sharingWeek = $state(false);
  let repeatCount = $state(1);
  const previousWeekId = $derived(trainingState.selectedWeekId ? decrementWeekId(trainingState.selectedWeekId) : '');
  const previousWeekCount = $derived(previousWeekId ? trainingState.getWorkoutsForWeek(previousWeekId).length : 0);
  function nextWeekIds(from: string, count: number): string[] {
    const ids: string[] = [];
    let id = from;
    for (let i = 0; i < count; i++) ids.push((id = incrementWeekId(id)));
    return ids;
  }
  async function copyLastWeekHere() {
    showCopy = false;
    await trainingState.copyWeek(previousWeekId, [trainingState.selectedWeekId!]);
  }
  async function repeatThisWeek() {
    showCopy = false;
    const from = trainingState.selectedWeekId!;
    await trainingState.copyWeek(from, nextWeekIds(from, repeatCount));
  }

  // Trips overlapping the selected week, with the sessions still planned on their days.
  const selectedWeekTrips = $derived.by(() => {
    const weekId = trainingState.selectedWeekId;
    const range = weekId ? getWeekDates(weekId) : null;
    if (!weekId || !range) return [];
    const start = range.start.toISOString().slice(0, 10);
    const end = range.end.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const weekWorkouts = trainingState.getWorkoutsForWeek(weekId);
    return trainingState.goals
      .filter((g) => g.kind === 'trip' && g.date <= end && goalEnd(g) >= start)
      .map((trip) => ({ trip, planned: sessionsDuringTrip(trip, weekWorkouts, today).length }));
  });
  const selectedWeekNote = $derived(trainingState.selectedWeekId ? trainingState.getWeekNote(trainingState.selectedWeekId) : '');

  // --- Logic: Calendar Generation ---
  // Reverted to the pre-Stage-6 50-week grid + hover-tooltip design
  // (user-directed, 2026-09-18: the
  // block-timeline band/16-week window/visible-week-number redesign this
  // stage originally built didn't read well in the
  // real app and was reverted in favour of the original look, restyled
  // only with this branch's tokens/radii - not a partial keep of any of
  // that redesign).

  const weeks = $derived.by(() => {
    const currentWeekId = trainingState.currentWeekId;
    const tempWeeks: { id: string; label: string; phaseId?: string; isCurrent: boolean; year: number; hasOverlap: boolean; provisional: boolean }[] = [];

    const startOffset = -25 + (trainingState.weekOffset * 50);
    const endOffset = 24 + (trainingState.weekOffset * 50);

    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      const covering = getBlocksForWeek(trainingState.trainingBlocks, id);
      const dominant = getDominantBlockForWeek(trainingState.trainingBlocks, id);

      tempWeeks.push({
        id,
        label: `Week ${id.split('-W')[1]}`,
        phaseId: dominant?.phaseId,
        isCurrent: id === currentWeekId,
        year: d.getUTCFullYear(),
        hasOverlap: covering.length > 1,
        provisional: trainingState.isWeekProvisional(id),
      });
    }
    return tempWeeks;
  });

  const calendarWeeks = $derived(
    weeks.map((w) => ({
      id: w.id,
      label: w.label,
      year: w.year,
      isCurrent: w.isCurrent,
      // Deliberately not `phaseColor(w.phaseId)` here - that helper's
      // `bg-status-neutral` fallback is right for badges/legend dots
      // elsewhere in this file, but for the calendar grid it was drowning
      // out `WeekCalendar`'s own softer "no phase" fallback
      // (`bg-surface-elevated/50`, matching main's original look) with a
      // flat mid-gray on every unassigned cell. Passing `undefined` here
      // lets that component's own fallback apply instead (found/fixed
      // 2026-09-18).
      color: w.phaseId ? phaseDefById.get(w.phaseId)?.color : undefined,
      tooltip: `${w.id}${phaseName(w.phaseId) ? ` - ${phaseName(w.phaseId)}` : ''}${w.hasOverlap ? ' (overlapping blocks)' : ''}${w.provisional ? ' - not saved yet' : ''}`,
      hasOverlap: w.hasOverlap,
      provisional: w.provisional,
    })),
  );

  /** Every block covering the selected week, for the "Active Blocks" list - not just the dominant one. */
  const selectedWeekBlocks = $derived(
    trainingState.selectedWeekId ? getBlocksForWeek(trainingState.trainingBlocks, trainingState.selectedWeekId) : [],
  );

  $effect(() => {
    if (!trainingState.selectedWeekId) trainingState.selectedWeekId = trainingState.currentWeekId;
  });

  // --- Helpers ---
  const selectedWeekData = $derived(weeks.find(w => w.id === trainingState.selectedWeekId));
  
  // Ordering lives in `sortWorkoutsBySchedule` (day, then start time, then
  // id) so this view and the "+" screen's planned list share exactly one
  // comparator rather than two copies that can drift.
  const weekWorkouts = $derived(
    sortWorkoutsBySchedule(
      trainingState.selectedWeekId ? trainingState.getWorkoutsForWeek(trainingState.selectedWeekId) : [],
    ),
  );

  // A provisional week shows sessions projected from its phase's templates
  // rather than stored rows - see lib/planning/weekProjection.ts. Nothing
  // here treats them differently; the copy-on-write gate in state.svelte.ts
  // materialises the week behind any edit, so every handler below works
  // unchanged on a projected session.
  const isProvisionalWeek = $derived(
    !!trainingState.selectedWeekId && trainingState.isWeekProvisional(trainingState.selectedWeekId),
  );

  /** A locked-in (or hand-edited) week that still has a phase to fall back to. */
  const canResetWeek = $derived(
    !!trainingState.selectedWeekId && trainingState.canResetWeekToDefaults(trainingState.selectedWeekId),
  );

  const weekBenchmarks = $derived(trainingState.benchmarks.filter((b: Benchmark) => b.weekId === trainingState.selectedWeekId));

  // --- Sessions grouped under day headings - Mon-Sun in
  // that fixed order, then "Unassigned" last. Rest days (and an empty
  // Unassigned group) render explicitly as "- rest -"/"No unassigned
  // sessions" rather than an empty gap - every group always renders, even
  // empty, since each one is also a live drag-and-drop zone (below) and
  // needs a real drop target to reassign a session *to* an empty day.
  const DAYS = WEEK_DAYS;
  type DayKey = DayOfWeek | 'Unassigned';
  const DAY_GROUP_KEYS: DayKey[] = [...DAYS, 'Unassigned'];

  function groupByDay(list: Workout[]): Record<DayKey, Workout[]> {
    const groups = Object.fromEntries(DAY_GROUP_KEYS.map((k) => [k, [] as Workout[]])) as Record<DayKey, Workout[]>;
    for (const w of list) {
      groups[w.dayOfWeek ?? 'Unassigned'].push(w);
    }
    return groups;
  }

  // Local, mutable mirror of `weekWorkouts` grouped by day - `svelte-dnd-
  // action` needs a locally-reorderable array per zone to give live visual
  // feedback while dragging (its `consider` events), which a plain
  // `$derived` (read-only, recomputed only when its own dependencies
  // change) can't provide. Resynced from the canonical, store-backed
  // `weekWorkouts` on every change (including the one this drag itself
  // causes, once persisted) - the actual write path is still exclusively
  // `handleDayReassign` (see below), never a direct mutation of this array.
  let dayGroups = $state<Record<DayKey, Workout[]>>(groupByDay([]));
  $effect(() => {
    dayGroups = groupByDay(weekWorkouts);
  });

  // --- Handlers ---

  async function handleAssign(phaseId: string) {
    if (!trainingState.selectedWeekId) return;
    await trainingState.assignPhase(trainingState.selectedWeekId, phaseId);
    showPhaseDropdown = false;
  }

  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'prev') trainingState.weekOffset--;
    else if (direction === 'next') trainingState.weekOffset++;
    else if (direction === 'today') {
      trainingState.weekOffset = 0;
      trainingState.selectedWeekId = trainingState.currentWeekId;
    }
    showPhaseDropdown = false;
  }

  function handleAddWorkout(weekId: string) {
    const dominantBlock = getDominantBlockForWeek(trainingState.trainingBlocks, weekId);
    const newWorkout: Workout = {
      id: generateId(),
      status: 'planned',
      date: null,
      weekId,
      notes: 'New Session',
      loadFactor: 0,
      exercises: [],
      blockId: dominantBlock?.id,
    };
    openWorkout(newWorkout, 'edit', true);
  }

  /**
   * The single write path for reassigning a session's day (the select
   * and drag-and-drop both write the same field through it). Snapshots
   * before mutating rather than writing to the live store object in place
   * (the stash's version did the latter and is explicitly called out as
   * the thing not to repeat). Uses `saveWorkoutQuiet` rather than
   * `saveWorkout` so this in-place edit doesn't trigger `refresh()`'s
   * `isLoading` remount - see that method's own doc comment.
   */
  async function handleDayReassign(workout: Workout, newDay: DayOfWeek | undefined) {
    if (workout.dayOfWeek === newDay) return;
    const snapshot = $state.snapshot(workout);
    await trainingState.saveWorkoutQuiet({ ...snapshot, dayOfWeek: newDay });
  }

  /**
   * Drag-and-drop day reassignment, via a drag handle on
   * each session row rather than the whole row - user-directed, so the
   * rest of the row (and the page) keeps its normal scroll/tap behaviour;
   * only the handle itself starts a drag. Each day group is its own
   * `dragHandleZone`; dropping into a different zone than the one a
   * session started in reassigns its day through the exact same
   * `handleDayReassign` the explicit picker uses - so the save path isn't
   * duplicated, this finalize handler never writes
   * `dayOfWeek` itself, it only decides *whether* to call the one function
   * that does.
   */
  function handleDndConsider(dayKey: DayKey, e: CustomEvent<DndEvent<Workout>>) {
    dayGroups[dayKey] = e.detail.items;
  }

  async function handleDndFinalize(dayKey: DayKey, e: CustomEvent<DndEvent<Workout>>) {
    dayGroups[dayKey] = e.detail.items;
    const moved = e.detail.items.find((w) => w.id === e.detail.info.id);
    if (moved) await handleDayReassign(moved, dayKey === 'Unassigned' ? undefined : dayKey);
  }

  function handleAddBenchmark() {
    editingBenchmark = null;
    isAddingBenchmark = true;
  }

  function handleEditBenchmark(benchmark: Benchmark) {
    editingBenchmark = benchmark;
    isAddingBenchmark = true;
  }
</script>

<div class="w-full max-w-lg space-y-4 animate-in fade-in duration-200 pb-12">
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-y-2 px-1">
      <h2 class="text-title text-content">Training Plan</h2>
      <div class="flex items-center gap-1.5">
        <button
          onclick={() => showBlockManager = true}
          class="p-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-control transition-all active:scale-95"
          aria-label="Manage Training Blocks"
          title="Manage Training Blocks"
        >
          <Icon icon="ic:baseline-view-week" class="text-base" />
        </button>
        <button
          onclick={() => showAICoach = true}
          class="p-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-control transition-all active:scale-95"
          aria-label="AI Coach"
          title="AI Coach: change the plan, analyze, or share context"
        >
          <Icon icon="ic:baseline-auto-awesome" class="text-base" />
        </button>
        <button
          onclick={() => navigate('today')}
          class="px-3 py-2.5 bg-surface-elevated/50 hover:bg-surface-elevated text-label text-content-muted hover:text-content rounded-control border border-border-strong/50 transition-all active:scale-95"
        >
          Today
        </button>
        <div class="flex bg-surface/50 rounded-control border border-border p-1">
          <button onclick={() => navigate('prev')} class="p-2 hover:bg-surface-elevated text-content-subtle hover:text-content rounded-control transition-colors active:scale-90"><Icon icon="ic:baseline-chevron-left" class="text-lg" /></button>
          <button onclick={() => navigate('next')} class="p-2 hover:bg-surface-elevated text-content-subtle hover:text-content rounded-control transition-colors active:scale-90"><Icon icon="ic:baseline-chevron-right" class="text-lg" /></button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
      {#each selectablePhases as phase}
        <div class="flex items-center gap-1">
          <div class="w-2.5 h-2.5 rounded-control {phase.color || FALLBACK_PHASE_COLOR}"></div>
          <span class="text-label text-content-subtle">{phase.name}</span>
        </div>
      {/each}
    </div>

    <WeekCalendar
      weeks={calendarWeeks}
      selectedWeekId={trainingState.selectedWeekId}
      onSelectWeek={(weekId) => { trainingState.selectedWeekId = weekId; showPhaseDropdown = false; }}
    />
  </div>

  {#if trainingState.selectedWeekId && selectedWeekData}
    <div class="bg-surface/50 border border-border p-5 rounded-card backdrop-blur-sm space-y-4 shadow-card relative {showPhaseDropdown ? 'z-30' : ''}">
      <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div class="flex-1 min-w-[11rem] relative">
          <span class="text-section uppercase text-primary mb-0.5 block">{selectedWeekData.isCurrent ? 'Current Week' : selectedWeekData.id} <span class="text-content-subtle opacity-70 ml-2 lowercase tracking-normal">({getWeekDateRange(selectedWeekData.id)})</span></span>
          <div class="flex items-center gap-2 flex-wrap">
            <button onclick={() => showPhaseDropdown = !showPhaseDropdown} class="text-left group flex items-center gap-2">
              <h3 class="text-title text-content group-hover:text-primary-hover transition-colors">{phaseName(selectedWeekData.phaseId) ?? 'No Phase'}</h3>
              <span class="text-content-subtle group-hover:text-primary-hover transition-colors"><Icon icon="ic:baseline-arrow-drop-down" class="text-xl" /></span>
            </button>
            {#if isProvisionalWeek}
              <span
                class="flex items-center gap-1 px-1.5 py-0.5 rounded-control border border-dashed border-primary/40 text-caption text-primary/80 leading-none"
                title="These sessions come from the phase's templates and aren't saved into this week yet. They save themselves as soon as you log or change anything here, when the week ends, or when you tap Lock In Plan."
              >
                <Icon icon="ic:outline-cloud-queue" class="text-xs" />
                Not saved yet
              </span>
            {/if}
          </div>

          {#if showPhaseDropdown}
            <div class="absolute left-0 mt-2 w-44 bg-surface border border-border rounded-control shadow-card z-20 overflow-hidden animate-in zoom-in-95 duration-200">
              <div class="p-2 border-b border-border bg-surface/50"><span class="text-section uppercase text-content-subtle px-1">Select Phase</span></div>
              {#each selectablePhases as phase}
                <button onclick={() => handleAssign(phase.id)} class="w-full text-left px-3 py-2.5 text-label text-content-muted hover:bg-surface-elevated hover:text-content transition-colors border-b border-border last:border-0 flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full {phase.color || FALLBACK_PHASE_COLOR}"></div>{phase.name}
                </button>
              {/each}
            </div>
          {/if}

          {#if selectedWeekBlocks.length > 1}
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#each selectedWeekBlocks as block}
                <span class="flex items-center gap-1.5 px-2 py-1 bg-surface-elevated/70 rounded-control border border-border-strong/50 text-label text-content-muted">
                  <span class="w-1.5 h-1.5 rounded-full {block.color || phaseColor(block.phaseId)}"></span>
                  {block.name}
                </span>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Sits top-right beside the phase title, and drops onto its own
             line only when the title column can no longer hold its 11rem
             minimum - i.e. on very narrow screens. -->
        <div class="flex items-center gap-1.5 shrink-0 ml-auto">
          <!-- Filled when the week has a note, outline when not. Opening it
               never materialises the week - see WeekNote. -->
          <button
            onclick={() => showWeekNote = true}
            class="flex items-center px-2.5 py-2 rounded-control border transition-all active:scale-95 {selectedWeekNote
              ? 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'
              : 'bg-surface-elevated/50 hover:bg-surface-elevated text-content-subtle hover:text-content border-border-strong/50'}"
            title={selectedWeekNote ? 'Week note' : 'Add a week note'}
            aria-label={selectedWeekNote ? 'Open week note' : 'Add a week note'}
          >
            <Icon icon={selectedWeekNote ? 'ic:baseline-sticky-note-2' : 'ic:outline-sticky-note-2'} class="text-sm" />
          </button>
          <button
            onclick={() => showCopy = !showCopy}
            class="flex items-center px-2.5 py-2 rounded-control border transition-all active:scale-95 {showCopy
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-surface-elevated/50 hover:bg-surface-elevated text-content-subtle hover:text-content border-border-strong/50'}"
            title="Copy, repeat or share this week"
            aria-label="Copy, repeat or share this week"
            aria-expanded={showCopy}
          >
            <Icon icon="ic:baseline-more-horiz" class="text-sm" />
          </button>
          {#if isProvisionalWeek}
            <button
              onclick={() => trainingState.materializeWeek(trainingState.selectedWeekId!)}
              class="flex items-center gap-1.5 px-2.5 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-control border border-primary/20 transition-all text-label active:scale-95"
              title="Save these sessions into this week so they stop following the phase templates"
            >
              <Icon icon="ic:baseline-push-pin" class="text-sm" />
              Lock In
            </button>
          {:else if canResetWeek}
            <button
              onclick={() => trainingState.resetWeekToPhaseDefaults(trainingState.selectedWeekId!)}
              class="flex items-center gap-1.5 px-2.5 py-2 bg-surface-elevated/50 hover:bg-surface-elevated text-content-subtle hover:text-content rounded-control border border-border-strong/50 transition-all text-label active:scale-95"
              title="Discard this week's planned sessions and follow the phase templates again"
            >
              <Icon icon="ic:baseline-restore" class="text-sm" />
              Reset
            </button>
          {/if}
          <button
            onclick={() => trainingState.clearWeek(trainingState.selectedWeekId!)}
            class="flex items-center gap-1.5 px-2.5 py-2 bg-surface-elevated/50 hover:bg-danger/10 text-content-subtle hover:text-danger rounded-control border border-border-strong/50 hover:border-danger/20 transition-all text-label active:scale-95"
            title="Clear all data for this week"
          >
            <Icon icon="ic:baseline-delete-sweep" class="text-sm" />
            Clear
          </button>
        </div>
      </div>

      {#if showCopy}
        <div class="p-3.5 rounded-card border border-border bg-surface/40 space-y-3 animate-in fade-in duration-150">
          <button
            onclick={copyLastWeekHere}
            disabled={previousWeekCount === 0}
            class="w-full flex items-center gap-2 text-left disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <Icon icon="ic:baseline-south" class="text-base text-primary shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block text-label text-content group-hover:text-primary transition-colors">Copy last week here</span>
              <span class="block text-caption text-content-subtle">{previousWeekId} · {previousWeekCount} session{previousWeekCount === 1 ? '' : 's'}</span>
            </span>
          </button>
          <div class="pt-3 border-t border-border/60 flex items-center gap-2 flex-wrap">
            <Icon icon="ic:baseline-repeat" class="text-base text-primary shrink-0" />
            <span class="text-label text-content">Repeat this week into the next</span>
            <select bind:value={repeatCount} class="bg-surface-elevated text-content px-2 py-1 rounded-control border border-border-strong outline-none text-label" aria-label="Number of weeks">
              {#each [1, 2, 3, 4, 5, 6, 7, 8] as n}<option value={n}>{n}</option>{/each}
            </select>
            <span class="text-label text-content">week{repeatCount === 1 ? '' : 's'}</span>
            <button
              onclick={repeatThisWeek}
              disabled={weekWorkouts.length === 0}
              class="ml-auto px-3 py-1.5 text-label font-bold text-white bg-primary hover:bg-primary-hover rounded-control transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >Repeat</button>
          </div>
          <p class="text-caption text-content-subtle">Replaces the planned sessions there; completed ones stay. You can undo it.</p>
          <button
            onclick={() => { showCopy = false; sharingWeek = true; }}
            disabled={weekWorkouts.length === 0}
            class="w-full pt-3 border-t border-border/60 flex items-center gap-2 text-left disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <Icon icon="ic:baseline-ios-share" class="text-base text-primary shrink-0" />
            <span class="text-label text-content group-hover:text-primary transition-colors">Share this week as an image</span>
          </button>
        </div>
      {/if}

      {#each selectedWeekTrips as { trip, planned } (trip.id)}
        <div class="flex items-center gap-2 p-2.5 rounded-control bg-primary/10 border border-primary/20">
          <Icon icon="ic:baseline-terrain" class="text-primary shrink-0" />
          <p class="text-label text-content flex-1 min-w-0 truncate">{trip.name} <span class="text-content-subtle">· {formatGoalDates(trip)}{trip.location ? ` · ${trip.location.name}` : ''}</span></p>
          {#if planned > 0}
            <span class="text-caption text-status-caution shrink-0">{planned} session{planned === 1 ? '' : 's'} planned during it</span>
          {/if}
        </div>
      {/each}

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-section uppercase text-content-subtle">Scheduled Sessions</h4>
          <div class="flex items-center gap-3">
            <span class="text-caption text-content-subtle">{weekWorkouts.length} Total</span>
            <button onclick={() => handleAddWorkout(trainingState.selectedWeekId!)} class="bg-surface-elevated hover:bg-surface-elevated-hover text-content p-1 rounded-control transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
          </div>
        </div>

        {#if weekWorkouts.length === 0}
          <div class="p-4 bg-surface-elevated/20 rounded-control border border-dashed border-border text-center"><p class="text-caption text-content-subtle italic">No workouts planned</p></div>
        {:else}
        {#each DAY_GROUP_KEYS as dayKey}
          <div class="space-y-2">
            <h5 class="text-label font-bold text-content-subtle">{dayKey}</h5>

            <div
              class="space-y-2 min-h-[1.5rem] rounded-control transition-colors"
              use:dragHandleZone={{ items: dayGroups[dayKey], flipDurationMs: 200, delayTouchStart: true, dropTargetClasses: ['ring-2', 'ring-primary/40'] }}
              onconsider={(e) => handleDndConsider(dayKey, e)}
              onfinalize={(e) => handleDndFinalize(dayKey, e)}
            >
              {#each dayGroups[dayKey] as workout (workout.id)}
                <div class="flex items-center justify-between p-3.5 rounded-control transition-colors group/item {workout.provisional ? 'bg-surface-elevated/20 border border-dashed border-border-strong/60' : 'bg-surface-elevated/50 border border-border-strong/50 hover:border-border-strong'}">
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <div use:dragHandle class="cursor-grab active:cursor-grabbing text-content-subtle hover:text-content shrink-0 touch-none p-1 -ml-1" aria-label="Drag to reassign day">
                      <Icon icon="ic:baseline-drag-indicator" class="text-lg" />
                    </div>
                    <div class="w-1.5 h-1.5 rounded-full {workout.status === 'completed' ? 'bg-success' : 'bg-primary-hover'} shrink-0"></div>
                    <div
                      class="min-w-0 flex-1 cursor-pointer"
                      role="button"
                      tabindex="0"
                      onclick={() => openWorkout(workout)}
                      onkeydown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openWorkout(workout); } }}
                    >
                      <div class="flex items-center gap-2">
                        <div class="flex items-center gap-1.5">
                          <select
                            onclick={(e) => e.stopPropagation()}
                            value={workout.dayOfWeek ?? ''}
                            onchange={(e) => handleDayReassign(workout, (e.currentTarget.value || undefined) as DayOfWeek | undefined)}
                            class="w-11 text-center text-caption font-bold text-primary-hover bg-primary-hover/10 px-0 py-0.5 rounded-control leading-none shrink-0 border-none outline-none appearance-none"
                            aria-label="Reassign day"
                          >
                            <option value="">—</option>
                            {#each DAYS as d}
                              <option value={d}>{d.slice(0, 3)}</option>
                            {/each}
                          </select>
                          {#if workout.startTime}
                            <span class="text-caption font-bold text-content-muted bg-surface-elevated px-1.5 py-0.5 rounded-control border border-border leading-none shrink-0">{workout.startTime}</span>
                          {/if}
                        </div>
                        <p class="text-body font-bold text-content leading-tight truncate">{workout.notes}</p>
                      </div>
                      <p class="text-caption text-content-subtle mt-0.5 flex items-center gap-1">
                        {#if workout.provisional}
                          <Icon icon="ic:outline-cloud-queue" class="text-xs text-primary/70 shrink-0" />
                        {/if}
                        <span class="truncate">{workout.exercises.length} Exercises{workout.plannedDuration ? ` · ${workout.plannedDuration} min planned` : ''}</span>
                      </p>
                      {#if workout.description}
                        <p class="text-caption text-content-subtle mt-1 line-clamp-2 leading-snug">{workout.description}</p>
                      {/if}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 ml-4">
                    <button onclick={() => trainingState.duplicateWorkout(workout)} class="p-1.5 text-content-subtle hover:text-content transition-colors" title="Duplicate"><Icon icon="ic:baseline-content-copy" class="text-sm" /></button>
                    <button onclick={() => openWorkout(workout, 'edit')} class="p-1.5 text-content-subtle hover:text-content transition-colors"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
                    <button onclick={() => trainingState.deleteWorkout(workout.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
                    {#if workout.status === 'completed'}
                      <span class="text-label text-success">Done</span>
                    {:else}
                      {@const isThisRunning = trainingState.sessionStore.isRunning(workout.id)}
                      <button
                        onclick={() => trainingState.startSession(workout)}
                        disabled={trainingState.isSessionActive && !isThisRunning}
                        title={trainingState.isSessionActive && !isThisRunning ? 'Finish or discard the running session first' : undefined}
                        class="text-label hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 {isThisRunning ? 'text-success font-bold' : 'text-primary'}"
                      >{isThisRunning ? 'Resume' : 'Start'}</button>
                    {/if}
                  </div>
                </div>
              {:else}
                <p class="text-caption text-content-subtle italic pl-1">{dayKey === 'Unassigned' ? 'No unassigned sessions' : '— rest —'}</p>
              {/each}
            </div>
          </div>
        {/each}
        {/if}
      </div>

      <div class="pt-4 space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-section uppercase text-content-subtle">Benchmark Tests</h4>
          <button onclick={handleAddBenchmark} class="bg-surface-elevated hover:bg-surface-elevated-hover text-content p-1 rounded-control transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
        </div>

        {#if isAddingBenchmark}
          <BenchmarkForm
            weekId={trainingState.selectedWeekId!}
            initialData={editingBenchmark}
            onSave={() => { isAddingBenchmark = false; editingBenchmark = null; }}
            onCancel={() => { isAddingBenchmark = false; editingBenchmark = null; }}
          />
        {/if}

        <div class="space-y-2">
          {#each weekBenchmarks as benchmark}
            <div class="flex items-center justify-between p-3.5 bg-primary-hover/5 rounded-control border border-primary/10">
              <div class="flex-1 min-w-0">
                <p class="text-body font-bold text-content leading-tight truncate">{benchmark.type}</p>
                <p class="text-label text-primary-hover mt-0.5">{benchmark.value} {benchmark.unit}</p>
              </div>
              <div class="flex items-center gap-2">
                <button onclick={() => handleEditBenchmark(benchmark)} class="p-1.5 text-content-subtle hover:text-content transition-colors" aria-label="Edit benchmark"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
                <button onclick={() => trainingState.deleteBenchmark(benchmark.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" aria-label="Delete benchmark"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
              </div>
            </div>
          {:else}
            {#if !isAddingBenchmark}
              <div class="p-4 bg-surface-elevated/20 rounded-control border border-dashed border-border text-center"><p class="text-caption text-content-subtle italic">No benchmarks logged</p></div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <GoalsCalendar />
</div>

{#if sharingWeek && trainingState.selectedWeekId}
  <WeekShareImage weekId={trainingState.selectedWeekId} onClose={() => sharingWeek = false} />
{/if}

{#if showAICoach}
  <AICoachModal onClose={() => showAICoach = false} />
{/if}

{#if showBlockManager}
  <BlockManager onClose={() => showBlockManager = false} />
{/if}

{#if showWeekNote && trainingState.selectedWeekId}
  {@const weekId = trainingState.selectedWeekId}
  <NoteSheet
    title="Week note"
    subtitle="{weekId} · {getWeekDateRange(weekId)}"
    text={selectedWeekNote}
    placeholder="Circumstances, ideas, anything that explains this week…"
    onSave={(text) => trainingState.saveWeekNote(weekId, text)}
    onClose={() => showWeekNote = false}
  />
{/if}

