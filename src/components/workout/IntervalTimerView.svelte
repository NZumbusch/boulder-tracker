<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * The interval timer, full screen.
   *
   * Presentational: every number comes in as a prop and every action goes
   * out as a callback, so the running state lives in one place
   * (`TimerWidget`) and this can't drift from it.
   *
   * Sized to be read from the board rather than from the hand - the
   * remaining seconds are the largest thing on the screen, the phase name
   * sits above them, and set/rep counts stay in the corners where they
   * don't compete.
   */
  import type { IntervalSpec, IntervalPosition, IntervalProgress } from '../../lib/timer/intervalTimer';
  import { phaseLabel, specsDiffer } from '../../lib/timer/intervalTimer';
  import { formatClock } from '../../lib/session/formatSession';
  import Icon from '@iconify/svelte';
  import VolumeControl from './VolumeControl.svelte';
  import VolumeBar from './VolumeBar.svelte';

  let {
    spec,
    baseSpec,
    position,
    progress,
    totalSeconds,
    elapsedSeconds,
    workLabel,
    isRunning,
    isFinished,
    canLog,
    onToggle,
    onSkip,
    onBack,
    onRestart,
    onMinimize,
    onClose,
    onSpecChange,
    onResetToExercise,
    onLog,
  }: {
    spec: IntervalSpec;
    baseSpec: IntervalSpec;
    position: IntervalPosition;
    progress: IntervalProgress;
    totalSeconds: number;
    elapsedSeconds: number;
    workLabel: string;
    isRunning: boolean;
    isFinished: boolean;
    canLog: boolean;
    onToggle: () => void;
    onSkip: () => void;
    onBack: () => void;
    onRestart: () => void;
    onMinimize: () => void;
    onClose: () => void;
    onSpecChange: (patch: Partial<IntervalSpec>) => void;
    onResetToExercise: () => void;
    onLog: () => void;
  } = $props();

  let showSettings = $state(false);

  const edited = $derived(specsDiffer(spec, baseSpec));
  const phase = $derived(position.step?.phase ?? null);

  /** Colour carries the phase, so a glance from three metres shows whether to be on the holds. */
  const accent = $derived(
    isFinished ? 'var(--color-success)'
      : phase === 'work' ? 'var(--color-danger)'
      : phase === 'leadIn' ? 'var(--color-warning)'
      : 'var(--color-primary)',
  );

  const headline = $derived(
    isFinished ? 'Done' : phase ? phaseLabel(phase, workLabel) : 'Ready',
  );

  /** Fraction of the current phase still to run, for the ring. */
  const phaseFraction = $derived.by(() => {
    if (!position.step || position.step.seconds <= 0) return 0;
    return Math.max(0, Math.min(1, position.elapsedInStep / position.step.seconds));
  });

  const overallFraction = $derived(totalSeconds > 0 ? Math.min(1, elapsedSeconds / totalSeconds) : 0);

  const RING = 2 * Math.PI * 45;

  // Derived, not a plain const: the work field is labelled "Hang" or
  // "Work" depending on the exercise, which changes as the session moves on.
  const FIELDS = $derived<{ key: keyof IntervalSpec; label: string; unit: string; min: number; step: number }[]>([
    { key: 'sets', label: 'Sets', unit: '', min: 1, step: 1 },
    { key: 'reps', label: 'Reps', unit: '', min: 1, step: 1 },
    { key: 'workSeconds', label: workLabel, unit: 's', min: 1, step: 1 },
    { key: 'restSeconds', label: 'Rest', unit: 's', min: 0, step: 1 },
    { key: 'setRestSeconds', label: 'Set rest', unit: 's', min: 0, step: 5 },
    { key: 'leadInSeconds', label: 'Get ready', unit: 's', min: 0, step: 5 },
  ]);

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  let volumeOpen = $state(false);
  backWhile(() => true, () => onMinimize());
</script>

<!-- Above the live session (z-110), below its sheets (z-115+). -->
<div class="fixed inset-0 z-[112] safe-y bg-app-bg flex flex-col">
  <!-- Header -->
  <div class="shrink-0 flex items-center justify-between px-4 pt-4 pb-2">
    <button
      onclick={onMinimize}
      class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors"
      aria-label="Minimise timer"
      title="Minimise — the timer keeps running"
    >
      <Icon icon="ic:baseline-keyboard-arrow-down" class="text-2xl" />
    </button>
    <div class="text-center min-w-0">
      <p class="text-caption uppercase text-content-subtle tracking-widest">Interval</p>
      <p class="text-label text-content-muted tabular-nums">
        {formatClock(elapsedSeconds * 1000)} / {formatClock(totalSeconds * 1000)}
      </p>
    </div>
    <div class="flex items-center -mr-2">
      <VolumeControl bind:open={volumeOpen} />
      <button
        onclick={() => showSettings = !showSettings}
        class="p-2 transition-colors {showSettings ? 'text-primary' : 'text-content-subtle hover:text-content'}"
        aria-label="Adjust the protocol"
      >
        <Icon icon="ic:baseline-tune" class="text-2xl" />
      </button>
    </div>
  </div>

  {#if volumeOpen}
    <VolumeBar onclose={() => (volumeOpen = false)} />
  {/if}

  {#if showSettings}
    <!-- Local overrides. These never touch the exercise - Reset puts the
         prescribed numbers back, and moving to another exercise re-seeds. -->
    <div class="shrink-0 px-4 pb-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
      <div class="grid grid-cols-3 gap-2">
        {#each FIELDS as field}
          <label class="space-y-1 min-w-0">
            <span class="text-caption text-content-subtle truncate block">{field.label}{field.unit ? ` (${field.unit})` : ''}</span>
            <input
              type="number"
              inputmode="numeric"
              min={field.min}
              step={field.step}
              value={spec[field.key]}
              oninput={(e) => onSpecChange({ [field.key]: Number(e.currentTarget.value) })}
              class="w-full px-2.5 py-2 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors tabular-nums"
            />
          </label>
        {/each}
      </div>
      {#if edited}
        <button
          onclick={onResetToExercise}
          class="w-full py-2.5 text-label font-bold text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-control border border-border-strong/50 transition-colors flex items-center justify-center gap-2"
        >
          <Icon icon="ic:baseline-restart-alt" class="text-base" />
          Reset to exercise
        </button>
      {:else}
        <p class="text-caption text-content-subtle text-center">Matching the exercise.</p>
      {/if}
    </div>
  {/if}

  <!-- The dial -->
  <div class="flex-1 min-h-0 flex flex-col items-center justify-center px-6 gap-6">
    <!-- Sized by the room it has on both axes, so the dial fits in landscape too. -->
    <div class="flex-1 min-h-0 w-full grid place-items-center" style="container-type: size;">
      <div class="relative aspect-square" style="width: min(19rem, 100cqw, 100cqh); container-type: inline-size;">
        <svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-surface-elevated)" stroke-width="5" />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke={accent}
            stroke-width="5"
            stroke-linecap="round"
            stroke-dasharray="{(1 - phaseFraction) * RING} {RING}"
            class="transition-[stroke-dasharray] duration-200 ease-linear"
          />
        </svg>

        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <p class="text-section uppercase tracking-[0.2em]" style="color: {accent};">{headline}</p>
          <p class="text-[length:min(5rem,30cqw)] leading-none font-black text-content tabular-nums my-2">
            {isFinished ? '✓' : position.remaining}
          </p>
          {#if !isFinished}
            <p class="text-label text-content-subtle tabular-nums">
              Set {progress.currentSet}/{spec.sets} &middot; Rep {progress.currentRep}/{spec.reps}
            </p>
          {:else}
            <p class="text-label text-content-subtle tabular-nums">
              {progress.setsCompleted} sets &middot; {progress.repsCompleted} reps
            </p>
          {/if}
        </div>
      </div>
    </div>

    <!-- Overall progress -->
    <div class="w-full max-w-[19rem] space-y-1.5">
      <div class="h-1.5 bg-surface-elevated rounded-control overflow-hidden">
        <div class="h-full rounded-control transition-[width] duration-200 ease-linear" style="width: {overallFraction * 100}%; background: {accent};"></div>
      </div>
      {#if edited}
        <p class="text-caption text-content-subtle text-center">
          Adjusted for this run &mdash; the exercise is unchanged.
        </p>
      {/if}
    </div>
  </div>

  <!-- Controls -->
  <div class="shrink-0 px-6 pb-8 space-y-3">
    {#if isFinished}
      <div class="flex gap-2.5">
        <button
          onclick={onRestart}
          class="shrink-0 px-5 py-4 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-control border border-border-strong/50 text-label font-bold transition-colors"
        >
          Again
        </button>
        {#if canLog}
          <button
            onclick={onLog}
            class="flex-1 min-w-0 py-4 bg-success hover:bg-success-hover text-white rounded-control text-label font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Icon icon="ic:baseline-check" class="text-base" />
            Log this exercise
          </button>
        {:else}
          <button
            onclick={onClose}
            class="flex-1 min-w-0 py-4 bg-primary hover:bg-primary-hover text-white rounded-control text-label font-bold transition-all active:scale-[0.98]"
          >
            Done
          </button>
        {/if}
      </div>
      {#if canLog}
        <button onclick={onClose} class="w-full py-2 text-label text-content-subtle hover:text-content transition-colors">
          Close without logging
        </button>
      {/if}
    {:else}
      <div class="flex items-center justify-center gap-4">
        <button
          onclick={onBack}
          class="w-14 h-14 rounded-full grid place-items-center bg-surface-elevated/60 hover:bg-surface-elevated text-content-muted border border-border-strong/50 transition-colors active:scale-90"
          aria-label="Previous phase"
        >
          <Icon icon="ic:baseline-skip-previous" class="text-2xl" />
        </button>
        <button
          onclick={onToggle}
          class="w-20 h-20 rounded-full grid place-items-center text-app-bg shadow-xl transition-all active:scale-90"
          style="background: {accent};"
          aria-label={isRunning ? 'Pause' : 'Start'}
        >
          <Icon icon={isRunning ? 'ic:baseline-pause' : 'ic:baseline-play-arrow'} class="text-4xl" />
        </button>
        <button
          onclick={onSkip}
          class="w-14 h-14 rounded-full grid place-items-center bg-surface-elevated/60 hover:bg-surface-elevated text-content-muted border border-border-strong/50 transition-colors active:scale-90"
          aria-label="Next phase"
        >
          <Icon icon="ic:baseline-skip-next" class="text-2xl" />
        </button>
      </div>
      <div class="flex gap-2.5">
        <button
          onclick={onRestart}
          class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-content transition-colors"
        >
          Restart
        </button>
        <button
          onclick={onClose}
          class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-danger transition-colors"
        >
          Stop
        </button>
      </div>
    {/if}
  </div>
</div>
