<script lang="ts">
  import { onMount } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { formatDate, getWeekIdRange } from '../../lib/dateUtils';
  import { generateId } from '../../lib/utils';
  import { DEFAULT_METRIC_DEFS } from '../../lib/constants';
  import { computeFatigueDecay, computeHrvBaseline, computeReadiness, MAX_FATIGUE_PENALTY, MAX_ACWR_PENALTY, MAX_SLEEP_PENALTY, MAX_HRV_PENALTY, type ReadinessStatus } from '../../lib/analytics/readiness';
  import { calculateRollingAcwr } from '../../lib/analytics/loadAnalytics';
  import { calculateWeeklyAdherence } from '../../lib/analytics/loadAnalytics';
  import { isLoggedMetricValue, loggedMetrics } from '../../lib/analytics/metricValues';
  import { describeWeatherCode } from '../../lib/weather/codes';
  import { rateFriction, rateForecastDay, type Friction, type FrictionLabel } from '../../lib/weather/friction';
  import { bestWindow } from '../../lib/weather/conditions';
  import type { DailyForecastDay, WeatherSnapshot } from '../../lib/weather/api';
  import FatigueRadarChart from '../common/FatigueRadarChart.svelte';
  import NoteSheet from '../common/NoteSheet.svelte';
  import QuickLogSheet from './QuickLogSheet.svelte';
  import { buildAlerts, type AlertSeverity } from '../../lib/alerts/alerts';
  import { latestBenchmarks, retestDue, sendsSummary, consistency } from '../../lib/analytics/progress';
  import { outdoorSuggestion } from '../../lib/weather/suggestion';
  import { getWeekId } from '../../lib/dateUtils';
  import { upcomingGoals, isOngoing, daysUntilGoal, goalLength, formatGoalDates, coversDate } from '../../lib/goals/goals';
  import { tripSummary, resolveCandidate } from '../../lib/goals/projects';
  import { sessionsDuringTrip } from '../../lib/goals/tripConflicts';
  import { pastGoals } from '../../lib/goals/goals';
  import { getWeekDates } from '../../lib/dateUtils';
  import type { GoalEvent, TripProject } from '../../lib/types';
  import { summarizeSession } from '../../lib/planning/sessionSummary';
  import { missedWorkouts, weekDayStrip, WEEK_DAYS, type DayStatus } from '../../lib/planning/weekStatus';
  import { nextBlock, daysUntilWeek, taperHint, blockLoadTrend } from '../../lib/planning/blockOutlook';
  import { recentActivity as buildRecentActivity } from '../../lib/activity/recentActivity';
  import { averageReading } from '../../lib/analytics/metricValues';
  import { sessionDuration } from '../../lib/planning/sessionDuration';
  import { BODYWEIGHT_METRIC_ID } from '../../lib/constants';
  import type { Workout } from '../../lib/types';
  import type { DailyMetricEntry, DayOfWeek } from '../../lib/types';
  import Icon from "@iconify/svelte";

  // Stage 2 (UI_PLAN.md §6/§4.2): Home fully populated, on top of Stage 1's
  // skeleton. Every section below reads from `trainingState` or the pure
  // analytics modules directly - no new business logic lives in this file
  // beyond simple display derivations (day-of-week matching, sparkline
  // scaling) that have no other natural home.

  const asOf = new Date();
  const todayIso = asOf.toISOString().split('T')[0];
  const DAY_NAMES: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = DAY_NAMES[asOf.getDay()];
  const today = formatDate(asOf.toISOString());

  // --- Weather (UI_PLAN.md §5.5) - fetched once per mount, not on every
  // `refresh()` (a network call on every save would be excessive for
  // conditions that change over hours). No-ops per-location if it isn't set.
  onMount(() => {
    trainingState.refreshWeather();
  });

  // --- Friction / conditions (see lib/weather/friction.ts for the model) ---
  const FRICTION_STYLE: Record<FrictionLabel, { badge: string; dot: string; text: string }> = {
    Prime: { badge: 'bg-status-good/15 text-status-good border-status-good/30', dot: 'bg-status-good', text: 'text-status-good' },
    Good: { badge: 'bg-status-good/10 text-status-good border-status-good/20', dot: 'bg-status-good/60', text: 'text-status-good' },
    OK: { badge: 'bg-status-caution/15 text-status-caution border-status-caution/30', dot: 'bg-status-caution', text: 'text-status-caution' },
    Greasy: { badge: 'bg-status-risk/15 text-status-risk border-status-risk/30', dot: 'bg-status-risk', text: 'text-status-risk' },
    Wet: { badge: 'bg-primary/15 text-primary border-primary/30', dot: 'bg-primary', text: 'text-primary' },
  };
  function currentFriction(w: WeatherSnapshot): Friction {
    return rateFriction({
      tempC: w.currentTempC,
      humidityPercent: w.humidityPercent,
      dewPointC: w.dewPointC,
      windKmh: w.windSpeedKmh,
      precipitationMm: w.precipitationMm,
      recentRainMm: w.recentRain?.last24hMm,
    }, trainingState.frictionConfig);
  }
  const dayFriction = (day: DailyForecastDay): Friction => rateForecastDay(day, trainingState.frictionConfig);
  let showFrictionReason = $state(false);

  /**
   * Joins the parts of a one-line summary with " · ", skipping empty ones.
   * Built in code on purpose: written in markup, a " · " at the edge of an
   * {#if} block loses its surrounding spaces ("min·6 exercises").
   */
  function joinParts(...parts: (string | false | null | undefined)[]): string {
    return parts.filter((p): p is string => !!p).join(' · ');
  }
  /** A conditions badge's text - the word, the score, or both, as the two weather options say. */
  function frictionText(f: Friction): string {
    return joinParts(
      trainingState.homeDetails['weather.frictionWord'] && f.label,
      trainingState.homeDetails['weather.frictionNumber'] && f.score.toFixed(1),
    );
  }

  function formatRelativeAge(iso: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  // --- Header: block/phase context ---
  const currentWeekId = trainingState.currentWeekId;
  const dominantBlock = $derived(trainingState.getDominantBlockForWeek(currentWeekId));
  const currentPhaseName = $derived(
    dominantBlock ? trainingState.phaseDefs.find((p) => p.id === dominantBlock.phaseId)?.name : undefined,
  );
  const blockWeekPosition = $derived.by(() => {
    if (!dominantBlock) return undefined;
    const weeks = getWeekIdRange(dominantBlock.startWeekId, dominantBlock.endWeekId);
    const index = weeks.indexOf(currentWeekId);
    return index >= 0 ? { week: index + 1, of: weeks.length } : undefined;
  });

  // --- Notes (week + current block) - opened from their cards' headers ---
  const weekNote = $derived(trainingState.getWeekNote(currentWeekId));
  let openNote = $state<'week' | 'block' | null>(null);

  // --- Readiness hero (UI_PLAN.md §5.2) ---
  const fatigueDecay = $derived(computeFatigueDecay(trainingState.completedWorkouts, asOf, trainingState.fatigueHalfLife));
  const acwr = $derived(calculateRollingAcwr(trainingState.workouts, asOf));
  const hrvBaseline = $derived(computeHrvBaseline(trainingState.dailyMetrics, asOf));
  /** Today's stored entry for `metricId`, zero or not - what a save/clear acts on. */
  const todaysEntry = (metricId: string): DailyMetricEntry | undefined =>
    trainingState.dailyMetrics.find((m) => m.metricId === metricId && m.date === todayIso);
  /** Today's reading for `metricId` - a stored 0 is "not logged" (`isLoggedMetricValue`), not a reading. */
  const todaysMetric = (metricId: string): DailyMetricEntry | undefined => {
    const entry = todaysEntry(metricId);
    return entry && isLoggedMetricValue(entry.value) ? entry : undefined;
  };
  const readiness = $derived(
    computeReadiness({
      fatigue: { fingers: fatigueDecay.fingers, core: fatigueDecay.core, systemic: fatigueDecay.systemic },
      acwr,
      sleep: todaysMetric('sleep-score')?.value,
      hrv: todaysMetric('hrv')?.value,
      hrvBaseline,
    }, trainingState.readinessConfig),
  );
  const STATUS_COLOR: Record<ReadinessStatus, string> = {
    good: 'text-status-good',
    caution: 'text-status-caution',
    risk: 'text-status-risk',
    neutral: 'text-status-neutral',
  };
  const STATUS_BAR: Record<ReadinessStatus, string> = {
    good: 'bg-status-good',
    caution: 'bg-status-caution',
    risk: 'bg-status-risk',
    neutral: 'bg-status-neutral',
  };
  // Bold hero treatment (user-directed, 2026-09-18 - see PROGRESS.md
  // "Home card redesign") - a status-tinted gradient + border, translated
  // through this app's existing status tokens rather than the stash's
  // literal emerald/amber/rose. Full literal Tailwind class strings, not
  // built via template interpolation - Tailwind's JIT can't see classes
  // assembled at runtime, only ones it can find as complete strings.
  const STATUS_HERO_BG: Record<ReadinessStatus, string> = {
    good: 'bg-gradient-to-br from-status-good/15 via-surface to-surface border-status-good/30',
    caution: 'bg-gradient-to-br from-status-caution/15 via-surface to-surface border-status-caution/30',
    risk: 'bg-gradient-to-br from-status-risk/15 via-surface to-surface border-status-risk/30',
    neutral: 'bg-surface/50 border-border',
  };
  // Referenced from inline `style` (not a Tailwind class), so this one is
  // safe to build dynamically - `color-mix()` needs a real custom-property
  // reference, and `--theme-status-*` are already hex per-theme (never
  // channel triples), matching the `color-mix` fix `AcwrPanel.svelte`
  // already established rather than the stash's invalid `rgba(var(...))`.
  const STATUS_VAR: Record<ReadinessStatus, string> = {
    good: 'var(--theme-status-good)',
    caution: 'var(--theme-status-caution)',
    risk: 'var(--theme-status-risk)',
    neutral: 'var(--theme-status-neutral)',
  };
  const STATUS_ICON: Record<ReadinessStatus, string> = {
    good: 'ic:baseline-local-fire-department',
    caution: 'ic:baseline-info',
    risk: 'ic:baseline-warning-amber',
    neutral: 'ic:baseline-help-outline',
  };
  // Tap-to-open breakdown: one row per input, its bar scaled to that
  // input's own maximum so "half of what sleep can cost" reads as half.
  let showBreakdown = $state(false);
  const BREAKDOWN_ROWS = $derived([
    { label: 'Fatigue', penalty: readiness.penalties.fatigue, max: MAX_FATIGUE_PENALTY, used: readiness.inputsUsed.fatigue },
    { label: 'Load', penalty: readiness.penalties.acwr, max: MAX_ACWR_PENALTY, used: readiness.inputsUsed.acwr },
    { label: 'Sleep', penalty: readiness.penalties.sleep, max: MAX_SLEEP_PENALTY, used: readiness.inputsUsed.sleep },
    { label: 'HRV', penalty: readiness.penalties.hrv, max: MAX_HRV_PENALTY, used: readiness.inputsUsed.hrv },
  ]);
  const RING_RADIUS = 44;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const ringOffset = $derived(RING_CIRCUMFERENCE * (1 - (readiness.score ?? 0) / 100));

  // --- Today ---
  const todaysWorkouts = $derived(
    trainingState.getPlannedWorkoutsForWeek(currentWeekId).filter((w) => w.dayOfWeek === todayName),
  );

  // Earlier sessions this week that were neither logged nor skipped.
  const weekWorkouts = $derived(trainingState.getWorkoutsForWeek(currentWeekId));
  const missed = $derived(missedWorkouts(weekWorkouts, todayName));
  let showMissed = $state(false);
  /** "Skip": keeps the session in the plan (and its planned load) but marks every slot skipped, so it stops counting as missed. */
  async function skipWorkout(workout: Workout) {
    await trainingState.saveWorkout({
      ...$state.snapshot(workout) as Workout,
      exercises: workout.exercises.map((slot) => ({ ...slot, skipped: true })),
    });
  }

  // --- Daily metrics quick-entry (UI_PLAN.md §4.2 item 4 - well-known ids only) ---
  const QUICK_METRICS = $derived(
    DEFAULT_METRIC_DEFS.filter((d) =>
      ['sleep-score', 'hrv', 'rhr'].includes(d.id) || (d.id === BODYWEIGHT_METRIC_ID && trainingState.homeDetails['metrics.bodyweight']),
    ),
  );
  /** Today's HRV against its 14-day baseline, as a signed fraction (−0.1 = 10% below). */
  const hrvDelta = $derived.by(() => {
    const today = todaysMetric('hrv')?.value;
    if (today === undefined || hrvBaseline === undefined || hrvBaseline <= 0) return undefined;
    return (today - hrvBaseline) / hrvBaseline;
  });
  const bodyweightAvg = $derived(averageReading(trainingState.dailyMetrics, BODYWEIGHT_METRIC_ID, asOf));
  const bodyweightPrevAvg = $derived(averageReading(trainingState.dailyMetrics, BODYWEIGHT_METRIC_ID, asOf, 7, 7));
  let editingMetricId = $state<string | null>(null);
  let draftValue = $state('');

  function entriesFor(metricId: string): DailyMetricEntry[] {
    return loggedMetrics(trainingState.dailyMetrics).filter((m) => m.metricId === metricId).slice().sort((a, b) => a.date.localeCompare(b.date));
  }
  function sparkHeightPercent(value: number, values: number[]): number {
    if (values.length === 0) return 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return 50;
    return 10 + ((value - min) / (max - min)) * 80;
  }
  function startEdit(metricId: string) {
    editingMetricId = metricId;
    draftValue = String(todaysMetric(metricId)?.value ?? '');
  }
  async function saveMetric(metricId: string) {
    const value = parseFloat(draftValue);
    if (Number.isNaN(value)) return;
    const existing = todaysEntry(metricId);
    // 0 (or less) means "I have no reading today" - it clears the day rather
    // than storing a value every baseline and chart would have to skip.
    if (!isLoggedMetricValue(value)) {
      if (existing) await trainingState.deleteDailyMetric(existing.id);
      editingMetricId = null;
      return;
    }
    const def = DEFAULT_METRIC_DEFS.find((d) => d.id === metricId)!;
    await trainingState.saveDailyMetric({ id: existing?.id ?? generateId(), metricId, date: todayIso, value }, def);
    editingMetricId = null;
  }

  // --- Fatigue bars (UI_PLAN.md §5.4 - bars are the default; radar is an Appearance setting, Stage 8) ---
  const FATIGUE_BARS: { key: 'fingers' | 'arms' | 'core' | 'systemic'; label: string }[] = [
    { key: 'fingers', label: 'Fingers' },
    { key: 'arms', label: 'Arms' },
    { key: 'core', label: 'Core' },
    { key: 'systemic', label: 'Systemic' },
  ];

  // --- Weekly load progress ---
  const weeklyAdherence = $derived(calculateWeeklyAdherence(trainingState.workouts, currentWeekId));
  const dayStrip = $derived(weekDayStrip(weekWorkouts, todayName));
  let peekDay = $state<number | null>(null);
  const DAY_MARK: Record<DayStatus, { icon: string; class: string; label: string }> = {
    done: { icon: 'ic:baseline-check', class: 'bg-success/15 text-success border-success/30', label: 'done' },
    missed: { icon: 'ic:baseline-close', class: 'bg-danger/10 text-danger border-danger/30', label: 'missed' },
    skipped: { icon: 'ic:baseline-remove', class: 'bg-surface-elevated text-content-subtle border-border-strong/50', label: 'skipped' },
    planned: { icon: 'ic:baseline-circle', class: 'bg-primary/10 text-primary border-primary/30', label: 'planned' },
    rest: { icon: '', class: 'bg-transparent text-content-subtle border-border/60', label: 'rest' },
  };
  // ACWR zones, from loadAnalytics' own thresholds.
  const acwrZone = $derived.by((): { label: string; class: string } | undefined => {
    if (!acwr.sufficient || acwr.ratio === undefined) return undefined;
    const r = acwr.ratio;
    const zones = trainingState.acwrZones;
    if (r > zones.highRisk) return { label: 'high risk', class: 'bg-status-risk/15 text-status-risk border-status-risk/30' };
    if (r > zones.caution) return { label: 'caution', class: 'bg-status-caution/15 text-status-caution border-status-caution/30' };
    if (r >= zones.sweetMin) return { label: 'sweet spot', class: 'bg-status-good/15 text-status-good border-status-good/30' };
    return { label: 'low', class: 'bg-surface-elevated text-content-muted border-border-strong/50' };
  });

  // --- Training block outlook ---
  const upcomingBlock = $derived(nextBlock(trainingState.trainingBlocks, currentWeekId));
  const daysToNextBlock = $derived(upcomingBlock ? daysUntilWeek(upcomingBlock.startWeekId, todayIso) : undefined);
  const blockTrend = $derived(
    dominantBlock
      ? blockLoadTrend(getWeekIdRange(dominantBlock.startWeekId, dominantBlock.endWeekId), (id) => trainingState.getWorkoutsForWeek(id))
      : [],
  );
  const blockTrendMax = $derived(Math.max(1, ...blockTrend.map((b) => Math.max(b.planned, b.actual))));

  // --- Next goal (competition or outdoor trip) ---
  const nextGoal = $derived(upcomingGoals(trainingState.goals, todayIso)[0]);
  const nextGoalOngoing = $derived(nextGoal ? isOngoing(nextGoal, todayIso) : false);
  const daysUntilCompetition = $derived(nextGoal ? daysUntilGoal(nextGoal, todayIso) : undefined);
  const nextTripSummary = $derived(nextGoal?.kind === 'trip' ? tripSummary(nextGoal, trainingState.outdoorAscents) : undefined);
  /** The trip's forecast days - only when the fetched snapshot is for this trip's place. */
  const tripForecastDays = $derived.by(() => {
    const snap = trainingState.goalWeather.snapshot;
    if (!nextGoal || nextGoal.kind !== 'trip' || !snap || trainingState.goalWeather.locationName !== nextGoal.location?.name) return [];
    return snap.daily.filter((d) => coversDate(nextGoal, d.date));
  });
  let goalNoteOpen = $state(false);

  // --- Trip tie-ins ---
  const tripConflicts = $derived(
    upcomingGoals(trainingState.goals, todayIso)
      .filter((g) => g.kind === 'trip' && daysUntilGoal(g, todayIso) <= trainingState.tunable('trips.conflictHorizonDays'))
      .map((trip) => {
        const weekIds = new Set<string>();
        for (let i = 0; i < goalLength(trip); i++) weekIds.add(getWeekId(new Date(Date.parse(`${trip.date}T12:00:00Z`) + i * 86400000)));
        const workouts = [...weekIds].flatMap((id) => trainingState.getWorkoutsForWeek(id));
        return { tripName: trip.name, dates: formatGoalDates(trip), count: sessionsDuringTrip(trip, workouts, todayIso).length };
      }),
  );
  /** For each day of this week (Mon-Sun), the trip covering it, if any. */
  const weekTripDays = $derived.by(() => {
    const start = getWeekDates(currentWeekId)?.start;
    const trips = trainingState.goals.filter((g) => g.kind === 'trip');
    return WEEK_DAYS.map((_, i) => {
      if (!start) return undefined;
      const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
      return trips.find((t) => coversDate(t, date));
    });
  });
  const lastTrip = $derived.by(() => {
    const trip = pastGoals(trainingState.goals, todayIso).find((g) => g.kind === 'trip');
    if (!trip || -daysUntilGoal({ ...trip, date: trip.endDate ?? trip.date }, todayIso) > trainingState.tunable('trips.lastTripDays')) return undefined;
    return { trip, summary: tripSummary(trip, trainingState.outdoorAscents) };
  });
  async function answerCandidate(goal: GoalEvent, project: TripProject, sendId: string, counts: boolean) {
    const updated = resolveCandidate(project, sendId, counts);
    await trainingState.saveGoal({
      ...$state.snapshot(goal) as GoalEvent,
      projects: (goal.projects ?? []).map((p) => (p.id === project.id ? updated : $state.snapshot(p) as TripProject)),
    });
  }

  const competitionTaperHint = $derived(taperHint(daysUntilCompetition, currentPhaseName));

  // --- Header quick log ---
  let showQuickLog = $state(false);

  // --- Alerts (lib/alerts/alerts.ts) - the card hides when this is empty ---
  const alerts = $derived(
    buildAlerts({
      asOf,
      workouts: trainingState.workouts,
      dailyMetrics: trainingState.dailyMetrics,
      painLogs: trainingState.painLogs,
      lastBackupAt: trainingState.lastBackupAt,
      enabled: {
        recovery: trainingState.homeDetails['alerts.recovery'],
        pain: trainingState.homeDetails['alerts.pain'],
        missingData: trainingState.homeDetails['alerts.missingData'],
        backup: trainingState.homeDetails['alerts.backup'],
        tripConflict: trainingState.homeDetails['alerts.tripConflict'],
      },
      tripConflicts,
      config: {
        restDays: trainingState.tunable('alerts.restDays'),
        backupDays: trainingState.tunable('alerts.backupDays'),
        acwrHighRisk: trainingState.acwrZones.highRisk,
      },
    }),
  );
  const ALERT_DOT: Record<AlertSeverity, string> = {
    risk: 'bg-status-risk',
    caution: 'bg-status-caution',
    info: 'bg-status-neutral',
  };
  function rateSession(workoutId: string) {
    const workout = trainingState.workouts.find((w) => w.id === workoutId);
    if (workout) trainingState.openFatigueModal(workout);
  }

  // --- Progress (lib/analytics/progress.ts) ---
  const benchmarkProgress = $derived(latestBenchmarks(trainingState.benchmarks, trainingState.benchmarkTypes));
  const retests = $derived(retestDue(benchmarkProgress, asOf, trainingState.tunable('progress.retestWeeks')));
  const sends = $derived(sendsSummary(trainingState.outdoorAscents, asOf));
  const consistencyStats = $derived(consistency(trainingState.workouts, asOf));

  // --- Crags ---
  let openCrag = $state<number | null>(null);
  const DAY_NAME_OF: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const cragSuggestion = $derived.by(() => {
    const forecasts = trainingState.crags
      .map((c, i) => ({ name: c.name, days: trainingState.cragWeather[i]?.snapshot?.daily ?? [] }))
      .filter((c) => c.days.length > 0);
    if (forecasts.length === 0) return undefined;
    return outdoorSuggestion(forecasts, todayIso, (date) => {
      const d = new Date(`${date}T12:00:00Z`);
      const day = DAY_NAME_OF[d.getUTCDay()];
      return trainingState.getPlannedWorkoutsForWeek(getWeekId(d)).filter((w) => w.dayOfWeek === day);
    }, trainingState.frictionConfig);
  });

  // --- Recent activity ---
  const recentActivity = $derived(
    buildRecentActivity(trainingState.completedWorkouts, trainingState.outdoorAscents, trainingState.tunable('home.recentActivityCount'), trainingState.homeDetails['recentActivity.ascents']),
  );
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in duration-200 pb-24">
  <div class="flex items-center justify-between px-1">
    <div>
      <p class="text-caption text-content-subtle">{today}</p>
      <h2 class="text-title text-content flex items-center gap-2 flex-wrap">
        <span>{currentPhaseName ?? 'Home'}</span>
        {#if blockWeekPosition}
          <span class="w-1 h-1 bg-surface-elevated-hover rounded-full flex-shrink-0"></span>
          <span class="text-content-subtle font-normal">Week {blockWeekPosition.week} of {blockWeekPosition.of}</span>
        {/if}
      </h2>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <button
        onclick={() => showQuickLog = true}
        class="p-2 bg-primary/10 rounded-control border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
        aria-label="Quick log: pain, bodyweight, send or benchmark"
        title="Quick log"
      >
        <Icon icon="ic:baseline-plus" class="text-lg" />
      </button>
      <button
        onclick={() => trainingState.navigate('settings')}
        class="p-2 bg-surface-elevated/50 rounded-control border border-border-strong/50 text-content-subtle hover:text-content transition-colors"
        aria-label="Settings"
      >
        <Icon icon="ic:baseline-settings" class="text-lg" />
      </button>
    </div>
  </div>

  <!-- UI_PLAN.md §4.7 "Home sections show/hide + reorder": every section
       below is a snippet, rendered in `trainingState.homeSections`'
       user-configurable order, skipping any marked hidden. The header
       above is not part of this list - it's always shown, always first. -->

  {#snippet readinessSection()}
    {@const canBreakDown = trainingState.homeDetails['readiness.breakdown'] && readiness.score !== undefined}
    <div
      class="relative overflow-hidden rounded-card border p-5 transition-colors {STATUS_HERO_BG[readiness.status]}"
      style="box-shadow: 0 14px 40px -18px color-mix(in srgb, {STATUS_VAR[readiness.status]} 45%, transparent), var(--shadow-card);"
    >
     <div class="flex items-center gap-5">
      <button
        class="relative w-28 h-28 shrink-0 rounded-full {canBreakDown ? 'cursor-pointer' : 'cursor-default'}"
        onclick={() => { if (canBreakDown) showBreakdown = !showBreakdown; }}
        disabled={!canBreakDown}
        aria-expanded={canBreakDown ? showBreakdown : undefined}
        aria-label={canBreakDown ? (showBreakdown ? 'Hide score breakdown' : 'Show score breakdown') : `Readiness ${readiness.score !== undefined ? Math.round(readiness.score) : 'unavailable'}`}
      >
        <svg viewBox="0 0 100 100" class="w-28 h-28 -rotate-90">
          <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--theme-border)" stroke-width="7" />
          {#if readiness.score !== undefined}
            <circle
              cx="50" cy="50" r={RING_RADIUS} fill="none" stroke-width="7" stroke-linecap="round"
              class={STATUS_COLOR[readiness.status]}
              stroke="currentColor"
              stroke-dasharray={RING_CIRCUMFERENCE}
              stroke-dashoffset={ringOffset}
              style="transition: stroke-dashoffset 700ms ease-out;"
            />
          {/if}
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-display text-content tabular-nums leading-none">{readiness.score !== undefined ? Math.round(readiness.score) : '—'}</span>
        </div>
        <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-surface border-2 border-app-bg shadow-card flex items-center justify-center {STATUS_COLOR[readiness.status]}">
          <Icon icon={STATUS_ICON[readiness.status]} class="text-base" />
        </div>
      </button>
      <div class="min-w-0 space-y-1.5">
        <span class="text-section uppercase {STATUS_COLOR[readiness.status]}">{readiness.status}</span>
        <p class="text-body text-content leading-snug">{readiness.advice}</p>
        {#if trainingState.homeDetails['readiness.confidence'] && !(canBreakDown && showBreakdown)}
          <p class="text-caption text-content-subtle flex items-start gap-1">
            <Icon icon="ic:baseline-insights" class="text-content-subtle text-sm mt-0.5 shrink-0" />
            <span>{readiness.confidence}</span>
          </p>
        {/if}
      </div>
     </div>
      {#if canBreakDown && showBreakdown}
        <div class="mt-4 pt-3 border-t border-border/60 space-y-2">
          {#each BREAKDOWN_ROWS as row}
            <div class="flex items-center gap-3">
              <span class="w-14 text-label text-content-subtle shrink-0">{row.label}</span>
              <div class="flex-1 h-1.5 bg-surface-elevated rounded-control overflow-hidden border border-border-strong/30">
                <div class="h-full rounded-control {STATUS_BAR[readiness.status]}" style="width: {Math.min(100, (row.penalty / row.max) * 100)}%"></div>
              </div>
              <span class="w-12 text-right text-label tabular-nums shrink-0 {row.used ? 'text-content' : 'text-content-subtle'}">
                {row.used ? (Math.round(row.penalty) > 0 ? `−${Math.round(row.penalty)}` : '0') : 'no data'}
              </span>
            </div>
          {/each}
          <p class="text-caption text-content-subtle">Points taken off 100. {readiness.confidence}</p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet sectionHeader(icon: string, label: string, subtitle?: string, note?: { has: boolean; open: () => void; what: string })}
    <div class="flex items-center justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-section uppercase text-content-muted">{label}</span>
          {#if note}
            <button
              onclick={note.open}
              class="p-1 -m-1 rounded-control transition-colors {note.has ? 'text-primary hover:text-primary-hover' : 'text-content-subtle hover:text-content'}"
              aria-label={note.has ? `Open ${note.what} note` : `Add a ${note.what} note`}
              title={note.has ? `${note.what[0].toUpperCase()}${note.what.slice(1)} note` : `Add a ${note.what} note`}
            >
              <Icon icon={note.has ? 'ic:baseline-sticky-note-2' : 'ic:outline-sticky-note-2'} class="text-sm" />
            </button>
          {/if}
        </div>
        {#if subtitle}<p class="text-caption text-content-subtle mt-0.5">{subtitle}</p>{/if}
      </div>
      <div class="p-2 bg-primary-hover/10 rounded-control text-primary shrink-0 ml-3">
        <Icon {icon} class="text-lg" />
      </div>
    </div>
  {/snippet}

  {#snippet todaySection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-today', 'Today', todaysWorkouts.length > 0 ? `${todaysWorkouts.length} session${todaysWorkouts.length === 1 ? '' : 's'} planned` : undefined)}
      {#each todaysWorkouts as workout}
        {@const isThisRunning = trainingState.sessionStore.isRunning(workout.id)}
        {@const summary = summarizeSession(workout, trainingState.exerciseTypes)}
        {@const showTime = trainingState.homeDetails['today.time']}
        {@const showLoad = trainingState.homeDetails['today.load'] && summary.plannedLoad > 0}
        <div class="flex items-center justify-between p-3.5 rounded-control {workout.provisional ? 'bg-surface-elevated/20 border border-dashed border-border-strong/60' : 'bg-surface-elevated/50 border border-border-strong/50'}">
          <div class="min-w-0 flex-1">
            <p class="text-body font-bold text-content truncate">{workout.notes}</p>
            <p class="text-caption text-content-subtle flex items-center gap-1">
              {#if workout.provisional}
                <Icon icon="ic:outline-cloud-queue" class="text-xs text-primary/70 shrink-0" />
              {/if}
              <span class="truncate">
                {joinParts(
                  showTime && summary.startTime,
                  showTime && `${summary.estimated ? '~' : ''}${summary.minutes} min`,
                  `${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`,
                  showLoad && `load ${summary.plannedLoad}`,
                )}
              </span>
            </p>
            {#if trainingState.homeDetails['today.exercises'] && summary.exerciseNames.length > 0}
              <p class="text-caption text-content-subtle truncate mt-0.5">
                {summary.exerciseNames.join(' · ')}{summary.moreExercises > 0 ? ` +${summary.moreExercises} more` : ''}
              </p>
            {/if}
          </div>
          <!-- Start goes live: it begins the session and opens the session
               modal, rather than opening the workout in the planning form.
               While a session is running, the only session that can be
               opened from here is that one. -->
          <button
            onclick={() => trainingState.startSession(workout)}
            disabled={trainingState.isSessionActive && !isThisRunning}
            title={trainingState.isSessionActive && !isThisRunning ? 'Finish or discard the running session first' : undefined}
            class="flex items-center gap-1 px-3 py-1.5 text-white text-label font-bold rounded-control shrink-0 ml-3 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed {isThisRunning
              ? 'bg-success hover:bg-success-hover'
              : 'bg-primary hover:bg-primary-hover shadow-[0_4px_14px_-4px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]'}"
          >
            <Icon icon="ic:baseline-play-arrow" class="text-sm" /> {isThisRunning ? 'Resume' : 'Start'}
          </button>
        </div>
      {:else}
        <div class="flex items-center justify-between gap-3">
          <p class="text-caption text-content-subtle italic">Nothing planned for today.</p>
          <button onclick={() => trainingState.navigate('add')} class="text-label text-primary shrink-0">Start a session</button>
        </div>
      {/each}
      {#if trainingState.homeDetails['today.missed'] && missed.length > 0}
        <div class="pt-1 border-t border-border/60">
          <button onclick={() => showMissed = !showMissed} class="w-full flex items-center gap-1 pt-2 text-label text-content-muted hover:text-content" aria-expanded={showMissed}>
            <Icon icon="ic:baseline-chevron-right" class="text-base transition-transform {showMissed ? 'rotate-90' : ''}" />
            Missed this week ({missed.length})
          </button>
          {#if showMissed}
            <div class="space-y-1.5 mt-2">
              {#each missed as workout (workout.id)}
                <div class="flex items-center gap-2 p-2.5 rounded-control bg-surface-elevated/30 border border-border-strong/40">
                  <div class="min-w-0 flex-1">
                    <p class="text-label text-content truncate">{workout.notes || 'Session'}</p>
                    <p class="text-caption text-content-subtle">{workout.dayOfWeek}</p>
                  </div>
                  <button onclick={() => trainingState.navigate('add', workout)} class="px-2.5 py-1 text-label text-primary bg-primary/10 hover:bg-primary/20 rounded-control shrink-0">Log</button>
                  <button onclick={() => skipWorkout(workout)} class="px-2.5 py-1 text-label text-content-subtle hover:text-content bg-surface-elevated rounded-control shrink-0">Skip</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet metricsSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-favorite', 'Metrics', `Sleep, HRV, resting heart rate${trainingState.homeDetails['metrics.bodyweight'] ? ', bodyweight' : ''}`)}
      {#each QUICK_METRICS as def}
        {@const entry = todaysMetric(def.id)}
        {@const spark = entriesFor(def.id).slice(-7)}
        <div class="flex items-center justify-between gap-3 p-2.5 bg-surface-elevated/40 rounded-control border border-border-strong/30">
          <div class="min-w-0">
            <p class="text-label text-content-subtle">{def.name}</p>
            {#if editingMetricId === def.id}
              <form onsubmit={(e) => { e.preventDefault(); saveMetric(def.id); }} class="flex items-center gap-2 mt-1">
                <input type="number" step="0.1" bind:value={draftValue} class="w-20 bg-surface-elevated text-content p-1.5 rounded-control border border-border-strong outline-none text-sm" />
                <button type="submit" class="p-1.5 bg-primary hover:bg-primary-hover text-white rounded-control"><Icon icon="ic:baseline-check" class="text-sm" /></button>
                <button type="button" onclick={() => editingMetricId = null} class="p-1.5 text-content-subtle hover:text-content"><Icon icon="ic:baseline-close" class="text-sm" /></button>
              </form>
            {:else}
              <button onclick={() => startEdit(def.id)} class="text-body text-content tabular-nums hover:text-primary transition-colors">
                {entry ? `${entry.value} ${def.unit}` : 'Log'}
              </button>
            {/if}
            {#if def.id === 'hrv' && hrvDelta !== undefined && hrvBaseline !== undefined && trainingState.homeDetails['metrics.hrvBaseline']}
              <p class="text-caption tabular-nums {hrvDelta < -trainingState.readinessConfig.hrvDip ? 'text-status-caution' : 'text-content-subtle'}">
                {hrvDelta >= 0 ? '+' : '−'}{Math.abs(Math.round(hrvDelta * 100))}% vs 14-day baseline ({Math.round(hrvBaseline)})
              </p>
            {:else if def.id === BODYWEIGHT_METRIC_ID && bodyweightAvg !== undefined}
              {@const diff = bodyweightPrevAvg !== undefined ? bodyweightAvg - bodyweightPrevAvg : undefined}
              <p class="text-caption text-content-subtle tabular-nums flex items-center gap-1">
                7-day avg {bodyweightAvg.toFixed(1)}
                {#if diff !== undefined && Math.abs(diff) >= 0.1}
                  <Icon icon={diff > 0 ? 'ic:baseline-arrow-upward' : 'ic:baseline-arrow-downward'} class="text-xs" />
                  <span>{Math.abs(diff).toFixed(1)}</span>
                {/if}
              </p>
            {/if}
          </div>
          {#if spark.length > 1 && trainingState.homeDetails['metrics.sparklines']}
            <div class="h-8 flex items-end gap-0.5 shrink-0">
              {#each spark as s}
                <div class="w-1.5 rounded-t-control bg-primary/50" style="height: {sparkHeightPercent(s.value, spark.map((v) => v.value))}%"></div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet fatigueSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-4">
      {@render sectionHeader('ic:baseline-bolt', 'Fatigue', 'Exponentially-decayed load, per axis')}
      {#if trainingState.fatigueChartStyle === 'radar'}
        <FatigueRadarChart fingers={fatigueDecay.fingers} arms={fatigueDecay.arms} core={fatigueDecay.core} systemic={fatigueDecay.systemic} />
      {:else}
        {#each FATIGUE_BARS as bar}
          {@const value = fatigueDecay[bar.key]}
          <div class="space-y-1.5">
            <div class="flex justify-between text-label text-content-subtle">
              <span>{bar.label}</span>
              <span class="tabular-nums text-content">{value !== undefined ? value.toFixed(1) : '—'} <span class="text-content-subtle">/ 10</span></span>
            </div>
            <div class="flex gap-1 h-2.5">
              {#each Array(10) as _, i}
                <div class="flex-1 rounded-[2px] transition-colors duration-500 {value !== undefined && i < Math.round(value) ? 'bg-primary' : 'bg-surface-elevated border border-border-strong/50'}"></div>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
      {#if fatigueDecay.coverage.total > 0}
        <p class="text-caption text-content-subtle">Arms: {fatigueDecay.coverage.arms} of {fatigueDecay.coverage.total} sessions</p>
      {/if}
    </div>
  {/snippet}

  {#snippet thisWeekSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-trending-up', 'This Week', 'Actual vs planned load',
        trainingState.homeDetails['thisWeek.note'] ? { has: !!weekNote, open: () => openNote = 'week', what: 'week' } : undefined)}
      {#if trainingState.homeDetails['thisWeek.strip']}
        <div class="grid grid-cols-7 gap-1">
          {#each dayStrip as cell, i}
            {@const mark = DAY_MARK[cell.status]}
            <button
              onclick={() => peekDay = peekDay === i ? null : i}
              class="flex flex-col items-center gap-1 py-1 rounded-control {peekDay === i ? 'bg-surface-elevated/60' : ''}"
              aria-label="{cell.day}: {mark.label}{cell.sessions.length ? `, ${cell.sessions.join(', ')}` : ''}"
            >
              <span class="text-caption {cell.isToday ? 'text-primary font-bold' : 'text-content-subtle'}">{WEEK_DAYS[i].slice(0, 1)}</span>
              <span class="w-6 h-6 rounded-full border flex items-center justify-center {mark.class} {cell.isToday ? 'ring-2 ring-primary/50' : ''}">
                {#if mark.icon}<Icon icon={mark.icon} class={cell.status === 'planned' ? 'text-[8px]' : 'text-xs'} />{/if}
              </span>
              {#if weekTripDays[i] && trainingState.homeDetails['thisWeek.tripDays']}
                <Icon icon="ic:baseline-terrain" class="text-[10px] text-primary -mt-0.5" aria-label="Trip: {weekTripDays[i]!.name}" />
              {/if}
            </button>
          {/each}
        </div>
        {#if peekDay !== null}
          {@const cell = dayStrip[peekDay]}
          <p class="text-caption text-content-subtle">
            <span class="text-content-muted">{cell.day}:</span> {weekTripDays[peekDay] ? `${weekTripDays[peekDay]!.name} · ` : ''}{cell.sessions.length ? cell.sessions.join(' · ') : weekTripDays[peekDay] ? 'trip day' : 'rest day'}{cell.status === 'missed' ? ' (missed)' : cell.status === 'skipped' ? ' (skipped)' : ''}
          </p>
        {/if}
      {/if}
      {#if weeklyAdherence.plannedLoad > 0 || weeklyAdherence.actualLoad > 0}
        {@const percent = weeklyAdherence.plannedLoad > 0 ? Math.min(100, (weeklyAdherence.actualLoad / weeklyAdherence.plannedLoad) * 100) : 100}
        <div class="flex items-baseline justify-between gap-2">
          <p class="text-metric text-content tabular-nums">{Math.round(weeklyAdherence.actualLoad)} <span class="text-caption text-content-subtle font-normal">of {Math.round(weeklyAdherence.plannedLoad)}</span></p>
          <div class="flex items-center gap-2 shrink-0">
            {#if acwrZone && trainingState.homeDetails['thisWeek.acwr']}
              <span class="px-2 py-0.5 rounded-full border text-caption tabular-nums {acwrZone.class}" title="Acute:chronic workload ratio - last 7 days vs the 28-day average">ACWR {acwr.ratio!.toFixed(2)} · {acwrZone.label}</span>
            {/if}
            <span class="text-label text-success">{Math.round(weeklyAdherence.completionRate * 100)}% logged</span>
          </div>
        </div>
        <div class="h-2.5 bg-surface-elevated rounded-control overflow-hidden border border-border-strong/30">
          <div class="h-full bg-success rounded-control transition-all duration-700" style="width: {percent}%"></div>
        </div>
      {:else}
        <div class="flex items-center justify-between gap-2">
          <p class="text-caption text-content-subtle italic">No load logged yet this week.</p>
          {#if acwrZone && trainingState.homeDetails['thisWeek.acwr']}
            <span class="px-2 py-0.5 rounded-full border text-caption tabular-nums shrink-0 {acwrZone.class}">ACWR {acwr.ratio!.toFixed(2)} · {acwrZone.label}</span>
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet trainingBlockSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
      {@render sectionHeader('ic:baseline-view-week', 'Training Block', undefined,
        dominantBlock && trainingState.homeDetails['trainingBlock.note'] ? { has: !!dominantBlock.notes, open: () => openNote = 'block', what: 'block' } : undefined)}
      {#if dominantBlock}
        <p class="text-body text-content font-bold">{dominantBlock.name}{currentPhaseName ? ` · ${currentPhaseName}` : ''}</p>
        {#if blockWeekPosition}
          <div class="flex items-center gap-3">
            <span class="text-caption text-content-subtle shrink-0">Week {blockWeekPosition.week} of {blockWeekPosition.of}</span>
            <div class="flex gap-1 flex-1">
              {#each Array(blockWeekPosition.of) as _, i}
                <div class="flex-1 h-1.5 rounded-control {i < blockWeekPosition.week ? 'bg-primary' : 'bg-surface-elevated border border-border-strong/50'}"></div>
              {/each}
            </div>
          </div>
        {/if}
        {#if trainingState.homeDetails['trainingBlock.loadTrend'] && blockTrend.some((b) => b.planned > 0 || b.actual > 0)}
          <div class="flex items-end gap-1 h-10 pt-1" aria-label="Planned vs logged load per week of this block">
            {#each blockTrend as bar}
              {@const isCurrent = bar.weekId === currentWeekId}
              <div class="flex-1 h-full flex items-end relative" title="{bar.weekId}: {bar.actual} of {bar.planned}">
                <div class="absolute inset-x-0 bottom-0 rounded-t-control border border-dashed {isCurrent ? 'border-primary/60' : 'border-border-strong/60'}" style="height: {(bar.planned / blockTrendMax) * 100}%"></div>
                <div class="relative w-full rounded-t-control {isCurrent ? 'bg-primary' : 'bg-primary/50'}" style="height: {(bar.actual / blockTrendMax) * 100}%"></div>
              </div>
            {/each}
          </div>
          <p class="text-caption text-content-subtle">Weekly load: logged (filled) vs planned (outline)</p>
        {/if}
      {:else}
        <p class="text-caption text-content-subtle italic">No training block covers this week.</p>
      {/if}
      {#if upcomingBlock && daysToNextBlock !== undefined && trainingState.homeDetails['trainingBlock.next']}
        {@const nextPhase = trainingState.phaseDefs.find((p) => p.id === upcomingBlock.phaseId)?.name}
        <p class="text-caption text-content-subtle flex items-center gap-1 pt-1">
          <Icon icon="ic:baseline-arrow-forward" class="text-xs shrink-0" />
          <span class="truncate">Next: <span class="text-content-muted">{upcomingBlock.name}{nextPhase && nextPhase !== upcomingBlock.name ? ` · ${nextPhase}` : ''}</span> · {daysToNextBlock === 0 ? 'this week' : `in ${daysToNextBlock} day${daysToNextBlock === 1 ? '' : 's'}`} ({upcomingBlock.startWeekId})</span>
        </p>
      {/if}
    </div>
  {/snippet}

  {#snippet competitionSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
      {@render sectionHeader(nextGoal?.kind === 'trip' ? 'ic:baseline-terrain' : 'ic:baseline-flag', 'Next Goal', undefined,
        nextGoal && trainingState.homeDetails['competition.note'] ? { has: !!nextGoal.notes, open: () => goalNoteOpen = true, what: nextGoal.kind === 'trip' ? 'trip' : 'competition' } : undefined)}
      {#if nextGoal && daysUntilCompetition !== undefined}
        {@const length = goalLength(nextGoal)}
        <div class="flex items-center gap-4">
          <div class="text-center shrink-0 px-2">
            {#if nextGoalOngoing && length > 1}
              <p class="text-display text-primary tabular-nums leading-none">{-daysUntilCompetition + 1}<span class="text-title text-content-subtle">/{length}</span></p>
              <p class="text-caption text-content-subtle uppercase mt-1">day</p>
            {:else}
              <p class="text-display text-primary tabular-nums leading-none">{Math.max(0, daysUntilCompetition)}</p>
              <p class="text-caption text-content-subtle uppercase mt-1">{daysUntilCompetition === 1 ? 'day' : 'days'}</p>
            {/if}
          </div>
          <div class="min-w-0 border-l border-border-strong/50 pl-4">
            <p class="text-body font-bold text-content truncate">{nextGoal.name}</p>
            <p class="text-caption text-content-subtle truncate">
              {nextGoalOngoing && length === 1 ? 'Today' : formatGoalDates(nextGoal)}{nextGoal.location ? ` · ${nextGoal.location.name}` : ''}
            </p>
          </div>
        </div>
        {#if nextGoal.kind === 'trip' && nextTripSummary}
          {#if nextGoalOngoing && nextTripSummary.sends.length > 0}
            <p class="text-caption text-content-muted flex items-center gap-1.5">
              <Icon icon="ic:baseline-check-circle" class="text-sm text-status-good shrink-0" />
              {nextTripSummary.sends.length} send{nextTripSummary.sends.length === 1 ? '' : 's'} so far{nextTripSummary.hardest ? ` · hardest ${nextTripSummary.hardest.grade}` : ''}
            </p>
          {/if}
          {#if trainingState.homeDetails['competition.conditions'] && tripForecastDays.length > 0}
            {@const rain = trainingState.goalWeather.snapshot?.recentRain}
            <div class="flex gap-3 overflow-x-auto no-scrollbar pt-1 border-t border-border/60">
              {#each tripForecastDays as day}
                {@const df = dayFriction(day)}
                {@const code = describeWeatherCode(day.weatherCode)}
                <div class="flex flex-col items-center gap-1 shrink-0 w-11 pt-2">
                  <span class="text-caption text-content-subtle">{day.date === todayIso ? 'Today' : new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span title={code.label} class="flex"><Icon icon={code.icon} class="text-lg text-primary" aria-label={code.label} /></span>
                  <span class="text-caption text-content tabular-nums">{Math.round(day.tempMaxC)}°</span>
                  {#if trainingState.homeDetails['weather.frictionNumber']}
                    <span class="text-caption tabular-nums leading-none {FRICTION_STYLE[df.label].text}" title={df.label}>{df.score.toFixed(0)}</span>
                  {:else}
                    <span class="w-2 h-2 rounded-full {FRICTION_STYLE[df.label].dot}" title={df.label}></span>
                  {/if}
                </div>
              {/each}
            </div>
            {#if rain && rain.last72hMm > 0 && daysUntilCompetition <= 3}
              <p class="text-caption text-content-subtle tabular-nums flex items-center gap-1.5">
                <Icon icon="ic:baseline-water-drop" class="text-sm text-primary shrink-0" />
                Rock drying: {rain.last72hMm} mm there in the last 3 days{rain.hoursSinceRain !== undefined ? `, last ${rain.hoursSinceRain} h ago` : ''}
              </p>
            {/if}
          {/if}
          {#if trainingState.homeDetails['competition.projects'] && nextTripSummary.projects.length > 0}
            <div class="pt-1 space-y-1">
              <p class="text-label text-content-muted">Projects {nextTripSummary.projectsDone}/{nextTripSummary.projects.length}</p>
              {#each nextTripSummary.projects as status (status.project.id)}
                {@const p = status.project}
                <div class="flex items-center gap-2 text-caption">
                  <Icon
                    icon={status.state === 'done' ? 'ic:baseline-check-circle' : status.state === 'maybe' ? 'ic:baseline-help-outline' : 'ic:baseline-radio-button-unchecked'}
                    class="text-sm shrink-0 {status.state === 'done' ? 'text-status-good' : status.state === 'maybe' ? 'text-status-caution' : 'text-content-subtle'}"
                  />
                  <span class="truncate {status.state === 'done' ? 'text-content' : 'text-content-muted'}">
                    {p.name ?? `Any ${p.grade}`}{p.name && p.grade ? ` ${p.grade}` : ''}{p.flash ? ' · flash' : ''}{status.send && status.send.name && status.send.name !== p.name ? ` (${status.send.name} ${status.send.grade})` : ''}
                  </span>
                </div>
                {#each status.candidates as candidate (candidate.id)}
                  <div class="flex items-center gap-2 pl-5 text-caption text-content-subtle">
                    <span class="flex-1 truncate">"{candidate.name} {candidate.grade}" - counts for {p.name}?</span>
                    <button onclick={() => answerCandidate(nextGoal, p, candidate.id, true)} class="px-2 py-0.5 rounded-control bg-primary/10 text-primary">Yes</button>
                    <button onclick={() => answerCandidate(nextGoal, p, candidate.id, false)} class="px-2 py-0.5 rounded-control bg-surface-elevated text-content-muted">No</button>
                  </div>
                {/each}
              {/each}
            </div>
          {/if}
        {/if}
        {#if competitionTaperHint && trainingState.homeDetails['competition.taper'] && !nextGoalOngoing}
          <p class="text-caption text-status-caution flex items-start gap-1">
            <Icon icon="ic:baseline-info" class="text-sm mt-px shrink-0" />
            <span>{competitionTaperHint}</span>
          </p>
        {/if}
      {:else}
        <p class="text-caption text-content-subtle italic">No competition or trip coming up. Add one under Plan → Goals.</p>
      {/if}
    </div>
  {/snippet}

  {#snippet recentActivitySection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-history', 'Recent Activity')}
      {#each recentActivity as item}
        {#if item.kind === 'workout'}
          {@const workout = item.workout}
          {@const fatigue = [['F', workout.fingers], ['A', workout.arms], ['C', workout.core], ['S', workout.systemic]].filter(([, v]) => v !== undefined)}
          <button onclick={() => trainingState.openInHistory(workout.id)} class="w-full flex items-center gap-3 p-2.5 bg-surface-elevated/50 rounded-control border border-border-strong/50 text-left hover:border-border-strong transition-colors">
            <div class="w-8 h-8 rounded-control bg-success/10 text-success flex items-center justify-center shrink-0">
              <Icon icon="ic:baseline-check" class="text-base" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-label text-content truncate">{workout.notes || 'Session'}</p>
              <p class="text-caption text-content-subtle truncate tabular-nums">
                {joinParts(
                  formatDate(workout.date),
                  trainingState.homeDetails['recentActivity.details'] && `${Math.round(sessionDuration(workout))} min`,
                  trainingState.homeDetails['recentActivity.details'] && `load ${Math.round(workout.loadFactor || 0)}`,
                  trainingState.homeDetails['recentActivity.fatigue'] && fatigue.length > 0 && fatigue.map(([k, v]) => `${k}${v}`).join(' '),
                )}
              </p>
            </div>
            <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0" />
          </button>
        {:else}
          {@const ascent = item.ascent}
          <div class="w-full flex items-center gap-3 p-2.5 bg-surface-elevated/30 rounded-control border border-border-strong/40">
            <div class="w-8 h-8 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon icon="ic:baseline-terrain" class="text-base" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-label text-content truncate">{ascent.name || 'Outdoor send'} <span class="text-primary tabular-nums">{ascent.grade}</span></p>
              <p class="text-caption text-content-subtle truncate">{formatDate(ascent.date)}{ascent.style ? ` · ${ascent.style}` : ''}{ascent.crag ? ` · ${ascent.crag}` : ''}</p>
            </div>
          </div>
        {/if}
      {:else}
        <p class="text-caption text-content-subtle italic">No completed sessions yet.</p>
      {/each}
    </div>
  {/snippet}

  {#snippet alertsSection()}
    {#if alerts.length > 0}
      <div class="bg-surface/50 border border-status-caution/30 rounded-card p-5 shadow-card space-y-2.5">
        {@render sectionHeader('ic:baseline-warning-amber', 'Alerts')}
        {#each alerts as alert (alert.id)}
          {#if alert.rateWorkoutId}
            <button onclick={() => rateSession(alert.rateWorkoutId!)} class="w-full flex items-start gap-2.5 text-left group">
              <span class="w-2 h-2 rounded-full mt-1.5 shrink-0 {ALERT_DOT[alert.severity]}"></span>
              <span class="text-body text-content group-hover:text-primary transition-colors flex-1">{alert.text}</span>
              <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0 mt-0.5" />
            </button>
          {:else}
            <div class="flex items-start gap-2.5">
              <span class="w-2 h-2 rounded-full mt-1.5 shrink-0 {ALERT_DOT[alert.severity]}"></span>
              <span class="text-body text-content">{alert.text}</span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/snippet}

  {#snippet progressSection()}
    {@const showBench = trainingState.homeDetails['progress.benchmarks'] && benchmarkProgress.length > 0}
    {@const showRetest = trainingState.homeDetails['progress.retest'] && retests.length > 0}
    {@const showSends = trainingState.homeDetails['progress.sends'] && sends.last}
    {@const showConsistency = trainingState.homeDetails['progress.consistency'] && consistencyStats.due > 0}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-emoji-events', 'Progress')}
      {#if showConsistency}
        <div class="flex items-baseline justify-between gap-3">
          <p class="text-body text-content"><span class="text-metric tabular-nums">{consistencyStats.done}</span>{' '}<span class="text-content-subtle">of the last {consistencyStats.due} sessions done</span></p>
          {#if consistencyStats.weekStreak > 1}
            <span class="text-label text-primary shrink-0">{consistencyStats.weekStreak}-week streak</span>
          {/if}
        </div>
      {/if}
      {#if showBench}
        <div class="space-y-1.5">
          {#each benchmarkProgress.slice(0, trainingState.tunable('home.progressBenchmarks')) as b (b.typeKey)}
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-label text-content-muted truncate">{b.name}</span>
              <!-- Parts laid out with a flex gap, not markup spaces - spaces at
                   an {#if} edge are dropped (see joinParts). -->
              <span class="text-label text-content tabular-nums shrink-0 flex items-baseline gap-1.5">
                <span>{b.latest} {b.unit}</span>
                {#if b.change !== undefined && b.change !== 0}
                  <span class={b.change > 0 ? 'text-status-good' : 'text-status-caution'}>{b.change > 0 ? '+' : '−'}{Math.abs(b.change)}</span>
                {/if}
                <span class="text-content-subtle">· {formatDate(b.latestDate)}</span>
              </span>
            </div>
          {/each}
        </div>
      {/if}
      {#if showRetest}
        <p class="text-caption text-content-subtle flex items-center gap-1">
          <Icon icon="ic:baseline-update" class="text-sm shrink-0" />
          <span>Retest {retests.slice(0, 2).map((r) => `${r.name} (${r.weeks} wk)`).join(', ')}</span>
        </p>
      {/if}
      {#if showSends && sends.last}
        <div class="pt-2 border-t border-border/60 space-y-1">
          <p class="text-label text-content-muted flex items-center gap-1.5">
            <Icon icon="ic:baseline-terrain" class="text-sm text-primary shrink-0" />
            <span class="truncate">Last send: <span class="text-content">{sends.last.name || 'Outdoor send'} {sends.last.grade}</span> · {formatDate(sends.last.date)}</span>
          </p>
          {#if sends.hardest}
            <p class="text-caption text-content-subtle">Hardest this season: <span class="text-content">{sends.hardest.grade}</span>{sends.hardest.name ? ` (${sends.hardest.name})` : ''} · {sends.countThisSeason} send{sends.countThisSeason === 1 ? '' : 's'}</p>
          {/if}
        </div>
      {/if}
      {#if lastTrip && trainingState.homeDetails['progress.lastTrip']}
        {@const s = lastTrip.summary}
        <button onclick={() => trainingState.openSends()} class="w-full pt-2 border-t border-border/60 flex items-center gap-1.5 text-left">
          <Icon icon="ic:baseline-terrain" class="text-sm text-primary shrink-0" />
          <span class="text-caption text-content-subtle truncate flex-1">
            Last trip: <span class="text-content">{lastTrip.trip.name}</span> · {s.sends.length} send{s.sends.length === 1 ? '' : 's'}{s.hardest ? ` · hardest ${s.hardest.grade}` : ''}{s.projects.length ? ` · projects ${s.projectsDone}/${s.projects.length}` : ''}
          </span>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0" />
        </button>
      {/if}
      {#if !showBench && !showRetest && !showSends && !showConsistency && !(lastTrip && trainingState.homeDetails['progress.lastTrip'])}
        <p class="text-caption text-content-subtle italic">Log sessions, benchmarks or sends to see progress here.</p>
      {/if}
    </div>
  {/snippet}

  {#snippet cragsSection()}
    {#if trainingState.crags.length > 0}
      <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
        {@render sectionHeader('ic:baseline-landscape', 'Crags')}
        {#each trainingState.crags as crag, i (crag.name)}
          {@const state = trainingState.cragWeather[i]}
          {@const snap = state?.snapshot}
          <div class="rounded-control bg-surface-elevated/40 border border-border-strong/30">
            <button onclick={() => openCrag = openCrag === i ? null : i} class="w-full flex items-center gap-3 p-2.5 text-left" aria-expanded={openCrag === i}>
              <span class="text-label text-content flex-1 truncate">{crag.name}</span>
              {#if snap}
                {@const f = currentFriction(snap)}
                <span class="text-label text-content tabular-nums">{Math.round(snap.currentTempC)}°</span>
                {#if trainingState.homeDetails['weather.frictionWord'] || trainingState.homeDetails['weather.frictionNumber']}
                  <span class="px-2 py-0.5 rounded-full border text-caption tabular-nums {FRICTION_STYLE[f.label].badge}">
                    {frictionText(f)}
                  </span>
                {/if}
              {:else if state?.unavailable}
                <span class="text-caption text-content-subtle italic">unavailable</span>
              {:else}
                <span class="text-caption text-content-subtle italic">loading…</span>
              {/if}
              <Icon icon="ic:baseline-chevron-right" class="text-content-subtle transition-transform {openCrag === i ? 'rotate-90' : ''}" />
            </button>
            {#if openCrag === i && snap}
              <div class="px-2.5 pb-2.5 space-y-2">
                {#if snap.recentRain && snap.recentRain.last72hMm > 0}
                  <p class="text-caption text-content-subtle tabular-nums">{snap.recentRain.last72hMm} mm rain in the last 3 days{snap.recentRain.hoursSinceRain !== undefined ? ` · last ${snap.recentRain.hoursSinceRain} h ago` : ''}</p>
                {/if}
                <div class="flex gap-3 overflow-x-auto no-scrollbar">
                  {#each snap.daily as day, d}
                    {@const code = describeWeatherCode(day.weatherCode)}
                    {@const df = dayFriction(day)}
                    <div class="flex flex-col items-center gap-1 shrink-0 w-11">
                      <span class="text-caption text-content-subtle">{d === 0 ? 'Today' : new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      <span title={code.label} class="flex"><Icon icon={code.icon} class="text-lg text-primary" aria-label={code.label} /></span>
                      <span class="text-caption text-content tabular-nums">{Math.round(day.tempMaxC)}°</span>
                      {#if trainingState.homeDetails['weather.frictionNumber']}
                        <span class="text-caption tabular-nums leading-none {FRICTION_STYLE[df.label].text}" title={df.label}>{df.score.toFixed(0)}</span>
                      {:else}
                        <span class="w-2 h-2 rounded-full {FRICTION_STYLE[df.label].dot}" title={df.label}></span>
                      {/if}
                    </div>
                  {/each}
                </div>
                {#if state.stale && state.fetchedAt}
                  <p class="text-caption text-warning">Stale - last updated {formatRelativeAge(state.fetchedAt)}</p>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
        {#if cragSuggestion && trainingState.homeDetails['crags.suggestion']}
          {@const when = cragSuggestion.date === todayIso ? 'Today' : new Date(`${cragSuggestion.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long' })}
          <p class="text-caption text-content-muted flex items-start gap-1.5 pt-1">
            <Icon icon="ic:outline-lightbulb" class="text-sm text-primary shrink-0 mt-px" />
            <span>{when} looks prime at {cragSuggestion.cragName} - you have "{cragSuggestion.sessionName}" planned.</span>
          </p>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet weatherSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
      {@render sectionHeader('ic:baseline-cloud', 'Weather')}
      {#if !trainingState.homeLocation}
        <p class="text-caption text-content-subtle italic">Set a home location in Settings to see conditions here.</p>
      {:else if trainingState.homeWeather.unavailable}
        <p class="text-caption text-content-subtle italic">Weather is currently unavailable.</p>
      {:else if trainingState.homeWeather.snapshot}
        {@const w = trainingState.homeWeather.snapshot}
        {@const code = describeWeatherCode(w.currentWeatherCode)}
        {@const friction = currentFriction(w)}
        {@const showWord = trainingState.homeDetails['weather.frictionWord']}
        {@const showNumber = trainingState.homeDetails['weather.frictionNumber']}
        <div class="flex items-center gap-3">
          <Icon icon={code.icon} class="text-3xl text-primary shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-metric text-content tabular-nums">{Math.round(w.currentTempC)}°C</p>
            <p class="text-caption text-content-subtle truncate">{code.label} · {trainingState.homeLocation.name}</p>
          </div>
          {#if showWord || showNumber}
            <button
              onclick={() => showFrictionReason = !showFrictionReason}
              class="px-2.5 py-1 rounded-full border text-label tabular-nums shrink-0 {FRICTION_STYLE[friction.label].badge}"
              aria-expanded={showFrictionReason}
              title="Climbing conditions - tap for why"
            >
              {frictionText(friction)}
            </button>
          {/if}
        </div>
        {#if showFrictionReason && (showWord || showNumber)}
          <p class="text-caption text-content-subtle">
            {[
              friction.reason ? `${friction.reason}.` : 'Nothing holding conditions back.',
              w.dewPointC !== undefined && `Air is ${Math.max(0, Math.round(w.currentTempC - w.dewPointC))}° above its dew point.`,
            ].filter(Boolean).join(' ')}
          </p>
        {/if}

        <!-- Humidity and wind sit beside the temperature because they are
             what decide whether rock has any friction - a dry 8°C day and a
             humid one are not the same session. Each is rendered only if
             the snapshot carries it: a cached snapshot from before these
             were fetched still shows the temperature rather than a row of
             blanks. -->
        {#if trainingState.homeDetails['weather.details'] && (w.feelsLikeC !== undefined || w.dewPointC !== undefined || w.humidityPercent !== undefined || w.windSpeedKmh !== undefined || (w.precipitationMm ?? 0) > 0)}
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            {#if w.feelsLikeC !== undefined}
              <span class="text-caption text-content-subtle tabular-nums">Feels {Math.round(w.feelsLikeC)}°</span>
            {/if}
            {#if w.humidityPercent !== undefined}
              <span class="text-caption text-content-subtle tabular-nums">{Math.round(w.humidityPercent)}% humidity</span>
            {/if}
            {#if w.dewPointC !== undefined}
              <span class="text-caption text-content-subtle tabular-nums">Dew {Math.round(w.dewPointC)}°</span>
            {/if}
            {#if w.windSpeedKmh !== undefined}
              <span class="text-caption text-content-subtle tabular-nums">{Math.round(w.windSpeedKmh)}{w.windGustsKmh !== undefined && w.windGustsKmh > w.windSpeedKmh + 5 ? `–${Math.round(w.windGustsKmh)}` : ''} km/h wind</span>
            {/if}
            {#if w.uvIndex !== undefined && w.uvIndex >= 3}
              <span class="text-caption text-content-subtle tabular-nums">UV {Math.round(w.uvIndex)}</span>
            {/if}
            {#if (w.precipitationMm ?? 0) > 0}
              <span class="text-caption text-primary tabular-nums">{w.precipitationMm} mm rain</span>
            {/if}
          </div>
        {/if}

        {#if trainingState.homeDetails['weather.rain'] && w.recentRain}
          {@const rain = w.recentRain}
          <p class="text-caption text-content-subtle flex items-center gap-1.5 tabular-nums">
            <Icon icon="ic:baseline-water-drop" class="text-sm shrink-0 {rain.last72hMm > 0 ? 'text-primary' : ''}" />
            {#if rain.last72hMm === 0}
              No rain in the last 3 days
            {:else}
              {rain.last72hMm} mm in the last 3 days{rain.last24hMm > 0 ? ` (${rain.last24hMm} in 24 h)` : ''}{rain.hoursSinceRain !== undefined ? ` · last rain ${rain.hoursSinceRain} h ago` : ''}
            {/if}
          </p>
        {/if}

        {#if trainingState.homeDetails['weather.window'] && w.localTime}
          {@const today = w.localTime.slice(0, 10)}
          {@const sunset = w.daily.find((d) => d.date === today)?.sunset}
          {@const best = w.hours ? bestWindow(w.hours, today, sunset, w.recentRain?.last24hMm, trainingState.frictionConfig) : undefined}
          {@const sunsetAhead = sunset !== undefined && sunset > w.localTime}
          {#if best || sunsetAhead}
            <p class="text-caption text-content-subtle flex items-center gap-1.5 tabular-nums">
              <Icon icon="ic:baseline-schedule" class="text-sm shrink-0" />
              {joinParts(
                best && `Best ${best.start}–${best.end}`,
                best && `${Math.round(best.avgTempC)}° dry`,
                sunsetAhead && `sunset ${sunset!.slice(11, 16)}`,
              )}
            </p>
          {/if}
        {/if}

        <!-- The week ahead. This was always in the snapshot - the trip card
             has rendered it since Stage 8 - the home card just never showed
             it. Today is labelled rather than given its weekday name, since
             "Mon" beside a live temperature reads as a different day. -->
        {#if w.daily.length > 0 && trainingState.homeDetails['weather.forecast']}
          <div class="flex gap-3 overflow-x-auto no-scrollbar pt-1 border-t border-border/60">
            {#each w.daily as day, i}
              {@const dayCode = describeWeatherCode(day.weatherCode)}
              <div class="flex flex-col items-center gap-1 shrink-0 w-12 pt-2">
                <span class="text-caption {i === 0 ? 'text-content-muted' : 'text-content-subtle'}">
                  {i === 0 ? 'Today' : new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span title={dayCode.label} class="flex"><Icon icon={dayCode.icon} class="text-lg text-primary" aria-label={dayCode.label} /></span>
                <span class="text-caption text-content tabular-nums">{Math.round(day.tempMaxC)}°</span>
                <span class="text-caption text-content-subtle tabular-nums">{Math.round(day.tempMinC)}°</span>
                {#if day.precipitationChance !== undefined && day.precipitationChance >= 20}
                  <span class="text-caption text-primary/80 tabular-nums leading-none">{Math.round(day.precipitationChance)}%</span>
                {/if}
                {#if trainingState.homeDetails['weather.dayFriction']}
                  {@const df = dayFriction(day)}
                  {#if trainingState.homeDetails['weather.frictionNumber']}
                    <span class="text-caption tabular-nums leading-none {FRICTION_STYLE[df.label].text}" title={df.label}>{df.score.toFixed(0)}</span>
                  {:else}
                    <span class="w-2 h-2 rounded-full {FRICTION_STYLE[df.label].dot}" title={df.label}></span>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        {#if trainingState.homeWeather.stale && trainingState.homeWeather.fetchedAt}
          <p class="text-caption text-warning">Stale - last updated {formatRelativeAge(trainingState.homeWeather.fetchedAt)}</p>
        {/if}
      {:else}
        <p class="text-caption text-content-subtle italic">Loading conditions…</p>
      {/if}
    </div>

  {/snippet}

  {#each trainingState.homeSections as section (section.id)}
    {#if section.visible}
      {#if section.id === 'readiness'}{@render readinessSection()}
      {:else if section.id === 'alerts'}{@render alertsSection()}
      {:else if section.id === 'progress'}{@render progressSection()}
      {:else if section.id === 'crags'}{@render cragsSection()}
      {:else if section.id === 'today'}{@render todaySection()}
      {:else if section.id === 'metrics'}{@render metricsSection()}
      {:else if section.id === 'fatigue'}{@render fatigueSection()}
      {:else if section.id === 'thisWeek'}{@render thisWeekSection()}
      {:else if section.id === 'trainingBlock'}{@render trainingBlockSection()}
      {:else if section.id === 'competition'}{@render competitionSection()}
      {:else if section.id === 'recentActivity'}{@render recentActivitySection()}
      {:else if section.id === 'weather'}{@render weatherSection()}
      {/if}
    {/if}
  {/each}
</div>

{#if openNote === 'week'}
  <NoteSheet
    title="Week note"
    subtitle="This week · {currentWeekId}"
    text={weekNote}
    placeholder="Circumstances, ideas, anything that explains this week…"
    onSave={(text) => trainingState.saveWeekNote(currentWeekId, text)}
    onClose={() => openNote = null}
  />
{:else if openNote === 'block' && dominantBlock}
  {@const block = dominantBlock}
  <NoteSheet
    title="{block.name} note"
    subtitle="{currentPhaseName ?? 'Training block'} · {block.startWeekId} – {block.endWeekId}"
    text={block.notes ?? ''}
    placeholder="What this block is for, how to progress it…"
    onSave={(text) => trainingState.saveBlockNotes(block.id, text)}
    onClose={() => openNote = null}
  />
{/if}

{#if showQuickLog}
  <QuickLogSheet onClose={() => showQuickLog = false} />
{/if}

{#if goalNoteOpen && nextGoal}
  {@const goal = nextGoal}
  <NoteSheet
    title="{goal.name} note"
    subtitle={formatGoalDates(goal)}
    text={goal.notes ?? ''}
    placeholder={goal.kind === 'trip' ? 'Logistics, beta, who\'s coming…' : 'Format, rounds, what to prepare…'}
    onSave={(text) => trainingState.saveGoal({ ...$state.snapshot(goal) as GoalEvent, notes: text.trim() || undefined })}
    onClose={() => goalNoteOpen = false}
  />
{/if}
