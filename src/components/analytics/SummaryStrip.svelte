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
  import type { InsightLink } from '../../lib/analytics/insights';

  let { current, previous, comparisonLabel, logged, onOpen }: {
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
    /** A tile opens the chart behind it (its tab, scrolled to its card). */
    onOpen?: (link: InsightLink) => void;
  } = $props();

  /** `delta` is a percentage, or - for counts, where "+100%" of two is noise - the plain difference (`count`). */
  type Tile = { label: string; value: string; delta?: number; count?: boolean; sense: 'neutral' | 'higher' | 'lower'; link: InsightLink };
  const LOAD: InsightLink = { kind: 'panel', tab: 'overview', section: 'section-load' };
  const RECOVERY: InsightLink = { kind: 'panel', tab: 'recovery', section: 'section-recoveryTrend' };
  const SENDS: InsightLink = { kind: 'panel', tab: 'progress', section: 'section-outdoor' };

  function hours(minutes: number): string {
    const h = minutes / 60;
    return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
  }

  const tiles = $derived.by(() => {
    const t: Tile[] = [
      { label: 'Sessions', value: String(current.sessions), delta: previous ? current.sessions - previous.sessions : undefined, count: true, sense: 'neutral', link: LOAD },
      { label: 'Hours', value: hours(current.minutes), delta: percentChange(current.minutes, previous?.minutes), sense: 'neutral', link: LOAD },
      { label: 'Load', value: Math.round(current.load).toLocaleString(), delta: percentChange(current.load, previous?.load), sense: 'neutral', link: LOAD },
    ];
    const mean = (v: number | undefined) => (v === undefined ? '–' : `${Math.round(v)}`);
    if (logged.hrv) t.push({ label: 'HRV', value: mean(current.hrv), delta: percentChange(current.hrv, previous?.hrv), sense: 'higher', link: RECOVERY });
    if (logged.rhr) t.push({ label: 'RHR', value: mean(current.rhr), delta: percentChange(current.rhr, previous?.rhr), sense: 'lower', link: RECOVERY });
    // One Sleep tile: the score where there are scores, else hours asleep.
    if (logged.sleep && (current.sleep !== undefined || current.sleepHours === undefined)) {
      t.push({ label: 'Sleep', value: mean(current.sleep), delta: percentChange(current.sleep, previous?.sleep), sense: 'higher', link: RECOVERY });
    } else if (logged.sleep) {
      t.push({ label: 'Sleep', value: `${current.sleepHours!.toFixed(1)} h`, delta: percentChange(current.sleepHours, previous?.sleepHours), sense: 'higher', link: RECOVERY });
    }
    if (logged.sends) t.push({ label: 'Sends', value: String(current.sends), delta: previous ? current.sends - previous.sends : undefined, count: true, sense: 'neutral', link: SENDS });
    return t;
  });

  function deltaClass(tile: Tile): string {
    if (tile.delta === undefined || Math.round(tile.delta) === 0 || tile.sense === 'neutral') return 'text-content-subtle';
    const better = tile.sense === 'higher' ? tile.delta > 0 : tile.delta < 0;
    return better ? 'text-status-good' : 'text-status-caution';
  }
</script>

<div class="space-y-1.5">
  <!-- What the changes are against comes first, so the numbers under it read in its light. Nothing to compare in a
       window that has not happened. -->
  <p class="text-caption text-content-subtle px-1 min-h-[1.25rem]">{previous ? comparisonLabel : 'Nothing to compare with yet'}</p>
  <div class="grid gap-1.5" style="grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));">
    {#each tiles as tile (tile.label)}
      <button
        type="button"
        onclick={() => onOpen?.(tile.link)}
        class="px-2.5 py-2 min-h-11 rounded-control bg-surface-elevated/50 text-left hover:bg-surface-elevated transition-colors"
      >
        <span class="block text-caption text-content-subtle leading-tight">{tile.label}</span>
        <span class="flex items-baseline justify-between gap-1">
          <span class="text-body font-semibold text-content tabular-nums">{tile.value}</span>
          {#if tile.delta !== undefined}
            <span class="flex items-center text-caption tabular-nums {deltaClass(tile)}">
              <span class="sr-only">{Math.round(tile.delta) > 0 ? 'up' : Math.round(tile.delta) < 0 ? 'down' : 'no change'}</span>
              <Icon icon={tile.delta >= 0 ? 'ic:baseline-arrow-drop-up' : 'ic:baseline-arrow-drop-down'} class="text-base -mx-1" aria-hidden="true" />{Math.round(tile.delta) > 0 ? '+' : Math.round(tile.delta) < 0 ? '−' : '±'}{Math.abs(Math.round(tile.delta))}{tile.count ? '' : '%'}
            </span>
          {/if}
        </span>
      </button>
    {/each}
  </div>
</div>
