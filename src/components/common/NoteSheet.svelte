<script lang="ts">
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { keyboardAware } from '../../lib/ui/keyboardAware';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
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
  import Icon from '@iconify/svelte';

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

  async function save(value: string) {
    saving = true;
    try {
      await onSave(value);
      onClose();
    } finally {
      saving = false;
    }
  }

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onClose());
</script>

<div class="fixed inset-0 pb-safe bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-md">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1" aria-label="Close note"></div>
  <div class="relative bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={() => onClose()} use:keyboardAware>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-title text-content flex items-center gap-2">
          <Icon icon="ic:outline-sticky-note-2" class="text-primary text-xl shrink-0" />
          <span class="truncate">{title}</span>
        </h3>
        {#if subtitle}<p class="text-caption text-content-subtle mt-0.5">{subtitle}</p>{/if}
      </div>
      <button onclick={onClose} class="text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <!-- svelte-ignore a11y_autofocus -->
    <textarea
      bind:value={draft}
      {placeholder}
      rows="7"
      autofocus
      class="w-full bg-surface-elevated/50 text-content p-3 rounded-control border border-border-strong outline-none text-sm leading-relaxed resize-y focus:border-primary/60"
    ></textarea>

    <div class="flex gap-2">
      <button
        onclick={() => save(draft)}
        disabled={saving || !changed}
        class="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-control disabled:opacity-40 transition-opacity"
      >
        Save
      </button>
      {#if text.trim()}
        <button
          onclick={() => save('')}
          disabled={saving}
          class="px-4 py-3 bg-surface-elevated text-content-muted hover:text-danger text-sm font-bold rounded-control transition-colors"
        >
          Clear
        </button>
      {/if}
      <button onclick={onClose} class="px-4 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
    </div>
  </div>
</div>
