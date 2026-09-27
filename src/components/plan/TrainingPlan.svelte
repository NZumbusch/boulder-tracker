<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  import { showInfo } from '../../lib/help/infoSheet.svelte';
  import { motionMs, scrollBehavior } from '../../lib/motion';
  import { WEEK_DAYS } from '../../lib/constants';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekDateRange, getWeekDates, incrementWeekId, decrementWeekId, localIsoDate } from '../../lib/dateUtils';
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
  import ListRow from '../common/ListRow.svelte';
  import { summarizeSession } from '../../lib/planning/sessionSummary';
  import { weekStartDay } from '../../lib/analytics/range';
  import { localDayIndex } from '../../lib/analytics/recoverySeries';
  import PlanBStretch from './PlanBStretch.svelte';
  import PlanBSheet from './PlanBSheet.svelte';
  import { occurrencesTouchingWeek, dayIndexOf, occurrenceDaysLabel } from '../../lib/planning/planB';
  import type { PlanAlternative } from '../../lib/types';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { onDestroy } from 'svelte';

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
  /**
   * Arrange mode: drag handles (and every day as a drop zone, rest days
   * included) only while it's on. Normally rows are clean and a tap opens
   * the session - dragging stays deliberate, never a side effect of
   * scrolling (user-directed: drag by handle only).
   */
  let arranging = $state(false);

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
    const today = localIsoDate();
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
  //
  // The list shows both sides of any Plan B (see lib/planning/planB.ts);
  // the side that doesn't count right now is faded and left out of the
  // week's numbers. In Plan B mode, the Plan B being edited shows as Plan B
  // sees it - its own sessions count, Plan A's replaced ones are faded.
  const planView = $derived(trainingState.selectedWeekId ? trainingState.getWeekPlanView(trainingState.selectedWeekId) : null);
  const weekWorkouts = $derived(sortWorkoutsBySchedule(planView?.shown ?? []));
  const editingPlanB = $derived(trainingState.planBEditing);
  function isEditedPlanB(w: Workout): boolean {
    return !!w.planB && editingPlanB?.altId === w.planB.altId && editingPlanB?.key === w.planB.occurrence;
  }
  /** Whether a listed session counts toward the week (and reads at full strength). */
  function counts(w: Workout): boolean {
    if (!w.planB) return true;
    return isEditedPlanB(w) ? w.planB.side === 'B' : w.planB.active;
  }
  const countedWorkouts = $derived(weekWorkouts.filter(counts));
  /** "Plan B", "Plan A · not chosen", "only in Plan A" - what a tagged row says about itself. */
  function planBMeta(w: Workout): string | undefined {
    if (!w.planB) return undefined;
    if (isEditedPlanB(w)) return w.planB.side === 'A' ? 'only in Plan A' : 'Plan B';
    if (w.planB.decided && !w.planB.active) return `Plan ${w.planB.side} · not chosen`;
    return `Plan ${w.planB.side}`;
  }

  // --- Plan B mode and settings ---
  const inPlanBMode = $derived(!!trainingState.planBEditing);
  backWhile(() => inPlanBMode, () => trainingState.finishPlanBEditing());
  onDestroy(() => { if (trainingState.planBEditing) void trainingState.finishPlanBEditing(); });
  let planBSettings = $state<{ alt: PlanAlternative; key: string } | null>(null);
  const editedPlanB = $derived(editingPlanB?.altId ? trainingState.getPlanB(editingPlanB.altId) : undefined);
  /** Repeating Plan Bs skipped this week - listed so they can be brought back. */
  const skippedHere = $derived.by(() => {
    const weekId = trainingState.selectedWeekId;
    if (!weekId) return [];
    return trainingState.planAlternatives.flatMap((alt) =>
      occurrencesTouchingWeek([{ ...alt, occurrences: {} }], weekId)
        .filter(({ key }) => alt.occurrences?.[key]?.skipped)
        .map(({ key }) => ({ alt, key })),
    );
  });
  /** Days of the selected week inside a Plan B stretch. */
  const planBDays = $derived.by(() => {
    const weekId = trainingState.selectedWeekId;
    const days = new Set<number>();
    if (!weekId || !planView) return days;
    const monday = dayIndexOf(weekId, 'Monday');
    for (const occ of planView.occurrences) {
      for (let d = occ.firstDay; d <= occ.lastDay; d++) if (d >= monday && d < monday + 7) days.add(d - monday);
    }
    return days;
  });

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

  function handleAddWorkout(weekId: string, dayOfWeek?: DayOfWeek) {
    const dominantBlock = getDominantBlockForWeek(trainingState.trainingBlocks, weekId);
    const newWorkout: Workout = {
      id: generateId(),
      status: 'planned',
      date: null,
      weekId,
      dayOfWeek,
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

  // --- The M-S strip over the session list: each day's date, and a dot per
  // session (filled = done, ring = planned, dashed = not saved yet).
  const weekStrip = $derived.by(() => {
    const start = trainingState.selectedWeekId ? weekStartDay(trainingState.selectedWeekId) : undefined;
    const today = localDayIndex(new Date());
    return DAYS.map((day, i) => ({
      day,
      date: start !== undefined ? new Date((start + i) * 86400000).getUTCDate() : undefined,
      isToday: start !== undefined && start + i === today,
      sessions: dayGroups[day],
      planB: planBDays.has(i),
    }));
  });
  const doneCount = $derived(countedWorkouts.filter((w) => w.status === 'completed').length);
  const plannedLoadTotal = $derived(
    countedWorkouts.reduce((sum, w) => sum + summarizeSession(w, trainingState.exerciseTypes).plannedLoad, 0),
  );
  /** Tapping a day in the strip: jump to its sessions, or start a new one on an empty day. */
  function onStripDay(day: DayOfWeek, hasSessions: boolean) {
    if (hasSessions) document.getElementById(`plan-day-${day}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    else handleAddWorkout(trainingState.selectedWeekId!, day);
  }
  /** Normally only days with sessions are listed; arranging shows them all, as drop targets. */
  const listedDays = $derived(DAY_GROUP_KEYS.filter((k) => arranging || dayGroups[k].length > 0));
  function dayHeading(day: DayKey): string {
    if (day === 'Unassigned') return 'No day';
    const cell = weekStrip.find((c) => c.day === day);
    return `${day.slice(0, 3)}${cell?.date !== undefined ? ` ${cell.date}` : ''}`;
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
    <!-- Same quiet control row as Analytics: tools, then paging. -->
    <div class="flex items-center justify-between gap-2 px-1">
      <h2 class="text-title text-content">Plan</h2>
      <div class="flex items-center gap-1">
        <button
          onclick={() => showBlockManager = true}
          class="p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors"
          aria-label="Manage training blocks"
          data-tour="plan-blocks"
          title="Training blocks"
        >
          <Icon icon="ic:baseline-view-week" class="text-lg" />
        </button>
        <button
          onclick={() => showAICoach = true}
          class="p-1.5 text-primary hover:text-primary-hover rounded-control hover:bg-surface-elevated transition-colors"
          aria-label="AI Coach"
          data-tour="plan-ai"
          title="AI Coach: change the plan, analyze, or share context"
        >
          <Icon icon="ic:baseline-auto-awesome" class="text-lg" />
        </button>
        <span class="w-px h-5 bg-border mx-1"></span>
        <button onclick={() => navigate('prev')} class="p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors" aria-label="Earlier weeks">
          <Icon icon="ic:baseline-chevron-left" class="text-lg" />
        </button>
        <button onclick={() => navigate('today')} class="px-2 py-1 text-caption rounded-control hover:bg-surface-elevated transition-colors {trainingState.weekOffset === 0 && trainingState.selectedWeekId === trainingState.currentWeekId ? 'text-content-subtle/50' : 'text-primary'}">
          Today
        </button>
        <button onclick={() => navigate('next')} class="p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors" aria-label="Later weeks">
          <Icon icon="ic:baseline-chevron-right" class="text-lg" />
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
      {#each selectablePhases as phase}
        <div class="flex items-center gap-1">
          <div class="w-2 h-2 rounded-full {phase.color || FALLBACK_PHASE_COLOR}"></div>
          <span class="text-caption text-content-subtle">{phase.name}</span>
        </div>
      {/each}
    </div>

    <div data-tour="plan-calendar">
    <WeekCalendar
      weeks={calendarWeeks}
      selectedWeekId={trainingState.selectedWeekId}
      onSelectWeek={(weekId) => { trainingState.selectedWeekId = weekId; showPhaseDropdown = false; }}
    />
    </div>
  </div>

  {#if trainingState.selectedWeekId && selectedWeekData}
    <div class="card space-y-4 relative {showPhaseDropdown ? 'z-30' : ''}">
      <!-- Title column and the week's actions side by side on every width -
           the actions used to drop onto their own row, leaving a gap. -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0 relative">
          <span class="text-section uppercase text-content-muted block">{selectedWeekData.isCurrent ? 'This week' : `Week ${selectedWeekData.id.split('-W')[1]}`} <span class="normal-case tracking-normal font-normal text-content-subtle whitespace-nowrap">· {getWeekDateRange(selectedWeekData.id)}</span></span>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button onclick={() => showPhaseDropdown = !showPhaseDropdown} class="text-left group flex items-center gap-0.5" data-tour="plan-phase">
              <h3 class="text-title text-content group-hover:text-primary-hover transition-colors">{phaseName(selectedWeekData.phaseId) ?? 'No Phase'}</h3>
              <span class="text-content-subtle group-hover:text-primary-hover transition-colors"><Icon icon="ic:baseline-arrow-drop-down" class="text-xl" /></span>
            </button>
            <InfoButton term="phases" />
            {#if isProvisionalWeek}
              <button
                onclick={() => showInfo('notSaved')}
                class="flex items-center gap-1 px-1.5 py-0.5 rounded-control border border-dashed border-primary/40 text-caption text-primary/80 leading-none"
                aria-label="Not saved yet - what does this mean?"
              >
                <Icon icon="ic:outline-cloud-queue" class="text-xs" />
                Not saved yet
              </button>
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

        <div class="flex items-center shrink-0 -mr-1.5 -mt-1">
          <!-- Filled when the week has a note, outline when not. Opening it
               never materialises the week - see WeekNote. -->
          <button
            onclick={() => showWeekNote = true}
            class="p-1.5 rounded-control transition-colors hover:bg-surface-elevated {selectedWeekNote ? 'text-primary' : 'text-content-subtle hover:text-content'}"
            title={selectedWeekNote ? 'Week note' : 'Add a week note'}
            aria-label={selectedWeekNote ? 'Open week note' : 'Add a week note'}
          >
            <Icon icon={selectedWeekNote ? 'ic:baseline-sticky-note-2' : 'ic:outline-sticky-note-2'} class="text-lg" />
          </button>
          {#if isProvisionalWeek}
            <button
              onclick={() => trainingState.materializeWeek(trainingState.selectedWeekId!)}
              class="chip border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              title="Save these sessions into this week so they stop following the phase templates"
            >
              <Icon icon="ic:baseline-push-pin" class="text-sm" />
              Lock In
            </button>
          {:else if canResetWeek}
            <button
              onclick={() => trainingState.resetWeekToPhaseDefaults(trainingState.selectedWeekId!)}
              class="p-1.5 rounded-control text-content-subtle hover:text-content hover:bg-surface-elevated transition-colors"
              title="Discard this week's planned sessions and follow the phase templates again"
              aria-label="Reset week to its phase"
            >
              <Icon icon="ic:baseline-restore" class="text-lg" />
            </button>
          {/if}
          <button
            onclick={() => trainingState.clearWeek(trainingState.selectedWeekId!)}
            class="p-1.5 rounded-control text-content-subtle hover:text-danger hover:bg-danger/10 transition-colors"
            title="Clear all data for this week"
            aria-label="Clear week"
          >
            <Icon icon="ic:baseline-delete-sweep" class="text-lg" />
          </button>
          <button
            onclick={() => showCopy = !showCopy}
            class="p-1.5 rounded-control transition-colors hover:bg-surface-elevated {showCopy ? 'text-primary bg-surface-elevated' : 'text-content-subtle hover:text-content'}"
            title="Copy, repeat or share this week"
            aria-label="Copy, repeat or share this week"
            aria-expanded={showCopy}
          >
            <Icon icon="ic:baseline-more-horiz" class="text-lg" />
          </button>
        </div>
      </div>

      {#if showCopy}
        <div class="p-3.5 rounded-control bg-surface-elevated/40 space-y-3 animate-in fade-in duration-150">
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
            onclick={() => { showCopy = false; trainingState.editPlanBAt(trainingState.selectedWeekId!); }}
            class="w-full pt-3 border-t border-border/60 flex items-center gap-2 text-left group"
          >
            <Icon icon="ic:baseline-call-split" class="text-base text-primary shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block text-label text-content group-hover:text-primary transition-colors">Plan B for uncertain days</span>
              <span class="block text-caption text-content-subtle">A second version of some days, e.g. outdoor if it's dry</span>
            </span>
          </button>
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
        <div class="flex items-center gap-2 py-2 px-3 rounded-control bg-surface-elevated/40">
          <Icon icon="ic:baseline-terrain" class="text-primary shrink-0" />
          <p class="text-label text-content flex-1 min-w-0 truncate">{trip.name} <span class="text-content-subtle">· {formatGoalDates(trip)}{trip.location ? ` · ${trip.location.name}` : ''}</span></p>
          {#if planned > 0}
            <span class="text-caption text-status-caution shrink-0">{planned} session{planned === 1 ? '' : 's'} planned during it</span>
          {/if}
        </div>
      {/each}

      {#if editingPlanB}
        <div class="flex items-start gap-2 p-3 rounded-control border border-primary/40 bg-primary/10">
          <Icon icon="ic:baseline-call-split" class="text-primary text-lg shrink-0 mt-0.5" />
          <div class="min-w-0 flex-1">
            <p class="text-label font-semibold text-content">Editing {editedPlanB?.label || 'Plan B'}{editedPlanB && editingPlanB.key ? ` · ${occurrenceDaysLabel(editedPlanB, editingPlanB.key)}` : ''}</p>
            <p class="text-caption text-content-muted">Tap a session to change or remove it for Plan B, or + to add one. Plan A stays as it is.{editedPlanB?.repeatUntilWeekId ? ' Applies to every week it repeats.' : ''}</p>
          </div>
          {#if editedPlanB && editingPlanB.key}
            <button onclick={() => planBSettings = { alt: editedPlanB, key: editingPlanB.key! }} class="p-1 text-content-subtle hover:text-content" aria-label="Plan B settings"><Icon icon="ic:baseline-tune" class="text-lg" /></button>
          {/if}
          <button onclick={() => trainingState.finishPlanBEditing()} class="px-3 py-1.5 rounded-control bg-primary text-white text-label font-bold shrink-0">Done</button>
        </div>
      {/if}

      {#each planView?.occurrences ?? [] as occ (`${occ.alt.id}:${occ.key}`)}
        <PlanBStretch {occ} onSettings={() => planBSettings = { alt: occ.alt, key: occ.key }} />
      {/each}
      {#each skippedHere as { alt, key } (`${alt.id}:${key}`)}
        <p class="flex items-center gap-2 text-caption text-content-subtle px-1">
          <Icon icon="ic:baseline-call-split" class="text-sm shrink-0" />
          <span class="flex-1 min-w-0 truncate">{alt.label || 'Plan B'} is skipped this week</span>
          <button onclick={() => trainingState.setPlanBOccurrence(alt.id, key, { skipped: undefined })} class="text-primary shrink-0">Use it again</button>
        </p>
      {/each}

      <!-- The week at a glance: tap a day to jump to it, or to plan a
           session on an empty one. -->
      <div class="grid grid-cols-7 gap-1">
        {#each weekStrip as cell (cell.day)}
          <button
            onclick={() => onStripDay(cell.day, cell.sessions.length > 0)}
            class="flex flex-col items-center gap-1 py-1.5 rounded-control hover:bg-surface-elevated/60 transition-colors"
            aria-label="{cell.day}{cell.sessions.length ? `: ${cell.sessions.map((w) => w.notes || 'Session').join(', ')}` : ': add a session'}{cell.planB ? ' (Plan B stretch)' : ''}"
          >
            <span class="text-caption {cell.isToday ? 'text-primary font-bold' : 'text-content-subtle'}">{cell.day.slice(0, 1)}</span>
            <span class="text-label tabular-nums {cell.isToday ? 'text-primary font-bold' : 'text-content'}">{cell.date ?? ''}</span>
            <span class="flex gap-0.5 h-1.5">
              {#each cell.sessions.slice(0, 3) as w (w.id)}
                <span class="w-1.5 h-1.5 rounded-full {w.status === 'completed' ? 'bg-success' : w.provisional ? 'border border-dashed border-primary' : 'border border-primary'} {counts(w) ? '' : 'opacity-35'}"></span>
              {/each}
            </span>
            <!-- Inside a Plan B stretch. -->
            <span class="h-0.5 w-5 rounded-full {cell.planB ? 'bg-primary/60' : 'bg-transparent'}"></span>
          </button>
        {/each}
      </div>

      <div class="space-y-2" data-tour="plan-sessions">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <h4 class="text-section uppercase text-content-muted">Sessions</h4>
            {#if weekWorkouts.length > 0}
              <p class="text-caption text-content-subtle tabular-nums">{doneCount} of {countedWorkouts.length} done{plannedLoadTotal > 0 ? ` · planned load ${plannedLoadTotal} pts` : ''}{#if plannedLoadTotal > 0}{' '}<InfoButton term="load" />{/if}</p>
            {/if}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            {#if weekWorkouts.length > 0}
              <button
                onclick={() => arranging = !arranging}
                aria-pressed={arranging}
                class="chip transition-colors {arranging ? 'border-primary bg-primary/15 text-content' : 'text-content-subtle hover:text-content'}"
              >
                <Icon icon="ic:baseline-drag-indicator" class="text-sm" />{arranging ? 'Done' : 'Arrange'}
              </button>
            {/if}
            <button onclick={() => handleAddWorkout(trainingState.selectedWeekId!)} class="p-1.5 rounded-control text-primary hover:bg-surface-elevated transition-colors" aria-label="Add a session">
              <Icon icon="ic:baseline-plus" class="text-lg" />
            </button>
          </div>
        </div>

        {#if weekWorkouts.length === 0}
          <p class="text-caption text-content-subtle italic py-3">Nothing planned - tap a day above or + to add a session.</p>
        {:else}
          {#each listedDays as dayKey (dayKey)}
            <div id="plan-day-{dayKey}" class="scroll-mt-20">
              <h5 class="text-caption uppercase tracking-wide text-content-subtle pt-1">{dayHeading(dayKey)}</h5>
              <div
                class="divide-y divide-border rounded-control transition-colors {arranging ? 'min-h-[2.25rem]' : ''}"
                use:dragHandleZone={{ items: dayGroups[dayKey], flipDurationMs: motionMs(200), dragDisabled: !arranging, delayTouchStart: true, dropTargetClasses: ['ring-2', 'ring-primary/40'] }}
                onconsider={(e) => handleDndConsider(dayKey, e)}
                onfinalize={(e) => handleDndFinalize(dayKey, e)}
              >
                {#each dayGroups[dayKey] as workout (workout.id)}
                  {@const summary = summarizeSession(workout, trainingState.exerciseTypes)}
                  {@const isThisRunning = trainingState.sessionStore.isRunning(workout.id)}
                  <ListRow
                    title={workout.notes || 'Session'}
                    meta={[
                      summary.startTime,
                      `${summary.estimated ? '~' : ''}${summary.minutes} min`,
                      summary.plannedLoad > 0 ? `load ${summary.plannedLoad} pts` : `${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`,
                      workout.provisional ? 'not saved yet' : undefined,
                    ].filter(Boolean).join(' · ')}
                    muted={workout.provisional || !counts(workout)}
                    onclick={arranging ? undefined : () => openWorkout(workout)}
                  >
                    {#snippet titleExtra()}
                      {#if workout.planB}
                        <!-- Which plan this session belongs to - only sessions the two plans don't share get one. -->
                        <span class="inline-flex align-middle px-1.5 py-px rounded-full text-[10px] font-semibold uppercase tracking-wide {workout.planB.side === 'B' ? 'bg-primary/15 text-primary' : 'bg-surface-elevated text-content-muted'}">{planBMeta(workout)}</span>
                      {/if}
                    {/snippet}
                    {#snippet leading()}
                      {#if arranging}
                        <div use:dragHandle class="cursor-grab active:cursor-grabbing text-content-subtle hover:text-content shrink-0 touch-none p-1 -ml-1" aria-label="Drag to another day">
                          <Icon icon="ic:baseline-drag-indicator" class="text-lg" />
                        </div>
                      {/if}
                    {/snippet}
                    {#snippet trailing()}
                      {#if arranging}
                        <!-- The keyboard/precise alternative to dragging. -->
                        <select
                          value={workout.dayOfWeek ?? ''}
                          onchange={(e) => handleDayReassign(workout, (e.currentTarget.value || undefined) as DayOfWeek | undefined)}
                          class="chip bg-transparent text-content-muted outline-none"
                          aria-label="Move to day"
                        >
                          <option value="">No day</option>
                          {#each DAYS as d}<option value={d}>{d.slice(0, 3)}</option>{/each}
                        </select>
                      {:else if workout.status === 'completed'}
                        <span class="flex items-center gap-1 text-caption text-success shrink-0"><Icon icon="ic:baseline-check" class="text-sm" />Done</span>
                      {:else}
                        <button
                          onclick={() => trainingState.startSession(workout)}
                          disabled={trainingState.isSessionActive && !isThisRunning}
                          title={trainingState.isSessionActive && !isThisRunning ? 'Finish or discard the running session first' : undefined}
                          class="flex items-center gap-1 px-3 py-1.5 rounded-control text-label font-semibold shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed {isThisRunning ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary hover:bg-primary/20'}"
                        >
                          <Icon icon="ic:baseline-play-arrow" class="text-sm" />{isThisRunning ? 'Resume' : 'Start'}
                        </button>
                      {/if}
                    {/snippet}
                  </ListRow>
                {:else}
                  <p class="text-caption text-content-subtle/60 italic py-2">Drop here</p>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="pt-3 border-t border-border space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-section uppercase text-content-muted">Benchmarks</h4>
          <button onclick={handleAddBenchmark} class="p-1.5 rounded-control text-primary hover:bg-surface-elevated transition-colors" aria-label="Add a benchmark result"><Icon icon="ic:baseline-plus" class="text-lg" /></button>
        </div>

        {#if isAddingBenchmark}
          <BenchmarkForm
            weekId={trainingState.selectedWeekId!}
            initialData={editingBenchmark}
            onSave={() => { isAddingBenchmark = false; editingBenchmark = null; }}
            onCancel={() => { isAddingBenchmark = false; editingBenchmark = null; }}
          />
        {/if}

        <div class="divide-y divide-border">
          {#each weekBenchmarks as benchmark}
            <ListRow title={benchmark.type} value="{benchmark.value} {benchmark.unit}" onclick={() => handleEditBenchmark(benchmark)}>
              {#snippet trailing()}
                <button onclick={() => trainingState.deleteBenchmark(benchmark.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" aria-label="Delete benchmark"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
              {/snippet}
            </ListRow>
          {:else}
            {#if !isAddingBenchmark}
              <p class="text-caption text-content-subtle italic py-1">None this week</p>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <div data-tour="plan-goals"><GoalsCalendar /></div>
</div>

{#if sharingWeek && trainingState.selectedWeekId}
  <WeekShareImage weekId={trainingState.selectedWeekId} onClose={() => sharingWeek = false} />
{/if}

{#if showAICoach}
  <AICoachModal onClose={() => showAICoach = false} />
{/if}

{#if planBSettings}
  <PlanBSheet alt={planBSettings.alt} occurrence={planBSettings.key} onClose={() => planBSettings = null} />
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

