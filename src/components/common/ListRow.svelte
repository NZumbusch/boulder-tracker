<script lang="ts">
  /**
   * One row of a session/send list - the same row on Home (Today, Recent
   * Activity), Plan and History, so lists read alike everywhere.
   *
   * Title and a one-line meta on the left, an optional headline value on
   * the right, then an optional trailing control (a Start button). Rows sit
   * in a `divide-y divide-border` list rather than each being its own boxed
   * card. The whole left side is the tap target when `onclick` is given.
   */
  import type { Snippet } from 'svelte';
  import { longPress } from '../../lib/ui/longPress';

  let { title, titleExtra, meta, detail, value, valueHint, muted = false, onclick, onlongpress = null, leading, trailing }: {
    title: string;
    /** Rendered right after the title, e.g. a grade. */
    titleExtra?: Snippet;
    meta?: string;
    /** A second, quieter meta line. */
    detail?: string;
    /** The headline number on the right (load). */
    value?: string | number;
    valueHint?: string;
    /** Planned-but-not-real rows (provisional) read quieter. */
    muted?: boolean;
    onclick?: () => void;
    /** Hold (or right-click) the row - quick actions. */
    onlongpress?: (() => void) | null;
    leading?: Snippet;
    trailing?: Snippet;
  } = $props();
</script>

<div class="flex items-center gap-3 py-2.5 {muted ? 'opacity-70' : ''}">
  {@render leading?.()}
  {#snippet body()}
    <p class="text-body font-semibold text-content truncate {onclick ? 'group-hover:text-primary transition-colors' : ''}">
      {title}{#if titleExtra}{' '}{@render titleExtra()}{/if}
    </p>
    {#if meta}<p class="text-caption text-content-subtle truncate tabular-nums">{meta}</p>{/if}
    {#if detail}<p class="text-caption text-content-subtle/70 truncate">{detail}</p>{/if}
  {/snippet}
  {#if onclick}
    <button type="button" {onclick} use:longPress={onlongpress} class="min-w-0 flex-1 text-left group select-none">{@render body()}</button>
  {:else}
    <div class="min-w-0 flex-1">{@render body()}</div>
  {/if}
  {#if value !== undefined}
    <div class="text-right shrink-0">
      <p class="text-body font-semibold text-content tabular-nums leading-tight">{value}</p>
      {#if valueHint}<p class="text-caption text-content-subtle leading-tight">{valueHint}</p>{/if}
    </div>
  {/if}
  {@render trailing?.()}
</div>
