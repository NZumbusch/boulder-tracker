<script lang="ts">
  /**
   * The cue volume as a slim row under a timer's header: icon, slider and
   * the percentage. Folds away by itself a few seconds after the last touch.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const percent = $derived(Math.round(trainingState.timerCues.volume * 100));

  let timeout: ReturnType<typeof setTimeout> | undefined;
  function touched() {
    clearTimeout(timeout);
    timeout = setTimeout(onclose, 4000);
  }
  touched();
  $effect(() => () => clearTimeout(timeout));
</script>

<div class="shrink-0 mx-4 mb-2 px-3 py-2 flex items-center gap-3 rounded-control bg-surface-elevated/50 animate-in fade-in" role="group" aria-label="Cue volume" onpointerdown={touched} onpointermove={touched}>
  <Icon icon="ic:baseline-volume-down" class="text-lg text-content-subtle shrink-0" />
  <div class="flex-1 min-w-0">
    <RangeSlider value={percent} min={10} max={100} step={5} label="Cue volume" onchange={(v) => { trainingState.setTimerCues({ volume: v / 100 }); touched(); }} />
  </div>
  <Icon icon="ic:baseline-volume-up" class="text-lg text-content-subtle shrink-0" />
  <span class="w-10 text-right text-label text-content-muted tabular-nums">{percent} %</span>
</div>
