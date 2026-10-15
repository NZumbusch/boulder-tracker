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
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '@iconify/svelte';

  let { title, message = '', choices, cancelLabel = 'Cancel', onChoose, onCancel }: {
    title: string;
    message?: string;
    choices: Choice[];
    cancelLabel?: string;
    onChoose: (id: string) => void;
    onCancel: () => void;
  } = $props();

  const toneClass = (tone: Choice['tone'], first: boolean) =>
    (tone ?? (first ? 'primary' : 'neutral')) === 'primary'
      ? 'bg-primary hover:bg-primary-hover text-on-primary'
      : tone === 'danger'
        ? 'bg-danger/10 hover:bg-danger/20 text-danger'
        : 'bg-surface-elevated/60 hover:bg-surface-elevated text-content';
</script>

<Sheet {title} subtitle={message || undefined} level="nested" onClose={onCancel}>
  <div class="space-y-2.5">
    {#each choices as choice, i (choice.id)}
      <button onclick={() => onChoose(choice.id)} class="w-full p-4 rounded-card transition-all active:scale-[0.99] text-left flex items-start gap-3 {toneClass(choice.tone, i === 0)}">
        {#if choice.icon}<Icon icon={choice.icon} class="text-xl shrink-0 mt-0.5" />{/if}
        <span class="min-w-0">
          <span class="text-label font-bold block">{choice.label}</span>
          {#if choice.description}<span class="text-caption block opacity-90">{choice.description}</span>{/if}
        </span>
      </button>
    {/each}
  </div>
  {#snippet footer()}
    <button onclick={onCancel} class="btn btn-ghost flex-1">{cancelLabel}</button>
  {/snippet}
</Sheet>
