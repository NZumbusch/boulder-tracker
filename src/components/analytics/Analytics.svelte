<script lang="ts" module>
  // The open tab survives leaving Analytics and coming back within a visit.
  let rememberedTab: 'overview' | 'training' | 'recovery' | 'progress' = 'overview';
  /** The "More charts" fold of a tab stays open within a visit once opened. */
  let rememberedMore = false;
</script>

<script lang="ts">
  import { fabActions } from '../../lib/navigation/fabActions.svelte';
  import AppBar from '../nav/AppBar.svelte';
  import { tick } from 'svelte';
  import FindingsPanel from './FindingsPanel.svelte';
  import HiddenFindingsSheet from './HiddenFindingsSheet.svelte';
  import OverflowMenu, { type OverflowItem } from '../ui/OverflowMenu.svelte';
  import { columnPlannedLoad } from '../../lib/analytics/plannedOutline';
  import { splitFindings } from '../../lib/analytics/hiddenFindings';
  import { showUndo } from '../../lib/toast.svelte';
  import ExerciseProgressPanel from './ExerciseProgressPanel.svelte';
  import { buildInsights, findingTab, topFindings, type AnalyticsTab, type Insight, type InsightGroup, type InsightLink } from '../../lib/analytics/insights';
  import { showAcwr } from '../../lib/help/acwrSheet.svelte';
  import { openBlockReview } from '../../lib/analytics/blockReview.svelte';
  import { openTaperView } from '../../lib/goals/taperView.svelte';
  import { openExerciseProgress } from '../../lib/analytics/exerciseProgress.svelte';
  import { tour } from '../../lib/tour/tour.svelte';
  import { settingsPath } from '../../lib/settings/tree';
  import { motionReduced } from '../../lib/motion';
  import { trainingState } from '../../lib/state.svelte';
  import type { Workout, ExerciseTypeDef, ExerciseCategory } from '../../lib/types';
  import { estimateSlotDuration, DEFAULT_EXERCISE_MINUTES } from '../../lib/planning/sessionDuration';
  import { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import {
    calculateAcwrForBuckets,
    calculateAcwrForWeeks,
    correlatePainWithLoadSpikes,
  } from '../../lib/analytics/loadAnalytics';
  import { computeFatigueDecay } from '../../lib/analytics/readiness';
  import { labelStep } from '../../lib/analytics/chartWindow';
  import { parseFontGrade } from '../../lib/analytics/grades';
  import { planProgress } from '../../lib/planning/weekRecap';
  import { toUtcDayIndex } from '../../lib/dateUtils';
  import { buildBuckets, bucketOfDay, dayToX, ANALYTICS_RANGES, RANGE_LABELS } from '../../lib/analytics/range';
  import { windowStats, comparisonSpans } from '../../lib/analytics/windowSummary';
  import { blockSegments, goalsInWindow, painIssueRows } from '../../lib/analytics/timeline';
  import { benchmarkChanges } from '../../lib/analytics/progress';
  import { bodyweightsOf } from '../../lib/benchmarks/series';
  import PainTimelinePanel from './PainTimelinePanel.svelte';
  import BenchmarkOverviewPanel from './BenchmarkOverviewPanel.svelte';
  import { dayIndexToIso, localDayIndex } from '../../lib/analytics/recoverySeries';
  import { swipePaging, type SwipeDirection } from '../../lib/analytics/swipe';
  import Segmented from '../ui/Segmented.svelte';
  import LoadPanel from './LoadPanel.svelte';
  import MixPanel from './MixPanel.svelte';
  import BenchmarkPanel from './BenchmarkPanel.svelte';
  import type { ChartData } from './chartTypes';
  import FatiguePanel from './FatiguePanel.svelte';
  import OutdoorAscentsPanel from './OutdoorAscentsPanel.svelte';
  import RecoveryTrendPanel from './RecoveryTrendPanel.svelte';
  import WellnessPanel from './WellnessPanel.svelte';
  import SummaryStrip from './SummaryStrip.svelte';
  import WeekDetailSheet from './WeekDetailSheet.svelte';
  import StrainPanel from './StrainPanel.svelte';
  import FingerLoadPanel from './FingerLoadPanel.svelte';
  import HeatmapPanel from './HeatmapPanel.svelte';
  import { bucketStrain, fingerCategoryIds, fingerLoad } from '../../lib/analytics/proMetrics';
  import { dailyLoadByDay } from '../../lib/analytics/recoverySeries';
  import Icon from "@iconify/svelte";

  // Analytics: a header (range preset, window paging, CSV export, the
  // window's dates) and four tabs by the question each answers: Overview
  // (the window against the one before, what needs a look, the load chart),
  // Training, Recovery and Progress. Each tab opens with its own findings,
  // then its cards, in the order and with the visibility chosen in
  // Settings. This file owns
  // the window and the data every panel reads from it; each panel draws
  // itself.
  //
  // The window is a range preset split into columns ("buckets") - a week
  // each, or a month each for the year view. See `lib/analytics/range.ts`.
  //
  // Not a sticky header: it scrolls away with the page like every other
  // screen's header (a sticky one had z-index and narrow-screen problems).

  // --- State ---
  const categories = $derived(trainingState.analyticsCategories);
  const range = $derived(trainingState.analyticsRange);
  let viewOffset = $state<number>(0);
  let tab = $state(rememberedTab);
  $effect(() => {
    rememberedTab = tab;
  });
  // The tour's stops (findings, range, the load chart) are all on the Overview.
  $effect(() => {
    if (!tour.active || tour.step.view !== 'analytics') return;
    tab = 'overview';
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
  // The screen's own width (less a card's padding) is what every chart is as wide as: measured here, so a chart on a
  // tab where the Load plot isn't drawn still thins its labels.
  let panelsWidth = $state(0);
  const axisStep = $derived(labelStep(buckets.length, panelsWidth > 0 ? panelsWidth - 80 : chartWidth));

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
  type Tab = AnalyticsTab;
  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'training', label: 'Training' },
    { id: 'recovery', label: 'Recovery' },
    { id: 'progress', label: 'Progress' },
  ];
  const TAB_OF: Record<string, Tab> = {
    load: 'overview',
    heatmap: 'overview',
    mix: 'training',
    strain: 'training',
    fingerLoad: 'training',
    recoveryTrend: 'recovery',
    wellness: 'recovery',
    fatigue: 'recovery',
    pain: 'recovery',
    outdoor: 'progress',
    benchmarks: 'progress',
    benchmarkOverview: 'progress',
  };
  /** Specialist charts: behind a "More charts" fold, so the first screen of a tab is the main picture. */
  const MORE_OF: Record<string, true> = { strain: true, fingerLoad: true };
  const tabSections = $derived(trainingState.analyticsSections.filter((s) => s.visible && TAB_OF[s.id] === tab));
  const mainSections = $derived(tabSections.filter((s) => !MORE_OF[s.id]));
  const moreSections = $derived(tabSections.filter((s) => MORE_OF[s.id]));
  let moreOpen = $state(rememberedMore);
  $effect(() => {
    rememberedMore = moreOpen;
  });

  // --- Findings: the rules over the athlete's numbers (`lib/analytics/insights.ts`), each on the tab of the chart it
  // points at; the Overview shows the few that matter most right now, across all of them.
  const allFindings = $derived(buildInsights(trainingState.insightInputs()));
  const findingSplit = $derived(splitFindings(allFindings, trainingState.hiddenFindings));
  const findings = $derived(findingSplit.shown);
  let showHiddenFindings = $state(false);
  function hideFinding(insight: Insight) {
    trainingState.setFindingHidden(insight.id, true);
    showUndo('Finding hidden. Bring it back from the top menu.', () => trainingState.setFindingHidden(insight.id, false));
  }
  const overflowItems = $derived<OverflowItem[]>([
    { label: 'Export all sessions as CSV', icon: 'ic:baseline-download', onclick: () => trainingState.exportToCSV() },
    ...(findingSplit.hidden.length > 0 ? [{ label: `Hidden findings (${findingSplit.hidden.length})`, icon: 'ic:baseline-visibility-off', onclick: () => (showHiddenFindings = true) }] : []),
  ]);
  const tabFindings = $derived(tab === 'overview' ? topFindings(findings) : findings.filter((f) => findingTab(f) === tab));
  const FINDINGS_TITLE: Record<Tab, string> = { overview: 'Findings', training: 'Training findings', recovery: 'Recovery findings', progress: 'Progress findings' };
  const ASK_GROUP: Record<Tab, InsightGroup> = { overview: 'push', training: 'plan', recovery: 'body', progress: 'strength' };

  /** An insight's link: the ACWR breakdown, or the chart behind it on its own tab. */
  async function openInsight(link: InsightLink) {
    if (link.kind === 'acwr') { showAcwr(); return; }
    if (link.kind === 'plan') { trainingState.navigate('plan'); return; }
    if (link.kind === 'block') { openBlockReview(link.blockId); return; }
    if (link.kind === 'taper') { openTaperView(link.goalId); return; }
    if (link.kind === 'exercise') { openExerciseProgress(link.typeId); return; }
    tab = link.tab;
    if (MORE_OF[link.section.replace('section-', '')]) moreOpen = true;
    await tick();
    document.getElementById(link.section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Tabs by keyboard: arrows move along the row and the focus goes with the selection (roving tabindex).
  async function onTabKeys(event: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = event.key === 'ArrowRight' ? (i + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? TABS.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    tab = TABS[next].id;
    await tick();
    document.getElementById(`analytics-tab-${tab}`)?.focus();
  }

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
    return { hrv: ids.has('hrv'), rhr: ids.has('rhr'), sleep: ids.has('sleep-score') || ids.has('sleep-duration'), sends: trainingState.outdoorAscents.length > 0 };
  });
  const RANGE_WORDS: Record<typeof range, string> = { '4w': '4 weeks', '3m': '3 months', '6m': '6 months', '1y': 'year' };
  // "the previous 4 weeks" / "the previous year": the window just before this one, of the same length.
  const comparisonLabel = $derived(
    summary.partial
      ? `Change vs the same days of the previous ${RANGE_WORDS[range]}`
      : `Change vs the previous ${RANGE_WORDS[range]}`,
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
        workouts: [] as Workout[],
        categories: Object.fromEntries(categories.map((c) => [c.name, 0])) as Record<string, number>,
        completedCategories: Object.fromEntries(categories.map((c) => [c.name, 0])) as Record<string, number>,
      };

      // Read each week through the projection layer, so a week that is
      // still provisional (phase assigned, nothing stored yet - see
      // lib/planning/weekProjection.ts) still contributes its planned load
      // and training mix. Reading `trainingState.workouts` directly here
      // would make the target path drop to zero for every
      // week that still follows its phase.
      bucket.weekIds.flatMap((id) => trainingState.getWorkoutsForWeek(id)).forEach((w: Workout) => {
        column.workouts.push(w);
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

    const maxLoad = Math.max(...columns.map((c) => c.load), 100) * 1.15;

    return {
      weeks: buckets.map((bucket, i) => ({
        id: bucket.id,
        label: bucket.label,
        totalLoad: columns[i].load,
        planProgress: planProgress(columns[i].workouts),
        plannedLoad: columnPlannedLoad(columns[i].workouts),
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
  const acwrResults = $derived(calculateAcwrForBuckets(trainingState.workoutsForLoad, buckets));
  // How much of the plan is done, per column and over the window so far -
  // logged vs planned work, both from the exercises (see `planProgress`),
  // the same measure as Home's This Week. Weeks still ahead are left out of
  // the window figure, or a plan running into the future would pull it down.
  const planDone = $derived.by(() => {
    const perColumn: Record<string, number> = {};
    for (const w of chartData.weeks) if (w.planProgress !== undefined) perColumn[w.id] = w.planProgress;
    const soFar = buckets.flatMap((b) => b.weekIds).filter((id) => id <= trainingState.currentWeekId);
    return { perColumn, window: planProgress(soFar.flatMap((id) => trainingState.getWorkoutsForWeek(id))) };
  });

  // --- Pain timeline: a row per issue (start to end), ringed where a load spike was
  // near (judged week by week, whatever the column size).
  const painData = $derived.by(() => {
    const correlations = correlatePainWithLoadSpikes(trainingState.painLogs, calculateAcwrForWeeks(trainingState.workouts, allWeekIds), trainingState.acwrZones.highRisk);
    return {
      rows: painIssueRows(trainingState.painIssues, trainingState.painLogs, firstDay, lastDay, today),
      spikeIds: new Set(correlations.filter((c) => c.loadSpikeNearby).map((c) => c.painLogId)),
    };
  });

  const benchmarkSeries = $derived(benchmarkChanges(trainingState.benchmarks, trainingState.benchmarkTypes, firstDay, lastDay, trainingState.valueDefs, trainingState.units.weight, bodyweightsOf(trainingState.dailyMetrics)));

  // --- Fatigue panel data - `computeFatigueDecay` sampled at each
  // column's last day, so this is a trend rather than duplicating Home's
  // single "now" snapshot ("Home = now, Analytics = history, no duplicated
  // panels").
  const fatigueSamples = $derived(buckets.map((b) => {
    // Nothing to sample in a column that hasn't started yet.
    if (b.startDay > today) return { weekId: b.id };
    // Only what had happened by the column's end: a later session would count as 'that day' and make every column before the first one read max fatigue.
    const sofar = trainingState.completedForLoad.filter((w) => w.date && toUtcDayIndex(w.date) <= b.endDay);
    const decay = computeFatigueDecay(sofar, new Date(b.endDay * 86400000), trainingState.fatigueModel);
    return { weekId: b.id, fingers: decay.fingers, arms: decay.arms, core: decay.core, systemic: decay.systemic };
  }));
  const fatigueCoverage = $derived.by(() => {
    const inWindow = trainingState.completedForLoad.filter((w) => w.weekId && allWeekIds.includes(w.weekId));
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
    const byDay = dailyLoadByDay(trainingState.workoutsForLoad);
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

  // Nothing logged of any kind yet: every chart would be a row of zeros,
  // so the screen says what will appear instead.
  const hasAnyData = $derived(
    trainingState.completedWorkouts.length > 0 ||
    trainingState.benchmarks.length > 0 ||
    trainingState.dailyMetrics.length > 0 ||
    trainingState.painLogs.length > 0 ||
    trainingState.outdoorAscents.length > 0
  );

  const UNLOCKS: [string, string, string][] = [
    ['ic:baseline-show-chart', 'Overview & training', 'load, plan and mix after your first completed sessions'],
    ['ic:baseline-battery-charging-full', 'Fatigue', 'when you rate how a session felt'],
    ['ic:baseline-monitor-heart', 'Recovery', 'when you log sleep, HRV, bodyweight or pain'],
    ['ic:baseline-emoji-events', 'Progress', 'from benchmarks and outdoor sends'],
  ];
</script>

{#if !hasAnyData}
<div class="page-col space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200 pb-24">
  <AppBar title="Analytics" />
  <div class="card space-y-4" data-tour="analytics-empty">
    <div class="space-y-1">
      <p class="text-body font-bold text-content">Your charts appear here</p>
      <p class="text-caption text-content-subtle leading-relaxed">Nothing is logged yet. Each part fills in as you use the app:</p>
    </div>
    <ul class="space-y-3">
      {#each UNLOCKS as [icon, title, when]}
        <li class="flex items-start gap-3">
          <Icon {icon} class="text-lg text-content-subtle shrink-0 mt-0.5" />
          <div>
            <p class="text-label text-content">{title}</p>
            <p class="text-caption text-content-subtle">{when}</p>
          </div>
        </li>
      {/each}
    </ul>
    {#if !fabActions.showing}<button onclick={() => trainingState.navigate('add')} class="w-full min-h-10 py-2.5 bg-primary text-white text-label rounded-control">Log a session</button>{/if}
    <button onclick={() => void tour.startExample()} class="w-full min-h-10 py-2.5 border border-border-strong text-label text-content rounded-control hover:bg-surface-elevated">See it with example data</button>
  </div>
</div>
{:else}
<div class="page-col space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200 pb-24">
  <AppBar title="Analytics" subtitle={windowDateRange}>
    {#snippet actions()}
        <OverflowMenu items={overflowItems} />
    {/snippet}
  </AppBar>
  <div class="flex flex-col gap-2.5">
    <div class="seg grid grid-cols-4 gap-0.5" role="tablist" aria-label="Analytics sections" data-tour="analytics-tabs">
      {#each TABS as t}
        <button
          role="tab"
          id="analytics-tab-{t.id}"
          aria-selected={tab === t.id}
          aria-controls="analytics-panel"
          tabindex={tab === t.id ? 0 : -1}
          onclick={() => (tab = t.id)}
          onkeydown={onTabKeys}
          class="seg-item min-w-0 text-label {tab === t.id ? 'seg-on' : 'hover:text-content'}"
        >
          {t.label}
        </button>
      {/each}
    </div>

    <!-- Range preset; the dates it covers are the page title's second line. Window paging sits beside it: a step is one
         whole range, so the buttons say which. "Today" is only there when you are away from the current window. -->
    <div class="flex items-center justify-between gap-2" data-tour="analytics-range">
      <Segmented
        label="Range"
        options={ANALYTICS_RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
        value={range}
        onChange={setRange}
      />
      <div class="flex items-center shrink-0 -mr-2">
        <button onclick={() => navigate('prev')} class="btn-icon" aria-label="Previous {RANGE_WORDS[range]}" title="Previous {RANGE_WORDS[range]}">
          <Icon icon="ic:baseline-chevron-left" class="text-2xl" />
        </button>
        {#if viewOffset !== 0}
          <button onclick={() => navigate('today')} class="btn-quiet px-2 text-label text-primary hover:bg-surface-elevated/60">Today</button>
        {/if}
        <button onclick={() => navigate('next')} class="btn-icon" aria-label="Next {RANGE_WORDS[range]}" title="Next {RANGE_WORDS[range]}">
          <Icon icon="ic:baseline-chevron-right" class="text-2xl" />
        </button>
      </div>
    </div>
  </div>

  <!-- touch-action keeps vertical scrolling native while a sideways swipe
       pages the window (see lib/analytics/swipe.ts). -->
  <div class="space-y-4 touch-pan-y" role="tabpanel" id="analytics-panel" aria-labelledby="analytics-tab-{tab}" bind:this={panelsEl} bind:clientWidth={panelsWidth} use:swipePaging={(d) => navigate(d)}>
    {#if tab === 'overview'}<SummaryStrip current={summary.current} previous={summary.previous} {comparisonLabel} logged={summaryLogged} onOpen={openInsight} />{/if}


    <div class="space-y-5">
      {#snippet loadSection()}
      <LoadPanel {chartData} {acwrResults} {axisStep} {tips} {timeline} xOfDay={(day) => dayToX(buckets, day)} onSelect={(i) => (selectedIndex = i)} planDone={planDone.perColumn} windowPlanDone={planDone.window} bind:chartWidth />
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

      {#snippet wellnessSection()}
      <WellnessPanel {firstDay} {lastDay} {today} />
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
      <PainTimelinePanel {firstDay} {lastDay} rows={painData.rows} spikeIds={painData.spikeIds} loadByDay={dailyLoadByDay(trainingState.workoutsForLoad)} />
      {/snippet}

      {#snippet benchmarkOverviewSection()}
      <BenchmarkOverviewPanel series={benchmarkSeries} {firstDay} {lastDay} />
      {/snippet}

      <FindingsPanel
        title={FINDINGS_TITLE[tab]}
        items={tabFindings}
        onOpen={openInsight}
        onHide={hideFinding}
        askGroup={ASK_GROUP[tab]}
        footnote={tab === 'overview' ? 'Each finding is a fixed rule over your own numbers; tap one for the chart behind it. Thresholds: Settings → Training model.' : undefined}
        emptyText={tab === 'overview' ? 'Nothing needs a look. Log a few sessions, ratings and a test result and findings about your load, progress and plan show up here.' : undefined}
      />

      {#if tab === 'progress'}
        <ExerciseProgressPanel />
      {/if}

      {#snippet section(id: string)}
        {#if id === 'load'}{@render loadSection()}
        {:else if id === 'strain'}{@render strainSection()}
        {:else if id === 'fingerLoad'}{@render fingerLoadSection()}
        {:else if id === 'heatmap'}{@render heatmapSection()}
        {:else if id === 'mix'}{@render mixSection()}
        {:else if id === 'fatigue'}{@render fatigueSection()}
        {:else if id === 'recoveryTrend'}{@render recoveryTrendSection()}
        {:else if id === 'wellness'}{@render wellnessSection()}
        {:else if id === 'pain'}{@render painSection()}
        {:else if id === 'outdoor'}{@render outdoorSection()}
        {:else if id === 'benchmarks'}{@render benchmarksSection()}
        {:else if id === 'benchmarkOverview'}{@render benchmarkOverviewSection()}
        {/if}
      {/snippet}

      {#each mainSections as s (s.id)}{@render section(s.id)}{/each}

      {#if moreSections.length > 0}
        <button
          onclick={() => (moreOpen = !moreOpen)}
          class="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-control bg-surface-elevated/50 text-label text-content-subtle hover:text-content transition-colors"
          aria-expanded={moreOpen}
        >
          <span>More charts <span class="text-content-subtle">· {moreSections.length === 1 ? '1 chart' : `${moreSections.length} charts`}</span></span>
          <Icon icon={moreOpen ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-xl" />
        </button>
        {#if moreOpen}
          {#each moreSections as s (s.id)}{@render section(s.id)}{/each}
        {/if}
      {/if}

      {#if tabSections.length === 0 && tab !== 'overview'}
        <div class="text-center py-8 px-8 space-y-2">
          <p class="text-caption text-content-subtle italic leading-relaxed">Every card on this tab is hidden.</p>
          <button onclick={() => trainingState.uiStore.openSettingsPage('history')} class="btn btn-ghost text-primary">Turn them back on: {settingsPath('history')}</button>
        </div>
      {/if}

    </div>
  </div>
</div>

{/if}

{#if selectedIndex !== null && buckets[selectedIndex]}
  <WeekDetailSheet bucket={buckets[selectedIndex]} acwr={acwrResults[selectedIndex]} onClose={() => (selectedIndex = null)} />
{/if}

{#if showHiddenFindings}
  <HiddenFindingsSheet hidden={findingSplit.hidden} onClose={() => (showHiddenFindings = false)} />
{/if}

