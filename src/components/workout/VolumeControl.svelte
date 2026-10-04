<script lang="ts">
  /**
   * The speaker button for the full-screen timers' headers. It only opens
   * and closes the volume bar (`VolumeBar`), which sits on its own row under
   * the header - squeezed into the header it pushed the title around.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  const percent = $derived(Math.round(trainingState.timerCues.volume * 100));
</script>

<button
  onclick={() => (open = !open)}
  class="p-2 transition-colors {open ? 'text-primary' : 'text-content-subtle hover:text-content'}"
  aria-label="Cue volume, {percent} %"
  aria-expanded={open}
>
  <Icon icon={percent <= 30 ? 'ic:baseline-volume-down' : 'ic:baseline-volume-up'} class="text-xl" />
</button>
