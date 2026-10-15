<script lang="ts">
  /**
   * Appearance -> History & Analytics: how the charts draw - how the
   * recovery chart lays out HRV/sleep/RHR, and whether History's
   * sends-by-grade chart prints each bar's count. (The Analytics range is
   * picked, and remembered, in the Analytics header itself.)
   */
  import { trainingState } from '../../lib/state.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';
</script>

<div class="card space-y-5 animate-in fade-in">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Recovery chart</h2>
    <p class="text-caption text-content-subtle px-1">HRV, sleep and resting heart rate together as a percentage of your own baseline (easiest to compare), or as three rows in their real units. The chart's own toggle changes this too.</p>
    <Segmented
      variant="setting"
      full
      label="Recovery chart layout"
      value={trainingState.recoveryChartMode}
      onChange={(v) => trainingState.setRecoveryChartMode(v)}
      options={[{ value: 'overlay', label: '% vs baseline' }, { value: 'lanes', label: 'Separate rows' }]}
    />
  </div>

  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Sends by grade</h2>
    <Toggle
      checked={trainingState.sendsChartCounts}
      onChange={(v) => trainingState.setSendsChartCounts(v)}
      label="Show counts on the bars"
      hint="History → Sends. Tapping a bar always shows its count."
    />
  </div>
</div>
