<script lang="ts">
  /**
   * Read/edit sheet for one free-text note - a week's `WeekNote` or a
   * block's `notes`. Shared by Plan and Home so both open the same thing.
   * Saving blank text deletes the note (the callers' save paths treat
   * blank as "no note"), which is also what "Clear" does.
   *
   * Lines an AI import added start with "AI: " (`appendAINote`); they're
   * plain text here, editable like everything else - the prefix is only a
   * marker of where they came from.
   */
  import Sheet from '../ui/Sheet.svelte';
  import { showConfirm } from '../../lib/utils';

  let { title, subtitle, text, placeholder = 'Anything worth remembering about this…', onSave, onClose }: {
    title: string;
    subtitle?: string;
    text: string;
    placeholder?: string;
    onSave: (text: string) => Promise<void> | void;
    onClose: () => void;
  } = $props();

  // Seeded once from the note as it was when the sheet opened.
  // svelte-ignore state_referenced_locally
  let draft = $state(text);
  let saving = $state(false);
  const changed = $derived(draft.trim() !== text.trim());

  async function clear() {
    if (!(await showConfirm('Clear this note?', 'The text is deleted and cannot be brought back.', { ok: 'Clear', cancel: 'Keep it' }))) return;
    await save('');
  }

  async function save(value: string) {
    saving = true;
    try {
      await onSave(value);
      onClose();
    } finally {
      saving = false;
    }
  }
</script>

<Sheet {title} {subtitle} icon="ic:outline-sticky-note-2" {onClose} dirty={changed && !saving}>
  <!-- Opens ready to read; typing starts on a tap (an autofocus would raise the keyboard just to read a note). -->
  <textarea
    bind:value={draft}
    {placeholder}
    rows="7"
    aria-label={title}
    class="field leading-relaxed resize-y"
  ></textarea>

  {#snippet footer()}
    <button onclick={() => save(draft)} disabled={saving || !changed} class="btn btn-primary flex-1">Save</button>
    {#if text.trim()}
      <button onclick={clear} disabled={saving} class="btn btn-secondary text-danger">Clear</button>
    {/if}
    <button onclick={onClose} class="btn btn-secondary">Cancel</button>
  {/snippet}
</Sheet>
