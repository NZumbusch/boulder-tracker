<script lang="ts">
  /**
   * A forecast day's climbing conditions in a strip: the score (when the "friction number" option is on) or a dot, and
   * always the word under it, so the colour is never the only cue. One mark for the trip, crag and weather strips.
   */
  import { trainingState } from '../../../lib/state.svelte';
  import type { Friction } from '../../../lib/weather/friction';
  import { FRICTION_STYLE } from './format';

  let { friction }: { friction: Friction } = $props();
  const style = $derived(FRICTION_STYLE[friction.label]);
</script>

<span class="flex flex-col items-center gap-0.5" title="Conditions: {friction.label}">
  {#if trainingState.homeDetails['weather.frictionNumber']}
    <span class="text-caption tabular-nums leading-none {style.text}">{friction.score.toFixed(0)}</span>
  {:else}
    <span class="w-2 h-2 rounded-full {style.dot}" aria-hidden="true"></span>
  {/if}
  <span class="text-caption leading-none {style.text}">{friction.label}</span>
</span>
