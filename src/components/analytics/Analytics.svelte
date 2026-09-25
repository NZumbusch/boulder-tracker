<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekDates } from '../../lib/dateUtils';
  import type { Workout, ExerciseTypeDef, ExerciseCategory } from '../../lib/types';
  import { estimateSlotDuration, DEFAULT_EXERCISE_MINUTES } from '../../lib/planning/sessionDuration';
  import { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import {
    calculateAcwrForWeeks,
    calculateWeeklyAdherence,
    findRecoveryWarnings,
    correlatePainWithLoadSpikes,
  } from '../../lib/analytics/loadAnalytics';
  import { computeFatigueDecay } from '../../lib/analytics/readiness';
  import { weeksToShow, weekWindowOffsets, labelStep } from '../../lib/analytics/chartWindow';
  import { parseFontGrade } from '../../lib/analytics/grades';
  import LoadPanel from './LoadPanel.svelte';
  import MixPanel from './MixPanel.svelte';
  import BodyweightPanel from './BodyweightPanel.svelte';
  import BenchmarkPanel from './BenchmarkPanel.svelte';
  import type { ChartData } from './chartTypes';
  import AdherencePanel from './AdherencePanel.svelte';
  import RecoveryWarningsPanel from './RecoveryWarningsPanel.svelte';
  import FatiguePanel from './FatiguePanel.svelte';
  import OutdoorAscentsPanel from './OutdoorAscentsPanel.svelte';
  import RecoveryTrendPanel from './RecoveryTrendPanel.svelte';
  import { localDayIndex } from '../../lib/analytics/recoverySeries';
  import { swipePaging, type SwipeDirection } from '../../lib/analytics/swipe';
  import Icon from "@iconify/svelte";

  // Analytics: one header (week-window paging, CSV export, section-jump
  // chips, the window's dates) over the panels, in the order and with the
  // visibility chosen in Settings. This file owns the week window and the
  // data every panel reads from it; each panel draws itself.
  //
  // Not a sticky header (user-directed, 2026-09-18, after the sticky
  // version's z-index/narrow-screen problems): it scrolls away with the
  // page like every other screen's header.

  // --- State ---
  const categories = $derived(trainingState.analyticsCategories);
  let viewOffset = $state<number>(0);

  // --- Responsive week window. The charts used to draw a fixed 12 weeks at
  // any width, which on a phone left each week narrower than the "W34"
  // label under it. `chartWidth` is the measured inner width of the plot
  // area (bound below on the Rolling Load chart, which shares its padding
  // with every other chart on this screen); how many weeks that fits, and
  // how much the axis has to be thinned, is decided by
  // `lib/analytics/chartWindow.ts` - see its tests. Changing the week count
  // does not change the measured width (bars are flex-sized), so there's no
  // measure/layout feedback loop here.
  let chartWidth = $state(0);
  const visibleWeeks = $derived(weeksToShow(chartWidth, trainingState.chartDensity));
  const axisStep = $derived(labelStep(visibleWeeks, chartWidth));

  /**
   * The visible window as actual dates - Monday of the first week shown to
   * Sunday of the last. The charts' axes are week numbers, which say
   * nothing about when that was; this is the one place the window is
   * spelled out in months and days. The year is only shown when the window
   * spans two of them (or isn't this year), so the common case stays short.
   */
  const windowDateRange = $derived.by(() => {
    const weeks = chartData.weeks;
    if (weeks.length === 0) return '';
    const first = getWeekDates(weeks[0].id);
    const last = getWeekDates(weeks[weeks.length - 1].id);
    if (!first || !last) return '';

    const thisYear = new Date().getFullYear();
    const startYear = first.start.getFullYear();
    const endYear = last.end.getFullYear();
    const showYear = startYear !== endYear || endYear !== thisYear;

    const startOpts: Intl.DateTimeFormatOptions = startYear === endYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    const endOpts: Intl.DateTimeFormatOptions = showYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' };

    return `${first.start.toLocaleDateString(undefined, startOpts)} – ${last.end.toLocaleDateString(undefined, endOpts)}`;
  });

  // --- Section-jump chips. ACWR is merged into the Load panel below, so
  // its chip scrolls to the same anchor as Load - kept as a distinct (if
  // same-target) chip so ACWR is still findable by name.
  // Jump chips follow the cards' order and visibility (Settings -> History & Analytics).
  const CHIPS: Record<string, { id: string; label: string }[]> = {
    load: [{ id: 'section-load', label: 'Load' }, { id: 'section-load', label: 'ACWR' }],
    mix: [{ id: 'section-mix', label: 'Mix' }],
    fatigue: [{ id: 'section-fatigue', label: 'Fatigue' }],
    recoveryTrend: [{ id: 'section-recoveryTrend', label: 'Recovery' }],
    adherence: [{ id: 'section-adherence', label: 'Adherence' }],
    recovery: [{ id: 'section-recovery', label: 'Warnings' }],
    outdoor: [{ id: 'section-outdoor', label: 'Outdoor' }],
    bodyweight: [{ id: 'section-bodyweight', label: 'Bodyweight' }],
    benchmarks: [{ id: 'section-benchmarks', label: 'Benchmarks' }],
  };
  const SECTIONS = $derived(trainingState.analyticsSections.filter((s) => s.visible).flatMap((s) => CHIPS[s.id] ?? []));
  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Handlers ---
  function navigate(direction: 'prev' | 'next' | 'today') {
    const before = viewOffset;
    if (direction === 'prev') viewOffset--;
    else if (direction === 'next') viewOffset++;
    else if (direction === 'today') viewOffset = 0;
    if (viewOffset !== before) slideIn(viewOffset < before ? 'prev' : 'next');
  }

  // Paging slides the panels in from the side the new weeks come from, so
  // a swipe feels like moving along the timeline rather than a redraw.
  // Animated in place (Web Animations) rather than by re-keying the
  // panels, which would remount them and reset their own state (Mix
  // options, the chosen benchmark).
  let panelsEl = $state<HTMLElement | null>(null);
  function slideIn(from: SwipeDirection) {
    if (!panelsEl?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const dx = from === 'prev' ? -32 : 32;
    panelsEl.animate(
      [{ transform: `translateX(${dx}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }

  // --- Logic: Data Processing ---

  /**
   * Derives chart data for the "Rolling Load" and "Exercise Volume" graphs
   * over the currently visible week window (see `visibleWeeks`), aggregating
   * total actual load, total planned load, and counts of exercise categories.
   */
  const chartData = $derived.by((): ChartData => {
    const types = trainingState.exerciseTypes;

    // Quick lookup for assigning categories to recorded exercises
    const typeToCategory = new Map<string, ExerciseCategory>();
    types.forEach((t: ExerciseTypeDef) => typeToCategory.set(t.id, t.category));

    const weeksMap = new Map<string, {
      load: number,
      plannedLoad: number,
      completedCount: number,
      totalCount: number,
      categories: Record<string, number>,
      completedCategories: Record<string, number>
    }>();

    const weeksToDisplay: string[] = [];
    // As many weeks as the screen fits at the chosen density, paged a whole
    // window at a time - see `weekWindowOffsets`.
    const { startOffset, endOffset } = weekWindowOffsets(visibleWeeks, viewOffset);

    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      weeksToDisplay.push(id);

      weeksMap.set(id, {
        load: 0,
        plannedLoad: 0,
        completedCount: 0,
        totalCount: 0,
        categories: Object.fromEntries(categories.map(c => [c.name, 0])),
        completedCategories: Object.fromEntries(categories.map(c => [c.name, 0]))
      });
    }

    // Read each displayed week through the projection layer, so a week that
    // is still provisional (phase assigned, nothing stored yet - see
    // lib/planning/weekProjection.ts) still contributes its planned load and
    // training mix. Reading `trainingState.workouts` directly here would
    // make the target path drop to zero for every not-yet-materialised week.
    const visibleWorkouts = weeksToDisplay.flatMap((id) => trainingState.getWorkoutsForWeek(id));

    visibleWorkouts.forEach((w: Workout) => {
      const week = weeksMap.get(w.weekId)!;

      week.plannedLoad += (w.plannedLoad || 0);
      week.totalCount += 1;

      if (w.status === 'completed') {
        week.load += (w.loadFactor || 0);
        week.completedCount += 1;
      }

      // Count exercises for both planned and completed to show Training Mix
      w.exercises?.forEach(slot => {
        let categoryName = slot.categoryId
          ? categories.find(c => c.id === slot.categoryId)?.name
          : typeToCategory.get(slot.typeId);

        // Every typeId is guaranteed resolvable to some ExerciseTypeDef
        // (the prescribed/logged migration creates an archived placeholder for any
        // that can't resolve a real one), so this is just a final
        // safety net, not name-matching guesswork.
        if (!categoryName) categoryName = 'Other';

        // Ensure category exists in map (if user deleted a category)
        if (!categories.find(c => c.name === categoryName)) {
           categoryName = categories.length > 0 ? categories[0].name : 'Other';
        }

        // Weight the ratio by duration. An exercise with no explicit
        // duration is derived from its set/rep/rest structure before
        // falling back to the flat default, so a hangboard block stops
        // being weighted the same as a two-hour bouldering session.
        const durationWeight = estimateSlotDuration(slot) ?? DEFAULT_EXERCISE_MINUTES;

        if (week.categories[categoryName] !== undefined) {
          week.categories[categoryName] += durationWeight;
        } else {
          week.categories[categoryName] = durationWeight;
        }

        if (w.status === 'completed') {
          if (week.completedCategories[categoryName] !== undefined) {
            week.completedCategories[categoryName] += durationWeight;
          } else {
            week.completedCategories[categoryName] = durationWeight;
          }
        }
      });
    });

    const sortedWeeks = weeksToDisplay.map(id => [id, weeksMap.get(id)!] as const);

    const getWeeklyTotal = (v: any) => v.load || 0;
    const getWeeklyPlannedTotal = (v: any) => v.plannedLoad || 0;

    const maxLoad = Math.max(...sortedWeeks.map(([_, v]) => Math.max(getWeeklyTotal(v), getWeeklyPlannedTotal(v))), 100) * 1.15;

    return {
      weeks: sortedWeeks.map(([id, data]) => ({
        id,
        label: id.split('-W')[1],
        totalLoad: getWeeklyTotal(data),
        totalPlannedLoad: getWeeklyPlannedTotal(data),
        categories: data.categories,
        completedCategories: data.completedCategories,
        totalDuration: Object.values(data.categories).reduce((a: number, b: number) => a + b, 0),
        isCurrent: id === trainingState.currentWeekId
      })),
      maxLoad
    };
  });

  // --- Load analytics (ACWR/ramp-rate, adherence, recovery
  // warnings, injury-vs-load correlation) - scoped to the same visible
  // week window as the charts above, consistent with this view's existing
  // prev/next/today navigation rather than recomputing over full history.
  const orderedWeekIds = $derived(chartData.weeks.map((w) => w.id));
  const weekLabels = $derived(Object.fromEntries(chartData.weeks.map((w) => [w.id, `W${w.label}`])));
  const acwrResults = $derived(calculateAcwrForWeeks(trainingState.workouts, orderedWeekIds));
  const weeksWithCompletedSessions = $derived(new Set(trainingState.completedWorkouts.map((w) => w.weekId)));
  const weeklyAdherenceResults = $derived(
    orderedWeekIds
      .filter((id) => weeksWithCompletedSessions.has(id))
      .map((id) => calculateWeeklyAdherence(trainingState.workouts, id)),
  );
  const recoveryWarnings = $derived(findRecoveryWarnings(trainingState.workouts, trainingState.dailyMetrics, orderedWeekIds, trainingState.tunable('alerts.restDays')));
  const painCorrelations = $derived(correlatePainWithLoadSpikes(trainingState.painLogs, acwrResults, trainingState.acwrZones.highRisk));

  // --- Fatigue panel data - `computeFatigueDecay`
  // sampled at each displayed week's end date, mirroring the sampling
  // pattern `calculateRollingAcwrSeries` uses, so this is
  // a trend rather than duplicating Home's single "now" snapshot ("Home =
  // now, Analytics = history, no duplicated panels").
  const fatigueSamples = $derived(chartData.weeks.map((w) => {
    const dates = getWeekDates(w.id);
    const asOf = dates ? dates.end : new Date();
    const decay = computeFatigueDecay(trainingState.completedWorkouts, asOf, trainingState.fatigueHalfLife);
    return { weekId: w.id, fingers: decay.fingers, arms: decay.arms, core: decay.core, systemic: decay.systemic };
  }));
  const fatigueCoverage = $derived.by(() => {
    const inWindow = trainingState.completedWorkouts.filter((w) => w.weekId && orderedWeekIds.includes(w.weekId));
    const c = { total: inWindow.length, fingers: 0, arms: 0, core: 0, systemic: 0 };
    inWindow.forEach((w) => {
      if (w.fingers !== undefined) c.fingers++;
      if (w.arms !== undefined) c.arms++;
      if (w.core !== undefined) c.core++;
      if (w.systemic !== undefined) c.systemic++;
    });
    return c;
  });

  // --- Recovery chart: the same window, as calendar days.
  const recoveryDays = $derived.by(() => {
    const first = chartData.weeks.length ? getWeekDates(chartData.weeks[0].id) : null;
    const last = chartData.weeks.length ? getWeekDates(chartData.weeks[chartData.weeks.length - 1].id) : null;
    if (!first || !last) return null;
    return { firstDay: localDayIndex(first.start), lastDay: localDayIndex(last.end), today: localDayIndex(new Date()) };
  });

  // --- Outdoor Ascents panel data - grouped into
  // the same displayed week window, grade parsed via the new Font-grade
  // helper. Ascents whose grade doesn't parse are counted, never dropped
  // silently (see grades.ts's documented French-grade limitation).
  const outdoorAscentData = $derived.by(() => {
    const weekIdSet = new Set(orderedWeekIds);
    const byWeek = new Map<string, { id: string; grade: string; rank: number; date: string; name?: string; style?: string }[]>();
    let unparsedCount = 0;
    for (const a of trainingState.outdoorAscents) {
      const weekId = getWeekId(new Date(a.date));
      if (!weekIdSet.has(weekId)) continue;
      const rank = parseFontGrade(a.grade);
      if (rank === undefined) {
        unparsedCount++;
        continue;
      }
      if (!byWeek.has(weekId)) byWeek.set(weekId, []);
      byWeek.get(weekId)!.push({ id: a.id, grade: a.grade, rank, date: a.date, name: a.name, style: a.style });
    }
    return {
      weeks: orderedWeekIds.map((id) => ({ weekId: id, ascents: byWeek.get(id) ?? [] })),
      unparsedCount,
    };
  });

  // Tooltips are hover-only in CSS, which leaves them unreachable on a
  // phone; this drives the tap path. See `lib/analytics/chartTips.svelte.ts`.
  const tips = new ChartTips();
  $effect(() => tips.listen());
</script>

<div class="w-full max-w-lg space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200 pb-24">
  <div class="flex flex-col gap-2.5">
    <div class="flex items-center justify-between px-1">
      <h2 class="text-title text-content">Analytics</h2>
      <!-- Window paging and CSV export share one quiet row of controls,
           rather than a heavy button beside the title and a second nav row
           below the chips. -->
      <div class="flex items-center gap-1">
        <button
          onclick={() => navigate('prev')}
          class="p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors"
          aria-label="Earlier weeks"
        >
          <Icon icon="ic:baseline-chevron-left" class="text-lg" />
        </button>
        <button
          onclick={() => navigate('today')}
          class="px-2 py-1 text-caption text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors"
        >
          Today
        </button>
        <button
          onclick={() => navigate('next')}
          class="p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors"
          aria-label="Later weeks"
        >
          <Icon icon="ic:baseline-chevron-right" class="text-lg" />
        </button>
        <button
          onclick={() => trainingState.exportToCSV()}
          class="p-1.5 ml-1 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors"
          aria-label="Export CSV"
          title="Export CSV"
        >
          <Icon icon="ic:baseline-download" class="text-base" />
        </button>
      </div>
    </div>

    <!-- Chips get their own full-width row so they always have room to
         scroll horizontally, rather than being squeezed by the nav
         controls on a narrow phone. -->
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar px-1">
      {#each SECTIONS as s}
        <button
          onclick={() => scrollToSection(s.id)}
          class="shrink-0 px-2.5 py-1 text-caption text-content-subtle hover:text-content rounded-control border border-border transition-colors"
        >
          {s.label}
        </button>
      {/each}
    </div>

    <!-- What the week-numbered axes below actually cover, in dates. -->
    {#if windowDateRange}
      <div class="flex items-center gap-1.5 px-1 text-content-subtle/70">
        <Icon icon="ic:baseline-date-range" class="text-sm shrink-0" />
        <span class="text-caption leading-tight">{windowDateRange}</span>
        <span class="text-caption leading-tight opacity-60">· {chartData.weeks.length} weeks</span>
      </div>
    {/if}
  </div>

  <!-- touch-action keeps vertical scrolling native while a sideways swipe
       pages the window (see lib/analytics/swipe.ts). -->
  <div class="space-y-5 touch-pan-y" bind:this={panelsEl} use:swipePaging={(d) => navigate(d)}>
    {#snippet loadSection()}
    <LoadPanel {chartData} {acwrResults} {axisStep} {tips} bind:chartWidth />
    {/snippet}

    {#snippet mixSection()}
    <MixPanel {chartData} {axisStep} {tips} />
    {/snippet}

    {#snippet fatigueSection()}
    <div id="section-fatigue" class="scroll-mt-4">
      <FatiguePanel samples={fatigueSamples} {weekLabels} coverage={fatigueCoverage} />
    </div>
    {/snippet}

    {#snippet recoveryTrendSection()}
    {#if recoveryDays}
      <RecoveryTrendPanel {...recoveryDays} />
    {/if}
    {/snippet}

    {#snippet adherenceSection()}
    <div id="section-adherence" class="scroll-mt-4">
      <AdherencePanel results={weeklyAdherenceResults} {weekLabels} />
    </div>
    {/snippet}

    {#snippet recoverySection()}
    <div id="section-recovery" class="scroll-mt-4">
      <RecoveryWarningsPanel warnings={recoveryWarnings} {painCorrelations} />
    </div>
    {/snippet}

    {#snippet outdoorSection()}
    <div id="section-outdoor" class="scroll-mt-4">
      <OutdoorAscentsPanel weeks={outdoorAscentData.weeks} {weekLabels} unparsedCount={outdoorAscentData.unparsedCount} labelStep={axisStep} />
    </div>
    {/snippet}

    {#snippet bodyweightSection()}
    <BodyweightPanel {tips} />
    {/snippet}

    {#snippet benchmarksSection()}
    <BenchmarkPanel {tips} />
    {/snippet}

    <!-- Rendered in the order, and with the visibility, chosen under
         Settings -> History & Analytics. -->
    {#each trainingState.analyticsSections as section (section.id)}
      {#if section.visible}
        {#if section.id === 'load'}{@render loadSection()}
        {:else if section.id === 'mix'}{@render mixSection()}
        {:else if section.id === 'fatigue'}{@render fatigueSection()}
        {:else if section.id === 'recoveryTrend'}{@render recoveryTrendSection()}
        {:else if section.id === 'adherence'}{@render adherenceSection()}
        {:else if section.id === 'recovery'}{@render recoverySection()}
        {:else if section.id === 'outdoor'}{@render outdoorSection()}
        {:else if section.id === 'bodyweight'}{@render bodyweightSection()}
        {:else if section.id === 'benchmarks'}{@render benchmarksSection()}
        {/if}
      {/if}
    {/each}

    {#if trainingState.completedWorkouts.length === 0}
      <div class="py-12 text-center bg-surface-elevated/20 rounded-card border border-dashed border-border">
        <Icon icon="ic:baseline-insights" class="text-3xl text-content-subtle mx-auto mb-3" />
        <p class="text-caption text-content-subtle italic px-8 leading-relaxed">
          Complete some sessions to unlock detailed training analytics
        </p>
      </div>
    {/if}
  </div>
</div>
