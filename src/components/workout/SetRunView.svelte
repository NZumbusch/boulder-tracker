<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * The self-paced set timer, full screen.
   *
   * One action: **Finished set**. You do the set at your own pace, say so,
   * and the rest starts from that moment - which is the whole point, since
   * a rest that begins on schedule rather than when you actually racked is
   * worse than no timer at all.
   *
   * The rest counts down to its target, cues, and then keeps counting into
   * overtime rather than sitting at 0:00, because "you rested 3:20" is
   * information and "0:00" is not.
   */
  import type { IntervalSpec } from '../../lib/timer/intervalTimer';
  import { specsDiffer } from '../../lib/timer/intervalTimer';
  import {
    type SetRunState,
    type SetTimingMode,
    setRunPhase,
    isResting,
    restRemainingSeconds,
    setRunProgress,
  } from '../../lib/timer/setRun';
  import { formatClock } from '../../lib/session/formatSession';
  import Icon from '@iconify/svelte';

  let {
    spec,
    baseSpec,
    run,
    reps = $bindable(),
    timingMode,
    workLabel,
    isRunning,
    canLog,
    onFinishSet,
    onUndo,
    onSkipLeadIn,
    onToggle,
    onRestart,
    onMinimize,
    onClose,
    onSpecChange,
    onResetToExercise,
    onTimingModeChange,
    onLog,
  }: {
    spec: IntervalSpec;
    baseSpec: IntervalSpec;
    run: SetRunState;
    /** The rep count staged for the set about to be finished. */
    reps: number;
    timingMode: SetTimingMode;
    workLabel: string;
    isRunning: boolean;
    canLog: boolean;
    onFinishSet: () => void;
    onUndo: () => void;
    onSkipLeadIn: () => void;
    onToggle: () => void;
    onRestart: () => void;
    onMinimize: () => void;
    onClose: () => void;
    onSpecChange: (patch: Partial<IntervalSpec>) => void;
    onResetToExercise: () => void;
    onTimingModeChange: (mode: SetTimingMode) => void;
    onLog: () => void;
  } = $props();

  let showSettings = $state(false);

  const phase = $derived(setRunPhase(run));
  const progress = $derived(setRunProgress(run, spec));
  const resting = $derived(isResting(run));
  const restLeft = $derived(restRemainingSeconds(run, spec));
  const overtime = $derived(resting && restLeft <= 0);
  const edited = $derived(specsDiffer(spec, baseSpec));

  const accent = $derived(
    phase === 'done' ? 'var(--color-success)'
      : phase === 'leadIn' ? 'var(--color-warning)'
      : overtime ? 'var(--color-success)'
      : resting ? 'var(--color-primary)'
      : 'var(--color-danger)',
  );

  /** The big readout: the lead-in, the rest, or a prompt to go. */
  const headline = $derived(
    phase === 'done' ? 'Done'
      : phase === 'leadIn' ? 'Get ready'
      : resting ? (overtime ? 'Rest over' : 'Rest')
      : `${workLabel} now`,
  );

  const bigNumber = $derived.by(() => {
    if (phase === 'done') return '✓';
    if (phase === 'leadIn') return String(Math.ceil(run.leadInRemainingMs / 1000));
    if (resting) return (overtime ? '+' : '') + formatClock(Math.abs(restLeft) * 1000);
    return formatClock(run.sinceLastSetMs);
  });

  const RING = 2 * Math.PI * 45;
  const restFraction = $derived.by(() => {
    if (!resting || spec.setRestSeconds <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - restLeft / spec.setRestSeconds));
  });

  const FIELDS: { key: keyof IntervalSpec; label: string; unit: string; min: number; step: number }[] = [
    { key: 'sets', label: 'Sets', unit: '', min: 1, step: 1 },
    { key: 'reps', label: 'Target reps', unit: '', min: 1, step: 1 },
    { key: 'setRestSeconds', label: 'Set rest', unit: 's', min: 0, step: 15 },
    { key: 'leadInSeconds', label: 'Get ready', unit: 's', min: 0, step: 5 },
  ];

  const MODES: { value: SetTimingMode; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'selfPaced', label: 'Self-paced' },
    { value: 'timed', label: 'Counted' },
  ];

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onMinimize());
</script>

<!-- Above the live session (z-110), below its sheets (z-115+). -->
<div class="fixed inset-0 z-[112] safe-y bg-app-bg flex flex-col">
  <!-- Header -->
  <div class="shrink-0 flex items-center justify-between px-4 pt-4 pb-2">
    <button onclick={onMinimize} class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors" aria-label="Minimise timer" title="Minimise — the timer keeps running">
      <Icon icon="ic:baseline-keyboard-arrow-down" class="text-2xl" />
    </button>
    <div class="text-center min-w-0">
      <p class="text-caption uppercase text-content-subtle tracking-widest">Sets</p>
      <p class="text-label text-content-muted tabular-nums">
        {progress.setsCompleted}/{progress.totalSets} done
        {#if progress.repsCompleted > 0}&middot; {progress.repsCompleted} reps{/if}
      </p>
    </div>
    <button
      onclick={() => showSettings = !showSettings}
      class="p-2 -mr-2 transition-colors {showSettings ? 'text-primary' : 'text-content-subtle hover:text-content'}"
      aria-label="Adjust the protocol"
    >
      <Icon icon="ic:baseline-tune" class="text-2xl" />
    </button>
  </div>

  {#if showSettings}
    <div class="shrink-0 px-4 pb-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
      <div class="grid grid-cols-4 gap-2">
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
              class="w-full px-2 py-2 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors tabular-nums"
            />
          </label>
        {/each}
      </div>

      <!-- The override. Auto reads it off the exercise: no per-rep duration
           means there is nothing to count down. -->
      <div class="space-y-1">
        <span class="text-caption text-content-subtle">Set timing</span>
        <div class="flex bg-surface-elevated/50 p-1 rounded-control">
          {#each MODES as option}
            <button
              onclick={() => onTimingModeChange(option.value)}
              class="flex-1 py-2 text-label rounded-control transition-all {timingMode === option.value ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>

      {#if edited}
        <button onclick={onResetToExercise} class="w-full py-2.5 text-label font-bold text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-control border border-border-strong/50 transition-colors flex items-center justify-center gap-2">
          <Icon icon="ic:baseline-restart-alt" class="text-base" />
          Reset to exercise
        </button>
      {:else}
        <p class="text-caption text-content-subtle text-center">Matching the exercise.</p>
      {/if}
    </div>
  {/if}

  <!-- The dial -->
  <div class="flex-1 min-h-0 flex flex-col items-center justify-center px-6 gap-5">
    <!-- Sized by the room it has on both axes, so the dial fits in landscape too. -->
    <div class="flex-1 min-h-0 w-full grid place-items-center" style="container-type: size;">
      <div class="relative aspect-square" style="width: min(17rem, 100cqw, 100cqh); container-type: inline-size;">
        <svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-surface-elevated)" stroke-width="5" />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke={accent}
            stroke-width="5"
            stroke-linecap="round"
            stroke-dasharray="{(1 - restFraction) * RING} {RING}"
            class="transition-[stroke-dasharray] duration-200 ease-linear"
          />
        </svg>

        <div class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p class="text-section uppercase tracking-[0.2em]" style="color: {accent};">{headline}</p>
          <p class="text-[length:min(3.5rem,24cqw)] leading-none font-black text-content tabular-nums my-2">{bigNumber}</p>
          {#if phase !== 'done'}
            <p class="text-label text-content-subtle tabular-nums">Set {progress.currentSet} of {progress.totalSets}</p>
          {:else}
            <p class="text-label text-content-subtle tabular-nums">{run.completed.join(' · ')}</p>
          {/if}
        </div>
      </div>
    </div>

    {#if run.completed.length > 0 && phase !== 'done'}
      <p class="text-caption text-content-subtle tabular-nums">Done so far: {run.completed.join(', ')}</p>
    {/if}
    {#if edited}
      <p class="text-caption text-content-subtle text-center">Adjusted for this run &mdash; the exercise is unchanged.</p>
    {/if}
  </div>

  <!-- Controls -->
  <div class="shrink-0 px-6 pb-8 space-y-3">
    {#if phase === 'done'}
      <div class="flex gap-2.5">
        <button onclick={onRestart} class="shrink-0 px-5 py-4 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-control border border-border-strong/50 text-label font-bold transition-colors">
          Again
        </button>
        {#if canLog}
          <button onclick={onLog} class="flex-1 min-w-0 py-4 bg-success hover:bg-success-hover text-white rounded-control text-label font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2">
            <Icon icon="ic:baseline-check" class="text-base" />
            Log this exercise
          </button>
        {:else}
          <button onclick={onClose} class="flex-1 min-w-0 py-4 bg-primary hover:bg-primary-hover text-white rounded-control text-label font-bold transition-all active:scale-[0.98]">
            Done
          </button>
        {/if}
      </div>
      {#if canLog}
        <button onclick={onClose} class="w-full py-2 text-label text-content-subtle hover:text-content transition-colors">Close without logging</button>
      {/if}
    {:else if phase === 'leadIn'}
      <button onclick={onSkipLeadIn} class="w-full py-4 bg-primary hover:bg-primary-hover text-white rounded-control text-label font-bold transition-all active:scale-[0.98]">
        I'm ready
      </button>
    {:else}
      <!-- Rep count for the set about to be finished, prefilled with the
           target. One tap accepts it; the steppers are for the sets that
           didn't go to plan, which are the ones worth recording. -->
      <div class="flex items-center justify-between gap-3 px-1">
        <span class="text-label text-content-subtle">Reps this set <span class="text-content-subtle/70">(target {spec.reps})</span></span>
        <div class="flex items-center gap-2">
          <button onclick={() => reps = Math.max(1, reps - 1)} class="w-10 h-10 rounded-full grid place-items-center bg-surface-elevated text-content border border-border-strong transition-colors active:scale-90" aria-label="One fewer rep">
            <Icon icon="ic:baseline-remove" class="text-lg" />
          </button>
          <span class="w-10 text-center text-metric text-content tabular-nums">{reps}</span>
          <button onclick={() => reps = reps + 1} class="w-10 h-10 rounded-full grid place-items-center bg-surface-elevated text-content border border-border-strong transition-colors active:scale-90" aria-label="One more rep">
            <Icon icon="ic:baseline-add" class="text-lg" />
          </button>
        </div>
      </div>

      <button
        onclick={onFinishSet}
        class="w-full py-5 rounded-control text-white text-label font-bold transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-2"
        style="background: {accent};"
      >
        <Icon icon="ic:baseline-check-circle" class="text-xl" />
        Finished set {progress.currentSet}
      </button>

      <div class="flex items-center gap-2">
        <button onclick={onToggle} class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center justify-center gap-1.5">
          <Icon icon={isRunning ? 'ic:baseline-pause' : 'ic:baseline-play-arrow'} class="text-base" />
          {isRunning ? 'Pause' : 'Resume'}
        </button>
        <button
          onclick={onUndo}
          disabled={run.completed.length === 0}
          class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-content transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Icon icon="ic:baseline-undo" class="text-base" />
          Undo set
        </button>
        <button onclick={onClose} class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-danger transition-colors">
          Stop
        </button>
      </div>
    {/if}
  </div>
</div>
