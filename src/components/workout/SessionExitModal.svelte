<script lang="ts">
  /**
   * The "end the session" fork: save what happened, or throw it away.
   *
   * A confirmation step rather than a plain confirm dialog because the two
   * outcomes are genuinely different actions, not yes/no on one - and
   * because discarding is unrecoverable, so it needs to state exactly what
   * is being lost and must never be the easy default. Saving is the
   * primary action; discarding is a quiet destructive one below it.
   */
  import Sheet from '../ui/Sheet.svelte';
  import type { SessionProgress } from '../../lib/session/activeSession';
  import { onDestroy } from 'svelte';
  import Icon from '@iconify/svelte';

  let { progress, elapsedLabel, circuit = null, onSave, onDiscard, onCancel }: {
    progress: SessionProgress;
    elapsedLabel: string;
    /** A circuit or timer that is open: ending logs what it recorded and stops it. */
    circuit?: { name: string; sets: number } | null;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
  } = $props();

  const pending = $derived(progress.total - progress.settled);

  // Discarding takes two taps: the first arms the button, which disarms itself after a few seconds.
  let armed = $state(false);
  let disarm: ReturnType<typeof setTimeout> | undefined;
  function discard() {
    if (armed) { clearTimeout(disarm); onDiscard(); return; }
    armed = true;
    disarm = setTimeout(() => (armed = false), 4000);
  }
  onDestroy(() => clearTimeout(disarm));

  const subtitle = $derived(
    `${progress.done} of ${progress.total} logged${progress.skipped > 0 ? ` · ${progress.skipped} skipped` : ''} · ${elapsedLabel} in`,
  );
</script>

<Sheet title="End this session?" {subtitle} level="nested" onClose={onCancel}>
  <div class="space-y-2.5">
    <button
      onclick={onSave}
      class="w-full p-4 bg-primary hover:bg-primary-hover text-on-primary rounded-card transition-all active:scale-[0.99] text-left flex items-start gap-3"
    >
      <Icon icon="ic:baseline-check-circle" class="text-xl shrink-0 mt-0.5" />
      <span class="min-w-0">
        <span class="text-label font-bold block">Save session</span>
        <span class="text-caption text-on-primary block">
          {#if circuit}
            {circuit.name} is still running: {circuit.sets === 0 ? 'it has no sets yet, so it stops and nothing of it is logged' : `its ${circuit.sets} ${circuit.sets === 1 ? 'set' : 'sets'} so far ${circuit.sets === 1 ? 'is' : 'are'} logged and it stops`}.
          {:else if pending > 0}
            Keeps the {pending} unfinished {pending === 1 ? 'exercise' : 'exercises'} unlogged, so the plan still shows what was missed.
          {:else}
            Records the session and moves on to rating it.
          {/if}
        </span>
      </span>
    </button>

    <button
      onclick={onCancel}
      class="w-full p-4 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-card transition-all active:scale-[0.99] text-left flex items-start gap-3"
    >
      <Icon icon="ic:baseline-play-arrow" class="text-xl shrink-0 mt-0.5 text-success" />
      <span class="min-w-0">
        <span class="text-label font-bold block">Keep going</span>
        <span class="text-caption text-content-subtle block">Back to the session, clock still running.</span>
      </span>
    </button>
  </div>

  <div class="pt-1 border-t border-border space-y-1">
    <p class="text-label text-content-muted text-center px-2 pt-2">
      {#if progress.done > 0}
        Discarding throws away all {progress.done} logged {progress.done === 1 ? 'exercise' : 'exercises'}. The planned session stays planned.
      {:else}
        Nothing has been logged yet. The planned session stays planned.
      {/if}
    </p>
    <button
      onclick={discard}
      class="btn w-full {armed ? 'bg-danger text-on-primary' : 'btn-danger'}"
    >
      <Icon icon="ic:baseline-delete-outline" class="text-base shrink-0" />
      {armed ? 'Tap again to discard' : 'Discard session'}
    </button>
    <p class="sr-only" aria-live="assertive">{armed ? 'Tap discard again to confirm' : ''}</p>
  </div>
</Sheet>
