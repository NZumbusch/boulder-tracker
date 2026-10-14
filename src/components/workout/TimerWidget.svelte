<script lang="ts">
  /**
   * Floating stopwatch and countdown - the two plain timers. Intervals, sets
   * and the pacer are runs of the circuit engine (`CircuitRunner`); the third
   * button here opens one (`onOpenRun`).
   *
   * Both are kept as timestamps (`lib/timer/clock`) so they stay right while
   * the phone is locked or the app is in the background - a per-second
   * counter fell behind as soon as Android throttled it.
   *
   * `bottom-[91px]` (the default) clears App.svelte's nav bar; the session
   * modal covers that nav with a shorter footer and overrides it.
   *
   * Survives the app being closed in the background: its state is saved
   * (`lib/timer/persistTimer`) and restored on the next start. While the
   * app is hidden, a running countdown's end (and the optional 15 s
   * warning) is handed to Android as a notification
   * (`lib/timer/timerAlerts`) and taken back on return.
   */
  import { onDestroy, untrack } from "svelte";
  import Icon from "@iconify/svelte";
  import { slotValues, slotTypeName } from "../../lib/exerciseSlot";
  import { trainingState } from "../../lib/state.svelte";
  import type { ExerciseSlot } from "../../lib/types";
  import { type Clock, STOPPED_CLOCK, clockElapsedMs, startClock, pauseClock, countdownRemainingMs } from "../../lib/timer/clock";
  import { upcomingAlerts } from "../../lib/timer/timerAlerts";
  import { ACTIVE_TIMER_KEY, parseStoredTimer, serializeTimer, type TimerSnapshot } from "../../lib/timer/persistTimer";
  import { scheduleTimerAlerts, cancelTimerAlerts, ensureTimerAlertPermission } from "../../lib/notifications/timerAlerts";
  import { buildLiveTimer } from "../../lib/timer/liveTimer";
  import { liveTimerAvailable, type LiveAction } from "../../lib/native/timerService";
  import { cueMute } from "../../lib/timer/cueMute.svelte";
  import { live, onLiveAction, collectLiveActions } from "../../lib/native/liveNotification.svelte";
  import { CueSound, type CueKind } from "../../lib/timer/cueSound";
  import { ScreenWakeLock } from "../../lib/timer/screenWakeLock";

  let {
    currentSlot = null,
    bottomClass = 'bottom-[calc(var(--chrome-b)+var(--fab-b)+16px+env(safe-area-inset-bottom))]',
    visible = true,
    docked = false,
    onOpenRun = null,
  }: {
    /** The current exercise, for the countdown's On / Off / Sets shortcuts. */
    currentSlot?: ExerciseSlot | null;
    /**
     * Hides the widget without unmounting it. The session modal minimises
     * to a bubble, and unmounting there would throw away a running
     * countdown - the timer stays alive and silent instead, still audible,
     * just not on screen.
     */
    visible?: boolean;
    /**
     * The host shows the tucked-away button itself (the live session puts
     * it in its bottom bar, reading `tucked()`), so the widget doesn't
     * float its own over the list.
     */
    docked?: boolean;
    /** Vertical placement, so the widget can clear whatever is beneath it. */
    bottomClass?: string;
    /** Opens the runner for intervals, sets and the pacer. */
    onOpenRun?: (() => void) | null;
  } = $props();

  let mode = $state<'stopwatch' | 'timer'>('stopwatch');

  /** The one clock reading every timer display derives from, refreshed by the ticker. */
  let now = $state(Date.now());

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
  /** The 15 s heads-up (optional, Settings -> Timer, sound & voice). */
  const WARN_SECONDS = 15;

  // --- Audio cues -------------------------------------------------------

  // The tones and vibrations themselves: lib/timer/cueSound.
  const sound = new CueSound({ sound: () => trainingState.timerBeepEnabled && !cueMute.muted, vibrate: () => trainingState.timerVibrateEnabled, volume: () => trainingState.timerCues.volume, preset: () => trainingState.timerCues.sound });
  /** Every control that can begin a run calls this synchronously first - Web Audio's unlock (see CueSound.unlock). */
  const unlockAudio = () => sound.unlock();

  /**
   * Clock cues are played by the Android timer service while it runs (it has
   * the same schedule, and keeps playing when the phone is locked), so the
   * page stays quiet for them to avoid double beeps.
   */
  function cue(kind: CueKind) {
    // Hidden (locked, backgrounded): the service or a scheduled
    // notification speaks for the timer, so a late beep would double it.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (liveActive) return;
    if (kind === 'tick' && !trainingState.timerCountdownTicks) return;
    sound.play(kind);
  }

  // --- Keep screen awake ------------------------------------------------
  const screenLock = new ScreenWakeLock();
  function acquireWakeLock() {
    if (trainingState.timerKeepAwakeEnabled) void screenLock.acquire();
  }
  const releaseWakeLock = () => screenLock.release();
  onDestroy(() => {
    releaseWakeLock();
    if (interval) clearInterval(interval);
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
  let planNonce = $state(0);

  /** Publishes this timer's plan for the session notification (see `lib/native/liveNotification`). Null when no timer runs. */
  function syncLive() {
    // A running circuit or interval run owns the timer plan (CircuitRunner) - don't overwrite it.
    if (live.circuitRunning) return;
    const config = buildLiveTimer({
      mode,
      targetSeconds: targetTime,
      basic,
      ticks: trainingState.timerCountdownTicks,
      warningSeconds: trainingState.timerWarnBeforeEnd ? WARN_SECONDS : 0,
      label: currentSlot ? slotTypeName(currentSlot, trainingState.exerciseTypes) : 'Session timer',
    }, Date.now());
    if (!useLive) {
      live.timerPlan = null;
      live.timerFinished = false;
      return;
    }
    // Ran out by itself: the service plays the finish and moves on by itself.
    live.timerFinished = !config && mode === 'timer' && basic.bankedMs > 0 && countdownRemainingMs(targetTime, basic, Date.now()) <= 0;
    live.timerPlan = config;
  }

  $effect(() => {
    void [mode, targetTime, basic.bankedMs, basic.runningSince, currentSlot?.id,
      trainingState.timerCountdownTicks, trainingState.timerWarnBeforeEnd, trainingState.timerBeepEnabled,
      trainingState.timerVibrateEnabled, useLive, live.circuitRunning, planNonce];
    untrack(syncLive);
  });

  /** A notification button was pressed: apply it to the timer at the moment it happened. */
  function applyLiveAction({ kind, at }: LiveAction) {
    if (kind !== 'pause' && kind !== 'resume' && kind !== 'add30') return; // the session's, not the timer's
    if (kind === 'add30') {
      addTime(30);
      return;
    }
    basic = kind === 'pause' ? pauseClock(basic, at) : startClock(basic, at);
    now = Date.now();
    syncBasicTicker();
  }
  $effect(() => onLiveAction(applyLiveAction));

  // --- Surviving the background ------------------------------------------

  function saveTimer() {
    const snapshot: TimerSnapshot = { mode, targetSeconds: targetTime, basic: $state.snapshot(basic) };
    try { localStorage.setItem(ACTIVE_TIMER_KEY, serializeTimer(snapshot)); } catch { /* storage unavailable */ }
  }

  // Restore what was running before Android closed the app.
  {
    let stored: TimerSnapshot | null = null;
    try { stored = parseStoredTimer(localStorage.getItem(ACTIVE_TIMER_KEY)); } catch { /* storage unavailable */ }
    if (stored) {
      mode = stored.mode;
      targetTime = stored.targetSeconds;
      basic = stored.basic;
      now = Date.now();
      queueMicrotask(() => syncBasicTicker());
    }
  }

  // Saved on every meaningful change.
  $effect(() => {
    void [mode, targetTime, basic.bankedMs, basic.runningSince];
    untrack(saveTimer);
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

  /** What the tucked-away button shows - for a host that docks it (`docked`). */
  export function tucked(): { icon: string; running: boolean; text: string | null } {
    return {
      icon: mode === 'timer' ? 'ic:baseline-hourglass-empty' : 'ic:baseline-timer',
      running: isRunning,
      text: isRunning ? formatTime(time) : null,
    };
  }

  // --- Stopwatch / countdown --------------------------------------------

  function selectMode(next: 'stopwatch' | 'timer') {
    mode = next;
    reset();
  }

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

  /** Redraws the stopwatch/countdown while it runs. */
  function syncBasicTicker() {
    const shouldTick = basic.runningSince !== null;
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

<!-- z-[111]: above the live session (z-110) - at z-50 it sat hidden behind
     it, which is why the timer could not be found at all - and below the
     session's own sheets and the interval views. -->
<!-- Tucked away: a small button at the side. It still shows a running
     timer's time, and a tap brings the whole timer back. -->
{#if visible && !docked && trainingState.timerPillHidden}
  {@const running = isRunning}
  <button
    onclick={() => trainingState.setTimerPillHidden(false)}
    class="fixed {bottomClass} right-4 z-[111] h-11 min-w-11 px-3 rounded-full flex items-center justify-center gap-1.5 bg-surface/90 backdrop-blur-md border border-border shadow-card text-label tabular-nums animate-in fade-in {running ? 'text-primary' : 'text-content-subtle'}"
    aria-label="Show the timer"
  >
    <Icon icon={mode === 'timer' ? 'ic:baseline-hourglass-empty' : 'ic:baseline-timer'} class="text-lg" />
    {#if running}
      {formatTime(time)}
    {/if}
  </button>
{/if}

<!-- Full-width row that centres the pill. Positioning the pill itself at
     left: 50% only gave it half the screen to lay out in, so the minimised
     interval readout wrapped into a narrow broken column. The row lets taps
     through; only the pill takes them. -->
<div class="fixed {bottomClass} inset-x-0 px-4 z-[111] flex flex-col items-center gap-2 short:items-start pointer-events-none [&>*]:pointer-events-auto {!visible || trainingState.timerPillHidden ? 'hidden' : ''}">
  {#if presets.length > 0}
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

  <!-- Sized to fit a narrow phone (~360 px) - it used to run off both edges. -->
  <div class="max-w-full short:scale-90 short:origin-bottom-left bg-surface/90 backdrop-blur-md border border-border shadow-2xl rounded-full p-1.5 flex items-center gap-2 animate-in slide-in-from-bottom-10">
    <div class="shrink-0 flex items-center gap-0.5 bg-surface-elevated rounded-full p-1 border border-border-strong">
      <button
        onclick={() => selectMode('stopwatch')}
        class="w-7 h-7 rounded-full flex items-center justify-center transition-colors {mode === 'stopwatch' ? 'bg-primary text-white' : 'text-content-subtle hover:text-content'}"
        aria-label="Stopwatch"
      >
        <Icon icon="ic:baseline-timer" class="text-lg" />
      </button>
      <button
        onclick={() => selectMode('timer')}
        class="w-7 h-7 rounded-full flex items-center justify-center transition-colors {mode === 'timer' ? 'bg-warning text-white' : 'text-content-subtle hover:text-content'}"
        aria-label="Countdown"
      >
        <Icon icon="ic:baseline-hourglass-empty" class="text-lg" />
      </button>
      {#if onOpenRun}
        <button
          onclick={onOpenRun}
          class="w-7 h-7 rounded-full flex items-center justify-center transition-colors text-content-subtle hover:text-content"
          aria-label="Intervals, sets and pacer"
          title="Intervals, sets and pacer"
        >
          <Icon icon="ic:baseline-repeat" class="text-lg" />
        </button>
      {/if}
    </div>

    <div class="min-w-14 text-center text-metric text-content tabular-nums">
      {formatTime(time)}
    </div>

    <div class="shrink-0 flex items-center gap-1.5">
      {#if mode === 'timer'}
        <div class="flex flex-col gap-1">
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
    <button
      onclick={() => trainingState.setTimerPillHidden(true)}
      class="shrink-0 w-7 h-8 -ml-1 rounded-full flex items-center justify-center text-content-subtle hover:text-content transition-colors"
      aria-label="Hide the timer"
      title="Hide - it keeps running"
    >
      <Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" />
    </button>
  </div>
</div>
