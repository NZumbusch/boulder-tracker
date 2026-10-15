<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { live, composeLive, onLiveAction, pushTimerAction, timerRunning } from '../../lib/native/liveNotification.svelte';
  import { liveTimerAvailable, sendLiveTimer, stopLiveTimer } from '../../lib/native/timerService';
  import { tick, untrack } from 'svelte';
  import { motionMs } from '../../lib/motion';
  /**
   * The running session, full screen.
   *
   * The linear path is the point: the current exercise is expanded with
   * everything needed to do it, and finishing it logs what was done and
   * moves to the next one. Everything else (jumping around, reordering,
   * skipping, un-finishing, adding) is available but deliberately quieter.
   *
   * Leaving does not stop the session - closing minimises to
   * `SessionBubble`, and only the explicit Stop action opens the
   * save-or-discard fork. The stopwatch lives here and nowhere else, so it
   * can't compete with the bubble's own elapsed readout.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { ExerciseSlot, ExerciseValues, ParameterBlock, ExerciseGroup, Circuit } from '../../lib/types';
  import { insertCircuit } from '../../lib/exercise/circuits';
  import { slotValues, slotTypeName } from '../../lib/exerciseSlot';
  import { slotStatus } from '../../lib/session/activeSession';
  import { formatClock, formatMinutes } from '../../lib/session/formatSession';
  import { slotSummary } from '../../lib/session/slotDetails';
  import { generateId } from '../../lib/utils';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import ExerciseForm from './ExerciseForm.svelte';
  import ExerciseDetails from './ExerciseDetails.svelte';
  import ExerciseLogSheet from './ExerciseLogSheet.svelte';
  import TestSheet from './TestSheet.svelte';
  import { TEST_SLOT_MINUTES } from '../../lib/benchmarks/testSlot';
  import type { ExerciseSlot as TestSlotType } from '../../lib/types';
  import SessionExitModal from './SessionExitModal.svelte';
  import SessionNotesSheet from './SessionNotesSheet.svelte';
  import TimerWidget from './TimerWidget.svelte';
  import { hasRunnableTiming, isPacer, soloRun } from '../../lib/timer/soloRun';
  import { openQuickTimerSheet } from '../../lib/timer/quickTimer.svelte';
  import PresetNameSheet from './PresetNameSheet.svelte';
  import { CIRCUIT_LEAD_IN_SECONDS } from '../../lib/timer/circuitRun';
  import { workoutItems, groupMinutes, groupSummary, groupSlots, ungroup, takeOutOfGroup, addToGroup, updateGroup, settleAfterMove, normaliseGroups } from '../../lib/exercise/groups';
  import { repsPerSet } from '../../lib/exercise/reps';
  import GroupSettings from './GroupSettings.svelte';
  import CircuitPill from './CircuitPill.svelte';
  import { tonesFor } from '../../lib/timer/cueSound';
  import { cueMute, endSessionMute } from '../../lib/timer/cueMute.svelte';
  import { circuitHud, settleCircuit } from '../../lib/session/circuitHud.svelte';
  import { pendingMembers, skipPlan } from '../../lib/session/circuitFlow';
  import ChoiceSheet from './ChoiceSheet.svelte';
  import CircuitRunner, { storedCircuitGroupId, forgetCircuitRun } from './CircuitRunner.svelte';
  import { reportError } from '../../lib/errorReporting';
  import { ScreenWakeLock } from '../../lib/timer/screenWakeLock';
  import { haptic } from '../../lib/native/haptics';
  import { findLastLogged } from '../../lib/exercise/lastTime';
  import { swipeRow } from '../../lib/ui/swipeRow';
  import { showUndo, toast } from '../../lib/toast.svelte';
  import PainHeadsUp from '../health/PainHeadsUp.svelte';
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Segmented from '../ui/Segmented.svelte';

  const store = trainingState.sessionStore;

  // --- Local view state ---
  /** The slot whose "what did you do" sheet is open, if any. */
  let loggingSlotId = $state<string | null>(null);
  /** The slot open in the full ExerciseForm, or 'new' while adding one. */
  let editingSlotId = $state<string | null>(null);
  let isAddingExercise = $state(false);
  /** The add form's "Still to do": add the exercise as the next target instead of logging it as done. */
  let addAsTodo = $state(false);
  /** Planning a benchmark test into the running session (it is added as still to do, next up). */
  let isAddingTest = $state(false);
  /** Edit mode: the circuit sheet (new / from exercises / saved) is open. */
  let isAddingSavedCircuit = $state(false);
  /** The add form is for the first exercise of a brand-new circuit. */
  let startingCircuit = $state(false);
  let isExiting = $state(false);
  let showNotes = $state(false);
  /** The tucked-away "change the session" mode - reorder handles, remove, add. */
  let isEditingPlan = $state(false);
  /** Edit mode: picking exercises to turn into a circuit. */
  let isPickingCircuit = $state(false);
  let pickedSlotIds = $state<string[]>([]);
  /** Edit mode: the circuit whose rounds and rests are open, and the one a new exercise is being added to. */
  let openGroupId = $state<string | null>(null);
  let addToGroupId = $state<string | null>(null);
  /**
   * Values handed over by a finished interval run (or the exercise's own
   * clock), seeding the finish sheet once - only for the slot they were
   * made for, so a leftover can never follow the user to another exercise.
   */
  let seedFor = $state<{ slotId: string; values: ExerciseValues } | null>(null);
  const intervalSeed = $derived(seedFor && seedFor.slotId === loggingSlotId ? seedFor.values : null);
  /** Bumped on every open, so the finish sheet always mounts fresh. */
  let sheetKey = $state(0);

  // --- Circuits (CircuitRunner) ---
  /** The group whose run is going (or waiting to be resumed after the app was closed). */
  let circuitGroupId = $state<string | null>(storedCircuitGroupId(untrack(() => store.session?.startedAt)));
  /** The runner is on screen (it keeps running when minimised). */
  let circuitVisible = $state(false);
  /** A single exercise's timer is a run of its own: `solo-<slot id>` stands in for a circuit's group id. */
  const SOLO_PREFIX = 'solo-';
  const circuitRun = $derived.by(() => {
    if (!circuitGroupId) return null;
    if (circuitGroupId.startsWith(SOLO_PREFIX)) {
      const slot = store.exercises.find((s) => `${SOLO_PREFIX}${s.id}` === circuitGroupId);
      if (!slot) return null;
      const base = slotValues(slot);
      const made = soloRun(base, { leadIn: trainingState.tunable('timer.leadIn'), setRest: trainingState.tunable('timer.setRest') });
      return { group: { ...made.group, id: circuitGroupId }, slots: [{ ...slot, prescribed: made.values }], solo: made, baseValues: base };
    }
    const item = workoutItems({ exercises: store.exercises, groups: store.workout?.groups }).find((i) => i.kind === 'group' && i.group.id === circuitGroupId);
    if (!item || item.kind !== 'group') return null;
    // Only what is still to do: a member already logged or skipped would run again.
    const slots = pendingMembers(store.exercises, item.group.id);
    return slots.length > 0 ? { group: item.group, slots, solo: null, baseValues: undefined } : null;
  });
  /** The group a slot is in, for its Circuit button. */
  const groupIdOf = (slot: ExerciseSlot) => (slot.groupId && store.workout?.groups?.some((g) => g.id === slot.groupId) ? slot.groupId : null);

  // A mute from the session's button lasts for the session; the next one starts with sound.
  $effect(() => {
    if (!session) endSessionMute();
  });

  // The session ended (finished or discarded): a run in progress goes with it.
  $effect(() => {
    if (!session && circuitGroupId) {
      forgetCircuitRun();
      circuitGroupId = null;
      circuitVisible = false;
    }
  });

  // A run whose exercises are gone (all logged or skipped, removed) leaves nothing to run: it must not keep the
  // other circuits' Start buttons blocked.
  $effect(() => {
    if (session && circuitGroupId && !circuitRun) {
      untrack(() => {
        forgetCircuitRun();
        circuitGroupId = null;
        circuitVisible = false;
      });
    }
  });

  // The session's corner bubble was tapped while a circuit ran: open straight into it.
  $effect(() => {
    if (circuitHud.openRequested && store.isModalOpen && circuitGroupId) {
      circuitHud.openRequested = false;
      circuitVisible = true;
    }
  });

  /** A single exercise's run waiting for a preset name. */
  let namingPreset = $state<{ values: ExerciseValues; leadIn: number } | null>(null);

  /** The pill's "intervals, sets and pacer": this exercise's own timer when it has timing, else the Timer sheet for a made-up one. */
  function openRun() {
    const slot = current;
    if (slot && !slot.groupId && hasRunnableTiming(slotValues(slot))) openSolo(slot.id);
    else openQuickTimerSheet();
  }

  /** Opens the timer for one exercise: a repeater, rest-timed sets or a pacer - a run that waits for Start. */
  function openSolo(slotId: string) {
    openCircuit(`${SOLO_PREFIX}${slotId}`);
  }

  /** The other run that is in the way of the one asked for, waiting for the answer. */
  let switchingTo = $state<string | null>(null);

  function openCircuit(groupId: string) {
    if (circuitGroupId && circuitGroupId !== groupId) {
      // One run at a time. One that was never started has nothing in it: it just makes way. One under way is asked about.
      if (!circuitHud.started) replaceRun(groupId);
      else switchingTo = groupId;
      return;
    }
    if (!circuitGroupId && live.circuitRunning) { toast.show('Finish the timer that is running first'); return; } // a quick timer from outside the session
    circuitGroupId = groupId;
    circuitVisible = true;
  }

  /** Puts the run that is open away (what it recorded is lost) and opens another. */
  function replaceRun(groupId: string) {
    forgetCircuitRun();
    circuitGroupId = groupId;
    circuitVisible = true;
    switchingTo = null;
  }

  /**
   * A finished (or ended-early) circuit: log what each member did and skip
   * the ones that did no set. A member left pending would count at its full
   * plan in the session's load, which an early finish must not do.
   */
  function handleCircuitLogged(values: Record<string, ExerciseValues | undefined>) {
    for (const [slotId, v] of Object.entries(values)) {
      if (v) store.logExercise(slotId, v);
      else store.skipExercise(slotId);
    }
    circuitGroupId = null;
    circuitVisible = false;
    // The next exercise with timing gets its timer opened - ready for Start, never running (Settings -> Timer).
    if (trainingState.tunableOn('timer.openNext')) {
      void tick().then(() => {
        const next = store.currentSlot;
        if (next && !next.groupId && !next.test && hasRunnableTiming(slotValues(next))) openSolo(next.id);
      });
    }
  }

  const session = $derived(store.session);

  // The timer pills sit just above the footer, whatever its height is (text size, landscape, the safe area).
  let footerH = $state(0);
  const TIMER_BOTTOM = 'bottom-[calc(var(--live-footer-b,68px)+env(safe-area-inset-bottom)+12px)]';
  $effect(() => {
    if (!(session && store.isModalOpen) || footerH === 0) return;
    document.documentElement.style.setProperty('--live-footer-b', `${footerH}px`);
    return () => document.documentElement.style.removeProperty('--live-footer-b');
  });

  // The screen stays on while a session runs (Settings -> Live sessions -> Keep
  // screen on during a session). Android drops the lock whenever the app
  // is hidden, so it's asked for again on the way back.
  const sessionWakeLock = new ScreenWakeLock();
  $effect(() => {
    const want = !!session && !store.isPaused && trainingState.sessionKeepAwake;
    if (!want) {
      sessionWakeLock.release();
      return;
    }
    void sessionWakeLock.acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') void sessionWakeLock.acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      sessionWakeLock.release();
    };
  });

  // A session ending (or a different one starting) resets everything this
  // screen had open. Without it a sheet that failed to open left its slot
  // id behind, and the same plan's next session - same slot ids - found
  // Finish already "open" and did nothing, until the app was restarted.
  let viewFor: string | null = null;
  $effect(() => {
    const key = session?.startedAt ?? null;
    if (key === viewFor) return;
    viewFor = key;
    untrack(() => {
      loggingSlotId = null;
      seedFor = null;
      editingSlotId = null;
      isAddingExercise = false;
      addAsTodo = false;
      isAddingTest = false;
      startingCircuit = false;
      isAddingSavedCircuit = false;
      isEditingPlan = false;
      isPickingCircuit = false;
      pickedSlotIds = [];
      openGroupId = null;
      addToGroupId = null;
      isExiting = false;
      showNotes = false;
    });
  });
  // --- The Android session notification (lib/native/liveNotification) ---
  // This is its one sender: the session (always, while one runs) plus the
  // timer's plan when a timer runs. Re-sent on every meaningful change.
  let notificationSent = false;
  $effect(() => {
    const s = session;
    void [live.timerPlan, live.timerFinished, s?.runningSince, s?.accumulatedMs, store.currentIndex, store.progress.settled,
      s?.workout.notes, s?.workout.exercises.length, trainingState.exerciseTypes.length, trainingState.sessionNotification,
      trainingState.timerBeepEnabled, cueMute.muted, trainingState.timerVibrateEnabled, trainingState.timerCues.volume, trainingState.timerCues.volumeSetsMedia, trainingState.timerCues.sound, trainingState.timerCues.otherAudio, trainingState.timerCountdownTicks, trainingState.timerWarnBeforeEnd, JSON.stringify(trainingState.timerCues.announce), JSON.stringify(trainingState.timerCues.speech)];
    untrack(() => {
      if (!liveTimerAvailable()) return;
      const cur = store.currentSlot;
      const info = s ? {
        name: s.workout.notes || 'Session',
        exercise: cur ? slotTypeName(cur, trainingState.exerciseTypes) : undefined,
        done: store.progress.settled,
        total: store.progress.total,
        running: !store.isPaused,
        elapsedMs: store.elapsedMs,
      } : null;
      const config = composeLive(live.timerPlan, info, { sessionNotification: trainingState.sessionNotification }, Date.now());
      if (config) {
        notificationSent = true;
        // Muted for now: no beeps and no announcements from the service; the notification and haptics go on.
        const muted = cueMute.muted;
        void sendLiveTimer(muted ? { ...config, cues: config.cues.filter((c) => c.kind !== 'speak') } : config, {
          sound: trainingState.timerBeepEnabled && !muted,
          vibrate: trainingState.timerVibrateEnabled,
          volume: trainingState.timerCues.volume,
          volumeSetsMedia: trainingState.timerCues.volumeSetsMedia,
          otherAudio: trainingState.timerCues.otherAudio,
          tones: tonesFor(trainingState.timerCues.sound),
          speech: $state.snapshot(trainingState.timerCues.speech),
        }).then((ok) => { live.serviceOk = ok; });
      } else if (notificationSent && !(live.timerFinished && s)) {
        notificationSent = false;
        void stopLiveTimer();
      }
    });
  });
  // Pausing the session pauses a running timer or circuit with it, and
  // resuming resumes it - but only a timer this pause stopped: one paused
  // by hand stays paused, and resuming the timer alone while the session is
  // paused just runs the timer on (the session is not touched).
  let timerPausedBySession = false;
  let sessionWasPaused = untrack(() => store.isPaused);
  function linkTimerToSession(paused: boolean) {
    if (paused) {
      if (timerRunning(live.timerPlan)) {
        timerPausedBySession = true;
        pushTimerAction('pause');
      }
    } else if (timerPausedBySession) {
      timerPausedBySession = false;
      pushTimerAction('resume');
    }
  }
  $effect(() => {
    const paused = store.isPaused;
    untrack(() => {
      if (paused === sessionWasPaused) return;
      sessionWasPaused = paused;
      linkTimerToSession(paused);
    });
  });
  // The timer running again by itself (a hand resume) ends the link. (A
  // paused self-paced timer has no plan at all, so "no plan" doesn't.)
  $effect(() => {
    if (timerRunning(live.timerPlan)) timerPausedBySession = false;
  });
  // Pause / Resume session pressed in the notification: the service has
  // already paused or resumed the timer itself when it should (`withTimer`).
  $effect(() => onLiveAction((action) => {
    if (action.kind === 'sessionPause') {
      if (action.withTimer) timerPausedBySession = true;
      store.pause();
      sessionWasPaused = store.isPaused;
      if (!action.withTimer) linkTimerToSession(true);
    } else if (action.kind === 'sessionResume') {
      store.resume();
      sessionWasPaused = store.isPaused;
      linkTimerToSession(false);
    }
  }));

  /** The session timer, so the exercise card's Timer button can open it. */
  let timer = $state<ReturnType<typeof TimerWidget> | undefined>(undefined);

  // Back (phone key or browser): the add/edit screen returns to the
  // session; the session itself minimises to the bubble - it keeps running.
  const sessionOpen = $derived(!!session && store.isModalOpen);
  const formOpen = $derived(isAddingExercise || editingSlotId !== null);
  backWhile(() => sessionOpen, () => store.minimize());
  backWhile(() => formOpen, () => { isAddingExercise = false; editingSlotId = null; addToGroupId = null; startingCircuit = false; });
  const exercises = $derived(store.exercises);
  /** Circuit headers in the list: which slot starts which group. Round-by-round running comes later. */
  const groupStarts = $derived.by(() => {
    const starts = new Map<string, ExerciseGroup>();
    for (const item of workoutItems({ exercises, groups: store.workout?.groups })) {
      if (item.kind === 'group') starts.set(item.members[0].slot.id, item.group);
    }
    return starts;
  });
  /** Each circuit's estimated length in minutes, for its card. */
  const groupMins = $derived(groupMinutes({ exercises, groups: store.workout?.groups }, 'estimate'));
  const progress = $derived(store.progress);
  const current = $derived(store.currentSlot);
  const expected = $derived(store.expectedMinutes);
  const elapsed = $derived(store.elapsedMinutes);

  const loggingSlot = $derived(exercises.find((e) => e.id === loggingSlotId) ?? null);

  /** What was logged the last time this exercise was done - not counting this session. */
  function lastTimeFor(slot: ExerciseSlot) {
    return findLastLogged(slot.typeId, trainingState.workouts, session?.sourceWorkoutId ?? session?.workout.id);
  }

  /**
   * Opens the finish sheet. For an exercise that records a duration, the
   * time actually spent on it (its own clock, which stops with the session
   * pause) is prefilled - rounded to whole minutes, and only once there is
   * at least half a minute of it, so a quick tick-off keeps the planned value.
   */
  function openFinish(slot: ExerciseSlot) {
    const ms = store.slotElapsedMs(slot.id);
    const params = slot.activeParameters ?? trainingState.exerciseTypes.find((t) => t.id === slot.typeId)?.parameters ?? [];
    if (seedFor?.slotId !== slot.id) {
      seedFor = Array.isArray(params) && params.includes('duration') && ms >= 30_000
        ? { slotId: slot.id, values: { ...slotValues(slot), duration: Math.max(1, Math.round(ms / 60_000)) } }
        : null;
    }
    loggingSlotId = slot.id;
    sheetKey++;
  }

  /**
   * The finish sheet failed to open. It says so (and keeps a record under
   * Settings -> About & Help), closes cleanly so Finish works again, and
   * offers the full editor instead - the exercise can still be logged.
   */
  function handleSheetError(err: unknown) {
    const slotId = loggingSlotId;
    reportError(err, 'Finish exercise sheet');
    loggingSlotId = null;
    seedFor = null;
    if (slotId && !editorFailed) editingSlotId = slotId;
  }
  /** The full editor failed as well - don't bounce between the two. */
  let editorFailed = false;
  function handleEditorError(err: unknown) {
    reportError(err, 'Session exercise editor');
    editorFailed = true;
    isAddingExercise = false;
    editingSlotId = null;
  }

  /** "4:05", or "1:02:40" past an hour. */
  function clock(ms: number): string {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }
  const editingSlot = $derived(exercises.find((e) => e.id === editingSlotId) ?? null);

  const overrun = $derived(expected > 0 && elapsed > expected);

  // --- Handlers ---

  function handleLogged(values: ExerciseValues) {
    if (loggingSlotId) {
      store.logExercise(loggingSlotId, values);
      haptic(store.isComplete ? 'success' : 'tap');
    }
    loggingSlotId = null;
    seedFor = null;
  }

  /** A test's result was saved as a benchmark: the slot counts as done. */
  function handleTestRecorded(slotId: string) {
    const slot = exercises.find((e) => e.id === slotId);
    store.logExercise(slotId, { duration: slot?.prescribed?.duration ?? TEST_SLOT_MINUTES });
    haptic(store.isComplete ? 'success' : 'tap');
    loggingSlotId = null;
    seedFor = null;
  }

  /** A planned test goes in as the next thing to do. */
  function handleTestPlanned(slot: TestSlotType) {
    store.addPlannedExercise(slot);
    isAddingTest = false;
    isAddingExercise = false;
  }

  // --- Swiping a row ---
  function swipeDone(slot: ExerciseSlot) {
    if (lockedByRun(slot)) return;
    // A test is done when its result is in: swiping it away asks for the result instead.
    if (slot.test) { loggingSlotId = slot.id; return; }
    const name = slotTypeName(slot, trainingState.exerciseTypes);
    store.logExercise(slot.id, { ...(slot.prescribed ?? slotValues(slot)) });
    haptic(store.isComplete ? 'success' : 'tap');
    showUndo(`${name} done as prescribed`, () => store.unfinishExercise(slot.id));
  }
  /**
   * Skip on an exercise. A circuit's member asks first (unless Settings says not to): just this one - the circuit then
   * runs without it, its rests following the rest - or the whole circuit. Anything else is skipped at once.
   */
  function swipeSkip(slot: ExerciseSlot) {
    if (lockedByRun(slot)) return;
    const plan = skipPlan(store.exercises, slot.id);
    if (plan.kind === 'ask' && trainingState.tunableOn('circuit.askSkip')) {
      skipAsk = { slot, others: plan.others, circuit: circuitOf(slot)?.name || 'the circuit' };
      return;
    }
    skipSlots([slot]);
  }

  /** What the circuit-skip question is about, while it is open. */
  let skipAsk = $state<{ slot: ExerciseSlot; others: ExerciseSlot[]; circuit: string } | null>(null);

  /** Skips exercises together, with one Undo that reopens them all. */
  function skipSlots(slots: ExerciseSlot[], label?: string) {
    for (const s of slots) store.skipExercise(s.id);
    haptic('tap');
    const name = label ?? slotTypeName(slots[0], trainingState.exerciseTypes);
    showUndo(`${name} skipped`, () => { for (const s of [...slots].reverse()) store.unfinishExercise(s.id); });
  }

  function answerSkip(choice: string) {
    const ask = skipAsk;
    skipAsk = null;
    if (!ask) return;
    if (choice === 'one') skipSlots([ask.slot]);
    else if (choice === 'all') skipSlots([ask.slot, ...ask.others], ask.circuit.charAt(0).toUpperCase() + ask.circuit.slice(1));
  }

  function openFullEditor() {
    editingSlotId = loggingSlotId;
    loggingSlotId = null;
  }

  /**
   * The full form's save. While the session is running it writes the
   * `logged` bucket for an existing slot (it was opened from "edit full
   * details" on the finish sheet) and appends a new slot through
   * `addExercise`, which applies the added-exercise preference.
   */
  function handleFormSave(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues; planNote?: string }) {
    if (isAddingExercise) {
      const id = generateId();
      store.addExercise({ id, ...data }, trainingState.addedExerciseTarget, { pending: addAsTodo || startingCircuit });
      if (startingCircuit) {
        // The first member of a new circuit: it becomes the circuit, with its settings open to adjust.
        const gid = generateId();
        store.regroupExercises(groupSlots(groupingBase(), [id], { id: gid, rounds: 3, transition: 15, roundRest: 60 }));
        openGroupId = gid;
        startingCircuit = false;
      }
      const into = addToGroupId;
      addToGroupId = null;
      if (into) {
        // It lands at the end; move it to the end of the circuit it was added to.
        const base = groupingBase();
        const added = base.exercises.find((e) => e.id === id);
        if (added) store.regroupExercises(addToGroup({ ...base, exercises: base.exercises.filter((e) => e.id !== id) }, into, added));
      }
      isAddingExercise = false;
      addAsTodo = false;
    } else if (editingSlotId) {
      // Type/parameter changes first, then the log - `logExercise` is what
      // settles the slot and moves focus on, so it goes last.
      const planned = editingSlot?.prescribed;
      if (data.planNote !== undefined && planned) store.updateExercise(editingSlotId, { ...data, values: { ...planned, notes: data.planNote || undefined } }, 'prescribed');
      store.updateExercise(editingSlotId, data, 'logged');
      store.logExercise(editingSlotId, data.values);
      editingSlotId = null;
    }
  }

  /** Edit mode: a saved circuit goes in as a copy, after the focused exercise (or its circuit), still to do. */
  function addSavedCircuit(circuit: Circuit) {
    const base = groupingBase();
    const focus = base.exercises[store.currentIndex];
    let at = base.exercises.length === 0 ? 0 : store.currentIndex + 1;
    if (focus?.groupId) while (at < base.exercises.length && base.exercises[at].groupId === focus.groupId) at++;
    const added = insertCircuit({ exercises: [], groups: base.groups }, circuit, generateId);
    const exercises = [...base.exercises.slice(0, at), ...added.exercises, ...base.exercises.slice(at)];
    store.regroupExercises(normaliseGroups({ exercises, groups: added.groups }));
    const made = added.groups?.[added.groups.length - 1];
    if (made) openGroupId = made.id;
    isAddingSavedCircuit = false;
  }

  function handleDnd(e: CustomEvent<DndEvent<ExerciseSlot>>) {
    store.reorderExercises(e.detail.items);
  }

  /** On drop, an exercise landing inside a circuit joins it; a member dragged out leaves (as in the plan editor). */
  function handleDndFinalize(e: CustomEvent<DndEvent<ExerciseSlot>>) {
    store.regroupExercises(normaliseGroups({ exercises: settleAfterMove(e.detail.items), groups: store.workout?.groups }));
  }

  const circuitOf = (slot: ExerciseSlot) => (slot.groupId ? store.workout?.groups?.find((g) => g.id === slot.groupId) : undefined);
  /** The workout as the grouping helpers want it (a plain copy, never the live proxy). */
  const groupingBase = () => ({ exercises: $state.snapshot(store.exercises) as ExerciseSlot[], groups: $state.snapshot(store.workout?.groups) as ExerciseGroup[] | undefined });

  /** A member of the circuit that is running: its run owns it, so it can't be finished, skipped or removed meanwhile. */
  const lockedByRun = (slot: ExerciseSlot) => !!circuitGroupId && slot.groupId === circuitGroupId;

  /** Removes an exercise (a logged one included) with an Undo that puts back the list, circuits and focus. */
  function removeWithUndo(slot: ExerciseSlot) {
    if (lockedByRun(slot)) return;
    const before = { ...groupingBase(), index: store.currentIndex };
    store.removeExercise(slot.id);
    showUndo(`${slotTypeName(slot, trainingState.exerciseTypes)} removed`, () => {
      store.regroupExercises(before);
      store.focusExercise(before.index);
    });
  }

  function dissolveCircuit(groupId: string) {
    if (circuitGroupId === groupId) return; // it is running: finish or stop it first
    const before = groupingBase();
    const name = before.groups?.find((g) => g.id === groupId)?.name || 'Circuit';
    store.regroupExercises(ungroup(before, groupId));
    showUndo(`${name} ungrouped`, () => store.regroupExercises(before));
  }

  function leaveCircuit(slotId: string) {
    const slot = store.exercises.find((s) => s.id === slotId);
    if (!slot || lockedByRun(slot)) return;
    store.regroupExercises(takeOutOfGroup(groupingBase(), slotId));
  }

  function togglePicked(id: string) {
    pickedSlotIds = pickedSlotIds.includes(id) ? pickedSlotIds.filter((p) => p !== id) : [...pickedSlotIds, id];
  }

  /** Turns the picked exercises into a circuit: rounds from the most sets any has, else 3 (as in the plan editor). */
  function makeCircuit() {
    if (pickedSlotIds.length < 1) return;
    const chosen = store.exercises.filter((e) => pickedSlotIds.includes(e.id));
    const sets = Math.max(0, ...chosen.map((e) => {
      const v = slotValues(e);
      return v?.sets || (Array.isArray(v?.reps) ? repsPerSet(v).length : 0);
    }));
    store.regroupExercises(groupSlots(groupingBase(), pickedSlotIds, { id: generateId(), rounds: sets || 3, transition: 15, roundRest: 60 }));
    pickedSlotIds = [];
    isPickingCircuit = false;
  }

  // Back leaves the circuit picker first, then Edit mode, before it would minimise the session.
  backWhile(() => isEditingPlan && !formOpen, () => { if (isPickingCircuit) { isPickingCircuit = false; pickedSlotIds = []; } else isEditingPlan = false; });

  // Edit mode has nothing to show once the list is empty (the empty-state
  // branch takes over), so leave it rather than stranding the toggle on.
  $effect(() => {
    if (exercises.length === 0 && isEditingPlan) isEditingPlan = false;
  });

  /**
   * A finished interval run, logged against the exercise it was run for.
   * Opens the normal finish sheet with the protocol's real numbers seeded,
   * rather than logging silently - what the timer counted and what the user did
   * are usually but not always the same thing.
   */
  function handleSaveAndFinish() {
    isExiting = false;
    settleRunningCircuit();
    trainingState.finishSession();
  }

  /**
   * Stopping the session with a circuit (or a single exercise's timer) open: what it recorded is logged first, as
   * if it had been ended there, and the run goes - otherwise its clock and notification would carry on behind the
   * rating, and the sets it counted would be lost. Members it did no set for stay as they were (unlogged).
   */
  function settleRunningCircuit() {
    if (!circuitGroupId) return;
    const done = settleCircuit();
    if (done) for (const [slotId, v] of Object.entries(done)) if (v) store.logExercise(slotId, v);
    forgetCircuitRun();
    circuitGroupId = null;
    circuitVisible = false;
  }

  function handleDiscard() {
    isExiting = false;
    trainingState.discardSession();
  }
</script>

{#if session && store.isModalOpen}
  <div class="fixed inset-0 z-[110] safe-y bg-app-bg flex flex-col animate-in fade-in duration-200">
    <!-- Header: identity, clock, and the two ways out -->
    <header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
      <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 space-y-3 short:max-w-none short:flex short:items-center short:gap-4 short:py-1 short:space-y-0">
        <div class="flex items-start gap-3 short:flex-1 short:min-w-0 short:items-center">
          <button
            onclick={() => store.minimize()}
            class="btn-icon -ml-2 shrink-0"
            aria-label="Minimise session"
            title="Minimise — the session keeps running"
          >
            <Icon icon="ic:baseline-keyboard-arrow-down" class="text-2xl" />
          </button>
          <div class="min-w-0 flex-1">
            <p class="text-caption uppercase text-content-subtle flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full {store.isPaused ? 'bg-warning' : 'bg-success animate-pulse'}"></span>
              {store.isPaused ? 'Paused' : 'Session running'}
            </p>
            <h2 class="text-title text-content truncate">{session.workout.notes || 'Session'}</h2>
            {#if session.workout.description}
              <!-- The clamp sits on a span: a button's own display overrides line-clamp, which let long notes fill half the screen. -->
              <button onclick={() => showNotes = true} class="short:hidden block w-full text-left mt-0.5 text-caption text-content-subtle hover:text-content" title="Read all notes">
                <span class="line-clamp-2 leading-snug break-words">{session.workout.description}</span>
              </button>
            {/if}
          </div>
          <button
            onclick={() => showNotes = true}
            class="btn-icon shrink-0"
            aria-label="Session notes"
            title="Notes — the session's, the week's and each exercise's"
          >
            <Icon icon="ic:outline-sticky-note-2" class="text-xl" />
          </button>
          <button
            onclick={() => isExiting = true}
            class="btn-quiet shrink-0 px-3 text-label font-bold text-content-muted hover:text-danger hover:bg-danger/10 gap-1.5"
            aria-label="End the session"
          >
            <Icon icon="ic:baseline-stop-circle" class="text-base" />
            End
          </button>
        </div>

        <!-- Clock, progress and pause -->
        <div class="flex items-center gap-3 short:w-[42%] short:shrink-0">
          <button
            onclick={() => store.togglePause()}
            class="shrink-0 w-11 h-11 rounded-full grid place-items-center transition-all active:scale-90 {store.isPaused ? 'bg-success text-on-primary' : 'bg-surface-elevated text-content border border-border-strong'}"
            aria-label={store.isPaused ? 'Resume session' : 'Pause session'}
          >
            <Icon icon={store.isPaused ? 'ic:baseline-play-arrow' : 'ic:baseline-pause'} class="text-2xl" />
          </button>
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-metric text-content tabular-nums {overrun ? 'text-warning' : ''}">
                {formatClock(store.elapsedMs)}
              </span>
              <span class="text-label text-content-subtle tabular-nums">
                {#if progress.total === 0}
                  No exercises yet
                {:else}
                  {expected > 0 ? `of ~${formatMinutes(expected)} · ` : ''}{progress.settled}/{progress.total} done
                {/if}
              </span>
            </div>
            <div class="h-1.5 bg-surface-elevated rounded-control overflow-hidden">
              <div
                class="h-full rounded-control transition-all duration-500 {overrun ? 'bg-warning' : 'bg-primary'}"
                style="width: {expected > 0 && progress.total > 0 ? Math.min(100, (elapsed / expected) * 100) : 0}%"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Exercise list -->
    <div class="flex-1 overflow-y-auto no-scrollbar">
      <div class="max-w-lg mx-auto w-full px-4 py-4 pb-40 short:pb-24 short:py-2 space-y-2.5">
        <PainHeadsUp workout={session.workout} variant="line" />
        {#if exercises.length === 0}
          <div class="py-10 px-6 text-center space-y-4">
            <p class="text-body text-content-muted">Nothing in this session yet.</p>
            <button onclick={() => isAddingExercise = true} class="btn btn-primary w-full max-w-xs">
              <Icon icon="ic:baseline-plus" class="text-lg" /> Add an exercise
            </button>
          </div>
        {:else if isEditingPlan}
          <!-- Edit mode: drag to reorder, remove, add. Deliberately a
               separate mode rather than handles always on show - the
               normal path is going through the list, not rearranging it. -->
          {#if isPickingCircuit}
            <p class="px-1 text-caption text-content-subtle">Pick the exercises to do in rounds - a circuit, or a superset.</p>
            {#each exercises as slot (slot.id)}
              {@const on = pickedSlotIds.includes(slot.id)}
              <button
                onclick={() => togglePicked(slot.id)}
                class="w-full p-3 min-h-11 rounded-card border flex items-center gap-2.5 text-left transition-colors {on ? 'bg-primary/10 border-primary/50' : 'bg-surface/60 border-border hover:border-border-strong'}"
                aria-pressed={on}
              >
                <Icon icon={on ? 'ic:baseline-check-box' : 'ic:baseline-check-box-outline-blank'} class="text-xl shrink-0 {on ? 'text-primary' : 'text-content-subtle'}" />
                <div class="min-w-0 flex-1">
                  <p class="text-body font-bold text-content truncate">{slotTypeName(slot, trainingState.exerciseTypes)}</p>
                  <p class="text-caption text-content-subtle truncate">{slotSummary(slot) || '—'}</p>
                </div>
                {#if circuitOf(slot)}
                  <span class="shrink-0 max-w-[40%] truncate text-caption text-content-subtle">{circuitOf(slot)?.name || 'Circuit'}</span>
                {/if}
              </button>
            {/each}
            <div class="flex gap-2 pt-1">
              <button
                onclick={makeCircuit}
                disabled={pickedSlotIds.length < 1}
                class="btn btn-primary flex-1"
              >Make circuit{pickedSlotIds.length ? ` (${pickedSlotIds.length})` : ''}</button>
              <button onclick={() => { isPickingCircuit = false; pickedSlotIds = []; }} class="btn btn-secondary">Cancel</button>
            </div>
            {#if pickedSlotIds.length === 0}
              <p class="px-1 text-caption text-content-subtle">Tick at least one exercise to make a circuit.</p>
            {:else if pickedSlotIds.length === 1}
              <p class="px-1 text-caption text-content-subtle">One exercise repeats in rounds on its own; tick more to alternate them.</p>
            {/if}
          {:else}
          <div class="grid grid-cols-2 gap-2">
            <button
              onclick={() => (isAddingSavedCircuit = true)}
              class="min-h-11 py-2.5 rounded-control border border-dashed border-border-strong text-label font-bold text-content-subtle hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Icon icon="ic:baseline-repeat" class="text-base" /> Circuit
            </button>
            <button
              onclick={() => (isAddingTest = true)}
              class="min-h-11 py-2.5 rounded-control border border-dashed border-border-strong text-label font-bold text-content-subtle hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Icon icon="ic:baseline-flag" class="text-base" /> Test
            </button>
          </div>
          <section
            class="space-y-2.5 outline-none"
            use:dndzone={{ items: exercises, dropTargetStyle: {}, delayTouchStart: true }}
            onconsider={handleDnd}
            onfinalize={handleDndFinalize}
          >
            {#each exercises as slot (slot.id)}
              {@const group = circuitOf(slot)}
              {@const first = !!group && groupStarts.get(slot.id)?.id === group.id}
              <div animate:flip={{ duration: motionMs(200) }} class="p-3 bg-surface/60 border border-border rounded-card space-y-2 {group ? 'border-l-4 border-l-primary/60' : ''}">
                {#if group && first}
                  <div class="flex items-center gap-1.5 text-caption text-content-subtle min-w-0">
                    <button
                      onclick={() => { if (circuitGroupId !== group.id) openGroupId = openGroupId === group.id ? null : group.id; }}
                      class="min-w-0 flex-1 min-h-11 flex items-center gap-1.5 text-left"
                      aria-expanded={openGroupId === group.id}
                      title="Rounds and rests"
                    >
                      <Icon icon="ic:baseline-repeat" class="text-sm shrink-0" />
                      <span class="font-bold text-content-muted truncate max-w-[45%] shrink-0">{group.name || 'Circuit'}</span>
                      <span class="truncate min-w-0">· {groupSummary(group)}</span>
                      <Icon icon={openGroupId === group.id ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-sm shrink-0" />
                    </button>
                    <button
                      onclick={() => dissolveCircuit(group.id)}
                      disabled={circuitGroupId === group.id}
                      class="btn-quiet shrink-0 px-3 bg-surface-elevated text-label font-bold text-content-muted disabled:opacity-40"
                      title={circuitGroupId === group.id ? 'It is running: finish or stop it first' : 'Turn the circuit back into separate exercises'}
                    >Ungroup</button>
                  </div>
                  {#if openGroupId === group.id}
                    <GroupSettings
                      {group}
                      nameOf={(id) => { const m = exercises.find((e) => e.id === id); return m ? slotTypeName(m, trainingState.exerciseTypes) : ''; }}
                      onchange={(g) => store.regroupExercises(updateGroup(groupingBase(), g))}
                    />
                  {/if}
                {/if}
                <div class="flex items-center gap-2.5">
                  <Icon icon="ic:baseline-drag-indicator" class="text-xl text-content-subtle shrink-0 cursor-grab active:cursor-grabbing" aria-label="Drag to reorder" />
                  <button onclick={() => { if (!lockedByRun(slot)) editingSlotId = slot.id; }} class="min-w-0 flex-1 min-h-11 flex flex-col justify-center text-left" title="Edit what you did">
                    <p class="text-body font-bold text-content truncate">{slotTypeName(slot, trainingState.exerciseTypes)}</p>
                    <p class="text-caption text-content-subtle truncate">{slotSummary(slot) || '—'}</p>
                  </button>
                  {#if group}
                    <button
                      onclick={() => { addToGroupId = group.id; isAddingExercise = true; }}
                      class="btn-icon shrink-0 hover:text-primary {group.id !== slot.groupId || exercises[exercises.indexOf(slot) + 1]?.groupId === group.id ? 'hidden' : ''}"
                      aria-label="Add an exercise to this circuit"
                      title="Add to {group.name || 'the circuit'}"
                    >
                      <Icon icon="ic:baseline-plus" class="text-xl" />
                    </button>
                    <button
                      onclick={() => leaveCircuit(slot.id)}
                      disabled={lockedByRun(slot)}
                      class="btn-icon shrink-0 disabled:opacity-40"
                      aria-label="Take out of the circuit"
                      title="Take out of the circuit"
                    >
                      <Icon icon="ic:baseline-logout" class="text-xl" />
                    </button>
                  {/if}
                  <button
                    onclick={() => removeWithUndo(slot)}
                    disabled={lockedByRun(slot)}
                    class="btn-icon shrink-0 ml-1 hover:text-danger disabled:opacity-40"
                    aria-label="Remove exercise"
                  >
                    <Icon icon="ic:baseline-delete" class="text-xl" />
                  </button>
                </div>
              </div>
            {/each}
          </section>
          {/if}
        {:else}
          {#each exercises as slot, index (slot.id)}
            {@const status = slotStatus(slot)}
            {@const isCurrent = index === store.currentIndex}
            {@const groupStart = groupStarts.get(slot.id)}
            {#if groupStart}
              <!-- A circuit is one thing to start: its card heads its members, which carry the same bar down the side. -->
              <div class="mt-1 p-3 rounded-card bg-primary/5 flex items-center gap-3 min-w-0">
                <Icon icon="ic:baseline-repeat" class="text-xl text-primary shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="text-body font-bold text-content truncate">{groupStart.name || 'Circuit'}</p>
                  <p class="text-caption text-content-subtle truncate">{groupSummary(groupStart)}{groupMins.get(groupStart.id) ? ` · ~${formatMinutes(Math.ceil(groupMins.get(groupStart.id)!))}` : ''}</p>
                </div>
                {#if pendingMembers(exercises, groupStart.id).length === 0}
                  <!-- Nothing left in it to run: every member is logged or skipped. -->
                  <span class="shrink-0 px-2 text-caption font-bold text-content-subtle flex items-center gap-1">
                    <Icon icon={exercises.some((e) => e.groupId === groupStart.id && slotStatus(e) === 'done') ? 'ic:baseline-check' : 'ic:baseline-remove'} class="text-base" />
                    {exercises.some((e) => e.groupId === groupStart.id && slotStatus(e) === 'done') ? 'Done' : 'Skipped'}
                  </span>
                {:else if !store.isComplete}
                  <button
                    onclick={() => openCircuit(groupStart.id)}
                    class="btn btn-primary shrink-0 px-3.5 gap-1"
                  >
                    <Icon icon="ic:baseline-play-arrow" class="text-base" /> {circuitGroupId === groupStart.id ? 'Resume' : 'Start circuit'}
                  </button>
                {/if}
              </div>
            {/if}
            <!-- Swipe a pending exercise: right = done as prescribed,
                 left = skip (both with Undo). The solid backing hides
                 the coloured layer until the row slides off it. -->
            <div class="relative">
              <div
                class="peer relative z-10 bg-app-bg rounded-card"
                use:swipeRow={{ enabled: status === 'pending' && !store.isComplete && !lockedByRun(slot), onRight: () => swipeDone(slot), onLeft: () => swipeSkip(slot) }}
              >
                <div
                  class="rounded-card border transition-all {slot.groupId ? 'border-l-4 border-l-primary/60' : ''} {isCurrent
                    ? 'bg-surface border-primary/50 shadow-card'
                    : status === 'pending'
                      ? 'bg-surface/40 border-border'
                      : 'bg-surface/20 border-border/60'}"
                >
                  <div class="flex items-center gap-3 p-3.5">
                    <!-- The status pip and the name are one target: jump to this exercise. -->
                    <button onclick={() => store.focusExercise(index)} class="min-w-0 flex-1 min-h-11 flex items-center gap-3 text-left" aria-label="Go to exercise {index + 1}: {slotTypeName(slot, trainingState.exerciseTypes)}">
                      <span
                        class="shrink-0 w-8 h-8 rounded-full grid place-items-center text-caption font-bold transition-colors {status === 'done'
                          ? 'bg-success/15 text-success'
                          : status === 'skipped'
                            ? 'bg-surface-elevated text-content-subtle'
                            : isCurrent
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-elevated text-content-subtle'}"
                        aria-hidden="true"
                      >
                        {#if status === 'done'}
                          <Icon icon="ic:baseline-check" class="text-base" />
                        {:else if status === 'skipped'}
                          <Icon icon="ic:baseline-remove" class="text-base" />
                        {:else}
                          {index + 1}
                        {/if}
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-body font-bold truncate {status === 'pending' ? 'text-content' : 'text-content-muted'}">
                          {slotTypeName(slot, trainingState.exerciseTypes)}
                        </span>
                        <span class="text-caption text-content-subtle truncate flex items-center gap-1.5">
                          {#if status === 'skipped'}
                            <span class="text-content-subtle">Skipped</span>
                          {:else if !slot.prescribed}
                            <span class="text-primary/80">Extra</span>
                            {#if slotSummary(slot)}&middot; {slotSummary(slot)}{/if}
                          {:else}
                            {slotSummary(slot) || '—'}
                          {/if}
                        </span>
                      </span>
                    </button>

                    {#if isCurrent && status === 'pending' && groupIdOf(slot) && circuitGroupId !== slot.groupId}
                      <!-- A circuit member waits for the circuit to start: no clock running yet. -->
                      <span class="shrink-0 px-2 py-1 rounded-control text-caption font-bold bg-surface-elevated text-content-subtle">Circuit</span>
                    {:else if isCurrent && status === 'pending'}
                      <!-- This exercise's own clock: stops with the session pause,
                           and carries on from here if you come back to it. -->
                      <span
                        class="shrink-0 flex items-center gap-1 px-2 py-1 rounded-control text-caption tabular-nums {store.isPaused ? 'bg-surface-elevated text-content-subtle' : 'bg-primary/10 text-primary'}"
                        title="Time on this exercise"
                        aria-label="Time on this exercise: {clock(store.slotElapsedMs(slot.id))}"
                      >
                        <Icon icon={store.isPaused ? 'ic:baseline-pause' : 'ic:baseline-timer'} class="text-sm" />
                        {clock(store.slotElapsedMs(slot.id))}
                      </span>
                    {:else if store.slotElapsedMs(slot.id) >= 60_000}
                      <span class="shrink-0 text-caption text-content-subtle tabular-nums" title="Time spent on this exercise" aria-label="Time spent on this exercise: {Math.round(store.slotElapsedMs(slot.id) / 60_000)} minutes">{Math.round(store.slotElapsedMs(slot.id) / 60_000)} min</span>
                    {/if}

                    {#if status !== 'pending'}
                      <button
                        onclick={() => store.unfinishExercise(slot.id)}
                        class="btn-icon shrink-0 hover:text-primary"
                        aria-label="Reopen this exercise"
                        title="Reopen — correct what you logged"
                      >
                        <Icon icon="ic:baseline-undo" class="text-xl" />
                      </button>
                    {/if}
                  </div>

                  <!-- The current exercise opens up: what to do, then the actions -->
                  {#if isCurrent && status === 'pending'}
                    <div class="px-3.5 pb-3.5 space-y-3 animate-in fade-in duration-200">
                      <ExerciseDetails {slot} showHowTo lastTime={lastTimeFor(slot)} />

                      <div class="flex gap-2">
                        <button
                          onclick={() => swipeSkip(slot)}
                          disabled={lockedByRun(slot)}
                          class="btn shrink-0 py-3 bg-surface-elevated/50 hover:bg-surface-elevated text-content-subtle hover:text-content border border-border-strong/50 active:scale-[0.98]"
                        >
                          Skip
                        </button>
                        {#if groupIdOf(slot)}
                          <!-- The circuit is the way through these: it leads, "Finish exercise" is the fallback. -->
                          <button
                            onclick={() => openCircuit(groupIdOf(slot)!)}
                            class="btn btn-primary flex-1 min-w-0 py-3 active:scale-[0.98]"
                            aria-label={circuitGroupId === slot.groupId ? 'Resume the circuit' : 'Start the circuit'}
                          >
                            <Icon icon="ic:baseline-play-arrow" class="text-lg" />
                            {circuitGroupId === slot.groupId ? 'Resume circuit' : 'Start circuit'}
                          </button>
                        {:else if hasRunnableTiming(slotValues(slot))}
                          <!-- The exercise's own timer - a repeater, rest-timed sets or a pacer - the same
                               runner as a circuit's. It waits for Start. The floating pill also offers a
                               stopwatch and countdown for anything else. -->
                          <button
                            onclick={() => openSolo(slot.id)}
                            class="btn shrink-0 py-3 gap-1.5 bg-surface-elevated/50 hover:bg-surface-elevated text-content hover:text-primary border border-border-strong/50 active:scale-[0.98]"
                            aria-label={circuitGroupId === `${SOLO_PREFIX}${slot.id}` ? 'Resume the timer' : isPacer(slotValues(slot)) ? 'Open the pacer for this exercise' : 'Open the timer for this exercise'}
                          >
                            <Icon icon="ic:baseline-timer" class="text-base" />
                            {circuitGroupId === `${SOLO_PREFIX}${slot.id}` ? 'Resume' : isPacer(slotValues(slot)) ? 'Pacer' : 'Timer'}
                          </button>
                        {/if}
                        <button
                          onclick={() => openFinish(slot)}
                          disabled={lockedByRun(slot)}
                          class={groupIdOf(slot)
                            ? 'btn shrink-0 py-3 bg-surface-elevated/50 hover:bg-surface-elevated text-content-subtle hover:text-content border border-border-strong/50 active:scale-[0.98]'
                            : 'btn btn-primary flex-1 min-w-0 py-3 active:scale-[0.98]'}
                        >
                          <Icon icon="ic:baseline-check" class="text-base" />
                          {groupIdOf(slot) ? 'Finish' : 'Finish exercise'}
                        </button>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
              {#if status === 'pending'}
                <div class="absolute inset-0 z-0 rounded-card bg-success/80 text-on-primary flex items-center px-5 gap-2 text-label font-bold opacity-0 peer-data-[swipe=right]:opacity-100 transition-opacity">
                  <Icon icon="ic:baseline-check" class="text-xl" /> Done as prescribed
                </div>
                <div class="absolute inset-0 z-0 rounded-card bg-surface-elevated text-content-muted flex items-center justify-end px-5 gap-2 text-label font-bold opacity-0 peer-data-[swipe=left]:opacity-100 transition-opacity">
                  Skip <Icon icon="ic:baseline-skip-next" class="text-xl" />
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Footer: the quiet session-shape controls, and finishing -->
    <footer bind:offsetHeight={footerH} class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
      <div class="max-w-lg mx-auto w-full px-4 py-3 short:py-1 flex items-center gap-2">
        {#if exercises.length > 0}
          <!-- Nothing to reorder in an empty session: the button is not there rather than greyed out for no visible reason. -->
          <button
            onclick={() => { isEditingPlan = !isEditingPlan; isPickingCircuit = false; pickedSlotIds = []; }}
            class="btn-quiet px-3 text-label font-bold gap-1.5 {isEditingPlan
              ? 'bg-primary/15 text-primary'
              : 'text-content-subtle hover:text-content'}"
            title="Reorder or remove exercises"
          >
            <Icon icon={isEditingPlan ? 'ic:baseline-check' : 'ic:baseline-tune'} class="text-base" />
            {isEditingPlan ? 'Done' : 'Edit'}
          </button>
        {/if}
        <button
          onclick={() => isAddingExercise = true}
          class="btn-quiet px-3 text-label font-bold text-content-subtle hover:text-content gap-1.5"
          title="Add an exercise you did that wasn't planned"
        >
          <Icon icon="ic:baseline-plus" class="text-base" />
          Add
        </button>
        <div class="flex-1"></div>
        {#if timer && trainingState.timerPillHidden && !circuitRun}
          {@const t = timer.tucked()}
          <!-- The timer, tucked away: it keeps running, shows its time
               here, and a tap brings the whole thing back. -->
          <button
            onclick={() => trainingState.setTimerPillHidden(false)}
            class="h-11 min-w-11 px-3 rounded-full flex items-center justify-center gap-1.5 border text-label font-bold tabular-nums transition-colors {t.running ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface-elevated/50 border-border-strong/50 text-content-subtle hover:text-content'}"
            aria-label="Show the timer"
            title="Timer"
          >
            <Icon icon={t.icon} class="text-lg" />
            {#if t.text}{t.text}{/if}
          </button>
        {/if}
        {#if store.isComplete}
          <button
            onclick={handleSaveAndFinish}
            class="btn px-5 bg-success hover:bg-success-hover text-on-primary active:scale-[0.98] gap-1.5"
          >
            Finish &amp; rate
            <Icon icon="ic:baseline-arrow-forward" class="text-base" />
          </button>
        {/if}
      </div>
    </footer>

  </div>
{/if}

{#if session}
  <!-- Outside the modal block on purpose. Mounted for as long as the
       session runs, hidden (not unmounted) while the modal is minimised -
       unmounting here would throw away a running interval mid-protocol,
       and `visible` still keeps it off screen exactly when the session
       modal is, so it never competes with the session bubble. -->
  <TimerWidget
    bind:this={timer}
    currentSlot={current ?? null}
    bottomClass={TIMER_BOTTOM}
    docked
    visible={store.isModalOpen && !circuitRun}
    onOpenRun={openRun}
  />
{/if}

{#if session && circuitRun}
  <CircuitPill visible={store.isModalOpen && !circuitVisible} bottomClass={TIMER_BOTTOM} onOpen={() => (circuitVisible = true)} />
  {#key circuitGroupId}
    <CircuitRunner
      sessionKey={session.startedAt}
      group={circuitRun.group}
      slots={circuitRun.slots}
      variant={circuitRun.solo ? circuitRun.solo.kind : 'circuit'}
      autoStart={!circuitRun.solo}
      leadIn={circuitRun.solo ? circuitRun.solo.leadIn : CIRCUIT_LEAD_IN_SECONDS}
      baseValues={circuitRun.baseValues}
      logLabel={circuitRun.solo ? 'Log' : undefined}
      onSavePreset={circuitRun.solo ? (values, leadIn) => (namingPreset = { values: $state.snapshot(values) as ExerciseValues, leadIn }) : undefined}
      visible={store.isModalOpen && circuitVisible}
      onLog={handleCircuitLogged}
      onClose={() => { circuitGroupId = null; circuitVisible = false; }}
      onMinimize={() => (circuitVisible = false)}
    />
  {/key}
{/if}

{#if namingPreset}
  <PresetNameSheet values={namingPreset.values} leadIn={namingPreset.leadIn} suggestion={current ? slotTypeName(current, trainingState.exerciseTypes) : ''} onDone={() => (namingPreset = null)} />
{/if}

{#if loggingSlot?.test && session}
  {@const tslot = loggingSlot}
  <TestSheet
    mode="result"
    slot={tslot}
    workout={{ id: session.workout.id, weekId: session.workout.weekId }}
    onSaved={() => handleTestRecorded(tslot.id)}
    onClose={() => { loggingSlotId = null; seedFor = null; }}
  />
{:else if loggingSlot}
  {#key sheetKey}
    <svelte:boundary onerror={handleSheetError}>
      <ExerciseLogSheet
        slot={loggingSlot}
        seed={intervalSeed}
        lastTime={lastTimeFor(loggingSlot)}
        onSave={handleLogged}
        onCancel={() => { loggingSlotId = null; seedFor = null; }}
        onEditFull={openFullEditor}
      />
    </svelte:boundary>
  {/key}
{/if}

{#if isAddingExercise || editingSlot}
  <div class="fixed inset-0 z-[120] safe-y bg-app-bg overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full px-4 pb-12 space-y-4">
      <div class="sticky top-0 z-10 -mx-4 px-4 py-1 bg-app-bg">
        <button
          onclick={() => { isAddingExercise = false; editingSlotId = null; addToGroupId = null; startingCircuit = false; }}
          class="btn-quiet -ml-2 px-2 text-label text-content-subtle hover:text-content flex items-center gap-2"
        >
          <Icon icon="ic:baseline-arrow-back" class="text-lg" />
          Back to session
        </button>
      </div>
      {#if isAddingExercise && !startingCircuit && !addToGroupId}
        <button onclick={() => (isAddingTest = true)} class="btn-quiet px-1 text-label text-primary hover:underline flex items-center gap-1.5">
          <Icon icon="ic:baseline-flag" class="text-sm" /> Add a benchmark test instead
        </button>
      {/if}
      {#if isAddingExercise}
        <!-- The setting is changed here rather than linked to. This screen
             is a `fixed inset-0` overlay above the session modal, so the
             old "Change" link navigated to Settings *behind* it - the view
             really did change, you just couldn't see it. Bouncing someone
             out to Settings mid-session would be the wrong answer even if
             it had worked; this writes the same preference in place. -->
        {#if startingCircuit}
          <p class="px-1 text-caption text-content-subtle">First exercise of a new circuit, added to do next. Give it a time or some reps; add the others, rounds and rests afterwards.</p>
        {:else}
        <div class="px-1 space-y-2">
          <Segmented
            label="Is it done or still to do"
            variant="setting"
            full
            value={addAsTodo ? 'todo' : 'done'}
            onChange={(v) => (addAsTodo = v === 'todo')}
            options={[{ value: 'done', label: 'Already done' }, { value: 'todo', label: 'Still to do' }]}
          />
          <p class="text-caption text-content-subtle">
            {addAsTodo ? 'Added right after the current exercise, as the target for you to do next. Once done, it counts as:' : 'Logged as done, with what you enter below. This one counts as:'}
          </p>
          <Segmented
            label="What it counts as"
            variant="setting"
            full
            value={trainingState.addedExerciseTarget === 'none' ? 'none' : 'mirror'}
            onChange={(v) => trainingState.setAddedExerciseTarget(v)}
            options={[{ value: 'none', label: 'Extra work' }, { value: 'mirror', label: 'Part of the plan' }]}
          />
          <p class="text-caption text-content-subtle">
            {#if trainingState.addedExerciseTarget === 'none'}
              No target is recorded, so it adds nothing to planned load and adherence still measures the original plan.
            {:else}
              What you did is copied in as the target too, so it counts toward planned load and the session reports full adherence.
            {/if}
          </p>
        </div>
        {/if}
      {/if}
      {#if editingSlot}
        <p class="px-1 text-caption text-content-subtle">Saved as what you did, and counted as done. The plan stays as it was.</p>
      {/if}
      <svelte:boundary onerror={handleEditorError}>
        <!-- A to-do exercise is a target (plan notes); a done one is a log (how it went). Only labels differ for a new one, so no remount. -->
        <ExerciseForm initialSlot={editingSlot} mode={isAddingExercise && addAsTodo ? 'prescribed' : 'logged'} inGroup={!!editingSlot?.groupId || (isAddingExercise && (!!addToGroupId || startingCircuit))} onSave={handleFormSave} />
      </svelte:boundary>
    </div>
  </div>
{/if}

{#if isAddingTest}
  <TestSheet mode="plan" onSave={handleTestPlanned} onClose={() => (isAddingTest = false)} />
{/if}

{#if isAddingSavedCircuit}
  <Sheet title="Add a circuit" level="nested" onClose={() => (isAddingSavedCircuit = false)}>
    <div class="space-y-2">
      <button onclick={() => { isAddingSavedCircuit = false; startingCircuit = true; addToGroupId = null; isAddingExercise = true; }} class="w-full p-3 rounded-card border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-left">
        <p class="text-body font-bold text-primary flex items-center gap-1.5"><Icon icon="ic:baseline-plus" class="text-base" /> New circuit</p>
        <p class="text-caption text-content-subtle">Start with its first exercise; each one is a time or some reps, repeated in rounds.</p>
      </button>
      {#if exercises.length > 0}
        <button onclick={() => { isAddingSavedCircuit = false; isPickingCircuit = true; }} class="w-full p-3 rounded-card border border-border bg-surface/60 hover:border-border-strong text-left">
          <p class="text-body font-bold text-content">From exercises already here</p>
          <p class="text-caption text-content-subtle">Pick some of this session's exercises to do in rounds.</p>
        </button>
      {/if}
      {#if trainingState.circuits.length > 0}<p class="text-caption uppercase text-content-subtle px-1 pt-1">Your saved circuits</p>{/if}
      {#each trainingState.circuits as c (c.id)}
        <button onclick={() => addSavedCircuit(c)} class="w-full p-3 rounded-card border border-border bg-surface/60 hover:border-border-strong text-left">
          <p class="text-body font-bold text-content truncate">{c.name}</p>
          <p class="text-caption text-content-subtle truncate">{c.exercises.map((x) => slotTypeName(x, trainingState.exerciseTypes)).join(' · ')}</p>
        </button>
      {/each}
      {#if trainingState.circuits.length > 0}<p class="text-caption text-content-subtle px-1">A saved one is added as a copy after the current exercise, to do; adjust its rounds and rests right after.</p>{/if}
    </div>
  </Sheet>
{/if}

{#if showNotes && session}
  <SessionNotesSheet onClose={() => showNotes = false} />
{/if}

{#if isExiting && session}
  <SessionExitModal
    {progress}
    elapsedLabel={formatMinutes(elapsed)}
    circuit={circuitGroupId && circuitHud.active ? { name: circuitHud.name || 'the circuit', sets: circuitHud.sets } : null}
    onSave={handleSaveAndFinish}
    onDiscard={handleDiscard}
    onCancel={() => isExiting = false}
  />
{/if}

{#if skipAsk}
  <ChoiceSheet
    title="Skip {slotTypeName(skipAsk.slot, trainingState.exerciseTypes)}?"
    message="It is part of {skipAsk.circuit}."
    choices={[
      { id: 'one', label: 'Just ' + slotTypeName(skipAsk.slot, trainingState.exerciseTypes), description: 'The circuit goes on without it: ' + skipAsk.others.map((o) => slotTypeName(o, trainingState.exerciseTypes)).join(', ') + ', with the rounds and rests as set.', icon: 'ic:baseline-skip-next' },
      { id: 'all', label: 'The whole circuit', description: 'All of its exercises are skipped - nothing left to run or rest for.', icon: 'ic:baseline-repeat', tone: 'neutral' },
    ]}
    onChoose={answerSkip}
    onCancel={() => (skipAsk = null)}
  />
{/if}

{#if switchingTo}
  <ChoiceSheet
    title="{circuitHud.name || 'A timer'} is still running"
    message="Only one circuit or timer can run at a time."
    choices={[
      { id: 'back', label: 'Back to ' + (circuitHud.name || 'it'), description: 'Carry on where it is.', icon: 'ic:baseline-play-arrow' },
      { id: 'drop', label: 'Drop it and start this one', description: circuitHud.sets > 0 ? `The ${circuitHud.sets} ${circuitHud.sets === 1 ? 'set' : 'sets'} it recorded are not logged.` : 'Nothing it recorded is logged.', icon: 'ic:baseline-delete-outline', tone: 'danger' },
    ]}
    onChoose={(id) => { const to = switchingTo; switchingTo = null; if (id === 'drop' && to) replaceRun(to); else circuitVisible = true; }}
    onCancel={() => (switchingTo = null)}
  />
{/if}
