<script lang="ts" generics="T extends string | number">
  /**
   * One segmented control. `variant="view"` is the quiet track for switching what you look at (a chart's mode, a tab);
   * `variant="setting"` is the filled one for a choice that changes behaviour (see app.css, `seg`). Always a labelled
   * group of buttons with `aria-pressed`, at least 40 px tall.
   */
  let {
    options,
    value,
    onChange,
    label,
    variant = 'view',
    full = false,
  }: {
    options: { value: T; label: string; title?: string; disabled?: boolean }[];
    value: T;
    onChange: (v: T) => void;
    label: string;
    variant?: 'view' | 'setting';
    full?: boolean;
  } = $props();
</script>

<div role="group" aria-label={label} class="seg {full ? 'w-full' : 'w-fit max-w-full'}">
  {#each options as o (o.value)}
    <button
      type="button"
      aria-pressed={value === o.value}
      title={o.title}
      disabled={o.disabled}
      onclick={() => onChange(o.value)}
      class="seg-item {full ? 'flex-1' : ''} disabled:opacity-40 {value === o.value ? (variant === 'setting' ? 'bg-primary text-on-primary font-semibold' : 'seg-on') : 'hover:text-content'}"
    >
      {o.label}
    </button>
  {/each}
</div>
