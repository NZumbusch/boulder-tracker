<script lang="ts">
  /**
   * The timer pill's readout while an interval run is minimised: where you
   * are (set, rep, phase and seconds - or, self-paced, the set and the
   * rest) and the one control that matters. Tapping the readout brings the
   * big view back. Part of TimerWidget.
   */
  import Icon from '@iconify/svelte';
  import { type IntervalSpec, phaseLabel, type positionAt, type progressAt } from '../../lib/timer/intervalTimer';
  import { type SetRunState, setRunPhase, isResting, restRemainingSeconds } from '../../lib/timer/setRun';

  let {
    selfPaced,
    setRun,
    spec,
    position,
    progress,
    workLabel,
    finished,
    running,
    onExpand,
    onToggle,
  }: {
    selfPaced: boolean;
    setRun: SetRunState;
    spec: IntervalSpec;
    position: ReturnType<typeof positionAt>;
    progress: ReturnType<typeof progressAt>;
    workLabel: string;
    finished: boolean;
    running: boolean;
    onExpand: () => void;
    onToggle: () => void;
  } = $props();

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
</script>

{#if selfPaced}
  <!-- Minimised self-paced run: which set, and how long you have
       rested. Tapping goes back to the big view, where the only
       action - finishing a set - actually lives. -->
  <button onclick={onExpand} class="flex items-center gap-3 pr-1 text-left">
    <div class="min-w-0">
      <p class="text-label font-bold text-content leading-tight tabular-nums whitespace-nowrap">
        {#if setRun.done}
          Done
        {:else if setRunPhase(setRun) === 'leadIn'}
          Ready {Math.ceil(setRun.leadInRemainingMs / 1000)}s
        {:else if isResting(setRun)}
          {restRemainingSeconds(setRun, spec) <= 0 ? 'Rest over' : 'Rest'}
          <span class="text-content-subtle">{formatTime(Math.abs(Math.round(restRemainingSeconds(setRun, spec))))}</span>
        {:else}
          Set {setRun.currentSet}
        {/if}
      </p>
      <p class="text-caption text-content-subtle tabular-nums leading-tight whitespace-nowrap">
        {setRun.completed.length}/{spec.sets} sets done
      </p>
    </div>
    <Icon icon="ic:baseline-open-in-full" class="text-sm text-content-subtle shrink-0" />
  </button>

  <button
    onclick={onExpand}
    class="w-10 h-10 rounded-full flex items-center justify-center bg-success text-app-bg hover:opacity-90 transition-all shadow-lg active:scale-90"
    aria-label="Open the set timer"
  >
    <Icon icon="ic:baseline-check-circle" class="text-2xl" />
  </button>
{:else}
  <!-- Minimised interval: enough to know where you are, and a tap to
       get the big view back. -->
  <button onclick={onExpand} class="flex items-center gap-3 pr-1 text-left">
    <div class="min-w-0">
      <p class="text-label font-bold text-content leading-tight tabular-nums whitespace-nowrap">
        {finished ? 'Done' : phaseLabel(position.step?.phase ?? 'leadIn', workLabel)}
        {#if !finished}<span class="text-content-subtle"> {position.remaining}s</span>{/if}
      </p>
      <p class="text-caption text-content-subtle tabular-nums leading-tight whitespace-nowrap">
        S{progress.currentSet}/{spec.sets} &middot; R{progress.currentRep}/{spec.reps}
      </p>
    </div>
    <Icon icon="ic:baseline-open-in-full" class="text-sm text-content-subtle shrink-0" />
  </button>

  <button
    onclick={onToggle}
    class="w-10 h-10 rounded-full flex items-center justify-center {running ? 'bg-danger text-white' : 'bg-success text-app-bg'} hover:opacity-90 transition-all shadow-lg active:scale-90"
    aria-label={running ? 'Pause' : 'Start'}
  >
    <Icon icon={running ? "ic:baseline-pause" : "ic:baseline-play-arrow"} class="text-2xl" />
  </button>
{/if}
