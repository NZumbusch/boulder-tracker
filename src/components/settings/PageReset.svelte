<script lang="ts">
  /**
   * The quiet "Reset this page to defaults" at the foot of a Settings page. It puts back only the preferences and
   * tunables the page owns (`lib/settings/pageReset.ts`), asks first, and offers Undo. Pages with data lists, secrets
   * or sync state do not show it.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { showConfirm } from '../../lib/utils';
  import { showUndo } from '../../lib/toast.svelte';
  import { findPage, type PageId } from '../../lib/settings/tree';
  import { PAGE_PREFS, canResetPage, pageIsAtDefaults, pageResetWhat, resetPage } from '../../lib/settings/pageReset';

  let { page }: { page: PageId } = $props();

  const store = trainingState.preferencesStore;
  // The theme is read from the UI store so a change to it alone updates the button too.
  const atDefaults = $derived((void trainingState.theme, pageIsAtDefaults(store.snapshot(), page)));

  /** Writes a whole preferences object back: the store, the theme, and the fatigue reminders the switch schedules. */
  async function apply(next: ReturnType<typeof store.snapshot>) {
    const before = store.snapshot();
    store.replace(next);
    if (PAGE_PREFS[page]?.includes('theme')) trainingState.setTheme(next.theme);
    if (before.tunables['alerts.fatigueReminder'] !== next.tunables['alerts.fatigueReminder']) {
      await trainingState.setFatigueReminderEnabled(next.tunables['alerts.fatigueReminder'] as boolean);
    }
  }

  async function reset() {
    const name = findPage(page).page.label;
    const ok = await showConfirm(
      `Reset ${name}?`,
      `Puts ${pageResetWhat(page)} back to the defaults. Other pages, your sessions and your lists are not touched. You can undo this right after.`,
      { ok: 'Reset this page', cancel: 'Keep my settings' },
    );
    if (!ok) return;
    const before = store.snapshot();
    await apply(resetPage(before, page));
    showUndo(`${name} reset to the defaults`, () => apply(before));
  }
</script>

{#if canResetPage(page)}
  <div class="flex justify-center pt-2">
    <button type="button" class="btn-quiet gap-1.5 px-4 text-label text-content-muted hover:text-primary disabled:opacity-40 disabled:pointer-events-none" disabled={atDefaults} onclick={reset}>
      <Icon icon="ic:baseline-restore" class="text-base" /> Reset this page to defaults
    </button>
  </div>
{/if}
