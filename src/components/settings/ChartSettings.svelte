<script lang="ts">
  /**
   * Appearance -> History & Analytics: how the charts draw - how the
   * recovery chart lays out HRV/sleep/RHR, and whether History's
   * sends-by-grade chart prints each bar's count. (The Analytics range is
   * picked, and remembered, in the Analytics header itself.)
   */
  import { trainingState } from '../../lib/state.svelte';
</script>

<div class="card space-y-5 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Recovery chart</h3>
    <p class="text-caption text-content-subtle px-1">HRV, sleep and resting HR together as % vs your own baseline (easiest to compare), or as three rows in their real units. The chart's own toggle changes this too.</p>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button
        onclick={() => trainingState.setRecoveryChartMode('overlay')}
        class="flex-1 py-2 text-label rounded-control transition-all {trainingState.recoveryChartMode === 'overlay' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
      >
        % vs baseline
      </button>
      <button
        onclick={() => trainingState.setRecoveryChartMode('lanes')}
        class="flex-1 py-2 text-label rounded-control transition-all {trainingState.recoveryChartMode === 'lanes' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
      >
        Separate rows
      </button>
    </div>
  </div>

  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Sends by grade</h3>
    <label class="flex items-center justify-between gap-3 p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 cursor-pointer">
      <div class="min-w-0">
        <p class="text-body text-content">Show counts on the bars</p>
        <p class="text-caption text-content-subtle">History → Sends. Tapping a bar always shows its count.</p>
      </div>
      <input
        type="checkbox"
        checked={trainingState.sendsChartCounts}
        onchange={(e) => trainingState.setSendsChartCounts(e.currentTarget.checked)}
        class="w-5 h-5 rounded accent-primary shrink-0"
      />
    </label>
  </div>
</div>
