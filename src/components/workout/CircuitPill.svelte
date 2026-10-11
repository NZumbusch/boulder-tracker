<script lang="ts">
  /**
   * A minimised circuit: where the timer pill sits, showing the phase,
   * the exercise and the step's clock, with pause/resume. Tapping it opens
   * the circuit again. The same down-chevron as the timer tucks it into a
   * small round button at the side (the one `timerPillHidden` setting
   * serves both - while a circuit runs it is the session's timer).
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { circuitHud, toggleCircuit } from '../../lib/session/circuitHud.svelte';

  let { visible, bottomClass = 'bottom-[80px]', onOpen }: { visible: boolean; bottomClass?: string; onOpen: () => void } = $props();
  const tucked = $derived(trainingState.timerPillHidden);
</script>

{#if visible && circuitHud.active}
  {#if tucked}
    <button
      onclick={onOpen}
      class="fixed {bottomClass} right-4 z-[111] h-11 min-w-11 px-3 rounded-full flex items-center justify-center gap-1.5 bg-surface/90 backdrop-blur-md border border-border shadow-card text-label tabular-nums animate-in fade-in"
      style="color: {circuitHud.accent};"
      aria-label="Open the circuit"
    >
      <Icon icon="ic:baseline-loop" class="text-lg" />
      {circuitHud.time}
    </button>
  {:else}
    <div class="fixed {bottomClass} inset-x-0 px-4 z-[111] flex justify-center pointer-events-none">
      <div class="pointer-events-auto max-w-full bg-surface/90 backdrop-blur-md border border-border shadow-2xl rounded-full p-1.5 pl-4 flex items-center gap-3 animate-in slide-in-from-bottom-10">
        <button onclick={onOpen} class="min-w-0 flex items-center gap-3 text-left" aria-label="Open the circuit">
          <span class="min-w-0">
            <span class="block text-caption uppercase tracking-widest leading-tight" style="color: {circuitHud.accent};">{circuitHud.phase}</span>
            <span class="block text-label font-bold text-content truncate max-w-[9rem]">{circuitHud.exercise}</span>
          </span>
          <span class="text-metric text-content tabular-nums">{circuitHud.time}</span>
        </button>
        <button
          onclick={toggleCircuit}
          class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center {circuitHud.running ? 'bg-danger text-white' : 'bg-success text-app-bg'} hover:opacity-90 transition-all shadow-lg active:scale-90"
          aria-label={circuitHud.running ? 'Pause the circuit' : 'Resume the circuit'}
        >
          <Icon icon={circuitHud.running ? 'ic:baseline-pause' : 'ic:baseline-play-arrow'} class="text-2xl" />
        </button>
        <button
          onclick={() => trainingState.setTimerPillHidden(true)}
          class="shrink-0 w-7 h-8 -ml-1 rounded-full flex items-center justify-center text-content-subtle hover:text-content transition-colors"
          aria-label="Hide the circuit"
          title="Hide - it keeps running"
        >
          <Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" />
        </button>
      </div>
    </div>
  {/if}
{/if}
