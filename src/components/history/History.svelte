<script lang="ts">
  import { fabActions } from '../../lib/navigation/fabActions.svelte';
  import AppBar from '../nav/AppBar.svelte';
  import { openSessionActions } from '../../lib/sessionActions.svelte';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import type { Workout } from '../../lib/types';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { sessionDuration } from '../../lib/planning/sessionDuration';
  import ListRow from '../common/ListRow.svelte';
  import { openPastSessionSheet } from '../../lib/session/pastSessionUi.svelte';
  import SendsLog from '../sends/SendsLog.svelte';
  import { applySendFilters } from '../../lib/sends/filter';
  import { parseFontGrade } from '../../lib/analytics/grades';
  import { displayGrade } from '../../lib/sends/gradeScale';
  import Icon from "@iconify/svelte";
  import { onMount, tick } from 'svelte';
  import Segmented from '../ui/Segmented.svelte';
  import SectionHeader from '../dashboard/home/SectionHeader.svelte';
  import { formatDay, parseDay } from '../../lib/dateUtils';

  // History: overflow menu, month
  // grouping, richer row content (duration/fatigue/block), and the new
  // typeId/block/search/to-date filters, on top of the Share wiring.

  const completedWorkouts = $derived(trainingState.completedWorkouts);
  let limit = $state(50);

  let showFilters = $state(false);
  let filterFromDate = $state<string>('');
  let filterToDate = $state<string>('');
  let filterAnalyticsType = $state<string>('');
  let filterExerciseTypeId = $state<string>('');
  let filterBlockId = $state<string>('');
  let filterSearch = $state<string>('');
  let filterMinDuration = $state<number | ''>('');
  let filterMaxDuration = $state<number | ''>('');
  // Sends' own filters; search and the date range above are shared by both tabs.
  let filterMinGrade = $state('');
  let filterMaxGrade = $state('');
  let filterStyle = $state('');
  let filterCrag = $state('');
  const onSends = $derived(trainingState.uiStore.historyTab === 'sends');

  // Arriving from Home's Recent Activity: open that session in the workout
  // modal and bring its card into view. One-shot - the focus is cleared so coming back later starts
  // from the top as usual.
  onMount(async () => {
    const focusId = trainingState.uiStore.historyFocusId;
    if (!focusId) return;
    trainingState.uiStore.historyFocusId = null;
    const index = filteredWorkouts.findIndex((w) => w.id === focusId);
    if (index === -1) return;
    if (index >= limit) limit = index + 1;
    openWorkout(filteredWorkouts[index], 'view', false, filteredWorkouts);
    await tick();
    document.getElementById(`workout-${focusId}`)?.scrollIntoView({ block: 'center' });
  });

  // A live session's recorded running time when it has one, otherwise the
  // logged exercises (falling back to the estimate) - see `sessionDuration`,
  // which replaced this component's own sum so History, the duration filter,
  // load factor and the calendar export can't disagree about a session's
  // length. Sessions logged before live sessions existed are unaffected.
  function workoutDuration(w: Workout): number {
    return sessionDuration(w);
  }

  function blockForWorkout(w: Workout) {
    return w.blockId ? trainingState.trainingBlocks.find((b) => b.id === w.blockId) : undefined;
  }

  // Newest first. Sorted once; the filters below only narrow this list.
  const sortedWorkouts = $derived(completedWorkouts.slice().sort((a, b) => {
    const timeA = new Date(a.date || 0).getTime();
    const timeB = new Date(b.date || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const startA = a.startTime || "00:00";
    const startB = b.startTime || "00:00";
    return startA.localeCompare(startB);
  }).reverse());

  const filteredWorkouts = $derived(sortedWorkouts.filter(w => {
    // Compared by day, so the "to" date includes sessions later that same day.
    if (filterFromDate && w.date && w.date.slice(0, 10) < filterFromDate) return false;
    if (filterToDate && w.date && w.date.slice(0, 10) > filterToDate) return false;

    const totalDuration = workoutDuration(w);
    if (filterMinDuration !== '' && totalDuration < filterMinDuration) return false;
    if (filterMaxDuration !== '' && totalDuration > filterMaxDuration) return false;

    if (filterAnalyticsType) {
      if (!w.exercises || w.exercises.length === 0) return false;
      const hasCategory = w.exercises.some(e => {
        const catName = e.categoryId
          ? trainingState.analyticsCategories.find(c => c.id === e.categoryId)?.name
          : trainingState.exerciseTypes.find(t => t.id === e.typeId)?.category;
        return catName === filterAnalyticsType;
      });
      if (!hasCategory) return false;
    }

    if (filterExerciseTypeId) {
      if (!w.exercises?.some(e => e.typeId === filterExerciseTypeId)) return false;
    }

    if (filterBlockId && w.blockId !== filterBlockId) return false;

    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const matches = w.notes?.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q);
      if (!matches) return false;
    }

    return true;
  }));

  const displayedWorkouts = $derived(filteredWorkouts.slice(0, limit));

  const filteredSends = $derived(applySendFilters(trainingState.outdoorAscents, {
    search: filterSearch,
    from: filterFromDate,
    to: filterToDate,
    minGrade: filterMinGrade,
    maxGrade: filterMaxGrade,
    style: filterStyle,
    crag: filterCrag,
  }));

  /** Grades that have been sent, lowest first, labelled in the display scale. In V, one option per band: its lowest Font grade for "min", its highest for "max". */
  function gradeOptions(end: 'min' | 'max'): { value: string; label: string }[] {
    const grades = [...new Set(trainingState.outdoorAscents.map((a) => a.grade))]
      .filter((g) => parseFontGrade(g) !== undefined)
      .sort((a, b) => parseFontGrade(a)! - parseFontGrade(b)!);
    const byLabel = new Map<string, string>();
    for (const g of grades) {
      const label = displayGrade(g, trainingState.units.grades);
      if (end === 'max' || !byLabel.has(label)) byLabel.set(label, g);
    }
    return [...byLabel].map(([label, value]) => ({ label, value }));
  }
  const sendStyles = $derived([...new Set(trainingState.outdoorAscents.map((a) => a.style).filter((x): x is string => !!x))].sort());
  const sendCrags = $derived([...new Set(trainingState.outdoorAscents.map((a) => a.crag).filter((x): x is string => !!x))].sort());

  /** How many filters apply to the tab being viewed - shown on the filter button. */
  const activeFilterCount = $derived(
    [filterSearch, filterFromDate, filterToDate].filter(Boolean).length +
      (onSends
        ? [filterMinGrade, filterMaxGrade, filterStyle, filterCrag].filter(Boolean).length
        : [filterAnalyticsType, filterExerciseTypeId, filterBlockId].filter(Boolean).length +
          [filterMinDuration, filterMaxDuration].filter((v) => v !== '').length),
  );

  /** The filters that apply, each with the way to switch it off - shown as chips once the panel is closed. */
  const activeChips = $derived.by(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (filterSearch) chips.push({ label: `Search: ${filterSearch}`, clear: () => (filterSearch = '') });
    if (filterFromDate) chips.push({ label: `From ${formatDay(filterFromDate)}`, clear: () => (filterFromDate = '') });
    if (filterToDate) chips.push({ label: `To ${formatDay(filterToDate)}`, clear: () => (filterToDate = '') });
    if (onSends) {
      if (filterMinGrade) chips.push({ label: `Min grade ${displayGrade(filterMinGrade, trainingState.units.grades)}`, clear: () => (filterMinGrade = '') });
      if (filterMaxGrade) chips.push({ label: `Max grade ${displayGrade(filterMaxGrade, trainingState.units.grades)}`, clear: () => (filterMaxGrade = '') });
      if (filterStyle) chips.push({ label: filterStyle, clear: () => (filterStyle = '') });
      if (filterCrag) chips.push({ label: filterCrag, clear: () => (filterCrag = '') });
    } else {
      if (filterAnalyticsType) chips.push({ label: filterAnalyticsType, clear: () => (filterAnalyticsType = '') });
      if (filterExerciseTypeId) chips.push({ label: trainingState.exerciseTypes.find((t) => t.id === filterExerciseTypeId)?.name ?? 'Exercise type', clear: () => (filterExerciseTypeId = '') });
      if (filterBlockId) chips.push({ label: trainingState.trainingBlocks.find((b) => b.id === filterBlockId)?.name ?? 'Block', clear: () => (filterBlockId = '') });
      if (filterMinDuration !== '') chips.push({ label: `Min ${filterMinDuration} min`, clear: () => (filterMinDuration = '') });
      if (filterMaxDuration !== '') chips.push({ label: `Max ${filterMaxDuration} min`, clear: () => (filterMaxDuration = '') });
    }
    return chips;
  });

  function monthKey(dateStr: string | null): string {
    if (!dateStr) return 'unknown';
    const d = parseDay(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthLabel(dateStr: string | null): string {
    if (!dateStr) return 'Unknown';
    return parseDay(dateStr).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  const groupedWorkouts = $derived.by(() => {
    const groups: { key: string; label: string; workouts: Workout[]; totalLoad: number }[] = [];
    for (const w of displayedWorkouts) {
      const key = monthKey(w.date);
      let group = groups.find(g => g.key === key);
      if (!group) {
        group = { key, label: monthLabel(w.date), workouts: [], totalLoad: 0 };
        groups.push(group);
      }
      group.workouts.push(w);
      group.totalLoad += w.loadFactor || 0;
    }
    return groups;
  });

  function clearFilters() {
    filterFromDate = '';
    filterToDate = '';
    filterAnalyticsType = '';
    filterExerciseTypeId = '';
    filterBlockId = '';
    filterSearch = '';
    filterMinDuration = '';
    filterMaxDuration = '';
    filterMinGrade = '';
    filterMaxGrade = '';
    filterStyle = '';
    filterCrag = '';
  }
</script>

<div class="page-col space-y-4 animate-in fade-in duration-200 pb-12">
  <AppBar title="History" subtitle={onSends ? `${filteredSends.length} sends` : `${filteredWorkouts.length} sessions`}>
    {#snippet actions()}
      <button
        onclick={openPastSessionSheet}
        class="w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-surface-elevated/70 text-content-subtle hover:text-content"
        aria-label="Log a past session"
        title="Log a past session"
      >
        <Icon icon="ic:baseline-edit-calendar" class="text-xl" />
      </button>
      <button
        onclick={() => showFilters = !showFilters}
        class="relative w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-surface-elevated/70 {showFilters || activeFilterCount > 0 ? 'text-primary' : 'text-content-subtle hover:text-content'}"
        aria-label={activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : 'Filters'}
        data-tour="history-filters"
        aria-expanded={showFilters}
      >
        <Icon icon="ic:baseline-filter-list" class="text-xl" />
        {#if activeFilterCount > 0 && !showFilters}
          <span class="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[11px] font-bold grid place-items-center tabular-nums">{activeFilterCount}</span>
        {/if}
      </button>
    {/snippet}
  </AppBar>

  <div data-tour="history-tabs">
    <Segmented
      label="History view"
      options={[{ value: 'sessions', label: 'Sessions' }, { value: 'sends', label: 'Sends' }]}
      value={trainingState.uiStore.historyTab}
      onChange={(v) => (trainingState.uiStore.historyTab = v)}
    />
  </div>

  {#if !showFilters && activeChips.length > 0}
    <div class="flex flex-wrap gap-2" aria-label="Active filters">
      {#each activeChips as chip}
        <button type="button" onclick={chip.clear} class="chip max-w-full" aria-label="Remove filter: {chip.label}">
          <span class="truncate">{chip.label}</span><Icon icon="ic:baseline-close" class="text-sm shrink-0" aria-hidden="true" />
        </button>
      {/each}
    </div>
  {/if}

  {#if showFilters}
    <div class="card space-y-4 animate-in slide-in-from-top-2">
      <div class="flex items-center justify-between">
        <h4 class="text-section uppercase text-content-muted">Filters</h4>
        <button onclick={clearFilters} class="btn-quiet px-2 text-label text-content-subtle hover:text-primary">Clear all</button>
      </div>
      <div class="grid grid-cols-1 gap-4">
        <div class="space-y-1.5">
          <label for="filter-search" class="text-label text-content-subtle ml-1">Search</label>
          <input id="filter-search" type="text" bind:value={filterSearch} placeholder={onSends ? 'Name, crag or notes' : 'Name or notes'} class="field" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="filter-date" class="text-label text-content-subtle ml-1">From date</label>
            <input id="filter-date" type="date" bind:value={filterFromDate} class="field" />
          </div>
          <div class="space-y-1.5">
            <label for="filter-date-to" class="text-label text-content-subtle ml-1">To date</label>
            <input id="filter-date-to" type="date" bind:value={filterToDate} class="field" />
          </div>
        </div>
        {#if onSends}
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label for="filter-min-grade" class="text-label text-content-subtle ml-1">Min grade</label>
              <select id="filter-min-grade" bind:value={filterMinGrade} class="field">
                <option value="">Any</option>
                {#each gradeOptions('min') as g}<option value={g.value}>{g.label}</option>{/each}
              </select>
            </div>
            <div class="space-y-1.5">
              <label for="filter-max-grade" class="text-label text-content-subtle ml-1">Max grade</label>
              <select id="filter-max-grade" bind:value={filterMaxGrade} class="field">
                <option value="">Any</option>
                {#each gradeOptions('max') as g}<option value={g.value}>{g.label}</option>{/each}
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label for="filter-style" class="text-label text-content-subtle ml-1">Style</label>
              <select id="filter-style" bind:value={filterStyle} class="field">
                <option value="">Any</option>
                {#each sendStyles as style}<option value={style}>{style}</option>{/each}
              </select>
            </div>
            <div class="space-y-1.5">
              <label for="filter-crag" class="text-label text-content-subtle ml-1">Crag</label>
              <select id="filter-crag" bind:value={filterCrag} class="field">
                <option value="">Any</option>
                {#each sendCrags as crag}<option value={crag}>{crag}</option>{/each}
              </select>
            </div>
          </div>
        {:else}
        <div class="space-y-1.5">
          <label for="filter-type" class="text-label text-content-subtle ml-1">Includes analytics type</label>
          <select id="filter-type" bind:value={filterAnalyticsType} class="field">
            <option value="">Any</option>
            {#each trainingState.analyticsCategories as cat}
              <option value={cat.name}>{cat.name}</option>
            {/each}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="filter-exercise-type" class="text-label text-content-subtle ml-1">Exercise type</label>
            <select id="filter-exercise-type" bind:value={filterExerciseTypeId} class="field">
              <option value="">Any</option>
              {#each trainingState.exerciseTypes as type}
                <option value={type.id}>{type.name}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1.5">
            <label for="filter-block" class="text-label text-content-subtle ml-1">Training block</label>
            <select id="filter-block" bind:value={filterBlockId} class="field">
              <option value="">Any</option>
              {#each trainingState.trainingBlocks as block}
                <option value={block.id}>{block.name}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="filter-min-dur" class="text-label text-content-subtle ml-1">Min duration (min)</label>
            <input id="filter-min-dur"  type="number" inputmode="numeric" bind:value={filterMinDuration} class="field" placeholder="min" />
          </div>
          <div class="space-y-1.5">
            <label for="filter-max-dur" class="text-label text-content-subtle ml-1">Max duration (min)</label>
            <input id="filter-max-dur"  type="number" inputmode="numeric" bind:value={filterMaxDuration} class="field" placeholder="min" />
          </div>
        </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if onSends}
    <SendsLog ascents={filteredSends} filtered={activeFilterCount > 0} />
  {:else}


  <div class="space-y-4" data-tour="history-list">
    {#each groupedWorkouts as group (group.key)}
      <!-- One card per month: its totals as the header, then a row per
           session (the same row as Home's Recent Activity). Tapping a row
           opens the session, where edit, share, duplicate and delete live. -->
      <div class="card space-y-1">
        <SectionHeader label={group.label} subtitle="{group.workouts.length} session{group.workouts.length === 1 ? '' : 's'} · load {Math.round(group.totalLoad)}" info="load" />
        <div class="divide-y divide-border">
          {#each group.workouts as workout (workout.id)}
            {@const block = blockForWorkout(workout)}
            {@const duration = workoutDuration(workout)}
            <div id="workout-{workout.id}" class="scroll-mt-20">
              <ListRow
                title={workout.notes || 'Session'}
                meta={[
                  workout.date ? formatDay(workout.date, { weekday: 'short' }) : undefined,
                  duration > 0 ? `${duration} min` : undefined,
                  block?.name,
                ].filter(Boolean).join(' · ')}
                detail={[...new Set(workout.exercises.map((e) => slotTypeName(e, trainingState.exerciseTypes)))].join(', ') || undefined}
                value={Math.round(workout.loadFactor)}
                valueHint="load"
                onclick={() => openWorkout(workout, 'view', false, filteredWorkouts)}
                onlongpress={() => openSessionActions(workout, filteredWorkouts)}
              />
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="text-center py-12 space-y-3">
        {#if activeFilterCount > 0}
          <p class="text-caption text-content-subtle">No sessions match these filters.</p>
          <button onclick={clearFilters} class="btn btn-secondary">Clear filters</button>
        {:else}
          <p class="text-caption text-content-subtle">No workout history yet.{#if fabActions.showing} Tap + to log a session.{/if}</p>
          {#if !fabActions.showing}<button onclick={() => trainingState.navigate('add')} class="btn btn-secondary">Log a session</button>{/if}
        {/if}
      </div>
    {/each}

    {#if filteredWorkouts.length > limit}
      <button
        onclick={() => limit += 50}
        class="btn btn-ghost w-full text-primary"
      >
        Show more ({displayedWorkouts.length} of {filteredWorkouts.length})
      </button>
    {/if}
  </div>
  {/if}
</div>


