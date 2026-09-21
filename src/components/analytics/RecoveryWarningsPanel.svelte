<script lang="ts">
  /**
   * Recovery/rest-day warnings panel (PLAN.md Phase 4): consecutive
   * training days, or a load spike alongside declining readiness metrics.
   */
  import type { RecoveryWarning } from '../../lib/analytics/loadAnalytics';
  import type { PainLoadCorrelation } from '../../lib/analytics/loadAnalytics';
  import Icon from "@iconify/svelte";

  let { warnings, painCorrelations }: { warnings: RecoveryWarning[]; painCorrelations: PainLoadCorrelation[] } = $props();

  const flaggedPainLogs = $derived(painCorrelations.filter((p) => p.loadSpikeNearby));
</script>

<div class="bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-section uppercase text-content-muted">Recovery Warnings</h3>
      <p class="text-caption text-content-subtle mt-0.5">Overtraining and injury-risk signals</p>
    </div>
    <Icon icon="ic:baseline-warning" class="text-base {warnings.length > 0 ? 'text-danger' : 'text-content-subtle'}" />
  </div>

  <div class="space-y-2">
    {#each warnings as w}
      <div class="flex items-start gap-2.5 p-3 bg-danger/5 border border-danger/20 rounded-control">
        <Icon icon="ic:baseline-warning" class="text-danger text-sm mt-0.5 flex-shrink-0" />
        <div>
          <p class="text-label text-content-subtle">{w.date}</p>
          <p class="text-body text-content mt-0.5">{w.reason}</p>
        </div>
      </div>
    {/each}

    {#each flaggedPainLogs as p}
      <div class="flex items-start gap-2.5 p-3 bg-warning/5 border border-warning/20 rounded-control">
        <Icon icon="ic:baseline-personal-injury" class="text-warning text-sm mt-0.5 flex-shrink-0" />
        <div>
          <p class="text-label text-content-subtle">{p.date} · {p.bodyPart}</p>
          <p class="text-body text-content mt-0.5">Severity {p.severity}/10, logged near a training load spike</p>
        </div>
      </div>
    {/each}

    {#if warnings.length === 0 && flaggedPainLogs.length === 0}
      <p class="text-caption text-content-subtle italic text-center py-4">No warnings - recovery looks on track</p>
    {/if}
  </div>
</div>
