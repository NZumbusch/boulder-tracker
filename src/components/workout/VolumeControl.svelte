<script lang="ts">
  /**
   * The cue volume, unobtrusive: a speaker icon that opens a slim slider
   * beside it and folds away again a moment after the last touch. For the
   * full-screen timers' headers - the same setting as in Settings.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';

  let open = $state(false);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const percent = $derived(Math.round(trainingState.timerCues.volume * 100));
  function touched() {
    clearTimeout(timeout);
    timeout = setTimeout(() => (open = false), 3000);
  }
  $effect(() => () => clearTimeout(timeout));
</script>

<div class="flex items-center gap-1">
  {#if open}
    <div class="w-24 animate-in fade-in" role="group" aria-label="Cue volume" onpointerdown={touched} onpointermove={touched}>
      <RangeSlider value={percent} min={10} max={100} step={5} label="Cue volume" onchange={(v) => { trainingState.setTimerCues({ volume: v / 100 }); touched(); }} />
    </div>
  {/if}
  <button
    onclick={() => { open = !open; if (open) touched(); }}
    class="p-2 text-content-subtle hover:text-content transition-colors"
    aria-label="Cue volume, {percent} %"
    aria-expanded={open}
  >
    <Icon icon={percent <= 30 ? 'ic:baseline-volume-down' : 'ic:baseline-volume-up'} class="text-xl" />
  </button>
</div>
