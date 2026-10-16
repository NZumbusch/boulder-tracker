<script lang="ts">
  import { formatClockText } from '../../lib/timeFormat';
  import AppBar from '../nav/AppBar.svelte';
  import { openPastSessionSheet } from '../../lib/session/pastSessionUi.svelte';
  import { fabActions } from '../../lib/navigation/fabActions.svelte';
  import InfoButton from '../common/InfoButton.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { showInfo } from '../../lib/help/infoSheet.svelte';
  import { motionMs, motionReduced, scrollBehavior } from '../../lib/motion';
  import { swipePaging, type SwipeDirection } from '../../lib/analytics/swipe';
  import { openSessionActions } from '../../lib/sessionActions.svelte';
  import PainHeadsUp from '../health/PainHeadsUp.svelte';
  import { WEEK_DAYS } from '../../lib/constants';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekDateRange, getWeekDates, incrementWeekId, decrementWeekId, weekMondayIso, formatWeek } from '../../lib/dateUtils';
  import { generateId } from '../../lib/utils';
  import { getBlocksForWeek, getDominantBlockForWeek, phasesInWeek, weekRuns, describeRuns, dayRangeText } from '../../lib/planning/trainingBlocks';
  import { sortWorkoutsBySchedule } from '../../lib/planning/sortWorkouts';
  import type { Workout, Benchmark, DayOfWeek } from '../../lib/types';
  import { isMissedSession } from '../../lib/planning/weekStatus';
  import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action';
  import Icon from "@iconify/svelte";
  import BenchmarkForm from '../common/BenchmarkForm.svelte';
  import { describeResult } from '../../lib/benchmarks/model';
  import AICoachModal from './AICoachModal.svelte';
  import WeekShareImage from './WeekShareImage.svelte';
  import WeekCalendar from './WeekCalendar.svelte';
  import PhasePlanner from './PhasePlanner.svelte';
  import GoalsCalendar from './GoalsCalendar.svelte';
  import { patternForPhase, patternStyle, weekMatchesPhaseFilter } from '../../lib/planning/weekPatterns';
  import { formatGoalDates, goalEnd } from '../../lib/goals/goals';
  import { sessionsDuringTrip } from '../../lib/goals/tripConflicts';
  import NoteSheet from '../common/NoteSheet.svelte';
  import ListRow from '../common/ListRow.svelte';
  import { summarizeSession } from '../../lib/planning/sessionSummary';
  import { weekStartDay } from '../../lib/analytics/range';
  import { localDayIndex } from '../../lib/analytics/recoverySeries';
  import PlanBStretch from './PlanBStretch.svelte';
  import PlanBSheet from './PlanBSheet.svelte';
  import PlanCalendar from './PlanCalendar.svelte';
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
  /** Every phase id in list order (archived ones too, so a pattern never moves when a phase is archived). */
  const orderedPhaseIds = $derived([...trainingState.phaseDefs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => p.id));
  const usePatterns = $derived(trainingState.tunableOn('plan.weekPatterns'));
  const patternOf = (phaseId?: string) => (usePatterns ? patternStyle(patternForPhase(phaseId, orderedPhaseIds)) : '');
  /** The legend doubles as a filter: weeks without a chosen phase fade. Empty = all weeks. */
  let phaseFilter = $state<Set<string>>(new Set());
  function togglePhaseFilter(id: string) {
    const next = new Set(phaseFilter);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    phaseFilter = next;
  }
  const phaseName = (phaseId?: string) => (phaseId && phaseDefById.get(phaseId)?.name) || undefined;

  // --- State ---

  /** The Plan screen has two views of the same plan: the block grid with its week card, or a calendar (Day/Week/Month/Year). */
  const VIEW_KEY = 'plan.view';
  let view = $state<'blocks' | 'calendar'>((() => {
    try { return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'blocks'; } catch { return 'blocks'; }
  })());
  /** Editing a Plan B happens in the block view, whatever was picked. */
  const shownView = $derived(trainingState.planBEditing ? 'blocks' : view);
  function setView(next: 'blocks' | 'calendar') {
    view = next;
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* per-viewer convenience only */ }
  }
  let isAddingBenchmark = $state(false);
  let editingBenchmark = $state<Benchmark | null>(null);
  let showAICoach = $state(false);
  let showBlockManager = $state(false);
  /** A day to open the Block manager at (from the week card's phase chips); undefined = just the list. */
  let blockManagerDate = $state<string | undefined>(undefined);
  function openBlockManager(date?: string) {
    blockManagerDate = date;
    showBlockManager = true;
  }
  let showWeekNote = $state(false);
  /**
   * Arrange mode: drag handles (and every day as a drop zone, rest days
   * included) only while it's on. Normally rows are clean and a tap opens
   * the session - dragging stays deliberate, never a side effect of
   * scrolling (drag by handle only).
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
    const today = trainingState.todayIso;
    const weekWorkouts = trainingState.getWorkoutsForWeek(weekId);
    return trainingState.goals
      .filter((g) => g.kind === 'trip' && g.date <= end && goalEnd(g) >= start)
      .map((trip) => ({ trip, planned: sessionsDuringTrip(trip, weekWorkouts, today).length }));
  });
  const selectedWeekNote = $derived(trainingState.selectedWeekId ? trainingState.getWeekNote(trainingState.selectedWeekId) : '');

  // --- Logic: Calendar Generation ---
  // A 50-week grid with hover tooltips (a block-timeline band over a 16-week
  // window was tried and read worse in the real app).

  const weeks = $derived.by(() => {
    const currentWeekId = trainingState.currentWeekId;
    const tempWeeks: { id: string; label: string; phaseId?: string; isCurrent: boolean; year: number; hasOverlap: boolean; runs: ReturnType<typeof weekRuns> }[] = [];

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
        label: formatWeek(id),
        phaseId: dominant?.phaseId,
        isCurrent: id === currentWeekId,
        year: d.getUTCFullYear(),
        hasOverlap: covering.length > 1,
        runs: weekRuns(trainingState.trainingBlocks, id),
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
      // elsewhere in this file, but for the calendar grid it drowned out
      // `WeekCalendar`'s own softer "no phase" fallback
      // (`bg-surface-elevated/50`) with a flat mid-gray on every unassigned
      // cell. Passing `undefined` here lets that component's own fallback apply.
      color: w.phaseId ? phaseDefById.get(w.phaseId)?.color : undefined,
      tooltip: `${formatWeek(w.id)}${phaseName(w.phaseId) ? ` - ${w.runs.length > 1 ? describeRuns(w.runs.map((r) => ({ name: r.block ? phaseName(r.block.phaseId) : undefined, from: r.from, to: r.to }))) : phaseName(w.phaseId)}` : ''}${w.hasOverlap ? ' (overlapping blocks)' : ''}`,
      hasOverlap: w.hasOverlap,
      pattern: patternOf(w.phaseId),
      dimmed: !weekMatchesPhaseFilter(w.runs.length ? w.runs.map((r) => r.block?.phaseId) : [w.phaseId], phaseFilter),
      // A week with more than one run is split between phases (or has days no phase has): drawn in segments.
      runs: w.runs.length > 1 ? w.runs.map((r) => ({ color: r.block ? phaseDefById.get(r.block.phaseId)?.color : undefined, from: r.from, to: r.to, pattern: patternOf(r.block?.phaseId) })) : undefined,
    })),
  );

  /** The phases the selected week holds, with their days - two usually, three or more work the same. */
  const selectedWeekPhases = $derived(
    trainingState.selectedWeekId ? phasesInWeek(trainingState.trainingBlocks, trainingState.selectedWeekId) : [],
  );
  /** Blocks that touch the selected week without being its phase on any day (a lower-priority emphasis underneath another). */
  const selectedWeekAlso = $derived(
    trainingState.selectedWeekId
      ? getBlocksForWeek(trainingState.trainingBlocks, trainingState.selectedWeekId).filter((b) => !selectedWeekPhases.some((p) => p.block.id === b.id))
      : [],
  );
  /** 0 = Monday ... 6 = Sunday, for a day of the selected week. */
  const weekDayIndex = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

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
  const DAY_NAMES: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  /** A planned session whose day has gone by unlogged - marked, still startable. Sessions of the Plan B side that doesn't count aren't missed. */
  const isMissed = (w: Workout) => counts(w) && isMissedSession(w, trainingState.currentWeekId, DAY_NAMES[trainingState.today.getDay()]);
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

  // Sessions a phase gives the week are projected from its templates rather
  // than stored (lib/planning/weekProjection.ts) and saved one by one, when
  // something happens to them - so every handler below works unchanged on a
  // projected session.

  /** A week with sessions saved or deleted that still has a phase to fall back to. */
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

  // The floating + adds a session: on the calendar's day, or - in the block view - today if the selected week is this one, else its Monday.
  let calendarRef = $state<{ addAtFocus: () => void } | undefined>(undefined);
  $effect(() => {
    fabActions.addToPlan = () => {
      if (shownView === 'calendar') { calendarRef?.addAtFocus(); return; }
      const weekId = trainingState.selectedWeekId ?? trainingState.currentWeekId;
      const today = WEEK_DAYS[(new Date().getDay() + 6) % 7];
      handleAddWorkout(weekId, weekId === trainingState.currentWeekId ? today : 'Monday');
    };
    return () => { fabActions.addToPlan = null; };
  });

  // --- Handlers ---

  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'prev') trainingState.weekOffset--;
    else if (direction === 'next') trainingState.weekOffset++;
    else if (direction === 'today') {
      trainingState.weekOffset = 0;
      trainingState.selectedWeekId = trainingState.currentWeekId;
    }
  }

  // --- Swiping the week card: one week back or on (same gesture as Analytics) ---
  let weekCardEl = $state<HTMLElement | null>(null);
  function stepWeek(direction: SwipeDirection) {
    const from = trainingState.selectedWeekId;
    if (!from || arranging) return;
    const next = direction === 'next' ? incrementWeekId(from) : decrementWeekId(from);
    trainingState.selectedWeekId = next;
    // The calendar shows 50 weeks at a time - page it along when the week walks off its edge.
    if (!weeks.some((w) => w.id === next)) trainingState.weekOffset += direction === 'next' ? 1 : -1;
    if (weekCardEl?.animate && !motionReduced()) {
      weekCardEl.animate(
        [{ transform: `translateX(${direction === 'prev' ? -32 : 32}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  }

  function handleAddWorkout(weekId: string, dayOfWeek?: DayOfWeek, startTime?: string) {
    const dominantBlock = getDominantBlockForWeek(trainingState.trainingBlocks, weekId);
    const newWorkout: Workout = {
      id: generateId(),
      status: 'planned',
      date: null,
      weekId,
      dayOfWeek,
      ...(startTime ? { startTime } : {}),
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
   * before mutating rather than writing to the live store object in place.
   * Uses `saveWorkoutQuiet` rather than
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
   * each session row rather than the whole row, so the
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
    const today = localDayIndex(trainingState.today);
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

<div class="w-full {shownView === 'calendar' ? 'max-w-5xl' : 'page-col'} space-y-4 animate-in fade-in duration-200 pb-12">
  <AppBar title="Plan">
    {#snippet actions()}
      <button
        onclick={openPastSessionSheet}
        class="w-10 h-10 flex items-center justify-center text-content-subtle hover:text-content rounded-full hover:bg-surface-elevated/70 transition-colors"
        aria-label="Log a past session"
        title="Log a past session"
      >
        <Icon icon="ic:baseline-edit-calendar" class="text-xl" />
      </button>
      <button
        onclick={() => openBlockManager()}
        class="w-10 h-10 flex items-center justify-center text-content-subtle hover:text-content rounded-full hover:bg-surface-elevated/70 transition-colors"
        aria-label="Phases and training blocks"
        data-tour="plan-blocks"
        title="Phases and training blocks"
      >
        <Icon icon="ic:baseline-view-week" class="text-xl" />
      </button>
      <button
        onclick={() => showAICoach = true}
        class="w-10 h-10 flex items-center justify-center text-primary hover:text-primary-hover rounded-full hover:bg-surface-elevated/70 transition-colors"
        aria-label="AI Coach"
        data-tour="plan-ai"
        title="AI Coach: change the plan, analyze, or share context"
      >
        <Icon icon="ic:baseline-auto-awesome" class="text-xl" />
      </button>
    {/snippet}
  </AppBar>

  <div class="flex flex-col gap-4">
    {#if !inPlanBMode}
      <div class="px-1">
        <Segmented
          label="Plan view"
          options={[{ value: 'blocks', label: 'Weeks', title: 'Phases and weeks, with the sessions of the selected week' }, { value: 'calendar', label: 'Calendar', title: 'Day, week, month and year calendar' }]}
          value={view}
          onChange={setView}
        />
      </div>
    {/if}
    {#if shownView === 'calendar'}
      <PlanCalendar bind:this={calendarRef} onAdd={handleAddWorkout} onEditPhase={openBlockManager} onShowWeeks={() => setView('blocks')} />
    {:else}
    <div class="flex items-start justify-between gap-2 px-1">
      <!-- The legend is also the filter: tap a phase to fade the weeks that have none of it; tap again to undo. -->
      <div class="flex flex-wrap gap-x-1 gap-y-0 -ml-2" role="group" aria-label="Phases: tap to show only those weeks">
        {#each selectablePhases as phase (phase.id)}
          {@const on = phaseFilter.has(phase.id)}
          <button type="button" onclick={() => togglePhaseFilter(phase.id)} aria-pressed={on} class="tap inline-flex items-center gap-1.5 min-h-10 px-2 rounded-control text-caption transition-colors {on ? 'text-content font-semibold bg-surface-elevated' : 'text-content-subtle hover:text-content'}">
            <span class="w-3.5 h-3.5 rounded-full shrink-0 {phase.color || FALLBACK_PHASE_COLOR} {on ? 'ring-2 ring-content' : ''}" style={patternOf(phase.id)} aria-hidden="true"></span>{phase.name}
          </button>
        {/each}
        {#if phaseFilter.size > 0}
          <button type="button" onclick={() => (phaseFilter = new Set())} class="btn-quiet px-2 min-h-10 text-caption text-primary">Show all</button>
        {/if}
      </div>
      <!-- Paging through the weeks. -->
      <div class="flex items-center shrink-0 -mr-1.5">
        <button onclick={() => navigate('prev')} class="tap p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors" aria-label="Earlier weeks">
          <Icon icon="ic:baseline-chevron-left" class="text-lg" />
        </button>
        {#if !(trainingState.weekOffset === 0 && trainingState.selectedWeekId === trainingState.currentWeekId)}
          <button onclick={() => navigate('today')} class="btn-quiet px-2 text-caption text-primary hover:bg-surface-elevated">
            Today
          </button>
        {/if}
        <button onclick={() => navigate('next')} class="tap p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors" aria-label="Later weeks">
          <Icon icon="ic:baseline-chevron-right" class="text-lg" />
        </button>
      </div>
    </div>

    <div data-tour="plan-calendar">
    <WeekCalendar
      soft={!trainingState.tunableOn('plan.weekGridClear')}
      weeks={calendarWeeks}
      selectedWeekId={trainingState.selectedWeekId}
      onSelectWeek={(weekId) => { trainingState.selectedWeekId = weekId; }}
    />
    </div>
    {/if}
  </div>

  {#if shownView === 'blocks' && trainingState.selectedWeekId && selectedWeekData}
    <!-- A sideways swipe moves a week back or on (lib/analytics/swipe.ts);
         touch-pan-y keeps vertical scrolling native. Off while arranging,
         where a sideways drag moves a session. -->
    <div
      class="card space-y-4 relative touch-pan-y"
      bind:this={weekCardEl}
      use:swipePaging={stepWeek}
    >
      <!-- Title column and the week's actions side by side on every width -
           the actions used to drop onto their own row, leaving a gap. -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0 relative">
          <span class="text-section uppercase text-content-muted block">{selectedWeekData.isCurrent ? 'This week' : formatWeek(selectedWeekData.id)} <span class="normal-case tracking-normal font-normal text-content-subtle whitespace-nowrap block min-[380px]:inline"><span class="hidden min-[380px]:inline">·&nbsp;</span>{getWeekDateRange(selectedWeekData.id)}</span></span>
          <!-- The phases the week holds, with their days when it is split. Tapping one opens the Block manager at that day - phases are edited there. -->
          <div class="flex items-center gap-x-3 gap-y-0.5 flex-wrap" data-tour="plan-phase">
            {#each selectedWeekPhases as part (part.block.id)}
              <button onclick={() => openBlockManager(part.days[0])} class="tap text-left group flex items-baseline gap-1.5" aria-label="Edit the {phaseName(part.block.phaseId)} phase">
                {#if selectedWeekPhases.length > 1}<span class="w-2 h-2 rounded-full self-center shrink-0 {phaseColor(part.block.phaseId)}"></span>{/if}
                <h3 class="text-title text-content group-hover:text-primary-hover transition-colors">{phaseName(part.block.phaseId) ?? part.block.name}</h3>
                <Icon icon="ic:baseline-edit" class="text-sm text-content-subtle self-center shrink-0" />
                {#if selectedWeekPhases.length > 1}<span class="text-caption text-content-subtle whitespace-nowrap">{dayRangeText(weekDayIndex(part.days[0]), weekDayIndex(part.days[part.days.length - 1]))}</span>{/if}
              </button>
            {:else}
              <button onclick={() => openBlockManager(trainingState.selectedWeekId ? weekMondayIso(trainingState.selectedWeekId) : undefined)} class="text-left group min-h-10 flex items-center">
                <h3 class="text-label text-content-subtle group-hover:text-primary-hover transition-colors">No phase - tap to add</h3>
              </button>
            {/each}
            <InfoButton term="phases" />
          </div>

          {#if selectedWeekAlso.length > 0}
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#each selectedWeekAlso as block}
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
               saves no session - see WeekNote. -->
          <button
            onclick={() => showWeekNote = true}
            class="btn-icon rounded-control {selectedWeekNote ? 'text-primary' : 'text-content-subtle hover:text-content'}"
            title={selectedWeekNote ? 'Week note' : 'Add a week note'}
            aria-label={selectedWeekNote ? 'Open week note' : 'Add a week note'}
          >
            <Icon icon={selectedWeekNote ? 'ic:baseline-sticky-note-2' : 'ic:outline-sticky-note-2'} class="text-lg" />
          </button>
          <button
            onclick={() => showCopy = !showCopy}
            class="btn-icon rounded-control {showCopy ? 'text-primary bg-surface-elevated' : 'text-content-subtle hover:text-content'}"
            title="Week actions: copy, repeat, Plan B, share, reset, clear"
            aria-label="Week actions"
            aria-expanded={showCopy}
          >
            <Icon icon="ic:baseline-more-horiz" class="text-lg" />
          </button>
        </div>
      </div>

      {#if showCopy}
        <div class="p-3.5 rounded-control bg-surface-elevated/40 space-y-3 animate-in fade-in duration-150" role="group" aria-label="Week actions">
          <p class="text-section uppercase text-content-muted">Week actions</p>
          <button
            onclick={copyLastWeekHere}
            disabled={previousWeekCount === 0}
            class="tap w-full flex items-center gap-2 text-left disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <Icon icon="ic:baseline-south" class="text-base text-primary shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block text-label text-content group-hover:text-primary transition-colors">Copy last week here</span>
              <span class="block text-caption text-content-subtle">{formatWeek(previousWeekId)} · {previousWeekCount} session{previousWeekCount === 1 ? '' : 's'}</span>
            </span>
          </button>
          <div class="pt-3 border-t border-border/60 flex items-center gap-2 flex-wrap">
            <Icon icon="ic:baseline-repeat" class="text-base text-primary shrink-0" />
            <span class="text-label text-content">Repeat this week into the next</span>
            <!-- The number and its unit wrap together, so "week" never ends up alone beside the button. -->
            <span class="inline-flex items-center gap-2">
              <select bind:value={repeatCount} class="field w-auto" aria-label="Number of weeks">
                {#each [1, 2, 3, 4, 5, 6, 7, 8] as n}<option value={n}>{n}</option>{/each}
              </select>
              <span class="text-label text-content">week{repeatCount === 1 ? '' : 's'}</span>
            </span>
            <button
              onclick={repeatThisWeek}
              disabled={weekWorkouts.length === 0}
              class="btn btn-primary ml-auto"
            >Replace {repeatCount} week{repeatCount === 1 ? '' : 's'}</button>
          </div>
          <p class="text-caption text-content-subtle">Replaces the planned sessions there; completed ones stay. You can undo it.</p>
          <button
            onclick={() => { showCopy = false; trainingState.editPlanBAt(trainingState.selectedWeekId!); }}
            class="tap w-full pt-3 border-t border-border/60 flex items-center gap-2 text-left group"
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
            class="tap w-full pt-3 border-t border-border/60 flex items-center gap-2 text-left disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <Icon icon="ic:baseline-ios-share" class="text-base text-primary shrink-0" />
            <span class="text-label text-content group-hover:text-primary transition-colors">Share this week as an image</span>
          </button>
          {#if canResetWeek}
            <button
              onclick={() => { showCopy = false; trainingState.resetWeekToPhaseDefaults(trainingState.selectedWeekId!); }}
              class="tap w-full pt-3 border-t border-border/60 flex items-center gap-2 text-left group"
            >
              <Icon icon="ic:baseline-restore" class="text-base text-primary shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block text-label text-content group-hover:text-primary transition-colors">Reset week to its phase</span>
                <span class="block text-caption text-content-subtle">Discard this week's saved changes and follow the phase templates again</span>
              </span>
            </button>
          {/if}
          <button
            onclick={() => { showCopy = false; trainingState.clearWeek(trainingState.selectedWeekId!); }}
            class="tap w-full pt-3 border-t border-border/60 flex items-center gap-2 text-left group"
          >
            <Icon icon="ic:baseline-delete-sweep" class="text-base text-danger shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block text-label text-danger">Clear this week</span>
              <span class="block text-caption text-content-subtle">Deletes its sessions and test results; asks first</span>
            </span>
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
            <button onclick={() => planBSettings = { alt: editedPlanB, key: editingPlanB.key! }} class="btn-icon" aria-label="Plan B settings"><Icon icon="ic:baseline-tune" class="text-lg" /></button>
          {/if}
          <button onclick={() => trainingState.finishPlanBEditing()} class="btn btn-primary shrink-0">Done</button>
        </div>
      {/if}

      {#each planView?.occurrences ?? [] as occ (`${occ.alt.id}:${occ.key}`)}
        <div data-tour="plan-planb">
          <PlanBStretch {occ} onSettings={() => planBSettings = { alt: occ.alt, key: occ.key }} />
        </div>
      {/each}
      {#each skippedHere as { alt, key } (`${alt.id}:${key}`)}
        <p class="flex items-center gap-2 text-caption text-content-subtle px-1">
          <Icon icon="ic:baseline-call-split" class="text-sm shrink-0" />
          <span class="flex-1 min-w-0 truncate">{alt.label || 'Plan B'} is skipped this week</span>
          <button onclick={() => trainingState.setPlanBOccurrence(alt.id, key, { skipped: undefined })} class="btn-quiet px-2 text-primary shrink-0">Use it again</button>
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
            <span class="flex gap-0.5 h-2">
              {#each cell.sessions.slice(0, 3) as w (w.id)}
                <span class="w-2 h-2 rounded-full {w.status === 'completed' ? 'bg-success' : w.provisional ? 'border border-dashed border-primary' : 'border border-primary'} {counts(w) ? '' : 'opacity-35'}"></span>
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
                <Icon icon="ic:baseline-drag-indicator" class="text-sm" />{arranging ? 'Finish arranging' : 'Arrange'}
              </button>
            {/if}
            {#if !fabActions.showing}
              <button onclick={() => handleAddWorkout(trainingState.selectedWeekId!)} class="chip text-primary hover:bg-surface-elevated transition-colors" aria-label="Add a session to this week">Add session</button>
            {/if}
          </div>
        </div>

        {#if weekWorkouts.length === 0}
          <p class="text-caption text-content-subtle italic py-3">Nothing planned - tap a day above or {fabActions.showing ? '+' : 'Add session'} to add a session.</p>
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
                      summary.startTime ? formatClockText(summary.startTime, trainingState.clock12) : undefined,
                      `${summary.estimated ? '~' : ''}${summary.minutes} min`,
                      summary.plannedLoad > 0 ? `load ${summary.plannedLoad} pts` : `${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`,
                      workout.provisional ? 'not saved yet' : undefined,
                    ].filter(Boolean).join(' · ')}
                    muted={workout.provisional || !counts(workout)}
                    onclick={arranging ? undefined : () => openWorkout(workout, 'view', false, listedDays.flatMap((k) => dayGroups[k]))}
                    onlongpress={arranging ? null : () => openSessionActions(workout, listedDays.flatMap((k) => dayGroups[k]))}
                  >
                    {#snippet titleExtra()}
                      <PainHeadsUp {workout} />
                    {/snippet}
                    {#snippet metaLead()}
                      {#if isMissed(workout)}<span class="inline-flex align-middle px-1.5 py-px rounded-full text-caption font-semibold bg-danger/10 text-danger">Missed</span>{/if}
                      {#if workout.planB}
                        <!-- Which plan this session belongs to - only sessions the two plans don't share get one. On the meta line so a long title can't hide it. -->
                        <span class="inline-flex align-middle px-1.5 py-px rounded-full text-caption font-semibold {workout.planB.side === 'B' ? 'bg-primary/15 text-primary' : 'bg-surface-elevated text-content-muted'}">{planBMeta(workout)}</span>
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
                          class="flex items-center gap-1 px-3 min-h-10 rounded-control text-label font-semibold shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed {isThisRunning ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary hover:bg-primary/20'}"
                        >
                          <Icon icon="ic:baseline-play-arrow" class="text-sm" />{isThisRunning ? 'Resume' : 'Start'}
                        </button>
                      {/if}
                    {/snippet}
                  </ListRow>
                {:else}
                  <p class="text-caption text-content-subtle italic py-2">Drop here</p>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="pt-3 border-t border-border space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-section uppercase text-content-muted flex items-center gap-1.5">Tests <InfoButton term="tests" /></h4>
          <button onclick={handleAddBenchmark} class="chip text-primary hover:bg-surface-elevated transition-colors" aria-label="Add a test result">Add test</button>
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
            {@const shown = describeResult(benchmark, trainingState.benchmarkTypes, trainingState.valueDefs, trainingState.units.weight)}
            <ListRow title={shown.title} value={shown.value} onclick={() => handleEditBenchmark(benchmark)}>
              {#snippet trailing()}
                <button onclick={() => trainingState.deleteBenchmark(benchmark.id)} class="btn-icon hover:text-danger" aria-label="Delete test result"><Icon icon="ic:baseline-delete" class="text-base" /></button>
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

  {#if shownView !== 'calendar' || trainingState.tunableOn('plan.goalsInCalendar')}
    <div data-tour="plan-goals"><GoalsCalendar /></div>
  {/if}
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
  <PhasePlanner onClose={() => showBlockManager = false} focusDate={blockManagerDate} />
{/if}

{#if showWeekNote && trainingState.selectedWeekId}
  {@const weekId = trainingState.selectedWeekId}
  <NoteSheet
    title="Week note"
    subtitle="{formatWeek(weekId)} · {getWeekDateRange(weekId)}"
    text={selectedWeekNote}
    placeholder="Circumstances, ideas, anything that explains this week…"
    onSave={(text) => trainingState.saveWeekNote(weekId, text)}
    onClose={() => showWeekNote = false}
  />
{/if}

