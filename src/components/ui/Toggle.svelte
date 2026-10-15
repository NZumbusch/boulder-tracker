<script lang="ts">
  /**
   * A switch for an on/off setting: the whole row is the target (at least 44 px), `role="switch"` with the state in text
   * for screen readers, and a track that stays visible in every theme (an outline, not only a fill). `label` is the name,
   * `hint` an optional line under it.
   */
  let {
    checked,
    onChange,
    label,
    hint,
    disabled = false,
  }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  {disabled}
  onclick={() => onChange(!checked)}
  class="w-full flex items-center justify-between gap-4 min-h-11 py-2 text-left disabled:opacity-40"
>
  <span class="min-w-0">
    <span class="block text-body text-content">{label}</span>
    {#if hint}<span class="block text-caption text-content-subtle mt-0.5">{hint}</span>{/if}
  </span>
  <span class="relative shrink-0 w-11 h-6 rounded-full border border-field transition-colors {checked ? 'bg-primary border-primary' : 'bg-surface-elevated/60'}" aria-hidden="true">
    <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform {checked ? 'bg-on-primary translate-x-5' : 'bg-content-muted translate-x-0'}"></span>
  </span>
</button>
