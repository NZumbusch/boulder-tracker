<script lang="ts" module>
  /** Where a running circuit is kept, so it survives Android closing the app. */
  export const CIRCUIT_RUN_KEY = 'boulder_tracker_circuit_run';

  /**
   * The group a stored run belongs to, if one is waiting to be resumed in
   * this session (`sessionKey` = its start time). Group ids repeat across
   * weeks (they come from templates), so a run is only ever resumed in the
   * session it was started in.
   */
  export function storedCircuitGroupId(sessionKey: string | undefined): string | null {
    try {
      const raw = localStorage.getItem(CIRCUIT_RUN_KEY);
      const stored = raw ? JSON.parse(raw) : null;
      return stored && stored.sessionKey === sessionKey && typeof stored.groupId === 'string' ? stored.groupId : null;
    } catch {
      return null;
    }
  }

  export function forgetCircuitRun() {
    try { localStorage.removeItem(CIRCUIT_RUN_KEY); } catch { /* storage unavailable */ }
  }
</script>

<script lang="ts">
  /**
   * A circuit or superset, run live and full screen: round by round, timed
   * sets counting down, counted sets waiting for Done (with the reps), the
   * switches and rests on the clock (lib/timer/circuitRun.ts).
   *
   * Its own component rather than a fourth engine in TimerWidget: while it
   * runs it owns the timer side of the session notification (`live`), and
   * the widget stands aside (`live.circuitRunning`). Same cues, same
   * settings (beep, vibrate, 3-2-1, 15 s warning, keep awake, background).
   *
   * Survives the app being killed: the run is saved on every change and
   * replayed from the gap on the next start.
   */
  import { onDestroy, untrack } from 'svelte';
  import Icon from '@iconify/svelte';
  import type { ExerciseGroup, ExerciseSlot, ExerciseValues } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { formatClock } from '../../lib/session/formatSession';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { circuitHud, setCircuitToggle, resetCircuitHud } from '../../lib/session/circuitHud.svelte';
  import ExerciseDetails from './ExerciseDetails.svelte';
  import VolumeControl from './VolumeControl.svelte';
  import VolumeBar from './VolumeBar.svelte';
  import ExerciseLogSheet from './ExerciseLogSheet.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';
  import { PARAMETER_LABELS } from '../../lib/constants';
  import {
    type CircuitStep,
    type CircuitRunState,
    circuitSteps,
    startCircuitRun,
    tickCircuitRun,
    finishCircuitStep,
    skipCircuitStep,
    previousCircuitStep,
    setCircuitResult,
    currentStep,
    stepRemainingSeconds,
    previousWork,
    upcomingWork,
    circuitProgress,
    circuitLoggedValues,
    buildCircuitLive,
    repeaterPosition,
    stepsEndingAfterRound,
    currentRound,
    roundsDone,
  } from '../../lib/timer/circuitRun';
  import { CueSound, type CueKind } from '../../lib/timer/cueSound';
  import { speakText } from '../../lib/timer/speech';
  import { cueMute } from '../../lib/timer/cueMute.svelte';
  import { measureMissing, measurerFor } from '../../lib/timer/speechMeter';
  import { ScreenWakeLock } from '../../lib/timer/screenWakeLock';
  import { liveTimerAvailable, type LiveAction } from '../../lib/native/timerService';
  import { live, onLiveAction, collectLiveActions } from '../../lib/native/liveNotification.svelte';

  let {
    sessionKey,
    group,
    slots,
    visible,
    onLog,
    onClose,
    onMinimize,
  }: {
    /** The running session's start time - a saved run belongs to exactly one session. */
    sessionKey: string;
    group: ExerciseGroup;
    /** The members, in order, as the session has them now. */
    slots: ExerciseSlot[];
    visible: boolean;
    /** Log the run: values per member (undefined = no set done, so the member is skipped). */
    onLog: (values: Record<string, ExerciseValues | undefined>) => void;
    /** Throw the run away. */
    onClose: () => void;
    onMinimize: () => void;
  } = $props();

  const WARN_SECONDS = 15;

  /** The members as the run was planned - fixed at the start, so editing the session mid-run can't reshuffle it. */
  const members = untrack(() => slots.map((slot) => ({ slot, values: slot.prescribed ?? slot.logged ?? {} })));
  const memberName = (i: number) => (members[i] ? slotTypeName(members[i].slot, trainingState.exerciseTypes) : '');

  // --- State (restored if this group's run was saved) ---
  type Stored = { sessionKey: string; groupId: string; steps: CircuitStep[]; state: CircuitRunState; running: boolean; lastTickAt: number; stoppedEarly: boolean };
  function restore(): Stored | null {
    try {
      const raw = localStorage.getItem(CIRCUIT_RUN_KEY);
      const s = raw ? (JSON.parse(raw) as Stored) : null;
      return s && s.sessionKey === untrack(() => sessionKey) && s.groupId === untrack(() => group.id) && Array.isArray(s.steps) && s.state ? s : null;
    } catch {
      return null;
    }
  }
  const stored = restore();
  // Replaced when the run is cut short after a round.
  let steps = $state.raw<CircuitStep[]>(stored?.steps ?? untrack(() => circuitSteps(group, members)));
  /** Rounds the circuit was set up for, whatever the run was cut to. */
  const plannedRounds = untrack(() => roundsDone(circuitSteps(group, members), startCircuitRun()).planned);
  // A run that was going when the app closed catches up on the time since.
  let run = $state<CircuitRunState>(
    !stored ? startCircuitRun() : stored.running ? tickCircuitRun(untrack(() => steps), stored.state, Date.now() - stored.lastTickAt) : stored.state,
  );
  let running = $state(stored?.running ?? true);
  let lastTickAt = Date.now();
  let stoppedEarly = $state(stored?.stoppedEarly ?? false);
  const fullStepCount = untrack(() => circuitSteps(group, members).length);
  /** Ending after the round under way (chosen in the End menu); shown on the header. */
  const lastRound = $derived(!run.done && steps.length < fullStepCount);

  function save() {
    try {
      localStorage.setItem(CIRCUIT_RUN_KEY, JSON.stringify({ sessionKey, groupId: group.id, steps, state: $state.snapshot(run), running, lastTickAt, stoppedEarly }));
    } catch { /* storage unavailable */ }
  }
  const forget = forgetCircuitRun;

  // --- Derived view ---
  const step = $derived(currentStep(steps, run));
  const remaining = $derived(stepRemainingSeconds(steps, run));
  /** Inside a repeater set: which hang or rest the clock is in. */
  const rep = $derived(step?.kind === 'work' && step.interval ? repeaterPosition(step.interval, run.stepElapsedMs) : null);
  /** Seconds left on the dial's clock: the hang or rest of a repeater, else the step's. */
  const dialRemaining = $derived(rep ? rep.remaining : remaining);
  const phaseKey = () => `${run.stepIndex}:${rep ? `${rep.rep}${rep.phase}` : ''}`;
  let lastPhaseKey = '';
  const progress = $derived(circuitProgress(steps, run));
  const previous = $derived(previousWork(steps, run));
  const upcoming = $derived(upcomingWork(steps, run));
  const counted = $derived(circuitLoggedValues(members, run));
  /** Members corrected on the summary (weight, notes ...) - what they typed replaces what the run counted. */
  let edits = $state<Record<string, ExerciseValues>>({});
  const logged = $derived(Object.fromEntries(Object.entries(counted).map(([id, v]) => [id, v && edits[id] ? edits[id] : v])) as Record<string, ExerciseValues | undefined>);
  let editingId = $state<string | null>(null);
  const editingMember = $derived(members.find((m) => m.slot.id === editingId) ?? null);
  /** Rounds done in full, of the rounds the circuit was set up for - "2 of 4" when ended early. */
  const rounds = $derived(roundsDone(steps, run, plannedRounds));

  /** Reps staged for the open counted set, prefilled with its target. */
  let stagedReps = $state(0);
  let stagedFor = -1;
  $effect(() => {
    if (step?.kind === 'work' && step.seconds === undefined && stagedFor !== run.stepIndex) {
      stagedFor = run.stepIndex;
      stagedReps = step.reps ?? 10;
    }
  });

  // --- Clock ---
  let ticker: ReturnType<typeof setInterval> | null = null;
  /** The service owns the clock while the page is hidden; the page catches up when it's back. */
  let held = false;

  function tick() {
    const t = Date.now();
    // Held (hidden, the service owns the clock): lastTickAt must stay where
    // it was, or the time spent hidden is lost and the page wakes up behind
    // the notification - then publishes that stale plan over the right one.
    if (held) return;
    if (!running) { lastTickAt = t; return; }
    const before = run.stepIndex;
    run = tickCircuitRun(steps, run, t - lastTickAt);
    lastTickAt = t;
    if (run.stepIndex !== before) onStepChanged();
    else if (phaseKey() !== lastPhaseKey) {
      // A repeater's hang ended or its rest did: the beep for the switch.
      lastPhaseKey = phaseKey();
      lastTickSecond = -1;
      if (rep) cue(rep.phase === 'on' ? 'work' : 'rest');
    }
    cueCountdown();
    speakDue(t);
  }

  function syncTicker() {
    const shouldTick = running && !run.done;
    if (shouldTick && !ticker) ticker = setInterval(tick, 100);
    if (!shouldTick && ticker) { clearInterval(ticker); ticker = null; }
  }

  // --- Cues ---
  const sound = new CueSound({ sound: () => trainingState.timerBeepEnabled && !cueMute.muted, vibrate: () => trainingState.timerVibrateEnabled, volume: () => trainingState.timerCues.volume, preset: () => trainingState.timerCues.sound });
  const useLive = $derived(liveTimerAvailable() && trainingState.timerBackgroundAlerts);
  const liveActive = $derived(live.timerPlan !== null && live.serviceOk && useLive);
  let lastTickSecond = -1;
  let warnedStep = -1;

  function cue(kind: CueKind, immediate = false) {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (liveActive && !immediate) return;
    if (kind === 'tick' && !trainingState.timerCountdownTicks) return;
    sound.play(kind);
  }

  function onStepChanged(immediate = false) {
    lastTickSecond = -1;
    lastPhaseKey = phaseKey();
    if (run.done) { cue('done', immediate); return; }
    const s = currentStep(steps, run);
    if (s) cue(s.kind === 'work' ? 'work' : s.kind === 'leadIn' ? 'leadIn' : 'rest', immediate);
  }

  function cueCountdown() {
    const left = dialRemaining;
    if (left === undefined || run.done) return;
    const second = Math.ceil(left);
    if (trainingState.timerWarnBeforeEnd && step?.kind === 'roundRest' && second === WARN_SECONDS && warnedStep !== run.stepIndex) {
      warnedStep = run.stepIndex;
      cue('warn');
    }
    if (left > 0 && second <= 3 && second !== lastTickSecond) {
      lastTickSecond = second;
      cue('tick');
    }
  }

  // --- Taps ---
  function finishStep() {
    sound.unlock();
    const counted = step?.kind === 'work' && step.seconds === undefined;
    run = finishCircuitStep(steps, run, counted ? stagedReps : undefined);
    lastTickAt = Date.now();
    onStepChanged(true);
  }
  function skipStep() {
    run = skipCircuitStep(steps, run);
    lastTickAt = Date.now();
    onStepChanged(true);
  }
  /** Bumped when the run changes without changing step (back, restart), so the notification's plan is re-made. */
  let planNonce = $state(0);
  function back() {
    sound.unlock();
    tick();
    const before = run.stepIndex;
    run = previousCircuitStep(steps, run);
    lastTickAt = Date.now();
    planNonce++;
    if (run.stepIndex !== before) onStepChanged(true);
  }
  let confirmRestart = $state(false);
  function restart() {
    confirmEnd = false;
    sound.unlock();
    confirmRestart = false;
    stoppedEarly = false;
    steps = circuitSteps(group, members);
    run = startCircuitRun();
    running = true;
    lastTickAt = Date.now();
    stagedFor = -1;
    lastTickSecond = -1;
    warnedStep = -1;
    planNonce++;
    onStepChanged(true);
  }
  let volumeOpen = $state(false);
  /** The member whose details are open (by index), or null. */
  let infoMember = $state<number | null>(null);
  function toggle() {
    sound.unlock();
    tick();
    running = !running;
    lastTickAt = Date.now();
  }
  /** The End menu is open: finish now, or after the round under way. */
  let confirmEnd = $state(false);
  /** Whether "after this round" means something: a set or switch of a round that is not the last. */
  const canEndAfterRound = $derived(
    !!step && (step.kind === 'work' || step.kind === 'transition') && currentRound(steps, run) < progress.rounds - 1,
  );
  /** Ends the run here: what was done is logged, the set under way and the rest are dropped. */
  function endNow() {
    tick();
    confirmEnd = false;
    stoppedEarly = true;
    run = { ...run, done: true };
  }
  /** The round under way is played out, then the run is over: no rest and no further rounds. */
  function endAfterRound() {
    tick();
    confirmEnd = false;
    stoppedEarly = true;
    steps = stepsEndingAfterRound(steps, currentRound(steps, run));
    planNonce++;
    save();
  }
  function correct(by: number) {
    if (!previous) return;
    const value = run.results[previous.slotId]?.[previous.round];
    if (typeof value !== 'number') return;
    run = setCircuitResult(run, previous.slotId, previous.round, Math.max(0, value + by));
  }
  /** How hard the circuit was - optional, and only written to members that track difficulty. */
  let difficulty = $state<number | undefined>(undefined);
  const tracksDifficulty = (slot: ExerciseSlot) =>
    (slot.activeParameters ?? trainingState.exerciseTypes.find((t) => t.id === slot.typeId)?.parameters ?? []).includes('difficulty');
  const anyTracksDifficulty = $derived(members.some((m) => tracksDifficulty(m.slot)));
  function log() {
    forget();
    const values = $state.snapshot(logged) as Record<string, ExerciseValues | undefined>;
    if (difficulty !== undefined) {
      for (const m of members) if (values[m.slot.id] && tracksDifficulty(m.slot)) values[m.slot.id] = { ...values[m.slot.id]!, difficulty };
    }
    onLog(values);
  }
  /** A member corrected on the summary: back to the summary with its numbers changed. Per-set reps the sheet can't show are kept. */
  function saveEdit(values: ExerciseValues) {
    const id = editingId;
    if (!id) return;
    const was = logged[id];
    const next = { ...values };
    if (next.reps === undefined && Array.isArray(was?.reps)) next.reps = was.reps;
    edits[id] = next;
    editingId = null;
  }
  function discard() {
    forget();
    onClose();
  }

  // --- The Android service and the page's own lifecycle ---
  /** The announcements still to come, for when the page (not the service) is the one speaking. */
  let speakQueue: { at: number; text?: string }[] = [];
  function syncLive() {
    live.circuitRunning = true;
    // The phone's speech engine tells how long phrases really take; until it has, the plan uses an estimate and is made again.
    const speech = $state.snapshot(trainingState.timerCues.speech);
    const meter = measurerFor(speech);
    const plan = buildCircuitLive({
      steps, state: run, running, name: group.name || 'Circuit', memberName,
      ticks: trainingState.timerCountdownTicks, warningSeconds: trainingState.timerWarnBeforeEnd ? WARN_SECONDS : 0,
      announce: trainingState.timerCues.announce, speechRate: speech.rate,
      measure: liveTimerAvailable() ? meter.measure : undefined,
    }, Date.now());
    const unknown = meter.missing();
    if (unknown.length > 0) void measureMissing(unknown, speech).then((learned) => { if (learned) planNonce++; });
    speakQueue = plan ? plan.cues.filter((c) => c.kind === 'speak') : [];
    if (!useLive) { live.timerPlan = null; live.timerFinished = false; return; }
    live.timerFinished = !plan && run.done;
    live.timerPlan = plan;
  }
  /** Speaks what has come due - unless the service does, or the page is hidden. */
  function speakDue(t: number) {
    if (speakQueue.length === 0 || speakQueue[0].at > t) return;
    const due = speakQueue.filter((c) => c.at <= t);
    speakQueue = speakQueue.filter((c) => c.at > t);
    const last = due[due.length - 1];
    if (last?.text && !liveActive && !cueMute.muted && document.visibilityState !== 'hidden') speakText(last.text, trainingState.timerCues.volume, trainingState.timerCues.speech.rate, trainingState.timerCues.speech.pitch);
  }

  $effect(() => {
    // exerciseTypes: after a cold restore the notification is made before the names load, and says "Unknown" until the plan is made again.
    void [run.stepIndex, run.done, running, useLive, planNonce, trainingState.exerciseTypes.length, trainingState.timerCountdownTicks, trainingState.timerWarnBeforeEnd, JSON.stringify(trainingState.timerCues.announce), JSON.stringify(trainingState.timerCues.speech)];
    untrack(() => {
      syncLive();
      syncTicker();
      save();
    });
  });
  // Corrections and reps change the saved run but not the plan.
  $effect(() => {
    void JSON.stringify(run.results);
    untrack(save);
  });

  // Pausing the session pauses the circuit with it (on Android with the timer service, the service does that itself),
  // and resuming resumes it - but only a circuit this pause stopped: one paused by hand stays paused.
  let pausedBySession = false;
  $effect(() => {
    const paused = trainingState.sessionStore.isPaused;
    untrack(() => {
      if (useLive || run.done) return;
      if (paused && running) {
        tick();
        running = false;
        pausedBySession = true;
      } else if (!paused && pausedBySession) {
        pausedBySession = false;
        running = true;
        lastTickAt = Date.now();
      }
    });
  });

  function applyLiveAction({ kind, at }: LiveAction) {
    if (kind !== 'pause' && kind !== 'resume') return;
    if (kind === 'pause' && running) {
      run = tickCircuitRun(steps, run, Math.max(0, at - lastTickAt));
      running = false;
    } else if (kind === 'resume' && !running) {
      running = true;
    }
    lastTickAt = at;
  }
  $effect(() => onLiveAction(applyLiveAction));

  async function onVisibility() {
    if (document.visibilityState === 'hidden') {
      held = liveActive;
      return;
    }
    if (held) await collectLiveActions();
    held = false;
    tick();
  }
  $effect(() => {
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  const screenLock = new ScreenWakeLock();
  $effect(() => {
    if (running && !run.done && trainingState.timerKeepAwakeEnabled) void screenLock.acquire();
    else screenLock.release();
  });

  onDestroy(() => {
    if (ticker) clearInterval(ticker);
    screenLock.release();
    resetCircuitHud();
    live.circuitRunning = false;
    live.timerPlan = null;
    live.timerFinished = false;
  });

  backWhile(() => visible, () => onMinimize());

  // --- Display ---
  /** The exercise on now, or coming up during a rest. */
  const focus = $derived(step?.kind === 'work' ? step.member : upcoming?.member);
  /** The dial's word: "Go", or "Hang 3/6" / "Rest 3/6" inside a repeater set. */
  const stepWord = $derived(
    step?.kind === 'leadIn' ? 'Get ready'
      : step?.kind === 'work' ? (rep && step.interval ? `${rep.phase === 'on' ? 'Hang' : 'Rest'} ${rep.rep}/${step.interval.reps}` : 'Go')
      : step?.kind === 'roundRest' ? 'Rest'
      : 'Switch',
  );
  const phaseLabel = $derived(!running ? 'Paused' : stepWord);
  const clockText = $derived(
    !step ? '' : dialRemaining !== undefined ? formatClock(Math.ceil(dialRemaining) * 1000) : formatClock(run.stepElapsedMs),
  );
  /** What the minimised pill and the session bubble show. */
  $effect(() => {
    circuitHud.active = !run.done;
    circuitHud.phase = phaseLabel;
    circuitHud.exercise = focus !== undefined ? memberName(focus) : (group.name || 'Circuit');
    circuitHud.time = clockText;
    circuitHud.running = running;
    circuitHud.accent = accent;
  });
  setCircuitToggle(() => toggle());
  /** This round's sets, in order, with where each stands - the whole round at a glance. */
  const roundSets = $derived(
    steps.filter((s): s is Extract<CircuitStep, { kind: 'work' }> => s.kind === 'work' && s.round === progress.round - 1)
      .map((s) => {
        const result = run.results[s.slotId]?.[s.round];
        const here = step?.kind === 'work' && step.slotId === s.slotId && step.round === s.round;
        return { s, state: here ? 'now' : result === undefined ? 'next' : result === null ? 'skipped' : 'done' } as const;
      }),
  );
  const accent = $derived(
    run.done ? 'var(--color-success)'
      : step?.kind === 'leadIn' ? 'var(--color-warning)'
      : step?.kind === 'work' ? (rep?.phase === 'off' ? 'var(--color-primary)' : 'var(--color-danger)')
      : 'var(--color-primary)',
  );
  const RING = 2 * Math.PI * 45;
  const fraction = $derived.by(() => {
    if (!step || dialRemaining === undefined) return 0;
    const total = rep ? rep.length : step.kind === 'work' ? step.seconds ?? 0 : step.seconds;
    return total > 0 ? Math.max(0, Math.min(1, 1 - dialRemaining / total)) : 0;
  });
  const correctable = $derived(
    step && step.kind !== 'work' && previous && previous.seconds === undefined && typeof run.results[previous.slotId]?.[previous.round] === 'number',
  );
  function targetText(s: Extract<CircuitStep, { kind: 'work' }>): string {
    if (s.seconds !== undefined) return s.reps && s.reps > 1 ? `${s.reps} reps · ${formatClock(s.seconds * 1000)}` : formatClock(s.seconds * 1000);
    return s.reps ? `${s.reps} reps` : 'at your pace';
  }
</script>

<div class="fixed inset-0 z-[112] safe-y bg-app-bg flex flex-col {visible ? '' : 'hidden'}">
  <!-- Header -->
  <div class="shrink-0 flex items-center justify-between px-4 pt-4 pb-2 short:pt-1 short:pb-0 gap-2">
    <button onclick={onMinimize} class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors" aria-label="Minimise — the circuit keeps running">
      <Icon icon="ic:baseline-keyboard-arrow-down" class="text-2xl" />
    </button>
    <div class="text-center min-w-0">
      <p class="text-caption uppercase text-content-subtle tracking-widest truncate">{group.name || 'Circuit'}</p>
      <p class="text-label text-content-muted tabular-nums">Round {Math.min(progress.round, plannedRounds)}/{plannedRounds} · {progress.sets}/{progress.totalSets} sets{#if lastRound} · <span class="text-warning">last round</span>{/if}</p>
    </div>
    {#if !run.done}
      <div class="flex items-center -mr-2">
        <VolumeControl bind:open={volumeOpen} />
        <button onclick={() => { confirmEnd = false; confirmRestart = true; }} class="p-2 text-content-subtle hover:text-content transition-colors" aria-label="Restart the circuit" title="Restart from the beginning">
          <Icon icon="ic:baseline-restart-alt" class="text-xl" />
        </button>
        <button onclick={() => { confirmRestart = false; confirmEnd = !confirmEnd; }} aria-expanded={confirmEnd} class="p-2 text-label font-bold transition-colors {confirmEnd ? 'text-danger' : 'text-content-subtle hover:text-danger'}">End</button>
      </div>
    {:else}
      <span class="w-10"></span>
    {/if}
  </div>

  {#if volumeOpen && !run.done}
    <VolumeBar onclose={() => (volumeOpen = false)} />
  {/if}

  {#if confirmRestart && !run.done}
    <div class="shrink-0 mx-4 mb-1 px-3 py-2.5 rounded-control border border-border-strong bg-surface-elevated/60 flex items-center gap-3 animate-in fade-in">
      <p class="flex-1 text-label text-content">Restart from round 1? This run's progress is dropped.</p>
      <button onclick={() => (confirmRestart = false)} class="text-label font-bold text-content-subtle hover:text-content px-2 py-1">Cancel</button>
      <button onclick={restart} class="text-label font-bold text-danger px-2 py-1">Restart</button>
    </div>
  {/if}

  {#if confirmEnd && !run.done}
    <!-- End early: a round fewer is a smaller circuit, logged as what was done. -->
    <div class="shrink-0 mx-4 mb-1 p-3 rounded-control border border-border-strong bg-surface-elevated/60 space-y-2 animate-in fade-in" role="group" aria-label="End the circuit early">
      <p class="text-label text-content">End the circuit here? Only the sets you did are logged{progress.sets > 0 ? ` (${progress.sets} so far)` : ''}.</p>
      <div class="flex flex-wrap items-center gap-2">
        {#if canEndAfterRound}
          <button onclick={endAfterRound} class="px-3 py-2 rounded-control bg-primary hover:bg-primary-hover text-white text-label font-bold">Finish this round</button>
        {/if}
        <button onclick={endNow} class="px-3 py-2 rounded-control {canEndAfterRound ? 'bg-surface-elevated text-danger border border-border-strong' : 'bg-danger text-white'} text-label font-bold">Finish now</button>
        <button onclick={() => (confirmEnd = false)} class="px-3 py-2 text-label font-bold text-content-subtle hover:text-content ml-auto">Keep going</button>
      </div>
    </div>
  {/if}

  {#if run.done}
    <!-- Summary -->
    <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar px-6 py-4 space-y-3">
      <div class="text-center space-y-0.5">
        <p class="text-section uppercase tracking-[0.2em] {rounds.done < rounds.planned ? 'text-warning' : 'text-success'}">{rounds.done < rounds.planned ? 'Ended early' : 'Done'}</p>
        <p class="text-label text-content-muted tabular-nums">{rounds.done} of {rounds.planned} round{rounds.planned === 1 ? '' : 's'} done</p>
      </div>
      {#each members as m, i (m.slot.id)}
        {@const results = run.results[m.slot.id] ?? []}
        <svelte:element
          this={logged[m.slot.id] ? 'button' : 'div'}
          onclick={logged[m.slot.id] ? () => (editingId = m.slot.id) : undefined}
          role={logged[m.slot.id] ? 'button' : undefined}
          class="w-full text-left p-3 rounded-card border border-border bg-surface/40 flex items-center gap-3 {logged[m.slot.id] ? 'hover:bg-surface/70 active:scale-[0.99] transition-all' : ''}"
        >
          <div class="min-w-0 flex-1">
            <p class="text-body font-bold text-content truncate">{memberName(i)}</p>
            <p class="text-caption text-content-subtle tabular-nums">
              {#if results.length === 0}Not done{:else}{results.map((v) => v === null || v === undefined ? '–' : (m.values.timeOn || (!m.values.reps && m.values.duration)) ? formatClock(v * 1000) : `${v}`).join(' · ')}{/if}
            </p>
          </div>
          {#if logged[m.slot.id]}
            <Icon icon="ic:baseline-edit" class="text-base text-content-subtle shrink-0" />
            <Icon icon="ic:baseline-check-circle" class="text-lg text-success shrink-0" />
          {/if}
        </svelte:element>
      {/each}
      {#if anyTracksDifficulty}
        <div class="space-y-1.5 pt-1">
          <span class="flex items-baseline justify-between gap-2">
            <span class="text-label text-content-subtle">{PARAMETER_LABELS.difficulty}</span>
            <span class="text-caption text-content-muted tabular-nums">{difficulty ?? '—'}</span>
          </span>
          <RangeSlider value={difficulty ?? 5} label={PARAMETER_LABELS.difficulty} onchange={(v) => difficulty = v} />
        </div>
      {/if}
    </div>
    <div class="shrink-0 px-6 pb-8 short:pb-2 space-y-2">
      <button onclick={log} class="w-full py-4 bg-success hover:bg-success-hover text-white rounded-control text-label font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2">
        <Icon icon="ic:baseline-check" class="text-base" /> Log circuit
      </button>
      <button onclick={discard} class="w-full py-2 text-label text-content-subtle hover:text-content transition-colors">Close without logging</button>
    </div>
  {:else if step}
   <!-- Portrait: the dial over its controls. A landscape phone has no height for that: side by side, extras dropped. -->
   <div class="flex-1 min-h-0 flex flex-col short:flex-row">
    <!-- The dial -->
    <div class="flex-1 min-h-0 min-w-0 flex flex-col items-center justify-center px-6 pt-2 pb-5 gap-4 short:px-4 short:py-1 short:gap-1">
      <!-- Sized by the room it has on both axes, so the dial fits in landscape too. -->
      <div class="flex-1 min-h-0 w-full grid place-items-center" style="container-type: size;">
        <div class="relative aspect-square" style="width: min(17rem, 100cqw, 100cqh); container-type: inline-size;">
          <svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-surface-elevated)" stroke-width="5" />
            <circle cx="50" cy="50" r="45" fill="none" stroke={accent} stroke-width="5" stroke-linecap="round"
              stroke-dasharray="{(1 - fraction) * RING} {RING}" class="transition-[stroke-dasharray] duration-200 ease-linear" />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p class="text-section uppercase tracking-[0.2em]" style="color: {accent};">
              {stepWord}
            </p>
            {#if step.kind === 'work' && step.seconds === undefined}
              <p class="text-[length:min(3.5rem,24cqw)] leading-none font-black text-content tabular-nums my-2">{step.reps ?? '✓'}</p>
              <p class="text-label text-content-subtle tabular-nums">{step.reps ? 'reps · ' : ''}{formatClock(run.stepElapsedMs)}</p>
            {:else}
              <p class="text-[length:min(3.5rem,24cqw)] leading-none font-black text-content tabular-nums my-2">{formatClock(Math.ceil(dialRemaining ?? 0) * 1000)}</p>
            {/if}
            {#if step.kind === 'work'}
              <p class="text-body font-bold text-content mt-1 break-words">{memberName(step.member)}</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- What is on, what is next and the round: one block under the dial, so it never runs into the buttons. -->
      <div class="shrink-0 w-full flex flex-col items-center gap-3 short:gap-1">
        {#if step.kind !== 'work' && upcoming}
          <p class="text-body text-content-muted text-center">Next: <b class="text-content">{memberName(upcoming.member)}</b> · {targetText(upcoming)}</p>
        {/if}
        {#if focus !== undefined}
          <!-- The exercise's note on one line; a tap opens what to do (details, notes, how-to) without leaving the run. -->
          <button onclick={() => (infoMember = focus)} class="short:hidden w-full max-w-sm flex items-center gap-2 px-3 py-2 rounded-control bg-surface-elevated/40 border border-border text-left hover:border-border-strong transition-colors" aria-label="How to do {memberName(focus)}">
            <Icon icon="ic:outline-info" class="text-lg text-content-subtle shrink-0" />
            <span class="min-w-0 flex-1 text-caption text-content-muted line-clamp-2 break-words">{members[focus].values.notes?.trim() || `${memberName(focus)} — how to, details`}</span>
            <Icon icon="ic:baseline-chevron-right" class="text-base text-content-subtle shrink-0" />
          </button>
        {/if}
        {#if roundSets.length > 1}
          <div class="short:hidden flex flex-wrap items-center justify-center gap-1.5 max-w-sm" aria-label="This round">
            {#each roundSets as { s, state } (s.slotId)}
              <span class="px-2.5 py-1 rounded-full text-caption border flex items-center gap-1 max-w-full
                {state === 'now' ? 'border-transparent text-white font-bold' : state === 'done' ? 'border-success/40 text-success bg-success/10' : state === 'skipped' ? 'border-border text-content-subtle line-through' : 'border-border text-content-muted'}"
                style={state === 'now' ? `background: ${accent};` : ''}>
                {#if state === 'done'}<Icon icon="ic:baseline-check" class="text-xs shrink-0" />{/if}
                <span class="truncate">{memberName(s.member)}</span>
              </span>
            {/each}
          </div>
        {/if}
        {#if correctable && previous}
          <!-- The set just finished, correctable while resting: Done kept the flow, this keeps the record honest. -->
          <div class="flex items-center gap-3">
            <span class="text-label text-content-subtle">{memberName(previous.member)}</span>
            <button onclick={() => correct(-1)} class="w-9 h-9 rounded-full grid place-items-center bg-surface-elevated text-content border border-border-strong active:scale-90" aria-label="One fewer rep">
              <Icon icon="ic:baseline-remove" class="text-lg" />
            </button>
            <span class="w-8 text-center text-metric text-content tabular-nums">{run.results[previous.slotId]?.[previous.round]}</span>
            <button onclick={() => correct(1)} class="w-9 h-9 rounded-full grid place-items-center bg-surface-elevated text-content border border-border-strong active:scale-90" aria-label="One more rep">
              <Icon icon="ic:baseline-add" class="text-lg" />
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Controls -->
    <div class="shrink-0 px-6 pt-1 pb-8 space-y-3 short:w-[min(24rem,50%)] short:flex short:flex-col short:justify-center short:px-4 short:pb-2 short:space-y-2 short:overflow-y-auto">
      {#if step.kind === 'work' && step.seconds === undefined}
        <div class="flex items-center justify-between gap-3 px-1">
          <span class="text-label text-content-subtle">Reps done{step.reps ? ` (target ${step.reps})` : ''}</span>
          <div class="flex items-center gap-2">
            <button onclick={() => (stagedReps = Math.max(0, stagedReps - 1))} class="w-10 h-10 rounded-full grid place-items-center bg-surface-elevated text-content border border-border-strong active:scale-90" aria-label="One fewer rep">
              <Icon icon="ic:baseline-remove" class="text-lg" />
            </button>
            <span class="w-10 text-center text-metric text-content tabular-nums">{stagedReps}</span>
            <button onclick={() => (stagedReps += 1)} class="w-10 h-10 rounded-full grid place-items-center bg-surface-elevated text-content border border-border-strong active:scale-90" aria-label="One more rep">
              <Icon icon="ic:baseline-add" class="text-lg" />
            </button>
          </div>
        </div>
        <button onclick={finishStep} class="w-full py-5 short:py-3 rounded-control text-white text-label font-bold transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-2" style="background: {accent};">
          <Icon icon="ic:baseline-check-circle" class="text-xl" /> Done
        </button>
      {:else if step.kind === 'leadIn'}
        <button onclick={finishStep} class="w-full py-4 bg-primary hover:bg-primary-hover text-white rounded-control text-label font-bold transition-all active:scale-[0.98]">I'm ready</button>
      {/if}
      <div class="flex items-center gap-2">
        <button onclick={back} class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap" aria-label="Back: restart this step, or the previous one">
          <Icon icon="ic:baseline-skip-previous" class="text-base" /> Back
        </button>
        <button onclick={toggle} class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap">
          <Icon icon={running ? 'ic:baseline-pause' : 'ic:baseline-play-arrow'} class="text-base" /> {running ? 'Pause' : 'Resume'}
        </button>
        {#if step.kind === 'work' && step.seconds !== undefined}
          <button onclick={finishStep} class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap">
            <Icon icon="ic:baseline-check" class="text-base" /> Done early
          </button>
        {/if}
        {#if step.kind !== 'leadIn'}
        <button onclick={skipStep} class="flex-1 py-3 text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap">
          <Icon icon="ic:baseline-skip-next" class="text-base" /> {step.kind === 'work' ? 'Skip set' : 'Skip rest'}
        </button>
        {/if}
      </div>
    </div>
   </div>
  {/if}
  {#if infoMember !== null && members[infoMember]}
    {@const m = members[infoMember]}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="absolute inset-0 z-10 bg-black/50 flex items-end" onclick={() => (infoMember = null)}>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="w-full max-h-[75%] overflow-y-auto no-scrollbar bg-surface rounded-t-card border-t border-border-strong p-5 pb-8 space-y-3 animate-in slide-in-from-bottom-10" onclick={(e) => e.stopPropagation()}>
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-title text-content truncate">{memberName(infoMember)}</h3>
          <button onclick={() => (infoMember = null)} class="p-1 -mr-1 text-content-subtle hover:text-content" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
        </div>
        <ExerciseDetails slot={m.slot} values={m.values} inGroup showHowTo />
      </div>
    </div>
  {/if}

  {#if editingMember && logged[editingMember.slot.id]}
    <ExerciseLogSheet
      slot={{ ...editingMember.slot, logged: logged[editingMember.slot.id] }}
      saveLabel="Save"
      onSave={saveEdit}
      onCancel={() => (editingId = null)}
    />
  {/if}
</div>
