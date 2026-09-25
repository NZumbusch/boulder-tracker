<script lang="ts" module>
  // The open tab survives leaving Analytics and coming back within a visit.
  let rememberedTab: 'training' | 'body' | 'performance' = 'training';
</script>

<script lang="ts">
  import { motionReduced } from '../../lib/motion';
  import { trainingState } from '../../lib/state.svelte';
  import type { Workout, ExerciseTypeDef, ExerciseCategory } from '../../lib/types';
  import { estimateSlotDuration, DEFAULT_EXERCISE_MINUTES } from '../../lib/planning/sessionDuration';
  import { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import {
    calculateAcwrForBuckets,
    calculateAcwrForWeeks,
    calculateWorkoutAdherence,
    correlatePainWithLoadSpikes,
  } from '../../lib/analytics/loadAnalytics';
  import { computeFatigueDecay } from '../../lib/analytics/readiness';
  import { labelStep } from '../../lib/analytics/chartWindow';
  import { parseFontGrade } from '../../lib/analytics/grades';
  import { toUtcDayIndex } from '../../lib/dateUtils';
  import { buildBuckets, bucketOfDay, dayToX, ANALYTICS_RANGES, RANGE_LABELS } from '../../lib/analytics/range';
  import { windowStats, comparisonSpans } from '../../lib/analytics/windowSummary';
  import { blockSegments, goalsInWindow, painRows } from '../../lib/analytics/timeline';
  import { benchmarkChanges } from '../../lib/analytics/progress';
  import PainTimelinePanel from './PainTimelinePanel.svelte';
  import BenchmarkOverviewPanel from './BenchmarkOverviewPanel.svelte';
  import { dayIndexToIso, localDayIndex } from '../../lib/analytics/recoverySeries';
  import { swipePaging, type SwipeDirection } from '../../lib/analytics/swipe';
  import LoadPanel from './LoadPanel.svelte';
  import MixPanel from './MixPanel.svelte';
  import BenchmarkPanel from './BenchmarkPanel.svelte';
  import type { ChartData } from './chartTypes';
  import FatiguePanel from './FatiguePanel.svelte';
  import OutdoorAscentsPanel from './OutdoorAscentsPanel.svelte';
  import RecoveryTrendPanel from './RecoveryTrendPanel.svelte';
  import SummaryStrip from './SummaryStrip.svelte';
  import WeekDetailSheet from './WeekDetailSheet.svelte';
  import StrainPanel from './StrainPanel.svelte';
  import FingerLoadPanel from './FingerLoadPanel.svelte';
  import HeatmapPanel from './HeatmapPanel.svelte';
  import { bucketStrain, fingerCategoryIds, fingerLoad } from '../../lib/analytics/proMetrics';
  import { dailyLoadByDay } from '../../lib/analytics/recoverySeries';
  import Icon from "@iconify/svelte";

  // Analytics: a header (range preset, window paging, CSV export, the
  // window's dates), a summary of the window against the one before it,
  // then the cards - grouped into Training / Body / Performance tabs, in
  // the order and with the visibility chosen in Settings. This file owns
  // the window and the data every panel reads from it; each panel draws
  // itself.
  //
  // The window is a range preset split into columns ("buckets") - a week
  // each, or a month each for the year view. See `lib/analytics/range.ts`.
  //
  // Not a sticky header (user-directed, 2026-09-18, after the sticky
  // version's z-index/narrow-screen problems): it scrolls away with the
  // page like every other screen's header.

  // --- State ---
  const categories = $derived(trainingState.analyticsCategories);
  const range = $derived(trainingState.analyticsRange);
  let viewOffset = $state<number>(0);
  let tab = $state(rememberedTab);
  $effect(() => {
    rememberedTab = tab;
  });
  let selectedIndex = $state<number | null>(null);

  const buckets = $derived(buildBuckets(range, viewOffset));
  const previousBuckets = $derived(buildBuckets(range, viewOffset - 1));
  const firstDay = $derived(buckets[0].startDay);
  const lastDay = $derived(buckets[buckets.length - 1].endDay);
  const today = localDayIndex(new Date());

  // The Load plot's measured width decides only how far the x-axis labels
  // are thinned - never how many columns there are (the range does that).
  let chartWidth = $state(0);
  const axisStep = $derived(labelStep(buckets.length, chartWidth));

  /**
   * The visible window as actual dates - Monday of the first week shown to
   * Sunday of the last. The year is only shown when the window spans two
   * of them (or isn't this year), so the common case stays short.
   */
  const windowDateRange = $derived.by(() => {
    const start = new Date(`${dayIndexToIso(firstDay)}T12:00:00`);
    const end = new Date(`${dayIndexToIso(lastDay)}T12:00:00`);
    const thisYear = new Date().getFullYear();
    const showYear = start.getFullYear() !== end.getFullYear() || end.getFullYear() !== thisYear;
    const startOpts: Intl.DateTimeFormatOptions = start.getFullYear() === end.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    const endOpts: Intl.DateTimeFormatOptions = showYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' };
    return `${start.toLocaleDateString(undefined, startOpts)} – ${end.toLocaleDateString(undefined, endOpts)}`;
  });

  // --- Tabs. Each card belongs to one; within a tab, cards keep the order
  // and visibility chosen under Settings -> History & Analytics.
  type Tab = 'training' | 'body' | 'performance';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'training', label: 'Training' },
    { id: 'body', label: 'Body' },
    { id: 'performance', label: 'Performance' },
  ];
  const TAB_OF: Record<string, Tab> = {
    load: 'training',
    strain: 'training',
    fingerLoad: 'training',
    heatmap: 'training',
    mix: 'training',
    fatigue: 'training',
    recoveryTrend: 'body',
    pain: 'body',
    outdoor: 'performance',
    benchmarks: 'performance',
    benchmarkOverview: 'performance',
  };
  const tabSections = $derived(trainingState.analyticsSections.filter((s) => s.visible && TAB_OF[s.id] === tab));

  // --- Handlers ---
  function navigate(direction: 'prev' | 'next' | 'today') {
    const before = viewOffset;
    if (direction === 'prev') viewOffset--;
    else if (direction === 'next') viewOffset++;
    else if (direction === 'today') viewOffset = 0;
    if (viewOffset !== before) slideIn(viewOffset < before ? 'prev' : 'next');
  }
  function setRange(next: typeof range) {
    if (next === range) return;
    trainingState.setAnalyticsRange(next);
    viewOffset = 0;
  }

  // Paging slides the panels in from the side the new weeks come from, so
  // a swipe feels like moving along the timeline rather than a redraw.
  // Animated in place (Web Animations) rather than by re-keying the
  // panels, which would remount them and reset their own state (Mix
  // options, the chosen benchmark).
  let panelsEl = $state<HTMLElement | null>(null);
  function slideIn(from: SwipeDirection) {
    if (!panelsEl?.animate || motionReduced()) return;
    const dx = from === 'prev' ? -32 : 32;
    panelsEl.animate(
      [{ transform: `translateX(${dx}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }

  // --- Summary: this window against the one before it.
  const summary = $derived.by(() => {
    const data = { workouts: trainingState.workouts, dailyMetrics: trainingState.dailyMetrics, outdoorAscents: trainingState.outdoorAscents };
    const current = { startDay: firstDay, endDay: lastDay };
    const previous = { startDay: previousBuckets[0].startDay, endDay: previousBuckets[previousBuckets.length - 1].endDay };
    const spans = comparisonSpans(current, previous, today);
    if (!spans) return { current: windowStats(data, current), previous: undefined, partial: false };
    return {
      current: windowStats(data, spans.current),
      previous: windowStats(data, spans.previous),
      partial: spans.current.endDay < lastDay,
    };
  });
  const summaryLogged = $derived.by(() => {
    const ids = new Set(trainingState.dailyMetrics.map((m) => m.metricId));
    return { hrv: ids.has('hrv'), rhr: ids.has('rhr'), sleep: ids.has('sleep-score'), sends: trainingState.outdoorAscents.length > 0 };
  });
  const RANGE_WORDS: Record<typeof range, string> = { '4w': '4 weeks', '3m': '3 months', '6m': '6 months', '1y': 'year' };
  const comparisonLabel = $derived(
    summary.partial
      ? `Arrows: vs the same number of days of the ${RANGE_WORDS[range]} before`
      : `Arrows: vs the ${RANGE_WORDS[range]} before`,
  );

  // --- Phase band: blocks and goals over the window.
  const timeline = $derived({
    segments: blockSegments(trainingState.trainingBlocks, trainingState.phaseDefs, buckets.flatMap((b) => b.weekIds)),
    goals: goalsInWindow(trainingState.goals, firstDay, lastDay),
  });

  // --- Logic: Data Processing ---

  /**
   * Derives chart data for the "Rolling Load" and "Training Mix" graphs
   * over the window, aggregating total actual load, total planned load,
   * and minutes per category per column.
   */
  const chartData = $derived.by((): ChartData => {
    const types = trainingState.exerciseTypes;

    // Quick lookup for assigning categories to recorded exercises
    const typeToCategory = new Map<string, ExerciseCategory>();
    types.forEach((t: ExerciseTypeDef) => typeToCategory.set(t.id, t.category));

    const columns = buckets.map((bucket) => {
      const column = {
        load: 0,
        plannedLoad: 0,
        categories: Object.fromEntries(categories.map((c) => [c.name, 0])) as Record<string, number>,
        completedCategories: Object.fromEntries(categories.map((c) => [c.name, 0])) as Record<string, number>,
      };

      // Read each week through the projection layer, so a week that is
      // still provisional (phase assigned, nothing stored yet - see
      // lib/planning/weekProjection.ts) still contributes its planned load
      // and training mix. Reading `trainingState.workouts` directly here
      // would make the target path drop to zero for every
      // not-yet-materialised week.
      bucket.weekIds.flatMap((id) => trainingState.getWorkoutsForWeek(id)).forEach((w: Workout) => {
        column.plannedLoad += (w.plannedLoad || 0);
        if (w.status === 'completed') column.load += (w.loadFactor || 0);

        // Count exercises for both planned and completed to show Training Mix
        w.exercises?.forEach((slot) => {
          let categoryName = slot.categoryId
            ? categories.find((c) => c.id === slot.categoryId)?.name
            : typeToCategory.get(slot.typeId);

          // Every typeId is guaranteed resolvable to some ExerciseTypeDef
          // (the prescribed/logged migration creates an archived placeholder
          // for any that can't resolve a real one), so this is just a final
          // safety net, not name-matching guesswork.
          if (!categoryName) categoryName = 'Other';

          // Ensure category exists in map (if user deleted a category)
          if (!categories.find((c) => c.name === categoryName)) {
            categoryName = categories.length > 0 ? categories[0].name : 'Other';
          }

          // Weight the ratio by duration. An exercise with no explicit
          // duration is derived from its set/rep/rest structure before
          // falling back to the flat default, so a hangboard block stops
          // being weighted the same as a two-hour bouldering session.
          const durationWeight = estimateSlotDuration(slot) ?? DEFAULT_EXERCISE_MINUTES;
          column.categories[categoryName] = (column.categories[categoryName] ?? 0) + durationWeight;
          if (w.status === 'completed') {
            column.completedCategories[categoryName] = (column.completedCategories[categoryName] ?? 0) + durationWeight;
          }
        });
      });
      return column;
    });

    const maxLoad = Math.max(...columns.map((c) => Math.max(c.load, c.plannedLoad)), 100) * 1.15;

    return {
      weeks: buckets.map((bucket, i) => ({
        id: bucket.id,
        label: bucket.label,
        totalLoad: columns[i].load,
        totalPlannedLoad: columns[i].plannedLoad,
        categories: columns[i].categories,
        completedCategories: columns[i].completedCategories,
        totalDuration: Object.values(columns[i].categories).reduce((a, b) => a + b, 0),
        isCurrent: bucket.isCurrent,
      })),
      maxLoad,
    };
  });

  // --- Load analytics (ACWR/ramp-rate, adherence, injury-vs-load
  // correlation) - scoped to the same window as the charts.
  const allWeekIds = $derived(buckets.flatMap((b) => b.weekIds));
  const weekLabels = $derived(Object.fromEntries(buckets.map((b) => [b.id, b.label])));
  const acwrResults = $derived(calculateAcwrForBuckets(trainingState.workouts, buckets));
  // Adherence (share of planned exercises logged in completed sessions),
  // shown on the Load chart rather than as its own card.
  const adherence = $derived.by(() => {
    const perColumn: Record<string, number> = {};
    let slots = 0;
    let logged = 0;
    for (const b of buckets) {
      const results = trainingState.workouts
        .filter((w) => w.status === 'completed' && b.weekIds.includes(w.weekId))
        .map(calculateWorkoutAdherence);
      const total = results.reduce((sum, r) => sum + r.totalSlots, 0);
      const done = results.reduce((sum, r) => sum + r.loggedSlots, 0);
      if (total > 0) perColumn[b.id] = done / total;
      slots += total;
      logged += done;
    }
    return { perColumn, window: slots > 0 ? logged / slots : undefined };
  });

  // --- Pain timeline: rows per body part, ringed where a load spike was
  // near (judged week by week, whatever the column size).
  const painData = $derived.by(() => {
    const correlations = correlatePainWithLoadSpikes(trainingState.painLogs, calculateAcwrForWeeks(trainingState.workouts, allWeekIds), trainingState.acwrZones.highRisk);
    return {
      rows: painRows(trainingState.painLogs, firstDay, lastDay),
      spikeIds: new Set(correlations.filter((c) => c.loadSpikeNearby).map((c) => c.painLogId)),
    };
  });

  const benchmarkSeries = $derived(benchmarkChanges(trainingState.benchmarks, trainingState.benchmarkTypes, firstDay, lastDay));

  // --- Fatigue panel data - `computeFatigueDecay` sampled at each
  // column's last day, so this is a trend rather than duplicating Home's
  // single "now" snapshot ("Home = now, Analytics = history, no duplicated
  // panels").
  const fatigueSamples = $derived(buckets.map((b) => {
    // Nothing to sample in a column that hasn't started yet.
    if (b.startDay > today) return { weekId: b.id };
    const decay = computeFatigueDecay(trainingState.completedWorkouts, new Date(b.endDay * 86400000), trainingState.fatigueHalfLife);
    return { weekId: b.id, fingers: decay.fingers, arms: decay.arms, core: decay.core, systemic: decay.systemic };
  }));
  const fatigueCoverage = $derived.by(() => {
    const inWindow = trainingState.completedWorkouts.filter((w) => w.weekId && allWeekIds.includes(w.weekId));
    const c = { total: inWindow.length, fingers: 0, arms: 0, core: 0, systemic: 0 };
    inWindow.forEach((w) => {
      if (w.fingers !== undefined) c.fingers++;
      if (w.arms !== undefined) c.arms++;
      if (w.core !== undefined) c.core++;
      if (w.systemic !== undefined) c.systemic++;
    });
    return c;
  });

  // --- Outdoor Ascents panel data - grouped into the window's columns,
  // grade parsed via the Font-grade helper. Ascents whose grade doesn't
  // parse are counted, never dropped silently (see grades.ts's documented
  // French-grade limitation).
  const outdoorAscentData = $derived.by(() => {
    const byBucket = new Map<string, { id: string; grade: string; rank: number; date: string; name?: string; style?: string }[]>();
    let unparsedCount = 0;
    for (const a of trainingState.outdoorAscents) {
      const bucket = bucketOfDay(buckets, toUtcDayIndex(a.date));
      if (!bucket) continue;
      const rank = parseFontGrade(a.grade);
      if (rank === undefined) {
        unparsedCount++;
        continue;
      }
      if (!byBucket.has(bucket.id)) byBucket.set(bucket.id, []);
      byBucket.get(bucket.id)!.push({ id: a.id, grade: a.grade, rank, date: a.date, name: a.name, style: a.style });
    }
    return {
      weeks: buckets.map((b) => ({ weekId: b.id, ascents: byBucket.get(b.id) ?? [] })),
      unparsedCount,
    };
  });

  // --- Pro metrics: monotony & strain, finger load.
  const strainColumns = $derived.by(() => {
    const byDay = dailyLoadByDay(trainingState.workouts);
    return buckets.map((b) => ({ id: b.id, label: b.label, isCurrent: b.isCurrent, ...bucketStrain(byDay, b.weekIds) }));
  });
  const fingerColumns = $derived.by(() => {
    const opts = {
      types: trainingState.exerciseTypes,
      categories: trainingState.analyticsCategories,
      fingerIds: fingerCategoryIds(trainingState.analyticsCategories, trainingState.fingerCategoryIds),
    };
    return buckets.map((b) => ({ id: b.id, label: b.label, isCurrent: b.isCurrent, ...fingerLoad(trainingState.workouts, b.weekIds, opts) }));
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
      <!-- Window paging and CSV export share one quiet row of controls. -->
      <div class="flex items-center gap-1">
        <button
          onclick={() => navigate('prev')}
          class="p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors"
          aria-label="Earlier"
        >
          <Icon icon="ic:baseline-chevron-left" class="text-lg" />
        </button>
        <button
          onclick={() => navigate('today')}
          class="px-2 py-1 text-caption rounded-control hover:bg-surface-elevated transition-colors {viewOffset === 0 ? 'text-content-subtle/50' : 'text-primary'}"
        >
          Today
        </button>
        <button
          onclick={() => navigate('next')}
          class="p-1.5 text-content-subtle hover:text-content rounded-control hover:bg-surface-elevated transition-colors"
          aria-label="Later"
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

    <!-- Range preset, and what it covers in dates. -->
    <div class="flex items-center justify-between gap-3 px-1">
      <div class="flex bg-surface-elevated/50 p-0.5 rounded-control" role="radiogroup" aria-label="Range">
        {#each ANALYTICS_RANGES as r}
          <button
            role="radio"
            aria-checked={range === r}
            onclick={() => setRange(r)}
            class="px-2.5 py-1 text-caption rounded-control transition-colors {range === r ? 'bg-surface text-content shadow-sm' : 'text-content-subtle hover:text-content'}"
          >
            {RANGE_LABELS[r]}
          </button>
        {/each}
      </div>
      <span class="text-caption text-content-subtle/80 text-right leading-tight">{windowDateRange}</span>
    </div>
  </div>

  <!-- touch-action keeps vertical scrolling native while a sideways swipe
       pages the window (see lib/analytics/swipe.ts). -->
  <div class="space-y-4 touch-pan-y" bind:this={panelsEl} use:swipePaging={(d) => navigate(d)}>
    <SummaryStrip current={summary.current} previous={summary.previous} {comparisonLabel} logged={summaryLogged} />

    <div class="flex bg-surface-elevated/50 p-1 rounded-control" role="tablist">
      {#each TABS as t}
        <button
          role="tab"
          aria-selected={tab === t.id}
          onclick={() => (tab = t.id)}
          class="flex-1 py-1.5 text-label rounded-control transition-colors {tab === t.id ? 'bg-surface text-content shadow-sm' : 'text-content-subtle hover:text-content'}"
        >
          {t.label}
        </button>
      {/each}
    </div>

    <div class="space-y-5">
      {#snippet loadSection()}
      <LoadPanel {chartData} {acwrResults} {axisStep} {tips} {timeline} xOfDay={(day) => dayToX(buckets, day)} onSelect={(i) => (selectedIndex = i)} adherence={adherence.perColumn} windowAdherence={adherence.window} bind:chartWidth />
      {/snippet}

      {#snippet strainSection()}
      <StrainPanel columns={strainColumns} {axisStep} {tips} monthly={range === '1y'} />
      {/snippet}

      {#snippet fingerLoadSection()}
      <FingerLoadPanel columns={fingerColumns} {axisStep} {tips} />
      {/snippet}

      {#snippet heatmapSection()}
      <HeatmapPanel endDay={lastDay} {today} />
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
      <RecoveryTrendPanel {firstDay} {lastDay} {today} {timeline} />
      {/snippet}

      {#snippet outdoorSection()}
      <div id="section-outdoor" class="scroll-mt-4">
        <OutdoorAscentsPanel weeks={outdoorAscentData.weeks} {weekLabels} unparsedCount={outdoorAscentData.unparsedCount} />
      </div>
      {/snippet}

      {#snippet benchmarksSection()}
      <BenchmarkPanel {tips} {firstDay} {lastDay} />
      {/snippet}

      {#snippet painSection()}
      <PainTimelinePanel {firstDay} {lastDay} rows={painData.rows} spikeIds={painData.spikeIds} loadByDay={dailyLoadByDay(trainingState.workouts)} />
      {/snippet}

      {#snippet benchmarkOverviewSection()}
      <BenchmarkOverviewPanel series={benchmarkSeries} {firstDay} {lastDay} />
      {/snippet}

      {#each tabSections as section (section.id)}
        {#if section.id === 'load'}{@render loadSection()}
        {:else if section.id === 'strain'}{@render strainSection()}
        {:else if section.id === 'fingerLoad'}{@render fingerLoadSection()}
        {:else if section.id === 'heatmap'}{@render heatmapSection()}
        {:else if section.id === 'mix'}{@render mixSection()}
        {:else if section.id === 'fatigue'}{@render fatigueSection()}
        {:else if section.id === 'recoveryTrend'}{@render recoveryTrendSection()}
        {:else if section.id === 'pain'}{@render painSection()}
        {:else if section.id === 'outdoor'}{@render outdoorSection()}
        {:else if section.id === 'benchmarks'}{@render benchmarksSection()}
        {:else if section.id === 'benchmarkOverview'}{@render benchmarkOverviewSection()}
        {/if}
      {/each}

      {#if tabSections.length === 0}
        <p class="text-caption text-content-subtle italic text-center py-8 px-8 leading-relaxed">
          Every card on this tab is hidden - turn them back on under Settings → Appearance → History & Analytics
        </p>
      {/if}

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
</div>

{#if selectedIndex !== null && buckets[selectedIndex]}
  <WeekDetailSheet bucket={buckets[selectedIndex]} acwr={acwrResults[selectedIndex]} onClose={() => (selectedIndex = null)} />
{/if}
