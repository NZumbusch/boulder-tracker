<script lang="ts">
  /**
   * Everything written down for the running session, readable in full:
   * the session's own notes (the header only has room for two lines), the
   * week's note, and each exercise's notes in order. Read first - the
   * keyboard only comes up when the user chooses to edit the session notes.
   */
  import Sheet from '../ui/Sheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { slotTypeName, planNote, logNote } from '../../lib/exerciseSlot';
  import Icon from '@iconify/svelte';

  const store = trainingState.sessionStore;
  let { onClose: close }: { onClose: () => void } = $props();

  const workout = $derived(store.workout);
  const weekNote = $derived(workout?.weekId ? trainingState.getWeekNote(workout.weekId) : '');
  const exerciseNotes = $derived(
    (workout?.exercises ?? [])
      .map((slot, i) => ({ index: i + 1, name: slotTypeName(slot, trainingState.exerciseTypes), text: planNote(slot), logged: logNote(slot) }))
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

  /** Leaving with the editor open keeps what was typed rather than dropping it. */
  function onClose() {
    if (editing && draft.trim() !== (workout?.description ?? '').trim()) save();
    close();
  }
</script>

<Sheet title={workout?.notes || 'Session'} subtitle="Notes" level="nested" {onClose}>
  <section class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <h4 class="text-section uppercase text-content-muted">Session notes</h4>
      {#if !editing}
        <button onclick={startEdit} class="btn btn-quiet px-3 text-label text-content-subtle hover:text-primary gap-1">
          <Icon icon="ic:baseline-edit" class="text-sm" /> {workout?.description ? 'Edit' : 'Add'}
        </button>
      {/if}
    </div>
    {#if editing}
      <textarea
        bind:value={draft}
        rows="6"
        aria-label="Session notes"
        placeholder="Anything worth remembering about this session…"
        class="field leading-relaxed resize-y"
      ></textarea>
      <div class="flex gap-2">
        <button onclick={save} class="btn btn-primary flex-1">Save</button>
        <button onclick={() => editing = false} class="btn btn-ghost">Cancel</button>
      </div>
    {:else if workout?.description}
      <p class="text-body text-content whitespace-pre-wrap break-words leading-relaxed">{workout.description}</p>
    {:else}
      <button onclick={startEdit} class="text-caption text-content-subtle hover:text-primary text-left min-h-11">No notes for this session. Add a note</button>
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
          {#if e.logged}<p class="text-caption text-content whitespace-pre-wrap break-words"><span class="text-content-subtle">How it went:</span> {e.logged}</p>{/if}
        </div>
      {/each}
    </section>
  {/if}
</Sheet>
