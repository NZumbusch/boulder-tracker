<script lang="ts">
  /**
   * A row that opens another page - Settings' sections and Appearance's
   * topics. A small inline icon, title, one-line hint and a chevron; rows
   * sit in a `card divide-y divide-border` list, never each in their own box.
   */
  import Icon from '@iconify/svelte';

  let { icon, title, hint, onclick }: { icon: string; title: string; hint?: string; onclick: () => void } = $props();
</script>

<button {onclick} class="w-full flex items-center gap-3 py-3.5 text-left group">
  <Icon {icon} class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
  <span class="min-w-0 flex-1">
    <span class="block text-body font-semibold text-content group-hover:text-primary transition-colors">{title}</span>
    {#if hint}<span class="block text-caption text-content-subtle truncate">{hint}</span>{/if}
  </span>
  <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" />
</button>
