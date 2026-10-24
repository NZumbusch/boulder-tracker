<script lang="ts">
  /**
   * What the load ratio (ACWR) is made of: the last 28 days in four 7-day blocks,
   * each with its load and the sessions in it, and the sum that gives the
   * ratio. The same windows `calculateRollingAcwr` uses.
   */
  import Icon from '@iconify/svelte';
  import Sheet from '../../ui/Sheet.svelte';
  import { trainingState } from '../../../lib/state.svelte';
  import { acwrSheet } from '../../../lib/help/acwrSheet.svelte';
  import { showInfo } from '../../../lib/help/infoSheet.svelte';
  import { askAboutInsights } from '../../../lib/ai/askAbout.svelte';
  import { calculateAcwrBreakdown } from '../../../lib/analytics/loadAnalytics';
  import { acwrZone, ACWR_PILL } from '../../../lib/home/acwrZone';
  import { formatDay } from '../../../lib/dateUtils';

  const close = () => (acwrSheet.open = false);

  const breakdown = $derived(acwrSheet.open ? calculateAcwrBreakdown(trainingState.workoutsForLoad, trainingState.today) : undefined);
  const zones = $derived(trainingState.acwrZones);
  const maxLoad = $derived(Math.max(1, ...(breakdown?.blocks.map((b) => b.load) ?? [0])));
  const BLOCK_LABELS = ['Last 7 days', '8-14 days ago', '15-21 days ago', '22-28 days ago'];

  const day = (iso: string) => formatDay(iso);
  const short = (iso: string) => formatDay(iso, { weekday: 'short' });
  const n = (v: number) => Math.round(v).toLocaleString();

  const zone = $derived(breakdown?.sufficient ? acwrZone(breakdown.ratio, zones) : undefined);
</script>

{#if acwrSheet.open && breakdown}
  <Sheet title="Load ratio (ACWR)" subtitle="Last 7 days against your usual week" level="nested" onClose={close}>
    {#if breakdown.ratio !== undefined}
      <div>
        <p class="text-metric tabular-nums">{breakdown.ratio.toFixed(2)}</p>
        {#if zone}
          <p class="text-body text-content-muted mt-1 flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded-full text-caption font-semibold {ACWR_PILL[zone.status]}">{zone.label}</span>
            <span>{zone.meaning}</span>
          </p>
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
            <p class="text-label text-content">{BLOCK_LABELS[block.index] ?? `${block.index * 7 + 1}-${block.index * 7 + 7} days ago`} <span class="text-content-subtle font-normal">· {day(block.from)} to {day(block.to)}</span></p>
            <p class="text-label tabular-nums text-content">{n(block.load)} <span class="text-caption text-content-subtle font-normal">load</span></p>
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
      <p>Zones: {zones.sweetMin} to {zones.caution} sweet spot · above {zones.caution} caution · above {zones.highRisk} high risk · below {zones.sweetMin} low (less than you are used to, fine for a rest week). Readiness takes points off from the high-risk ratio up.</p>
    </div>

    {#snippet footer()}
      <button class="btn btn-secondary" onclick={() => showInfo('acwr')}>What is ACWR?</button>
      <button class="btn btn-secondary" onclick={() => { close(); askAboutInsights('push'); }}><Icon icon="ic:baseline-auto-awesome" class="text-base" />Ask the AI</button>
    {/snippet}
  </Sheet>
{/if}
