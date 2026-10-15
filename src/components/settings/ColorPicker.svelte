<script lang="ts">
  /** The colour swatches of the phase and category editors: named, 40 px, the chosen one ringed in the text colour. */
  import { COLOR_CHOICES } from './colorChoices';

  let { value, onChange, label = 'Colour' }: { value: string; onChange: (v: string) => void; label?: string } = $props();
</script>

<div role="group" aria-label={label} class="flex flex-wrap gap-2.5">
  {#each COLOR_CHOICES as c (c.value)}
    <button
      type="button"
      aria-label={c.name}
      aria-pressed={value === c.value}
      onclick={() => onChange(c.value)}
      class="w-10 h-10 rounded-full {c.value} transition-shadow {value === c.value ? 'ring-2 ring-content ring-offset-2 ring-offset-surface' : 'hover:ring-2 hover:ring-border-strong hover:ring-offset-2 hover:ring-offset-surface'}"
    ></button>
  {/each}
</div>
