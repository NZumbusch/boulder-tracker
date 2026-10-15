<script lang="ts">
  /**
   * A look back over a training block (`lib/analytics/blockReview.ts`): how
   * many sessions were done of those due, how the weekly load moved, where
   * the time went, which tests changed and what was sent. Opened from the
   * Insights finding for a block that just ended and from the block list.
   */
  import Icon from '@iconify/svelte';
  import InfoButton from '../common/InfoButton.svelte';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { blockReviewState } from '../../lib/analytics/blockReview.svelte';
  import { askAboutBlock } from '../../lib/ai/askAbout.svelte';
  import { blockInputsFrom } from '../../lib/analytics/insights';
  import { buildBlockReview } from '../../lib/analytics/blockReview';
  import { weekDatesText } from '../../lib/dateUtils';

  const close = () => (blockReviewState.blockId = null);
  backWhile(() => blockReviewState.blockId !== null, close);

  const block = $derived(trainingState.trainingBlocks.find((b) => b.id === blockReviewState.blockId));
  const review = $derived(block ? buildBlockReview(blockInputsFrom(trainingState.insightInputs(), block)) : undefined);
  const maxLoad = $derived(Math.max(1, ...(review?.weeklyLoad.map((w) => w.load) ?? [0])));
  const n0 = (v: number) => Math.round(v).toLocaleString();
  const wk = (id: string) => `W${id.split('-W')[1]}`;
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}%`;
  const avgLoad = $derived.by(() => {
    const done = review?.weeklyLoad.filter((w) => w.load > 0) ?? [];
    return done.length ? done.reduce((s, w) => s + w.load, 0) / done.length : 0;
  });
</script>

{#if block && review}
  <div class="fixed inset-0 z-[150] pb-safe bg-app-bg/90 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-150">
    <div class="absolute inset-0" role="presentation" onclick={close}></div>
    <div class="relative bg-surface w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={close} role="dialog" aria-modal="true" aria-label="Review of {block.name}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-title text-content truncate">{block.name}</h3>
          <p class="text-caption text-content-subtle">{wk(review.from)}–{wk(review.to)} · {weekDatesText(review.from, review.to)}{review.running ? ' · still running' : ''}</p>
        </div>
        <button onclick={close} class="btn-icon shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="tile">
          <p class="text-caption text-content-subtle">Sessions</p>
          <p class="text-body font-semibold tabular-nums">{review.sessions.done}{review.sessions.planned ? ` / ${review.sessions.planned}` : ''}</p>
        </div>
        <div class="tile">
          <p class="text-caption text-content-subtle flex items-center gap-1">Load a week <InfoButton term="load" /></p>
          <p class="text-body font-semibold tabular-nums">{avgLoad ? `${n0(avgLoad)} pts` : '–'}</p>
        </div>
        <div class="tile">
          <p class="text-caption text-content-subtle">Load change, first to last week</p>
          <p class="text-body font-semibold tabular-nums">{review.loadChange !== undefined ? signed(review.loadChange) : '–'}</p>
        </div>
      </div>

      <div class="space-y-1.5">
        <p class="text-label text-content-subtle px-1">Load per week (points)</p>
        <div class="flex items-end gap-1.5 h-24">
          {#each review.weeklyLoad as w (w.weekId)}
            <div class="flex-1 min-w-0 flex flex-col items-center justify-end gap-1 h-full">
              <span class="text-micro text-content-muted tabular-nums">{n0(w.load)}</span>
              <div class="w-full rounded-t-[3px] bg-series-1/60" style="height: {Math.max(2, (w.load / maxLoad) * 70)}%"></div>
              <span class="text-micro text-content-subtle tabular-nums">{wk(w.weekId)}</span>
            </div>
          {/each}
        </div>
      </div>

      {#if review.mix.length}
        <div class="space-y-1.5">
          <p class="text-label text-content-subtle px-1">Where the time went</p>
          <div class="flex flex-wrap gap-1.5">
            {#each review.mix as m (m.name)}
              <span class="px-2 py-0.5 rounded-control border border-border text-caption"><span class="text-content-muted">{m.name}</span> <span class="text-content tabular-nums">{Math.round(m.share * 100)}%</span></span>
            {/each}
          </div>
        </div>
      {/if}

      {#if review.tests.length}
        <div class="space-y-1.5">
          <p class="text-label text-content-subtle px-1">Tests</p>
          <div class="divide-y divide-border">
            {#each review.tests as t (t.name)}
              <div class="flex items-baseline justify-between gap-3 py-1.5 text-body">
                <span class="text-content truncate">{t.name}</span>
                <span class="tabular-nums shrink-0 {t.change > 0 ? 'text-status-good' : t.change < 0 ? 'text-status-caution' : 'text-content-subtle'}">{signed(t.change)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if review.sends.count}
        <p class="text-body text-content-muted px-1">Outdoor: <span class="text-content">{review.sends.count} send{review.sends.count === 1 ? '' : 's'}</span>{review.sends.hardest ? `, hardest ${review.sends.hardest}` : ''}</p>
      {/if}

      <button onclick={() => { const id = block.id; close(); askAboutBlock(id); }} class="w-full py-3 border border-border-strong rounded-control text-label font-bold text-content flex items-center justify-center gap-1.5">
        <Icon icon="ic:baseline-auto-awesome" class="text-base text-primary" />Ask the AI what to carry on
      </button>
    </div>
  </div>
{/if}
