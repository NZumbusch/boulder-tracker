<script lang="ts">
  /** Things worth a look (lib/alerts/alerts.ts). The card hides when there are none. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { buildAlerts, type AlertSeverity } from '../../../lib/alerts/alerts';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const alerts = $derived(
    buildAlerts({
      asOf: data.asOf,
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
      tripConflicts: data.tripConflicts,
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
</script>

{#if alerts.length > 0}
  <div class="card space-y-3">
    <SectionHeader label="Alerts" />
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
