import { trainingState } from '../../../lib/state.svelte';
import { formatDate, getWeekIdRange, getWeekId, getWeekDates, localIsoDate } from '../../../lib/dateUtils';
import { computeFatigueDecay, computeHrvBaseline, computeReadiness } from '../../../lib/analytics/readiness';
import { calculateRollingAcwr } from '../../../lib/analytics/loadAnalytics';
import { isLoggedMetricValue } from '../../../lib/analytics/metricValues';
import { upcomingGoals, isOngoing, daysUntilGoal, goalLength, formatGoalDates, coversDate } from '../../../lib/goals/goals';
import { sessionsDuringTrip } from '../../../lib/goals/tripConflicts';
import { WEEK_DAYS } from '../../../lib/constants';
import type { DailyMetricEntry, DayOfWeek } from '../../../lib/types';

const DAY_NAMES: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * What more than one Home card reads: today's date, the current block and
 * phase, readiness and its inputs, this week's sessions, the next goal and
 * trip conflicts. Created once per Home mount and handed to every card, so
 * a value two cards share is computed once. Every field is `$derived`, so
 * it's lazy - a hidden card's inputs are never computed.
 */
export class HomeData {
  readonly asOf = new Date();
  readonly todayIso = localIsoDate(this.asOf);
  readonly todayName: DayOfWeek = DAY_NAMES[this.asOf.getDay()];
  readonly todayLabel = formatDate(this.asOf.toISOString());
  readonly currentWeekId = trainingState.currentWeekId;

  // --- Block / phase ---
  dominantBlock = $derived(trainingState.getDominantBlockForWeek(this.currentWeekId));
  currentPhaseName = $derived(
    this.dominantBlock ? trainingState.phaseDefs.find((p) => p.id === this.dominantBlock!.phaseId)?.name : undefined,
  );
  blockWeekPosition = $derived.by(() => {
    const block = this.dominantBlock;
    if (!block) return undefined;
    const weeks = getWeekIdRange(block.startWeekId, block.endWeekId);
    const index = weeks.indexOf(this.currentWeekId);
    return index >= 0 ? { week: index + 1, of: weeks.length } : undefined;
  });

  // --- Readiness and its inputs ---
  fatigueDecay = $derived(computeFatigueDecay(trainingState.completedWorkouts, this.asOf, trainingState.fatigueModel));
  acwr = $derived(calculateRollingAcwr(trainingState.workouts, this.asOf));
  hrvBaseline = $derived(computeHrvBaseline(trainingState.dailyMetrics, this.asOf));
  readiness = $derived(
    computeReadiness({
      fatigue: { fingers: this.fatigueDecay.fingers, core: this.fatigueDecay.core, systemic: this.fatigueDecay.systemic },
      acwr: this.acwr,
      sleep: this.todaysMetric('sleep-score')?.value,
      sleepHours: this.todaysMetric('sleep-duration')?.value,
      napHours: this.todaysMetric('nap-duration')?.value,
      hrv: this.todaysMetric('hrv')?.value,
      hrvBaseline: this.hrvBaseline,
    }, trainingState.readinessConfig),
  );

  /** Today's stored entry for `metricId`, zero or not - what a save/clear acts on. */
  todaysEntry(metricId: string): DailyMetricEntry | undefined {
    return trainingState.dailyMetrics.find((m) => m.metricId === metricId && m.date === this.todayIso);
  }
  /** Today's reading for `metricId` - a stored 0 is "not logged" (`isLoggedMetricValue`), not a reading. */
  todaysMetric(metricId: string): DailyMetricEntry | undefined {
    const entry = this.todaysEntry(metricId);
    return entry && isLoggedMetricValue(entry.value) ? entry : undefined;
  }

  // --- This week ---
  weekWorkouts = $derived(trainingState.getWorkoutsForWeek(this.currentWeekId));
  /** For each day of this week (Mon-Sun), the trip covering it, if any. */
  weekTripDays = $derived.by(() => {
    const start = getWeekDates(this.currentWeekId)?.start;
    const trips = trainingState.goals.filter((g) => g.kind === 'trip');
    return WEEK_DAYS.map((_, i) => {
      if (!start) return undefined;
      const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
      return trips.find((t) => coversDate(t, date));
    });
  });

  // --- Next goal and trips ---
  nextGoal = $derived(upcomingGoals(trainingState.goals, this.todayIso)[0]);
  /** Upcoming trips within the conflict horizon, with how many planned sessions fall during them. */
  tripConflicts = $derived(
    upcomingGoals(trainingState.goals, this.todayIso)
      .filter((g) => g.kind === 'trip' && daysUntilGoal(g, this.todayIso) <= trainingState.tunable('trips.conflictHorizonDays'))
      .map((trip) => {
        const weekIds = new Set<string>();
        for (let i = 0; i < goalLength(trip); i++) weekIds.add(getWeekId(new Date(Date.parse(`${trip.date}T12:00:00Z`) + i * 86400000)));
        const workouts = [...weekIds].flatMap((id) => trainingState.getWorkoutsForWeek(id));
        return { tripName: trip.name, dates: formatGoalDates(trip), count: sessionsDuringTrip(trip, workouts, this.todayIso).length };
      }),
  );
  nextGoalOngoing = $derived(this.nextGoal ? isOngoing(this.nextGoal, this.todayIso) : false);
  daysUntilNextGoal = $derived(this.nextGoal ? daysUntilGoal(this.nextGoal, this.todayIso) : undefined);
}
