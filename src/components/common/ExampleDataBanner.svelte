<script lang="ts">
  /**
   * Shown for as long as "look around with example data" is on: says it is
   * example data, that nothing is saved, and gets out of it.
   */
  import { tour } from '../../lib/tour/tour.svelte';
</script>

{#if tour.example}
  <div class="shrink-0 w-full bg-status-caution/15 border-b border-status-caution/40 px-4 py-2 flex items-center gap-3" role="status">
    <p class="flex-1 min-w-0 text-caption text-content leading-snug"><strong>Example data.</strong> Nothing here is saved, and your own data is untouched.</p>
    <button onclick={() => tour.endExample()} class="px-3 py-1.5 rounded-control bg-primary text-white text-label font-semibold shrink-0">Exit</button>
  </div>
{/if}
