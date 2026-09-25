<script lang="ts">
  /**
   * Floating stopwatch / countdown / interval timer (ported from an old
   * stash, extended 2026-09-22 with interval mode).
   *
   * Three modes:
   * - **Stopwatch** and **countdown**, kept as timestamps (`lib/timer/clock`)
   *   so they stay right while the phone is locked or the app is in the
   *   background - a per-second counter fell behind as soon as Android
   *   throttled it.
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
   *
   * Survives the app being closed in the background: its state is saved
   * (`lib/timer/persistTimer`) and restored on the next start. While the
   * app is hidden, upcoming moments (rest over, countdown done, the
   * optional 15 s warning) are handed to Android as notifications
   * (`lib/timer/timerAlerts`) and taken back on return.
   */
  import { onDestroy, untrack } from "svelte";
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
  import { type Clock, STOPPED_CLOCK, clockElapsedMs, startClock, pauseClock, countdownRemainingMs } from "../../lib/timer/clock";
  import { upcomingAlerts } from "../../lib/timer/timerAlerts";
  import { ACTIVE_TIMER_KEY, parseStoredTimer, serializeTimer, type TimerSnapshot } from "../../lib/timer/persistTimer";
  import { scheduleTimerAlerts, cancelTimerAlerts, ensureTimerAlertPermission } from "../../lib/notifications/timerAlerts";
  import { hasIntervalTiming } from "../../lib/timer/intervalTimer";
  import { buildLiveTimer } from "../../lib/timer/liveTimer";
  import { liveTimerAvailable, type LiveAction } from "../../lib/native/timerService";
  import { live, onLiveAction, collectLiveActions } from "../../lib/native/liveNotification.svelte";
  import { slotTypeName } from "../../lib/exerciseSlot";
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

  /** The one clock reading every timer display derives from, refreshed by the tickers. */
  let now = $state(Date.now());

  // --- Stopwatch / countdown: a timestamp clock, ticked only to redraw ---
  let basic = $state<Clock>(STOPPED_CLOCK);
  let targetTime = $state(60);
  let interval: ReturnType<typeof setInterval> | null = null;
  const isRunning = $derived(basic.runningSince !== null);
  /** Whole seconds shown: up for the stopwatch, down (rounded up) for the countdown. */
  const time = $derived(
    mode === 'timer'
      ? Math.ceil(countdownRemainingMs(targetTime, basic, now) / 1000)
      : Math.floor(clockElapsedMs(basic, now) / 1000),
  );
  /** Cue bookkeeping for the countdown's 3-2-1 and warning. */
  let basicLastTick = -1;
  let basicWarned = false;

  // --- Interval mode ---
  let spec = $state<IntervalSpec>(DEFAULT_SPEC);
  /** The exercise's own numbers, for the "edited" marker and Reset. */
  let baseSpec = $state<IntervalSpec>(DEFAULT_SPEC);
  let seededForSlotId = $state<string | null>(null);
  let bankedMs = $state(0);
  let runningSince = $state<number | null>(null);
  let ticker: ReturnType<typeof setInterval> | null = null;
  let expanded = $state(false);
  /** Cue bookkeeping, so a phase change or a countdown second fires exactly once. */
  let lastStepIndex = $state(-1);
  let lastTickSecond = $state(-1);
  /** The 15 s heads-up (optional, Settings -> Sessions & Timer). */
  const WARN_SECONDS = 15;
  let warnedStepIndex = -1;
  let restWarnedForSet = 0;

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
  /**
   * `immediate` marks a cue that answers a tap (finishing a set) rather
   * than a moment on the clock. Clock cues are played by the Android timer
   * service while it runs (it has the same schedule, and keeps playing when
   * the phone is locked), so the page stays quiet for them to avoid double
   * beeps; tap cues always come from the page.
   */
  function cue(kind: 'work' | 'rest' | 'setRest' | 'leadIn' | 'done' | 'tick' | 'warn', immediate = false) {
    // Hidden (locked, backgrounded): the service or a scheduled
    // notification speaks for the timer, so a late beep would double it.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (liveActive && !immediate) return;
    if (kind === 'tick' && !trainingState.timerCountdownTicks) return;
    switch (kind) {
      case 'warn':
        tone(740, 90); tone(740, 90, 160);
        buzz([80, 80, 80]);
        break;
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
    if (mode !== 'interval' || !intervalRunning || heldForNative) return;

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

    // The optional heads-up before a set rest ends.
    if (trainingState.timerWarnBeforeEnd && pos.step?.phase === 'setRest' && pos.remaining === WARN_SECONDS && warnedStepIndex !== pos.index) {
      warnedStepIndex = pos.index;
      cue('warn');
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
    if (mode !== 'interval' || !selfPaced || runningSince === null || heldForNative) return;

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
      if (trainingState.timerWarnBeforeEnd && left > 0 && left <= WARN_SECONDS && restWarnedForSet !== setRun.currentSet) {
        restWarnedForSet = setRun.currentSet;
        cue('warn');
      }
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
    // Unmounted = the session ended: nothing left to restore or alert about.
    live.timerPlan = null;
    live.timerFinished = false;
    try { localStorage.removeItem(ACTIVE_TIMER_KEY); } catch { /* storage unavailable */ }
    void cancelTimerAlerts();
  });

  // --- Android timer service ---------------------------------------------
  // While a timer runs, the native service (plugins/timer-service) shows
  // it as a notification with a live countdown and plays its cues - also
  // when the phone is locked, over music. Re-planned on every change.
  /** The service is playing this timer's cues (its plan is published and the service is up). */
  const liveActive = $derived(live.timerPlan !== null && live.serviceOk);
  /**
   * Set while the page is hidden with the service running: the service owns
   * the timer then, and the page must not finish anything by itself - when
   * it wakes it would otherwise see a countdown that was paused from the
   * notification as already run out. Cleared once the notification's
   * button presses have been collected and applied.
   */
  let heldForNative = $state(false);
  const useLive = $derived(liveTimerAvailable() && trainingState.timerBackgroundAlerts);

  /**
   * Publishes this timer's plan for the session notification (see
   * `lib/native/liveNotification`, which combines it with the session and
   * talks to Android). Null when no timer runs.
   */
  function syncLive() {
    if (!useLive) {
      live.timerPlan = null;
      live.timerFinished = false;
      return;
    }
    const config = buildLiveTimer({
      mode,
      targetSeconds: targetTime,
      basic,
      spec,
      intervalClock: { bankedMs, runningSince },
      selfPaced,
      setRun,
      ticks: trainingState.timerCountdownTicks,
      warningSeconds: trainingState.timerWarnBeforeEnd ? WARN_SECONDS : 0,
      label: currentSlot ? slotTypeName(currentSlot, trainingState.exerciseTypes) : 'Session timer',
      workLabel,
    }, Date.now());
    // Ran out by itself: the service plays the finish and moves on by itself.
    live.timerFinished = !config && (
      (mode === 'timer' && basic.bankedMs > 0 && countdownRemainingMs(targetTime, basic, Date.now()) <= 0)
      || (mode === 'interval' && (selfPaced ? setRun.done : intervalFinished))
    );
    live.timerPlan = config;
  }

  $effect(() => {
    void [mode, targetTime, basic.bankedMs, basic.runningSince, spec, bankedMs, runningSince, timingMode, selfPaced,
      setRun.currentSet, setRun.completed.length, setRun.done, setRun.leadInRemainingMs > 0, currentSlot?.id,
      trainingState.timerCountdownTicks, trainingState.timerWarnBeforeEnd, trainingState.timerBeepEnabled,
      trainingState.timerVibrateEnabled, useLive];
    untrack(syncLive);
  });

  /** A notification button was pressed: apply it to the timer at the moment it happened. */
  function applyLiveAction({ kind, at }: LiveAction) {
    if (kind !== 'pause' && kind !== 'resume' && kind !== 'add30') return; // the session's, not the timer's
    if (kind === 'add30') {
      addTime(30);
      return;
    }
    if (mode === 'interval') {
      if (kind === 'pause' && runningSince !== null) {
        bankedMs += Math.max(0, at - runningSince);
        runningSince = null;
        releaseWakeLock();
      } else if (kind === 'resume' && runningSince === null) {
        runningSince = at;
      }
      now = Date.now();
      syncTicker();
    } else {
      basic = kind === 'pause' ? pauseClock(basic, at) : startClock(basic, at);
      now = Date.now();
      syncBasicTicker();
    }
  }
  $effect(() => onLiveAction(applyLiveAction));

  // --- Surviving the background ------------------------------------------

  function snapshot(): TimerSnapshot {
    return {
      mode,
      targetSeconds: targetTime,
      basic: $state.snapshot(basic),
      spec: $state.snapshot(spec),
      baseSpec: $state.snapshot(baseSpec),
      seededForSlotId,
      intervalClock: { bankedMs, runningSince },
      expanded,
      timingMode,
      setRun: $state.snapshot(setRun),
      stagedReps,
      lastTickAt,
    };
  }

  function saveTimer() {
    try { localStorage.setItem(ACTIVE_TIMER_KEY, serializeTimer(snapshot())); } catch { /* storage unavailable */ }
  }

  // Restore what was running before Android closed the app. Seeding is
  // skipped for the same exercise, so the reseed effect below leaves it.
  {
    let stored: TimerSnapshot | null = null;
    try { stored = parseStoredTimer(localStorage.getItem(ACTIVE_TIMER_KEY)); } catch { /* storage unavailable */ }
    if (stored) {
      mode = stored.mode;
      targetTime = stored.targetSeconds;
      basic = stored.basic;
      spec = stored.spec;
      baseSpec = stored.baseSpec;
      seededForSlotId = stored.seededForSlotId;
      bankedMs = stored.intervalClock.bankedMs;
      runningSince = stored.intervalClock.runningSince;
      expanded = stored.expanded;
      timingMode = stored.timingMode;
      setRun = stored.setRun;
      stagedReps = stored.stagedReps;
      lastTickAt = stored.lastTickAt;
      now = Date.now();
      // Cues for steps that passed while the app was gone stay silent.
      const restoredElapsedMs = stored.intervalClock.bankedMs + (stored.intervalClock.runningSince === null ? 0 : Date.now() - stored.intervalClock.runningSince);
      lastStepIndex = positionAt(buildTimeline(stored.spec), restoredElapsedMs / 1000).index;
      queueMicrotask(() => { syncTicker(); syncBasicTicker(); });
    }
  }

  // Saved on every meaningful change (not on each 100 ms tick - the tick
  // fields are saved with the next change, on hide, and every few seconds).
  $effect(() => {
    void [mode, targetTime, basic.bankedMs, basic.runningSince, spec, baseSpec, seededForSlotId, bankedMs, runningSince,
      expanded, timingMode, setRun.currentSet, setRun.completed.length, setRun.done, stagedReps];
    untrack(saveTimer);
  });
  $effect(() => {
    const running = runningSince !== null || basic.runningSince !== null;
    if (!running) return;
    const id = setInterval(saveTimer, 5000);
    return () => clearInterval(id);
  });

  // Hidden: save, and hand the next moments to Android. Back: take them back.
  $effect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveTimer();
        // The timer service already covers it; plain notifications are the
        // fallback when it isn't running (web has neither).
        if (liveActive) heldForNative = true;
        if (!trainingState.timerBackgroundAlerts || liveActive) return;
        const alerts = upcomingAlerts({
          mode,
          targetSeconds: targetTime,
          basic,
          spec,
          intervalClock: { bankedMs, runningSince },
          selfPaced,
          setRun,
          warningSeconds: trainingState.timerWarnBeforeEnd ? WARN_SECONDS : 0,
        }, Date.now());
        void scheduleTimerAlerts(alerts);
      } else {
        void cancelTimerAlerts();
        // Apply what was pressed in the notification first, then catch up.
        void collectLiveActions().then(() => {
          heldForNative = false;
          now = Date.now();
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  /** On the first timer start (a real tap), ask for notification permission if background alerts are on. */
  function askForAlerts() {
    if (trainingState.timerBackgroundAlerts) void ensureTimerAlertPermission();
  }

  /**
   * Opens the timer that fits the current exercise - the interval protocol
   * or the self-paced set run when it has timing, a stopwatch otherwise.
   * Called from the session's exercise card ("Timer").
   */
  export function openForExercise() {
    trainingState.setTimerPillHidden(false);
    const values = currentSlot ? slotValues(currentSlot) : undefined;
    if (hasIntervalTiming(values)) selectMode('interval');
    else if (mode === 'interval') selectMode('stopwatch');
  }

  /** Whether the current exercise has timing the interval/set timer can run. */
  export function exerciseHasTiming(): boolean {
    return hasIntervalTiming(currentSlot ? slotValues(currentSlot) : undefined);
  }

  // --- Interval controls ------------------------------------------------

  function syncTicker() {
    const shouldTick = mode === 'interval' && runningSince !== null;
    if (shouldTick && ticker === null) {
      now = Date.now();
      // A restored run keeps its last tick, so the first tick covers the
      // time the app was away; a fresh start begins from now.
      if (lastTickAt === 0) lastTickAt = now;
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
    askForAlerts();
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
      cue('done', true);
      runningSince = null;
      syncTicker();
      releaseWakeLock();
    } else {
      cue('setRest', true);
      if (runningSince === null) startSetRunClock();
    }
  }

  /** The self-paced run shares the interval clock's running flag, so pause works the same. */
  function startSetRunClock() {
    unlockAudio();
    askForAlerts();
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
    if (!isRunning) basic = STOPPED_CLOCK;
  }

  function resetStopwatch() {
    basic = STOPPED_CLOCK;
    syncBasicTicker();
  }

  /** Redraws the stopwatch/countdown while it runs, and ends the countdown. */
  function syncBasicTicker() {
    const shouldTick = basic.runningSince !== null && mode !== 'interval';
    if (shouldTick && interval === null) {
      now = Date.now();
      interval = setInterval(() => { now = Date.now(); }, 250);
    } else if (!shouldTick && interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  }

  // Countdown cues and its end, read off the clock rather than counted.
  $effect(() => {
    if (mode !== 'timer' || basic.runningSince === null || heldForNative) return;
    const remaining = countdownRemainingMs(targetTime, basic, now);
    const second = Math.ceil(remaining / 1000);
    if (remaining <= 0) {
      basic = { bankedMs: targetTime * 1000, runningSince: null };
      untrack(() => { syncBasicTicker(); releaseWakeLock(); });
      basicLastTick = -1;
      cue('done');
      return;
    }
    if (trainingState.timerWarnBeforeEnd && !basicWarned && targetTime > WARN_SECONDS && second <= WARN_SECONDS) {
      basicWarned = true;
      cue('warn');
    }
    if (second <= 3 && second !== basicLastTick) {
      basicLastTick = second;
      cue('tick');
    }
  });

  function toggle() {
    unlockAudio();
    if (isRunning) {
      basic = pauseClock(basic, Date.now());
      releaseWakeLock();
    } else {
      // Starting a finished countdown begins it again.
      if (mode === 'timer' && countdownRemainingMs(targetTime, basic, Date.now()) <= 0) basic = STOPPED_CLOCK;
      basicLastTick = -1;
      basicWarned = mode === 'timer' && countdownRemainingMs(targetTime, basic, Date.now()) <= WARN_SECONDS * 1000;
      basic = startClock(basic, Date.now());
      acquireWakeLock();
      askForAlerts();
    }
    syncBasicTicker();
  }

  function reset() {
    basic = STOPPED_CLOCK;
    basicLastTick = -1;
    basicWarned = false;
    syncBasicTicker();
    releaseWakeLock();
  }

  function formatTime(s: number) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function addTime(seconds: number) {
    if (mode === 'timer') {
      targetTime = Math.max(0, targetTime + seconds);
      if (countdownRemainingMs(targetTime, basic, Date.now()) > WARN_SECONDS * 1000) basicWarned = false;
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

<!-- z-[111]: above the live session (z-110) - at z-50 it sat hidden behind
     it, which is why the timer could not be found at all - and below the
     session's own sheets and the interval views. -->
<!-- Tucked away: a small button at the side. It still shows a running
     timer's time, and a tap brings the whole timer back. -->
{#if visible && trainingState.timerPillHidden && !(mode === 'interval' && expanded)}
  {@const running = mode === 'interval' ? intervalRunning : isRunning}
  <button
    onclick={() => trainingState.setTimerPillHidden(false)}
    class="fixed {bottomClass} right-4 z-[111] h-11 min-w-11 px-3 rounded-full flex items-center justify-center gap-1.5 bg-surface/90 backdrop-blur-md border border-border shadow-card text-label tabular-nums animate-in fade-in {running ? 'text-primary' : 'text-content-subtle'}"
    aria-label="Show the timer"
  >
    <Icon icon={mode === 'interval' ? 'ic:baseline-repeat' : mode === 'timer' ? 'ic:baseline-hourglass-empty' : 'ic:baseline-timer'} class="text-lg" />
    {#if running}
      {mode === 'interval' ? (selfPaced ? `Set ${setRun.currentSet}` : `${position.remaining}s`) : formatTime(time)}
    {/if}
  </button>
{/if}

<!-- Full-width row that centres the pill. Positioning the pill itself at
     left: 50% only gave it half the screen to lay out in, so the minimised
     interval readout wrapped into a narrow broken column. The row lets taps
     through; only the pill takes them. -->
<div class="fixed {bottomClass} inset-x-0 px-4 z-[111] flex flex-col items-center gap-2 pointer-events-none [&>*]:pointer-events-auto {!visible || trainingState.timerPillHidden || (mode === 'interval' && expanded) ? 'hidden' : ''}">
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
          <p class="text-label font-bold text-content leading-tight tabular-nums whitespace-nowrap">
            {intervalFinished ? 'Done' : phaseLabel(position.step?.phase ?? 'leadIn', workLabel)}
            {#if !intervalFinished}<span class="text-content-subtle"> {position.remaining}s</span>{/if}
          </p>
          <p class="text-caption text-content-subtle tabular-nums leading-tight whitespace-nowrap">
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
    <button
      onclick={() => trainingState.setTimerPillHidden(true)}
      class="w-8 h-8 -ml-1 rounded-full flex items-center justify-center text-content-subtle hover:text-content transition-colors"
      aria-label="Hide the timer"
      title="Hide - it keeps running"
    >
      <Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" />
    </button>
  </div>
</div>
