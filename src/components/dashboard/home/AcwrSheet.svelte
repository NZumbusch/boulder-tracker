<script lang="ts">
  /**
   * What the ACWR number is made of: the last 28 days in four 7-day blocks,
   * each with its load and the sessions in it, and the sum that gives the
   * ratio. The same windows `calculateRollingAcwr` uses.
   */
  import Icon from '@iconify/svelte';
  import { sheetDrag } from '../../../lib/ui/sheetDrag';
  import { backWhile } from '../../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../../lib/state.svelte';
  import { acwrSheet } from '../../../lib/help/acwrSheet.svelte';
  import { showInfo } from '../../../lib/help/infoSheet.svelte';
  import { askAboutInsights } from '../../../lib/ai/askAbout.svelte';
  import { calculateAcwrBreakdown } from '../../../lib/analytics/loadAnalytics';

  const close = () => (acwrSheet.open = false);
  backWhile(() => acwrSheet.open, close);

  const breakdown = $derived(acwrSheet.open ? calculateAcwrBreakdown(trainingState.workouts, trainingState.today) : undefined);
  const zones = $derived(trainingState.acwrZones);
  const maxLoad = $derived(Math.max(1, ...(breakdown?.blocks.map((b) => b.load) ?? [0])));
  const BLOCK_LABELS = ['Last 7 days', '8-14 days ago', '15-21 days ago', '22-28 days ago'];

  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const short = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  const n = (v: number) => Math.round(v).toLocaleString();

  const verdict = $derived.by(() => {
    const r = breakdown?.ratio;
    if (!breakdown || r === undefined) return '';
    if (r > zones.highRisk) return 'High risk - a sharp jump on what you are used to';
    if (r > zones.caution) return 'Caution - more than you are used to';
    if (r >= zones.sweetMin) return 'Sweet spot - in line with what you are used to';
    return 'Low - less than you are used to';
  });
</script>

{#if acwrSheet.open && breakdown}
  <div class="fixed inset-0 pb-safe bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[160] backdrop-blur-md animate-in fade-in duration-150">
    <div class="absolute inset-0" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()} role="button" tabindex="-1" aria-label="Close"></div>
    <div class="relative bg-surface w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={close} role="dialog" aria-modal="true" aria-label="What your ACWR is made of">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-title text-content">Load ratio (ACWR)</h3>
          <p class="text-caption text-content-subtle">Last 7 days against your usual week</p>
        </div>
        <button onclick={close} class="text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
          <Icon icon="ic:baseline-close" class="text-xl" />
        </button>
      </div>

      {#if breakdown.ratio !== undefined}
        <div>
          <p class="text-metric tabular-nums">{breakdown.ratio.toFixed(2)}</p>
          {#if breakdown.sufficient}
            <p class="text-body text-content-muted">{verdict}</p>
          {/if}
        </div>
        <p class="text-body text-content-muted tabular-nums">
          {n(breakdown.acuteLoad)} <span class="text-content-subtle">(last 7 days)</span> ÷ {n(breakdown.chronicLoad)} <span class="text-content-subtle">(your usual week: the four blocks below, averaged)</span> = {breakdown.ratio.toFixed(2)}
        </p>
      {/if}

      {#if !breakdown.sufficient}
        <p class="text-caption text-status-caution leading-relaxed">
          {breakdown.insufficientReason === 'break'
            ? `Not counted yet: only ${breakdown.activeWeeks} of the last 4 weeks have a session, and it needs 3. After a break the usual week is tiny, so the ratio would read alarmingly high.`
            : 'Not counted yet: it needs 28 days of history, so the usual week is real training rather than padded with zeros. Readiness ignores it until then.'}
        </p>
      {/if}

      <div class="space-y-3">
        {#each breakdown.blocks as block (block.index)}
          <div class="space-y-1">
            <div class="flex items-baseline justify-between gap-2">
              <p class="text-label text-content">{BLOCK_LABELS[block.index] ?? `${block.index * 7 + 1}-${block.index * 7 + 7} days ago`} <span class="text-content-subtle font-normal">· {day(block.from)} - {day(block.to)}</span></p>
              <p class="text-label tabular-nums text-content">{n(block.load)}</p>
            </div>
            <div class="h-1.5 bg-surface-elevated rounded-full overflow-hidden" aria-hidden="true">
              <div class="h-full rounded-full {block.index === 0 ? 'bg-primary' : 'bg-primary/40'}" style="width: {(block.load / maxLoad) * 100}%"></div>
            </div>
            {#if block.sessions.length}
              <ul class="text-caption text-content-subtle space-y-0.5">
                {#each block.sessions as s}
                  <li class="flex justify-between gap-2"><span class="truncate">{short(s.date)} · {s.name}</span><span class="tabular-nums shrink-0">{n(s.load)}</span></li>
                {/each}
              </ul>
            {:else}
              <p class="text-caption text-content-subtle">No sessions</p>
            {/if}
          </div>
        {/each}
      </div>

      <div class="text-caption text-content-subtle leading-relaxed space-y-1.5 pt-2 border-t border-border/60">
        <p>This is a rolling 7 days ending today, not the calendar week, so it can differ from "This week's" load. Load is each session's rated load.</p>
        <p>Zones: {zones.sweetMin}-{zones.caution} sweet spot · above {zones.caution} caution · above {zones.highRisk} high risk. Readiness takes points off from the high-risk ratio up.</p>
        <div class="flex items-center gap-4">
          <button class="text-primary font-semibold" onclick={() => showInfo('acwr')}>What is ACWR?</button>
          <button class="text-primary font-semibold flex items-center gap-1" onclick={() => { close(); askAboutInsights('push'); }}><Icon icon="ic:baseline-auto-awesome" class="text-sm" />Ask the AI</button>
        </div>
      </div>
    </div>
  </div>
{/if}
