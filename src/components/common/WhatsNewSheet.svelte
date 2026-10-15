<script lang="ts">
  /**
   * After an update: what is new in short notes (`lib/releaseNotes.ts`) and
   * what the update needs from you, worked out from your data - tests to
   * review, nothing fixed. Shown once per device per release, never over the
   * welcome screens or a running session; "Not now" still counts as seen,
   * and About → What's new keeps the history.
   */
  import Sheet from '../ui/Sheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { tour } from '../../lib/tour/tour.svelte';
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
</script>

{#if open}
  <Sheet title="What's new" subtitle="Since you last opened the app. Every change is listed under About → What's new." level="top" onClose={close}>
    {#if needsAction}
      <div class="rounded-card bg-status-caution/10 p-3.5 space-y-2" data-testid="whatsnew-actions">
        <p class="text-label font-semibold text-content">Needs a look</p>
        <ul class="space-y-1 text-body text-content-muted leading-relaxed list-disc pl-4">
          {#if actions.weighIn}<li>Weigh-ins are still kept as a test. Move them to your bodyweight readings (nothing is deleted; Undo is offered).</li>{/if}
          {#each actions.tidyLabels as label (label)}<li>{label} - suggested, you decide.</li>{/each}
        </ul>
        <button onclick={reviewTests} class="btn btn-primary w-full">Review your tests</button>
      </div>
    {/if}

    {#if adopted.length > 0}
      <p class="text-body text-content-muted leading-relaxed px-1">
        Already done for you: {adopted.map((a) => `${a.name} still shows ${a.views.join(', ')} on Home`).join('; ')}.
      </p>
    {/if}

    <div class="space-y-4">
      {#each notes as n (n.id)}
        <section class="space-y-1.5">
          <h4 class="text-body font-semibold text-content">{n.title}</h4>
          <ul class="space-y-1 text-body text-content-muted leading-relaxed list-disc pl-4">
            {#each n.points as p}<li>{p}</li>{/each}
          </ul>
        </section>
      {/each}
    </div>

    {#snippet footer()}
      <button onclick={close} class="btn {needsAction ? 'btn-secondary' : 'btn-primary'} flex-1">{needsAction ? 'Not now' : 'Got it'}</button>
    {/snippet}
  </Sheet>
{/if}
