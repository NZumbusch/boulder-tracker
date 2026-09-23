<script lang="ts">
  /**
   * Floating stopwatch / countdown / interval timer (ported from an old
   * stash, extended 2026-09-22 with interval mode).
   *
   * Three modes:
   * - **Stopwatch** and **countdown**, as ported, driven by a plain 1s tick.
   * - **Interval**, which runs a whole sets x reps protocol
   *   (`lib/timer/intervalTimer.ts`). A hangboard repeater is sets x reps x
   *   (hang -> rest) with a longer rest between sets, so it needs no mode
   *   of its own - it is this one with the exercise's numbers in it.
   *
   * Interval mode keeps its own clock rather than reusing the 1s tick: it
   * fires cues on phase changes and counts the last three seconds down, so
   * it samples `Date.now()` at 100ms and derives everything from elapsed
   * time. A counter incremented once per second drifts, and drift here
   * means the beep lands after you have already let go.
   *
   * `bottom-[91px]` (the default) clears App.svelte's nav bar; the session
   * modal covers that nav with a shorter footer and overrides it.
   */
  import { onDestroy } from "svelte";
  import Icon from "@iconify/svelte";
  import { slotValues } from "../../lib/exerciseSlot";
  import { trainingState } from "../../lib/state.svelte";
  import type { ExerciseSlot, ExerciseValues } from "../../lib/types";
  import {
    type IntervalSpec,
    DEFAULT_SPEC,
    buildTimeline,
    timelineSeconds,
    positionAt,
    progressAt,
    skipToNextSeconds,
    backSeconds,
    specFromExercise,
    loggedValuesFor,
    workPhaseLabel,
    phaseLabel,
    clampSpec,
  } from "../../lib/timer/intervalTimer";
  import IntervalTimerView from "./IntervalTimerView.svelte";
  import SetRunView from "./SetRunView.svelte";
  import {
    type SetRunState,
    type SetTimingMode,
    isSelfPaced,
    startSetRun,
    tickSetRun,
    finishSet,
    undoLastSet,
    skipLeadIn,
    setRunPhase,
    isResting,
    restRemainingSeconds,
    setRunLoggedValues,
  } from "../../lib/timer/setRun";

  let {
    currentSlot = null,
    bottomClass = 'bottom-[91px]',
    onLogInterval = null,
    visible = true,
  }: {
    currentSlot?: ExerciseSlot | null;
    /**
     * Hides the widget without unmounting it. The session modal minimises
     * to a bubble, and unmounting there would throw away a running
     * interval mid-protocol - the timer stays alive and silent instead,
     * still audible, just not on screen.
     */
    visible?: boolean;
    /**
     * Vertical placement, so the widget can clear whatever is beneath it.
     */
    bottomClass?: string;
    /**
     * Called when a finished interval run should be logged against the
     * current exercise, with the sets/reps actually completed. `null`
     * hides the option (nothing to log against).
     */
    onLogInterval?: ((values: Partial<ExerciseValues>) => void) | null;
  } = $props();

  let mode = $state<'stopwatch' | 'timer' | 'interval'>('stopwatch');

  // --- Stopwatch / countdown (unchanged behaviour) ---
  let time = $state(0);
  let isRunning = $state(false);
  let interval: ReturnType<typeof setInterval> | null = null;
  let targetTime = $state(60);

  // --- Interval mode ---
  let spec = $state<IntervalSpec>(DEFAULT_SPEC);
  /** The exercise's own numbers, for the "edited" marker and Reset. */
  let baseSpec = $state<IntervalSpec>(DEFAULT_SPEC);
  let seededForSlotId = $state<string | null>(null);
  let bankedMs = $state(0);
  let runningSince = $state<number | null>(null);
  let now = $state(Date.now());
  let ticker: ReturnType<typeof setInterval> | null = null;
  let expanded = $state(false);
  /** Cue bookkeeping, so a phase change or a countdown second fires exactly once. */
  let lastStepIndex = $state(-1);
  let lastTickSecond = $state(-1);

  // --- Self-paced sets (strength work: you set the pace, the rest is timed) ---
  let timingMode = $state<SetTimingMode>('auto');
  let setRun = $state<SetRunState>(startSetRun(DEFAULT_SPEC));
  /** Reps staged for the set about to be finished, prefilled from the target. */
  let stagedReps = $state(DEFAULT_SPEC.reps);
  let lastTickAt = $state(0);
  /** Fires the "rest is over" cue once per rest rather than every tick. */
  let restCuedForSet = $state(0);
  let lastLeadInSecond = $state(-1);

  const timeline = $derived(buildTimeline(spec));
  const totalSeconds = $derived(timelineSeconds(timeline));
  const elapsedMs = $derived(bankedMs + (runningSince === null ? 0 : Math.max(0, now - runningSince)));
  const elapsedSeconds = $derived(elapsedMs / 1000);
  const position = $derived(positionAt(timeline, elapsedSeconds));
  const progress = $derived(progressAt(timeline, spec, elapsedSeconds));
  const intervalRunning = $derived(runningSince !== null);
  const intervalFinished = $derived(position.done && elapsedSeconds > 0);
  const intervalStarted = $derived(elapsedMs > 0 || intervalRunning);
  const workLabel = $derived(workPhaseLabel(currentSlot?.activeParameters));
  const selfPaced = $derived(isSelfPaced(currentSlot ? slotValues(currentSlot) : undefined, timingMode));
  const setRunDone = $derived(setRun.done);
  const setRunStarted = $derived(setRun.completed.length > 0 || setRun.sinceLastSetMs > 0 || runningSince !== null);
  /** One "has a run in progress" answer, whichever engine is in play. */
  const runInProgress = $derived(selfPaced ? (setRunStarted && !setRunDone) : (intervalStarted && !intervalFinished));

  /**
   * Re-seeds the protocol from whichever exercise is current.
   *
   * Deliberately skipped while a run is in progress: the session advances
   * its current exercise as things get logged, and re-seeding mid-run
   * would reset the timer out from under someone who is hanging off a
   * board. The effect re-runs when the run ends, so it catches up then.
   */
  $effect(() => {
    const slotId = currentSlot?.id ?? null;
    if (slotId === seededForSlotId) return;
    if (runInProgress) return;

    seededForSlotId = slotId;
    const seeded = specFromExercise(currentSlot ? slotValues(currentSlot) : undefined);
    baseSpec = seeded;
    spec = seeded;
    timingMode = 'auto';
    resetInterval();
    resetSetRun();
  });

  // --- Audio cues -------------------------------------------------------

  // Synthesized rather than bundled audio files, and created lazily on a
  // real user gesture (tapping play) - that is the unlock browsers require
  // for Web Audio, obtained naturally rather than with a dedicated tap.
  let audioContext: AudioContext | null = null;

  /**
   * Creates (or resumes) the AudioContext from inside a real click.
   *
   * Cues fire from an `$effect`, which runs after the gesture has already
   * ended - a context first created there starts suspended and never makes
   * a sound. Every control that can begin a run calls this synchronously
   * first, which is the unlock browsers actually require.
   */
  function unlockAudio() {
    if (!trainingState.timerBeepEnabled) return;
    try {
      audioContext ??= new AudioContext();
      if (audioContext.state === 'suspended') void audioContext.resume();
    } catch {
      // Same silent degrade as `tone` itself.
    }
  }

  function tone(frequency: number, durationMs: number, delayMs = 0, gain = 0.2) {
    if (!trainingState.timerBeepEnabled) return;
    try {
      audioContext ??= new AudioContext();
      const ctx = audioContext;
      const start = ctx.currentTime + delayMs / 1000;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.frequency.value = frequency;
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);
      osc.connect(amp).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + durationMs / 1000);
    } catch {
      // Web Audio unavailable or blocked - degrade silently, same
      // discipline as vibrate and keep-awake below.
    }
  }

  function buzz(pattern: number | number[]) {
    if (!trainingState.timerVibrateEnabled) return;
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Same silent degrade.
    }
  }

  /**
   * One cue per event, each distinguishable without looking: a rising pair
   * to go, a single tone to come off, a falling triple for the long rest,
   * and a rising triple when the whole protocol is done.
   */
  function cue(kind: 'work' | 'rest' | 'setRest' | 'leadIn' | 'done' | 'tick') {
    switch (kind) {
      case 'work':
        tone(880, 120); tone(1320, 220, 120);
        buzz([120, 60, 220]);
        break;
      case 'rest':
        tone(660, 260);
        buzz(180);
        break;
      case 'setRest':
        tone(660, 180); tone(520, 180, 190); tone(400, 320, 380);
        buzz([160, 80, 160, 80, 260]);
        break;
      case 'leadIn':
        tone(520, 200);
        buzz(100);
        break;
      case 'done':
        tone(660, 180); tone(880, 180, 190); tone(1320, 420, 380);
        buzz([200, 100, 200, 100, 400]);
        break;
      case 'tick':
        tone(1000, 70, 0, 0.12);
        buzz(40);
        break;
    }
  }

  // Fires cues off the derived position. Writing `lastStepIndex` /
  // `lastTickSecond` from inside re-runs this once more, which then no-ops -
  // it settles rather than looping.
  $effect(() => {
    if (mode !== 'interval' || !intervalRunning) return;

    const pos = position;

    if (pos.index !== lastStepIndex) {
      lastStepIndex = pos.index;
      lastTickSecond = -1;
      if (pos.done) {
        cue('done');
        finishRun();
      } else if (pos.step) {
        cue(pos.step.phase);
      }
      return;
    }

    // Count the last three seconds of a phase, so the change is never a
    // surprise - you get onto or off the holds on the beat, not after it.
    if (!pos.done && pos.remaining > 0 && pos.remaining <= 3 && pos.remaining !== lastTickSecond) {
      lastTickSecond = pos.remaining;
      cue('tick');
    }
  });

  // Self-paced cues: the lead-in counts you in, and the rest announces
  // itself when the target passes. Kept separate from the timed engine's
  // effect because the two never run at the same time and sharing one
  // would mean guarding every branch on which engine is live.
  $effect(() => {
    if (mode !== 'interval' || !selfPaced || runningSince === null) return;

    const phase = setRunPhase(setRun);

    if (phase === 'leadIn') {
      const second = Math.ceil(setRun.leadInRemainingMs / 1000);
      if (second > 0 && second <= 3 && second !== lastLeadInSecond) {
        lastLeadInSecond = second;
        cue('tick');
      }
      return;
    }

    if (lastLeadInSecond !== -1) {
      lastLeadInSecond = -1;
      if (setRun.completed.length === 0) cue('work');
    }

    if (phase === 'done') return;

    if (isResting(setRun)) {
      const left = restRemainingSeconds(setRun, spec);
      const second = Math.ceil(left);
      if (left > 0 && second <= 3 && second !== lastTickSecond) {
        lastTickSecond = second;
        cue('tick');
      }
      if (left <= 0 && restCuedForSet !== setRun.currentSet) {
        restCuedForSet = setRun.currentSet;
        lastTickSecond = -1;
        cue('work');
      }
    }
  });

  // --- Keep screen awake ------------------------------------------------
  // The standard Web Wake Lock API rather than a native plugin: Capacitor
  // renders in a system WebView, and modern Android/iOS WebViews support
  // `navigator.wakeLock`. Held for a whole interval run, not just one
  // countdown, so the screen doesn't sleep during a three-minute set rest.
  // Gated on the Settings toggle, and degrades silently when unsupported.
  let wakeLock: WakeLockSentinel | null = null;
  async function acquireWakeLock() {
    if (!trainingState.timerKeepAwakeEnabled) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      // The OS drops the lock whenever the page is hidden; clear our
      // handle so the next acquire actually re-requests one.
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }
  function releaseWakeLock() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }
  onDestroy(() => {
    releaseWakeLock();
    if (interval) clearInterval(interval);
    if (ticker) clearInterval(ticker);
  });

  // --- Interval controls ------------------------------------------------

  function syncTicker() {
    const shouldTick = mode === 'interval' && runningSince !== null;
    if (shouldTick && ticker === null) {
      now = Date.now();
      lastTickAt = now;
      ticker = setInterval(() => {
        const at = Date.now();
        const delta = lastTickAt > 0 ? at - lastTickAt : 0;
        lastTickAt = at;
        now = at;
        // The self-paced run advances by elapsed delta rather than being
        // derived from a start time, because only its rests are on a
        // clock - the sets themselves end when you say so.
        if (selfPaced && !setRun.done) setRun = tickSetRun(setRun, delta);
      }, 100);
    } else if (!shouldTick && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
      lastTickAt = 0;
    }
  }

  function startInterval() {
    unlockAudio();
    if (runningSince !== null) return;
    // Starting from a finished run begins again rather than sitting at the end.
    if (position.done && elapsedMs > 0) bankedMs = 0;
    runningSince = Date.now();
    now = runningSince;
    lastStepIndex = positionAt(timeline, bankedMs / 1000).index;
    lastTickSecond = -1;
    syncTicker();
    acquireWakeLock();
  }

  function pauseInterval() {
    if (runningSince === null) return;
    bankedMs = elapsedMs;
    runningSince = null;
    syncTicker();
    releaseWakeLock();
  }

  function toggleInterval() {
    if (runningSince === null) startInterval();
    else pauseInterval();
  }

  /** Stops the clock at the end - the run stays on screen so it can be logged. */
  function finishRun() {
    bankedMs = totalSeconds * 1000;
    runningSince = null;
    syncTicker();
    releaseWakeLock();
  }

  function resetSetRun() {
    setRun = startSetRun(spec);
    stagedReps = clampSpec(spec).reps;
    restCuedForSet = 0;
    lastLeadInSecond = -1;
  }

  function handleFinishSet() {
    unlockAudio();
    const next = finishSet(setRun, spec, stagedReps);
    setRun = next;
    stagedReps = clampSpec(spec).reps;
    restCuedForSet = 0;
    lastTickSecond = -1;
    if (next.done) {
      cue('done');
      runningSince = null;
      syncTicker();
      releaseWakeLock();
    } else {
      cue('setRest');
      if (runningSince === null) startSetRunClock();
    }
  }

  /** The self-paced run shares the interval clock's running flag, so pause works the same. */
  function startSetRunClock() {
    unlockAudio();
    if (runningSince !== null) return;
    runningSince = Date.now();
    now = runningSince;
    lastTickAt = runningSince;
    syncTicker();
    acquireWakeLock();
  }

  function handleUndoSet() {
    setRun = undoLastSet(setRun);
    stagedReps = clampSpec(spec).reps;
    restCuedForSet = 0;
  }

  function handleLogSetRun() {
    onLogInterval?.(setRunLoggedValues(spec, setRun));
    expanded = false;
    resetSetRun();
    stopClock();
  }

  function stopClock() {
    runningSince = null;
    syncTicker();
    releaseWakeLock();
  }

  function resetInterval() {
    bankedMs = 0;
    runningSince = null;
    lastStepIndex = -1;
    lastTickSecond = -1;
    syncTicker();
    releaseWakeLock();
  }

  function restartInterval() {
    resetInterval();
    startInterval();
  }

  function seekTo(seconds: number) {
    const clampedSeconds = Math.max(0, Math.min(seconds, totalSeconds));
    bankedMs = clampedSeconds * 1000;
    if (runningSince !== null) {
      runningSince = Date.now();
      now = runningSince;
    }
    lastStepIndex = positionAt(timeline, clampedSeconds).index;
    lastTickSecond = -1;
  }

  function applySpecPatch(patch: Partial<IntervalSpec>) {
    // Clamped on the way in, so a half-typed or nonsense field can't
    // produce an empty or runaway timeline.
    spec = clampSpec({ ...spec, ...patch });
  }

  function resetSpecToExercise() {
    spec = baseSpec;
  }

  function handleLogInterval() {
    onLogInterval?.(loggedValuesFor(spec, progress));
    expanded = false;
    resetInterval();
  }

  function stopInterval() {
    expanded = false;
    resetInterval();
  }

  function selectMode(next: 'stopwatch' | 'timer' | 'interval') {
    mode = next;
    if (next === 'interval') {
      resetStopwatch();
      expanded = true;
      // The self-paced run's clock has to be going for its rests to count;
      // the timed engine waits for an explicit play instead.
      if (selfPaced) { resetSetRun(); startSetRunClock(); }
    } else {
      resetInterval();
      expanded = false;
      reset();
    }
  }

  // --- Stopwatch / countdown --------------------------------------------

  const presets = $derived.by(() => {
    if (!currentSlot) return [];
    const v = slotValues(currentSlot);
    const list: { label: string; seconds: number }[] = [];
    if (v.timeOn) list.push({ label: 'On', seconds: v.timeOn });
    if (v.timeOff) list.push({ label: 'Off', seconds: v.timeOff });
    if (v.timeBetweenSets) list.push({ label: 'Sets', seconds: v.timeBetweenSets });
    return list;
  });

  function applyPreset(seconds: number) {
    mode = 'timer';
    targetTime = seconds;
    if (!isRunning) time = seconds;
  }

  function resetStopwatch() {
    if (interval) clearInterval(interval);
    isRunning = false;
    time = 0;
  }

  function toggle() {
    unlockAudio();
    if (isRunning) {
      if (interval) clearInterval(interval);
      isRunning = false;
      releaseWakeLock();
    } else {
      isRunning = true;
      acquireWakeLock();
      interval = setInterval(() => {
        if (mode === 'stopwatch') {
          time++;
        } else {
          if (time > 0) {
            time--;
          } else {
            if (interval) clearInterval(interval);
            isRunning = false;
            releaseWakeLock();
            cue('done');
          }
        }
      }, 1000);
    }
  }

  function reset() {
    if (interval) clearInterval(interval);
    isRunning = false;
    releaseWakeLock();
    time = mode === 'timer' ? targetTime : 0;
  }

  function formatTime(s: number) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function addTime(seconds: number) {
    if (mode === 'timer') {
      targetTime += seconds;
      if (targetTime < 0) targetTime = 0;
      if (!isRunning) time = targetTime;
    }
  }
</script>

{#if mode === 'interval' && expanded && visible && selfPaced}
  <SetRunView
    {spec}
    {baseSpec}
    run={setRun}
    bind:reps={stagedReps}
    {timingMode}
    {workLabel}
    isRunning={intervalRunning}
    canLog={onLogInterval !== null}
    onFinishSet={handleFinishSet}
    onUndo={handleUndoSet}
    onSkipLeadIn={() => { startSetRunClock(); setRun = skipLeadIn(setRun); }}
    onToggle={() => intervalRunning ? stopClock() : startSetRunClock()}
    onRestart={() => { resetSetRun(); startSetRunClock(); }}
    onMinimize={() => expanded = false}
    onClose={() => { expanded = false; resetSetRun(); stopClock(); }}
    onSpecChange={applySpecPatch}
    onResetToExercise={resetSpecToExercise}
    onTimingModeChange={(next) => { timingMode = next; resetSetRun(); resetInterval(); }}
    onLog={handleLogSetRun}
  />
{:else if mode === 'interval' && expanded && visible}
  <IntervalTimerView
    {spec}
    {baseSpec}
    {position}
    {progress}
    {totalSeconds}
    {elapsedSeconds}
    {workLabel}
    isRunning={intervalRunning}
    isFinished={intervalFinished}
    canLog={onLogInterval !== null}
    onToggle={toggleInterval}
    onSkip={() => seekTo(skipToNextSeconds(timeline, elapsedSeconds))}
    onBack={() => seekTo(backSeconds(timeline, elapsedSeconds))}
    onRestart={restartInterval}
    onMinimize={() => expanded = false}
    onClose={stopInterval}
    onSpecChange={applySpecPatch}
    onResetToExercise={resetSpecToExercise}
    onLog={handleLogInterval}
  />
{/if}

<div class="fixed {bottomClass} left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 {!visible || (mode === 'interval' && expanded) ? 'hidden' : ''}">
  {#if presets.length > 0 && mode !== 'interval'}
    <div class="flex items-center gap-1.5 bg-surface/90 backdrop-blur-md border border-border rounded-control px-2 py-1 shadow-card animate-in fade-in">
      {#each presets as preset}
        <button
          onclick={() => applyPreset(preset.seconds)}
          class="text-label text-content-subtle hover:text-primary transition-colors px-1"
        >
          {preset.label} {formatTime(preset.seconds)}
        </button>
      {/each}
    </div>
  {/if}

  <div class="bg-surface/90 backdrop-blur-md border border-border shadow-2xl rounded-full p-2 flex items-center gap-3 animate-in slide-in-from-bottom-10">
    <div class="flex items-center gap-1 bg-surface-elevated rounded-full p-1 border border-border-strong">
      <button
        onclick={() => selectMode('stopwatch')}
        class="w-8 h-8 rounded-full flex items-center justify-center transition-colors {mode === 'stopwatch' ? 'bg-primary text-white' : 'text-content-subtle hover:text-content'}"
        aria-label="Stopwatch"
      >
        <Icon icon="ic:baseline-timer" class="text-lg" />
      </button>
      <button
        onclick={() => selectMode('timer')}
        class="w-8 h-8 rounded-full flex items-center justify-center transition-colors {mode === 'timer' ? 'bg-warning text-white' : 'text-content-subtle hover:text-content'}"
        aria-label="Countdown"
      >
        <Icon icon="ic:baseline-hourglass-empty" class="text-lg" />
      </button>
      <button
        onclick={() => selectMode('interval')}
        class="w-8 h-8 rounded-full flex items-center justify-center transition-colors {mode === 'interval' ? 'bg-danger text-white' : 'text-content-subtle hover:text-content'}"
        aria-label="Interval timer"
        title="Interval — sets, reps and rests"
      >
        <Icon icon="ic:baseline-repeat" class="text-lg" />
      </button>
    </div>

    {#if mode === 'interval' && selfPaced}
      <!-- Minimised self-paced run: which set, and how long you have
           rested. Tapping goes back to the big view, where the only
           action - finishing a set - actually lives. -->
      <button onclick={() => expanded = true} class="flex items-center gap-3 pr-1 text-left">
        <div class="min-w-0">
          <p class="text-label font-bold text-content leading-tight tabular-nums">
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
          <p class="text-caption text-content-subtle tabular-nums leading-tight">
            {setRun.completed.length}/{spec.sets} sets done
          </p>
        </div>
        <Icon icon="ic:baseline-open-in-full" class="text-sm text-content-subtle shrink-0" />
      </button>

      <button
        onclick={() => expanded = true}
        class="w-10 h-10 rounded-full flex items-center justify-center bg-success text-app-bg hover:opacity-90 transition-all shadow-lg active:scale-90"
        aria-label="Open the set timer"
      >
        <Icon icon="ic:baseline-check-circle" class="text-2xl" />
      </button>
    {:else if mode === 'interval'}
      <!-- Minimised interval: enough to know where you are, and a tap to
           get the big view back. -->
      <button onclick={() => expanded = true} class="flex items-center gap-3 pr-1 text-left">
        <div class="min-w-0">
          <p class="text-label font-bold text-content leading-tight tabular-nums">
            {intervalFinished ? 'Done' : phaseLabel(position.step?.phase ?? 'leadIn', workLabel)}
            {#if !intervalFinished}<span class="text-content-subtle"> {position.remaining}s</span>{/if}
          </p>
          <p class="text-caption text-content-subtle tabular-nums leading-tight">
            S{progress.currentSet}/{spec.sets} &middot; R{progress.currentRep}/{spec.reps}
          </p>
        </div>
        <Icon icon="ic:baseline-open-in-full" class="text-sm text-content-subtle shrink-0" />
      </button>

      <button
        onclick={toggleInterval}
        class="w-10 h-10 rounded-full flex items-center justify-center {intervalRunning ? 'bg-danger text-white' : 'bg-success text-app-bg'} hover:opacity-90 transition-all shadow-lg active:scale-90"
        aria-label={intervalRunning ? 'Pause' : 'Start'}
      >
        <Icon icon={intervalRunning ? "ic:baseline-pause" : "ic:baseline-play-arrow"} class="text-2xl" />
      </button>
    {:else}
      <div class="w-16 text-center text-metric text-content tabular-nums">
        {formatTime(time)}
      </div>

      <div class="flex items-center gap-2 pr-2">
        {#if mode === 'timer'}
          <div class="flex flex-col gap-1 mr-2">
            <button onclick={() => addTime(30)} class="text-label text-content-muted hover:text-content bg-surface-elevated px-1 rounded-control transition-colors">+30s</button>
            <button onclick={() => addTime(-30)} class="text-label text-content-muted hover:text-content bg-surface-elevated px-1 rounded-control transition-colors">-30s</button>
          </div>
        {/if}

        <button
          onclick={toggle}
          class="w-10 h-10 rounded-full flex items-center justify-center {isRunning ? 'bg-danger text-white' : 'bg-success text-app-bg'} hover:opacity-90 transition-all shadow-lg active:scale-90"
          aria-label={isRunning ? 'Pause' : 'Start'}
        >
          <Icon icon={isRunning ? "ic:baseline-pause" : "ic:baseline-play-arrow"} class="text-2xl" />
        </button>

        <button
          onclick={reset}
          class="w-8 h-8 rounded-full flex items-center justify-center bg-surface-elevated text-content-subtle hover:text-content border border-border-strong transition-colors active:scale-90"
          aria-label="Reset"
        >
          <Icon icon="ic:baseline-refresh" class="text-lg" />
        </button>
      </div>
    {/if}
  </div>
</div>
