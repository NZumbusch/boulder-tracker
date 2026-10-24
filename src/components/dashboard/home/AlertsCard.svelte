<script lang="ts">
  import { openPainIssue } from '../../../lib/pain/painUi.svelte';
  /** Things worth a look (lib/alerts/alerts.ts). The card hides when there are none. */
  import { trainingState } from '../../../lib/state.svelte';
  import { Capacitor } from '@capacitor/core';
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
      painIssues: trainingState.painIssues,
      lastBackupAt: trainingState.lastBackupAt,
      wearableDataEndsOn: trainingState.dailyMetrics.filter((m) => m.source === 'garmin').reduce<string | undefined>((latest, m) => (!latest || m.date > latest ? m.date : latest), undefined),
      noAutoBackup: !Capacitor.isNativePlatform(),
      enabled: {
        recovery: trainingState.homeDetails['alerts.recovery'],
        pain: trainingState.homeDetails['alerts.pain'],
        missingData: trainingState.homeDetails['alerts.missingData'],
        // Example data must never be exported as a backup.
        backup: trainingState.homeDetails['alerts.backup'] && !trainingState.demoActive,
        tripConflict: trainingState.homeDetails['alerts.tripConflict'],
        wearableImport: trainingState.homeDetails['alerts.wearableImport'] && !trainingState.demoActive,
      },
      tripConflicts: data.tripConflicts,
      config: {
        restDays: trainingState.tunable('alerts.restDays'),
        backupDays: trainingState.tunable('alerts.backupDays'),
        wearableDays: trainingState.tunable('alerts.wearableDays'),
        acwrHighRisk: trainingState.acwrZones.highRisk,
      },
    }),
  );
  /** Severity is an icon and a word as well as a colour. */
  const SEVERITY: Record<AlertSeverity, { icon: string; color: string; word: string }> = {
    risk: { icon: 'ic:baseline-warning', color: 'text-status-risk', word: 'Warning' },
    caution: { icon: 'ic:baseline-warning-amber', color: 'text-status-caution', word: 'Caution' },
    info: { icon: 'ic:baseline-info', color: 'text-status-neutral', word: 'Note' },
  };
  /** Housekeeping (backups, gaps in the data, unrated sessions) is kept apart from signals about training and health. */
  const isHousekeeping = (a: { id: string }) => a.id === 'backup' || a.id === 'wearable-import' || a.id.startsWith('gap-') || a.id.startsWith('unrated-');
  const signals = $derived(alerts.filter((a) => !isHousekeeping(a)));
  const housekeeping = $derived(alerts.filter(isHousekeeping));
  function rateSession(workoutId: string) {
    const workout = trainingState.workouts.find((w) => w.id === workoutId);
    if (workout) trainingState.openFatigueModal(workout);
  }
  function run(alert: (typeof alerts)[number]) {
    if (alert.exportBackup) void trainingState.exportData();
    else if (alert.openImport) trainingState.uiStore.openSettingsPage('activityImport');
    else if (alert.painIssueId) openPainIssue(alert.painIssueId);
    else if (alert.rateWorkoutId) rateSession(alert.rateWorkoutId);
  }
</script>

{#snippet row(alert: (typeof alerts)[number])}
  {@const sev = SEVERITY[alert.severity]}
  {@const tappable = !!(alert.exportBackup || alert.painIssueId || alert.rateWorkoutId)}
  {#snippet inner()}
    <span class="text-body h-[1lh] shrink-0 flex items-center {sev.color}"><Icon icon={sev.icon} class="text-base" /><span class="sr-only">{sev.word}: </span></span>
    <span class="text-body text-content flex-1">{alert.text}</span>
    {#if tappable}<span class="text-body h-[1lh] shrink-0 flex items-center"><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-lg" /></span>{/if}
  {/snippet}
  {#if tappable}
    <button onclick={() => run(alert)} class="w-full min-h-11 flex items-start gap-2.5 text-left py-2 hover:bg-surface-elevated/40 rounded-control -mx-1 px-1 transition-colors">{@render inner()}</button>
  {:else}
    <div class="flex items-start gap-2.5 py-1.5">{@render inner()}</div>
  {/if}
{/snippet}

{#if alerts.length > 0}
  <div class="card space-y-2">
    <SectionHeader label="Alerts" subtitle={signals.length > 0 ? `${signals.length} to look at` : undefined} />
    {#each signals as alert (alert.id)}{@render row(alert)}{/each}
    {#if housekeeping.length > 0}
      <div class="{signals.length > 0 ? 'pt-2 border-t border-border/60' : ''} space-y-0.5">
        {#if signals.length > 0}<p class="text-caption text-content-subtle">Housekeeping</p>{/if}
        {#each housekeeping as alert (alert.id)}{@render row(alert)}{/each}
      </div>
    {/if}
  </div>
{/if}
