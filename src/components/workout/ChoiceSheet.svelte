<script lang="ts" module>
export interface Choice {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  /** `danger` for the one that drops something. */
  tone?: 'primary' | 'neutral' | 'danger';
}

</script>

<script lang="ts">
  /**
   * A question with a few answers, as a bottom sheet: a title, what is at stake, then one row per answer (a label and
   * what it does), the first one the primary. For choices that deserve more than OK / Cancel - a native dialog can't
   * say what each button does. Back, a tap outside and a drag down all cancel.
   */
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import Icon from '@iconify/svelte';

  let { title, message = '', choices, cancelLabel = 'Cancel', onChoose, onCancel }: {
    title: string;
    message?: string;
    choices: Choice[];
    cancelLabel?: string;
    onChoose: (id: string) => void;
    onCancel: () => void;
  } = $props();

  backWhile(() => true, () => onCancel());

  const toneClass = (tone: Choice['tone'], first: boolean) =>
    (tone ?? (first ? 'primary' : 'neutral')) === 'primary'
      ? 'bg-primary hover:bg-primary-hover text-white'
      : tone === 'danger'
        ? 'bg-surface-elevated/60 hover:bg-surface-elevated text-danger border border-border-strong/50'
        : 'bg-surface-elevated/60 hover:bg-surface-elevated text-content border border-border-strong/50';
</script>

<div
  class="fixed inset-0 pb-safe z-[130] flex items-end sm:items-center justify-center bg-app-bg/90 backdrop-blur-md"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
>
  <div class="bg-surface w-full max-w-md rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card p-5 space-y-4 animate-in slide-in-from-bottom-4 duration-200" use:sheetDrag={() => onCancel()}>
    <div class="space-y-1">
      <h3 class="text-title text-content">{title}</h3>
      {#if message}<p class="text-caption text-content-subtle">{message}</p>{/if}
    </div>
    <div class="space-y-2.5">
      {#each choices as choice, i (choice.id)}
        <button onclick={() => onChoose(choice.id)} class="w-full p-4 rounded-card transition-all active:scale-[0.99] text-left flex items-start gap-3 {toneClass(choice.tone, i === 0)}">
          {#if choice.icon}<Icon icon={choice.icon} class="text-xl shrink-0 mt-0.5" />{/if}
          <span class="min-w-0">
            <span class="text-label font-bold block">{choice.label}</span>
            {#if choice.description}<span class="text-caption block opacity-75">{choice.description}</span>{/if}
          </span>
        </button>
      {/each}
    </div>
    <button onclick={onCancel} class="w-full py-3 text-label font-bold text-content-subtle hover:text-content transition-colors">{cancelLabel}</button>
  </div>
</div>
