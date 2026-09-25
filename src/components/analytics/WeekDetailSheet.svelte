<script lang="ts">
  /**
   * Tap a column on the Load chart: everything about that week (or month,
   * in the year view) in one sheet - sessions planned and done, load against
   * target, recovery averages, the block it belonged to, notes, sends and
   * pain. A session opens in the workout viewer.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import { toUtcDayIndex } from '../../lib/dateUtils';
  import { windowStats } from '../../lib/analytics/windowSummary';
  import { blockSegments } from '../../lib/analytics/timeline';
  import { loggedMetrics } from '../../lib/analytics/metricValues';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { displayGrade } from '../../lib/sends/gradeScale';
  import { formatWeight } from '../../lib/units';
  import { BODYWEIGHT_METRIC_ID } from '../../lib/constants';
  import type { Bucket } from '../../lib/analytics/range';
  import type { AcwrResult } from '../../lib/analytics/loadAnalytics';
  import type { Workout, DayOfWeek } from '../../lib/types';
  import Icon from '@iconify/svelte';

  let { bucket, acwr, onClose }: {
    bucket: Bucket;
    /** The Load chart's ACWR and ramp for this column - its dots are too small to tap on a phone, so they are repeated here. */
    acwr?: AcwrResult;
    onClose: () => void;
  } = $props();
  const acwrZones = $derived(trainingState.acwrZones);
  const acwrClass = $derived(
    !acwr?.sufficient || acwr.ratio === undefined ? 'text-content-subtle'
      : acwr.ratio >= acwrZones.highRisk ? 'text-status-risk'
      : acwr.ratio >= acwrZones.caution ? 'text-status-caution'
      : 'text-status-good',
  );

  const DAY_ORDER: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const span = $derived({ startDay: bucket.startDay, endDay: bucket.endDay });
  const inSpan = (iso: string) => {
    const d = toUtcDayIndex(iso);
    return d >= bucket.startDay && d <= bucket.endDay;
  };
  const fmtDay = (day: number, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, opts);

  const title = $derived(
    bucket.kind === 'week'
      ? `Week ${bucket.label.slice(1)}`
      : fmtDay(bucket.startDay + 10, { month: 'long', year: 'numeric' }),
  );
  const dateRange = $derived(`${fmtDay(bucket.startDay, { day: 'numeric', month: 'short' })} – ${fmtDay(bucket.endDay, { day: 'numeric', month: 'short' })}`);
  const blocks = $derived([...new Set(blockSegments(trainingState.trainingBlocks, trainingState.phaseDefs, bucket.weekIds).map((s) => s.name))]);

  /** Sort key: a completed session by its date, a planned one by its week and weekday. */
  function orderOf(w: Workout): number {
    if (w.date) return toUtcDayIndex(w.date) * 10;
    const weekIndex = bucket.weekIds.indexOf(w.weekId);
    const dayIndex = w.dayOfWeek ? DAY_ORDER.indexOf(w.dayOfWeek) : 6;
    return (bucket.startDay + weekIndex * 7 + dayIndex) * 10 + 1;
  }
  const sessions = $derived(
    bucket.weekIds.flatMap((id) => trainingState.getWorkoutsForWeek(id)).slice().sort((a, b) => orderOf(a) - orderOf(b)),
  );
  const done = $derived(sessions.filter((w) => w.status === 'completed'));
  const plannedLoad = $derived(sessions.reduce((sum, w) => sum + (w.plannedLoad || 0), 0));

  const stats = $derived(windowStats({ workouts: trainingState.workouts, dailyMetrics: trainingState.dailyMetrics, outdoorAscents: trainingState.outdoorAscents }, span));
  const bodyweight = $derived.by(() => {
    const values = loggedMetrics(trainingState.dailyMetrics).filter((m) => m.metricId === BODYWEIGHT_METRIC_ID && inSpan(m.date)).map((m) => m.value);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  });
  const recovery = $derived([
    { label: 'HRV', value: stats.hrv, unit: 'ms' },
    { label: 'Sleep', value: stats.sleep, unit: '' },
    { label: 'RHR', value: stats.rhr, unit: 'bpm' },
  ].filter((r) => r.value !== undefined));

  const notes = $derived(bucket.weekIds.map((id) => ({ weekId: id, text: trainingState.getWeekNote(id) })).filter((n) => n.text.trim()));
  const sends = $derived(trainingState.outdoorAscents.filter((a) => inSpan(a.date)));
  const pain = $derived(trainingState.painLogs.filter((p) => inSpan(p.date)));

  function sessionDay(w: Workout): string {
    if (w.date) {
      const d = new Date(w.date);
      return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`;
    }
    return w.dayOfWeek ? w.dayOfWeek.slice(0, 3) : '–';
  }
  function open(w: Workout) {
    if (w.provisional) return;
    onClose();
    openWorkout(w, 'view');
  }
</script>

<div class="fixed inset-0 bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-md">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1" aria-label="Close"></div>
  <div class="relative bg-surface w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-title text-content">{title}</h3>
        <p class="text-caption text-content-subtle mt-0.5">{dateRange}{blocks.length ? ` · ${blocks.join(', ')}` : ''}</p>
      </div>
      <button onclick={onClose} class="text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <div class="grid grid-cols-3 gap-1.5 text-center">
      <div class="p-2 rounded-control bg-surface-elevated/40">
        <p class="text-body font-semibold text-content tabular-nums">{done.length}<span class="text-content-subtle font-normal">/{sessions.length}</span></p>
        <p class="text-caption text-content-subtle">sessions</p>
      </div>
      <div class="p-2 rounded-control bg-surface-elevated/40">
        <p class="text-body font-semibold text-content tabular-nums">{Math.round(stats.load)}<span class="text-content-subtle font-normal">/{Math.round(plannedLoad)}</span></p>
        <p class="text-caption text-content-subtle">load / target</p>
      </div>
      <div class="p-2 rounded-control bg-surface-elevated/40">
        <p class="text-body font-semibold text-content tabular-nums">{(stats.minutes / 60).toFixed(1)}</p>
        <p class="text-caption text-content-subtle">hours</p>
      </div>
    </div>

    {#if acwr && (acwr.ratio !== undefined || acwr.rampRate)}
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-caption tabular-nums">
        {#if acwr.ratio !== undefined}
          <span><span class="text-content-subtle">ACWR</span> <span class={acwrClass}>{acwr.ratio.toFixed(2)}</span>{!acwr.sufficient ? ' (building history)' : ''}</span>
        {/if}
        {#if acwr.rampRate}
          <span class={acwr.spike ? 'text-status-risk' : 'text-content-muted'}>
            <span class="text-content-subtle">Load vs {bucket.kind === 'week' ? 'week' : 'month'} before</span> {acwr.rampRate > 0 ? '+' : ''}{Math.round(acwr.rampRate * 100)}%{acwr.spike ? ' ⚠' : ''}
          </span>
        {/if}
      </div>
    {/if}

    {#if recovery.length || bodyweight !== undefined}
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-caption text-content-muted tabular-nums">
        {#each recovery as r (r.label)}
          <span><span class="text-content-subtle">{r.label}</span> {Math.round(r.value!)}{r.unit ? ` ${r.unit}` : ''}</span>
        {/each}
        {#if bodyweight !== undefined}
          <span><span class="text-content-subtle">Weight</span> {formatWeight(bodyweight, trainingState.units.weight)}</span>
        {/if}
        <span class="text-content-subtle/70">averages</span>
      </div>
    {/if}

    <div class="space-y-1">
      <h4 class="text-section uppercase text-content-muted">Sessions</h4>
      {#if sessions.length === 0}
        <p class="text-caption text-content-subtle italic">Nothing planned or logged</p>
      {/if}
      {#each sessions as w (w.id)}
        <button
          onclick={() => open(w)}
          disabled={w.provisional}
          class="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-surface-elevated/50 transition-colors disabled:cursor-default"
        >
          <Icon
            icon={w.status === 'completed' ? 'ic:baseline-check-circle' : 'ic:outline-circle'}
            class="text-base shrink-0 {w.status === 'completed' ? 'text-success' : 'text-content-subtle'}"
          />
          <span class="text-caption text-content-subtle w-12 shrink-0 tabular-nums">{sessionDay(w)}</span>
          <span class="text-body text-content truncate flex-1">{w.notes || 'Session'}</span>
          <span class="text-caption text-content-subtle tabular-nums">{Math.round(w.status === 'completed' ? w.loadFactor || 0 : w.plannedLoad || 0)}</span>
        </button>
      {/each}
    </div>

    {#if notes.length}
      <div class="space-y-1">
        <h4 class="text-section uppercase text-content-muted">Notes</h4>
        {#each notes as n (n.weekId)}
          <p class="text-caption text-content-muted whitespace-pre-line leading-relaxed">{#if bucket.kind === 'month'}<span class="text-content-subtle">W{n.weekId.split('-W')[1]} · </span>{/if}{n.text}</p>
        {/each}
      </div>
    {/if}

    {#if sends.length}
      <div class="space-y-1">
        <h4 class="text-section uppercase text-content-muted">Sends</h4>
        <div class="flex flex-wrap gap-1.5">
          {#each sends as s (s.id)}
            <span class="px-2 py-0.5 rounded-control border border-border text-caption text-content-muted">
              <span class="font-semibold text-content">{displayGrade(s.grade, trainingState.units.grades)}</span>{s.name ? ` ${s.name}` : ''}
            </span>
          {/each}
        </div>
      </div>
    {/if}

    {#if pain.length}
      <div class="space-y-1">
        <h4 class="text-section uppercase text-content-muted">Pain</h4>
        {#each pain as p (p.id)}
          <p class="text-caption text-content-muted">
            <span class="text-content-subtle">{new Date(p.date).toLocaleDateString(undefined, { weekday: 'short' })} {new Date(p.date).getDate()}</span>
            {p.bodyPart} · {p.severity}/10{p.notes ? ` · ${p.notes}` : ''}
          </p>
        {/each}
      </div>
    {/if}
  </div>
</div>
