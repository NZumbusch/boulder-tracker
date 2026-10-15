<script lang="ts" generics="T extends string | number | boolean">
  /**
   * One choice among a few, as large cards (the welcome's questions). A real radio group: one tab stop, the arrow keys
   * move the choice, and choosing the selected card again keeps it (a radio never clears). The selected card says so
   * with a check as well as its border and tint.
   */
  import Icon from '@iconify/svelte';

  type Option = { value: T; label: string; hint?: string; lines?: string[] };
  let { options, value, onChange, label, compact = false }: {
    options: Option[];
    value: T | null;
    onChange: (v: T) => void;
    label: string;
    /** A tighter card for short answers. */
    compact?: boolean;
  } = $props();

  let buttons = $state<HTMLButtonElement[]>([]);
  // With nothing chosen yet the first card is the tab stop.
  const stop = $derived(options.findIndex((o) => o.value === value) >= 0 ? options.findIndex((o) => o.value === value) : 0);

  function onkeydown(e: KeyboardEvent, i: number) {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const j = (i + dir + options.length) % options.length;
    onChange(options[j].value);
    buttons[j]?.focus();
  }
</script>

<div class="space-y-2.5" role="radiogroup" aria-label={label}>
  {#each options as option, i (String(option.value))}
    {@const on = value === option.value}
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabindex={i === stop ? 0 : -1}
      bind:this={buttons[i]}
      onclick={() => onChange(option.value)}
      onkeydown={(e) => onkeydown(e, i)}
      class="w-full text-left {compact ? 'px-4 py-3' : 'p-4'} min-h-11 rounded-card border transition-colors flex items-start gap-3 {on ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-border-strong'}"
    >
      <span class="min-w-0 flex-1">
        <span class="block text-body font-bold text-content">{option.label}</span>
        {#if option.hint}<span class="block text-caption text-content-subtle mt-1 leading-relaxed">{option.hint}</span>{/if}
        {#if option.lines?.length}
          <ul class="mt-2 space-y-1">
            {#each option.lines as line}<li class="text-caption text-content-muted leading-relaxed">{line}</li>{/each}
          </ul>
        {/if}
      </span>
      <Icon icon={on ? 'ic:baseline-radio-button-checked' : 'ic:baseline-radio-button-unchecked'} class="text-xl shrink-0 mt-0.5 {on ? 'text-primary' : 'text-content-subtle'}" />
    </button>
  {/each}
</div>
