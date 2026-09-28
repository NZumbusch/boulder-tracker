<script lang="ts">
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  /**
   * Everything written down for the running session, readable in full:
   * the session's own notes (the header only has room for two lines), the
   * week's note, and each exercise's notes in order. Read first - the
   * keyboard only comes up when you choose to edit the session notes.
   */
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import Icon from '@iconify/svelte';

  const store = trainingState.sessionStore;
  let { onClose }: { onClose: () => void } = $props();

  const workout = $derived(store.workout);
  const weekNote = $derived(workout?.weekId ? trainingState.getWeekNote(workout.weekId) : '');
  const exerciseNotes = $derived(
    (workout?.exercises ?? [])
      .map((slot, i) => ({ index: i + 1, name: slotTypeName(slot, trainingState.exerciseTypes), text: (slot.prescribed?.notes ?? '').trim(), logged: (slot.logged?.notes ?? '').trim() }))
      .filter((e) => e.text || e.logged),
  );

  let editing = $state(false);
  let draft = $state('');
  function startEdit() {
    draft = workout?.description ?? '';
    editing = true;
  }
  function save() {
    store.updateWorkout({ description: draft.trim() || undefined });
    editing = false;
  }

  backWhile(() => true, () => onClose());
</script>

<div class="fixed inset-0 pb-safe z-[120] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[88vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-4 duration-200" use:sheetDrag={() => onClose()}>
    <div class="sticky top-0 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-caption uppercase text-content-subtle">Notes</p>
        <h3 class="text-title text-content truncate">{workout?.notes || 'Session'}</h3>
      </div>
      <button onclick={onClose} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <div class="p-5 space-y-5">
      <section class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-section uppercase text-content-muted">Session</h4>
          {#if !editing}
            <button onclick={startEdit} class="text-label text-content-subtle hover:text-primary transition-colors flex items-center gap-1">
              <Icon icon="ic:baseline-edit" class="text-sm" /> {workout?.description ? 'Edit' : 'Add'}
            </button>
          {/if}
        </div>
        {#if editing}
          <textarea
            bind:value={draft}
            rows="6"
            placeholder="Anything worth remembering about this session…"
            class="w-full bg-surface-elevated/50 text-content p-3 rounded-control border border-border-strong outline-none text-sm leading-relaxed resize-y focus:border-primary/60"
          ></textarea>
          <div class="flex gap-2">
            <button onclick={save} class="flex-1 py-2.5 bg-primary text-white text-label font-bold rounded-control">Save</button>
            <button onclick={() => editing = false} class="px-4 py-2.5 bg-surface-elevated text-content-muted text-label font-bold rounded-control">Cancel</button>
          </div>
        {:else if workout?.description}
          <p class="text-body text-content whitespace-pre-wrap break-words leading-relaxed">{workout.description}</p>
        {:else}
          <p class="text-caption text-content-subtle italic">No notes for this session.</p>
        {/if}
      </section>

      {#if weekNote}
        <section class="space-y-2">
          <h4 class="text-section uppercase text-content-muted">This week</h4>
          <p class="text-body text-content-muted whitespace-pre-wrap break-words leading-relaxed">{weekNote}</p>
        </section>
      {/if}

      {#if exerciseNotes.length > 0}
        <section class="space-y-3">
          <h4 class="text-section uppercase text-content-muted">Exercises</h4>
          {#each exerciseNotes as e}
            <div class="space-y-0.5">
              <p class="text-label font-bold text-content">{e.index}. {e.name}</p>
              {#if e.text}<p class="text-caption text-content-muted whitespace-pre-wrap break-words">{e.text}</p>{/if}
              {#if e.logged && e.logged !== e.text}<p class="text-caption text-content-subtle italic whitespace-pre-wrap break-words">You: {e.logged}</p>{/if}
            </div>
          {/each}
        </section>
      {/if}
    </div>
  </div>
</div>
