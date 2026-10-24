<script lang="ts">
  /**
   * One exercise's page: its trend over the sessions it was logged in (the
   * heaviest set, the longest hold, the most reps or the volume), its
   * records and when they were set, and the last sessions in numbers.
   */
  import Icon from '@iconify/svelte';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { exerciseProgressState } from '../../lib/analytics/exerciseProgress.svelte';
  import { exerciseHistory, metricsOf, recordsOf, valueOf, type ExerciseSession, type ProgressMetric } from '../../lib/analytics/exerciseProgress';
  import { displayWeight } from '../../lib/units';

  const close = () => (exerciseProgressState.typeId = null);
  backWhile(() => exerciseProgressState.typeId !== null, close);

  const typeId = $derived(exerciseProgressState.typeId);
  const name = $derived(trainingState.exerciseTypes.find((t) => t.id === typeId)?.name ?? 'Exercise');
  const history = $derived(typeId ? exerciseHistory(trainingState.workouts, typeId, trainingState.today) : []);
  const metrics = $derived(metricsOf(history));
  let chosen = $state<ProgressMetric | null>(null);
  $effect(() => { typeId; chosen = null; });
  const metric = $derived<ProgressMetric>(chosen && metrics.includes(chosen) ? chosen : metrics[0] ?? 'reps');
  const records = $derived(recordsOf(history));

  const LABEL: Record<ProgressMetric, string> = { weight: 'Weight', timeOn: 'Hold', reps: 'Reps', volume: 'Volume' };
  const wUnit = $derived(trainingState.units.weight);
  const w = (kg: number) => `${Math.round(displayWeight(kg, wUnit) * 10) / 10} ${wUnit}`;
  function fmt(v: number): string {
    return metric === 'weight' ? w(v) : metric === 'timeOn' ? `${v} s` : metric === 'reps' ? `${v} reps` : `${Math.round(v).toLocaleString()}`;
  }
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });

  const points = $derived(history.map((s) => ({ s, v: valueOf(s, metric) })).filter((p): p is { s: ExerciseSession; v: number } => p.v !== undefined && p.v > 0));
  const lo = $derived(Math.min(...points.map((p) => p.v)));
  const hi = $derived(Math.max(...points.map((p) => p.v)));
  const d0 = $derived(points[0]?.s.day ?? 0);
  const dSpan = $derived((points[points.length - 1]?.s.day ?? 0) - d0 || 1);
  const x = (d: number) => 8 + ((d - d0) / dSpan) * 284;
  const y = (v: number) => 104 - ((v - lo) / ((hi - lo) || 1)) * 88;
  let picked = $state<number | null>(null);
  $effect(() => { typeId; metric; picked = null; });
  const readout = $derived(points[picked ?? points.length - 1]);

  function sessionText(s: ExerciseSession): string {
    const parts: string[] = [];
    if (s.sets > 0 && s.reps) parts.push(`${s.sets}×${s.reps}`);
    else if (s.reps) parts.push(`${s.reps} reps`);
    if (s.weight) parts.push(`@ ${w(s.weight)}`);
    if (s.timeOn) parts.push(`${s.timeOn} s`);
    return parts.join(' ');
  }
  const recent = $derived([...history].reverse().slice(0, 6));
</script>

{#if typeId}
  <div class="fixed inset-0 z-[150] pb-safe bg-app-bg/90 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-150">
    <div class="absolute inset-0" role="presentation" onclick={close}></div>
    <div class="relative bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={close} role="dialog" aria-modal="true" aria-label="{name} progress">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-title text-content truncate">{name}</h3>
          <p class="text-caption text-content-subtle">{history.length} session{history.length === 1 ? '' : 's'} logged</p>
        </div>
        <button onclick={close} class="btn-icon shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
      </div>

      {#if points.length === 0}
        <p class="text-body text-content-muted">Nothing with weight, time or reps has been logged for this exercise yet.</p>
      {:else}
        {#if metrics.length > 1}
          <div class="flex bg-surface-elevated/50 p-0.5 rounded-control" role="group" aria-label="What to follow">
            {#each metrics as m (m)}
              <button onclick={() => (chosen = m)} aria-pressed={metric === m} class="flex-1 min-h-10 text-caption rounded-control {metric === m ? 'bg-surface text-content shadow-sm' : 'text-content-subtle'}">{LABEL[m]}</button>
            {/each}
          </div>
        {/if}

        <div class="space-y-1">
          <p class="text-body tabular-nums"><span class="text-metric">{fmt(readout.v)}</span> <span class="text-caption text-content-subtle">{date(readout.s.date)}{sessionText(readout.s) ? ` · ${sessionText(readout.s)}` : ''}</span></p>
          <svg viewBox="0 0 300 120" class="w-full h-32" role="img" aria-label="{name}, {LABEL[metric]} over time">
            <line x1="8" x2="292" y1="16" y2="16" stroke="currentColor" class="text-border" stroke-width="0.5" />
            <line x1="8" x2="292" y1="104" y2="104" stroke="currentColor" class="text-border" stroke-width="0.5" />
            <polyline points={points.map((p) => `${x(p.s.day).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" class="text-series-1" stroke-width="1.5" stroke-linejoin="round" />
            {#each points as p, i (p.s.workoutId)}
              <circle cx={x(p.s.day)} cy={y(p.v)} r={i === (picked ?? points.length - 1) ? 4 : 2.5} class="fill-series-1" />
              <circle cx={x(p.s.day)} cy={y(p.v)} r="19" fill="transparent" role="button" tabindex="0" aria-label="{date(p.s.date)}: {fmt(p.v)}" onclick={() => (picked = i)} onpointerenter={(e) => { if (e.pointerType === 'mouse') picked = i; }} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picked = i; } }} />
            {/each}
            <text x="8" y="12" class="fill-content-subtle" font-size="11">{fmt(hi)}</text>
            <text x="8" y="116" class="fill-content-subtle" font-size="11">{fmt(lo)}</text>
          </svg>
          <p class="text-caption text-content-subtle px-1">Hover or tap a point for that session.</p>
        </div>

        <div class="space-y-1">
          <p class="text-label text-content-subtle px-1">Records</p>
          <div class="divide-y divide-border text-body">
            {#if records.heaviest}<div class="flex justify-between py-1.5"><span class="text-content-muted">Heaviest</span><span class="tabular-nums text-content">{w(records.heaviest.weight)}{records.heaviest.reps ? ` × ${records.heaviest.reps}` : ''} <span class="text-content-subtle text-caption">{date(records.heaviest.date)}</span></span></div>{/if}
            {#if records.longestHold}<div class="flex justify-between py-1.5"><span class="text-content-muted">Longest hold</span><span class="tabular-nums text-content">{records.longestHold.seconds} s <span class="text-content-subtle text-caption">{date(records.longestHold.date)}</span></span></div>{/if}
            {#if records.mostReps}<div class="flex justify-between py-1.5"><span class="text-content-muted">Most reps in a set</span><span class="tabular-nums text-content">{records.mostReps.reps} <span class="text-content-subtle text-caption">{date(records.mostReps.date)}</span></span></div>{/if}
            {#if records.bestVolume && history.length > 1}<div class="flex justify-between py-1.5"><span class="text-content-muted">Best volume</span><span class="tabular-nums text-content">{Math.round(records.bestVolume.volume).toLocaleString()} <span class="text-content-subtle text-caption">{date(records.bestVolume.date)}</span></span></div>{/if}
          </div>
        </div>

        <div class="space-y-1">
          <p class="text-label text-content-subtle px-1">Last sessions</p>
          <div class="divide-y divide-border">
            {#each recent as s (s.workoutId)}
              <div class="flex justify-between gap-3 py-1.5 text-body"><span class="text-content-subtle shrink-0">{date(s.date)}</span><span class="text-content tabular-nums truncate">{sessionText(s) || '–'}</span></div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
