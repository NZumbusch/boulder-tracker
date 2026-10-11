<script lang="ts">
  /**
   * The sound control in the full-screen timers' headers: a small pill of
   * a speaker and a chevron. The speaker mutes and unmutes the cues for the
   * rest of the session (nothing in Settings changes); the chevron opens
   * the volume bar (`VolumeBar`), which sits on its own row under the
   * header - squeezed into the header it pushed the title around.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { cueMute, toggleCueMute } from '../../lib/timer/cueMute.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  const percent = $derived(Math.round(trainingState.timerCues.volume * 100));
</script>

<div class="flex items-center rounded-full transition-colors {cueMute.muted ? 'bg-warning/15' : ''}">
  <button
    onclick={toggleCueMute}
    class="py-2 pl-2 pr-1 transition-colors {cueMute.muted ? 'text-warning' : 'text-content-subtle hover:text-content'}"
    aria-label={cueMute.muted ? 'Sound is off for this session - turn it on' : 'Mute sound for this session'}
    aria-pressed={cueMute.muted}
  >
    <Icon icon={cueMute.muted ? 'ic:baseline-volume-off' : percent <= 30 ? 'ic:baseline-volume-down' : 'ic:baseline-volume-up'} class="text-xl" />
  </button>
  <button
    onclick={() => (open = !open)}
    class="py-2 pr-1.5 pl-0.5 transition-colors {open ? 'text-primary' : cueMute.muted ? 'text-warning' : 'text-content-subtle hover:text-content'}"
    aria-label="Cue volume, {percent} %"
    aria-expanded={open}
  >
    <Icon icon="ic:baseline-keyboard-arrow-down" class="text-base transition-transform {open ? 'rotate-180' : ''}" />
  </button>
</div>
