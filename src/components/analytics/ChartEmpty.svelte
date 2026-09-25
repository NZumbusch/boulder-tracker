<script lang="ts">
  /**
   * "Nothing here" laid over an empty plot. Cards keep their full frame in
   * an empty window (a future week, a quiet month) instead of collapsing
   * into a line of text, so swiping through the timeline doesn't make the
   * page jump - the note sits where the data would be.
   */
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
  <p class="text-caption text-content-subtle italic text-center leading-relaxed px-2.5 py-1 rounded-control bg-surface/80">
    {@render children()}
  </p>
</div>
