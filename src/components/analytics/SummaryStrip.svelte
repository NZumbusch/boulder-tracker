<script lang="ts">
  /**
   * The window at a glance: sessions, time, load and recovery averages,
   * each against the window before it (see `lib/analytics/windowSummary.ts`
   * for how a still-running window is compared fairly).
   *
   * Only recovery metrics get a good/bad colour - more load is not better
   * or worse on its own, so training volume deltas stay neutral.
   */
  import { percentChange, type WindowStats } from '../../lib/analytics/windowSummary';
  import Icon from '@iconify/svelte';

  let { current, previous, comparisonLabel, logged }: {
    current: WindowStats;
    previous?: WindowStats;
    /** e.g. "vs the 3 months before" - what the arrows compare against. */
    comparisonLabel: string;
    /**
     * Which optional tiles to show: ones ever logged, not ones with data in
     * this window - so the strip keeps the same tiles (a "–" where the
     * window has none) and doesn't jump while paging into empty weeks.
     */
    logged: { hrv: boolean; rhr: boolean; sleep: boolean; sends: boolean };
  } = $props();

  type Tile = { label: string; value: string; delta?: number; sense: 'neutral' | 'higher' | 'lower' };

  function hours(minutes: number): string {
    const h = minutes / 60;
    return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
  }

  const tiles = $derived.by(() => {
    const t: Tile[] = [
      { label: 'Sessions', value: String(current.sessions), delta: percentChange(current.sessions, previous?.sessions), sense: 'neutral' },
      { label: 'Hours', value: hours(current.minutes), delta: percentChange(current.minutes, previous?.minutes), sense: 'neutral' },
      { label: 'Load', value: Math.round(current.load).toLocaleString(), delta: percentChange(current.load, previous?.load), sense: 'neutral' },
    ];
    const mean = (v: number | undefined) => (v === undefined ? '–' : `${Math.round(v)}`);
    if (logged.hrv) t.push({ label: 'HRV', value: mean(current.hrv), delta: percentChange(current.hrv, previous?.hrv), sense: 'higher' });
    if (logged.rhr) t.push({ label: 'RHR', value: mean(current.rhr), delta: percentChange(current.rhr, previous?.rhr), sense: 'lower' });
    // One Sleep tile: the score where there are scores, else hours asleep.
    if (logged.sleep && (current.sleep !== undefined || current.sleepHours === undefined)) {
      t.push({ label: 'Sleep', value: mean(current.sleep), delta: percentChange(current.sleep, previous?.sleep), sense: 'higher' });
    } else if (logged.sleep) {
      t.push({ label: 'Sleep', value: `${current.sleepHours!.toFixed(1)} h`, delta: percentChange(current.sleepHours, previous?.sleepHours), sense: 'higher' });
    }
    if (logged.sends) t.push({ label: 'Sends', value: String(current.sends), delta: percentChange(current.sends, previous?.sends), sense: 'neutral' });
    return t;
  });

  function deltaClass(tile: Tile): string {
    if (tile.delta === undefined || Math.round(tile.delta) === 0 || tile.sense === 'neutral') return 'text-content-subtle';
    const better = tile.sense === 'higher' ? tile.delta > 0 : tile.delta < 0;
    return better ? 'text-status-good' : 'text-status-caution';
  }
</script>

<div class="space-y-1.5">
  <div class="grid grid-cols-3 gap-1.5">
    {#each tiles as tile (tile.label)}
      <div class="px-2.5 py-2 rounded-control bg-surface/50 border border-border">
        <p class="text-caption text-content-subtle leading-tight">{tile.label}</p>
        <div class="flex items-baseline justify-between gap-1">
          <span class="text-body font-semibold text-content tabular-nums">{tile.value}</span>
          {#if tile.delta !== undefined}
            <span class="flex items-center text-caption tabular-nums {deltaClass(tile)}">
              <Icon icon={tile.delta >= 0 ? 'ic:baseline-arrow-drop-up' : 'ic:baseline-arrow-drop-down'} class="text-base -mx-1" />{Math.abs(Math.round(tile.delta))}%
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
  <!-- The line stays (empty) when there's nothing to compare, e.g. a window in the future. -->
  <p class="text-caption text-content-subtle/70 px-1 min-h-[1.25rem]">{previous ? comparisonLabel : ''}</p>
</div>
