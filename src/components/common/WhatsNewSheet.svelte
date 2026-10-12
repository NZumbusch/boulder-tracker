<script lang="ts">
  /**
   * After an update: what is new in short notes (`lib/releaseNotes.ts`) and
   * what the update needs from you, worked out from your data - tests to
   * review, nothing fixed. Shown once per device per release, never over the
   * welcome screens or a running session; "Not now" still counts as seen,
   * and About → What's new keeps the history.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { tour } from '../../lib/tour/tour.svelte';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { RELEASE_NOTES, markNotesSeen, readAdoptedViews, readSeenNote, unseenNotes } from '../../lib/releaseNotes';
  import { pendingTestActions } from '../../lib/benchmarks/pending';

  let open = $state(false);
  let decided = false;
  let notes = $state<typeof RELEASE_NOTES>([]);
  let adopted = $state<{ name: string; views: string[] }[]>([]);

  // Decide once, when loading is over: a fresh install is told nothing (it starts on the newest), an update is told what is new.
  $effect(() => {
    if (decided || trainingState.isLoading) return;
    if (!trainingState.welcomeDone) {
      if (trainingState.workouts.length === 0 && !tour.active) markNotesSeen();
      decided = true;
      return;
    }
    decided = true;
    const unseen = unseenNotes(readSeenNote());
    if (unseen.length === 0) return;
    notes = unseen;
    adopted = readAdoptedViews();
    open = true;
  });

  const actions = $derived(
    open ? pendingTestActions(trainingState.benchmarkTypes, trainingState.benchmarks, trainingState.valueDefs, trainingState.dailyMetrics, trainingState.workouts) : { weighIn: false, tidy: 0, tidyLabels: [] },
  );
  const needsAction = $derived(actions.weighIn || actions.tidy > 0);

  function close() {
    markNotesSeen();
    open = false;
  }
  function reviewTests() {
    close();
    trainingState.uiStore.openSettingsPage('benchmarks');
  }
  backWhile(() => open, close);
</script>

{#if open}
  <div class="fixed inset-0 z-[170] pb-safe bg-app-bg/90 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-150">
    <div class="absolute inset-0" role="presentation" onclick={close}></div>
    <div class="relative bg-surface w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={close} role="dialog" aria-modal="true" aria-label="What's new">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-title text-content">What's new</h3>
          <p class="text-caption text-content-subtle">Since you last opened the app. This stays under About → What's new.</p>
        </div>
        <button onclick={close} class="text-content-subtle hover:text-content shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
      </div>

      {#if needsAction}
        <div class="rounded-card bg-status-caution/10 border border-status-caution/30 p-3.5 space-y-2" data-testid="whatsnew-actions">
          <p class="text-label font-semibold text-content">Needs a look</p>
          <ul class="space-y-1 text-caption text-content-muted leading-relaxed list-disc pl-4">
            {#if actions.weighIn}<li>Weigh-ins are still kept as a test. Move them to your bodyweight readings (nothing is deleted; Undo is offered).</li>{/if}
            {#each actions.tidyLabels as label (label)}<li>{label} - suggested, you decide.</li>{/each}
          </ul>
          <button onclick={reviewTests} class="w-full py-2.5 rounded-control bg-primary text-white text-label font-semibold">Review your tests</button>
        </div>
      {/if}

      {#if adopted.length > 0}
        <p class="text-caption text-content-muted leading-relaxed px-1">
          Already done for you: {adopted.map((a) => `${a.name} keeps a Home row for ${a.views.join(', ')}`).join('; ')}.
        </p>
      {/if}

      <div class="space-y-4">
        {#each notes as n (n.id)}
          <section class="space-y-1.5">
            <h4 class="text-body font-semibold text-content">{n.title}</h4>
            <ul class="space-y-1 text-caption text-content-muted leading-relaxed list-disc pl-4">
              {#each n.points as p}<li>{p}</li>{/each}
            </ul>
          </section>
        {/each}
      </div>

      <button onclick={close} class="w-full py-3 rounded-control border border-border-strong text-label text-content hover:bg-surface-elevated">{needsAction ? 'Not now' : 'Got it'}</button>
    </div>
  </div>
{/if}
