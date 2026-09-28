<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { live, composeLive, onLiveAction } from '../../lib/native/liveNotification.svelte';
  import { liveTimerAvailable, sendLiveTimer, stopLiveTimer } from '../../lib/native/timerService';
  import { untrack } from 'svelte';
  import { motionMs } from '../../lib/motion';
  /**
   * The running session, full screen.
   *
   * The linear path is the point: the current exercise is expanded with
   * everything you need to do it, and finishing it logs what you did and
   * moves to the next one. Everything else (jumping around, reordering,
   * skipping, un-finishing, adding) is available but deliberately quieter.
   *
   * Leaving does not stop the session - closing minimises to
   * `SessionBubble`, and only the explicit Stop action opens the
   * save-or-discard fork. The stopwatch lives here and nowhere else, so it
   * can't compete with the bubble's own elapsed readout.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { ExerciseSlot, ExerciseValues, ParameterBlock, ExerciseGroup } from '../../lib/types';
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
  import SessionExitModal from './SessionExitModal.svelte';
  import SessionNotesSheet from './SessionNotesSheet.svelte';
  import TimerWidget from './TimerWidget.svelte';
  import { hasIntervalTiming } from '../../lib/timer/intervalTimer';
  import { workoutItems, groupSummary } from '../../lib/exercise/groups';
  import CircuitRunner, { storedCircuitGroupId, forgetCircuitRun } from './CircuitRunner.svelte';
  import { reportError } from '../../lib/errorReporting';
  import Icon from '@iconify/svelte';

  const store = trainingState.sessionStore;

  // --- Local view state ---
  /** The slot whose "what did you do" sheet is open, if any. */
  let loggingSlotId = $state<string | null>(null);
  /** The slot open in the full ExerciseForm, or 'new' while adding one. */
  let editingSlotId = $state<string | null>(null);
  let isAddingExercise = $state(false);
  let isExiting = $state(false);
  let showNotes = $state(false);
  /** The tucked-away "change the session" mode - reorder handles, remove, add. */
  let isEditingPlan = $state(false);
  /**
   * Values handed over by a finished interval run (or the exercise's own
   * clock), seeding the finish sheet once - only for the slot they were
   * made for, so a leftover can never follow you to another exercise.
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
  const circuitRun = $derived.by(() => {
    if (!circuitGroupId) return null;
    const item = workoutItems({ exercises: store.exercises, groups: store.workout?.groups }).find((i) => i.kind === 'group' && i.group.id === circuitGroupId);
    return item && item.kind === 'group' ? { group: item.group, slots: item.members.map((m) => m.slot) } : null;
  });
  /** The group a slot is in, for its Circuit button. */
  const groupIdOf = (slot: ExerciseSlot) => (slot.groupId && store.workout?.groups?.some((g) => g.id === slot.groupId) ? slot.groupId : null);

  // The session ended (finished or discarded): a run in progress goes with it.
  $effect(() => {
    if (!session && circuitGroupId) {
      forgetCircuitRun();
      circuitGroupId = null;
      circuitVisible = false;
    }
  });

  function openCircuit(groupId: string) {
    if (circuitGroupId && circuitGroupId !== groupId) return; // one at a time: resume or finish that one first
    circuitGroupId = groupId;
    circuitVisible = true;
  }

  /** A finished (or stopped) circuit: log what each member did; skip the ones never reached only if it ran to the end. */
  function handleCircuitLogged(values: Record<string, ExerciseValues | undefined>, complete: boolean) {
    for (const [slotId, v] of Object.entries(values)) {
      if (v) store.logExercise(slotId, v);
      else if (complete) store.skipExercise(slotId);
    }
    circuitGroupId = null;
    circuitVisible = false;
  }

  const session = $derived(store.session);

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
      isEditingPlan = false;
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
      trainingState.timerBeepEnabled, trainingState.timerVibrateEnabled];
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
        void sendLiveTimer(config, trainingState.timerBeepEnabled, trainingState.timerVibrateEnabled).then((ok) => { live.serviceOk = ok; });
      } else if (notificationSent && !(live.timerFinished && s)) {
        notificationSent = false;
        void stopLiveTimer();
      }
    });
  });
  // Pause / Resume session pressed in the notification.
  $effect(() => onLiveAction((action) => {
    if (action.kind === 'sessionPause') store.pause();
    else if (action.kind === 'sessionResume') store.resume();
  }));

  /** The session timer, so the exercise card's Timer button can open it. */
  let timer = $state<ReturnType<typeof TimerWidget> | undefined>(undefined);

  // Back (phone key or browser): the add/edit screen returns to the
  // session; the session itself minimises to the bubble - it keeps running.
  const sessionOpen = $derived(!!session && store.isModalOpen);
  const formOpen = $derived(isAddingExercise || editingSlotId !== null);
  backWhile(() => sessionOpen, () => store.minimize());
  backWhile(() => formOpen, () => { isAddingExercise = false; editingSlotId = null; });
  const exercises = $derived(store.exercises);
  /** Circuit headers in the list: which slot starts which group. Round-by-round running comes later. */
  const groupStarts = $derived.by(() => {
    const starts = new Map<string, ExerciseGroup>();
    for (const item of workoutItems({ exercises, groups: store.workout?.groups })) {
      if (item.kind === 'group') starts.set(item.members[0].slot.id, item.group);
    }
    return starts;
  });
  const progress = $derived(store.progress);
  const current = $derived(store.currentSlot);
  const expected = $derived(store.expectedMinutes);
  const elapsed = $derived(store.elapsedMinutes);

  const loggingSlot = $derived(exercises.find((e) => e.id === loggingSlotId) ?? null);

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
    if (loggingSlotId) store.logExercise(loggingSlotId, values);
    loggingSlotId = null;
    seedFor = null;
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
  function handleFormSave(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues }) {
    if (isAddingExercise) {
      store.addExercise({ id: generateId(), ...data }, trainingState.addedExerciseTarget);
      isAddingExercise = false;
    } else if (editingSlotId) {
      // Type/parameter changes first, then the log - `logExercise` is what
      // settles the slot and moves focus on, so it goes last.
      store.updateExercise(editingSlotId, data, 'logged');
      store.logExercise(editingSlotId, data.values);
      editingSlotId = null;
    }
  }

  function handleDnd(e: CustomEvent<DndEvent<ExerciseSlot>>) {
    store.reorderExercises(e.detail.items);
  }

  // Edit mode has nothing to show once the list is empty (the empty-state
  // branch takes over), so leave it rather than stranding the toggle on.
  $effect(() => {
    if (exercises.length === 0 && isEditingPlan) isEditingPlan = false;
  });

  /**
   * A finished interval run, logged against the exercise it was run for.
   * Opens the normal finish sheet with the protocol's real numbers seeded,
   * rather than logging silently - what the timer counted and what you did
   * are usually but not always the same thing.
   */
  function handleIntervalLogged(values: Partial<ExerciseValues>) {
    const slot = store.currentSlot;
    if (!slot) return;
    seedFor = { slotId: slot.id, values: { ...slotValues(slot), ...values } };
    loggingSlotId = slot.id;
    sheetKey++;
  }

  function handleSaveAndFinish() {
    isExiting = false;
    trainingState.finishSession();
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
      <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 space-y-3">
        <div class="flex items-start gap-3">
          <button
            onclick={() => store.minimize()}
            class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors shrink-0"
            aria-label="Minimise session"
            title="Minimise — the session keeps running"
          >
            <Icon icon="ic:baseline-keyboard-arrow-down" class="text-2xl" />
          </button>
          <div class="min-w-0 flex-1">
            <p class="text-caption uppercase text-success flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-success {store.isPaused ? '' : 'animate-pulse'}"></span>
              {store.isPaused ? 'Paused' : 'Session running'}
            </p>
            <h2 class="text-title text-content truncate">{session.workout.notes || 'Session'}</h2>
            {#if session.workout.description}
              <button onclick={() => showNotes = true} class="block w-full text-left text-caption text-content-subtle hover:text-content mt-0.5 line-clamp-2 leading-snug" title="Read all notes">
                {session.workout.description}
              </button>
            {/if}
          </div>
          <button
            onclick={() => showNotes = true}
            class="shrink-0 p-2 text-content-subtle hover:text-content transition-colors"
            aria-label="Session notes"
            title="Notes — the session's, the week's and each exercise's"
          >
            <Icon icon="ic:outline-sticky-note-2" class="text-xl" />
          </button>
          <button
            onclick={() => isExiting = true}
            class="shrink-0 px-3 py-2 text-label font-bold text-danger hover:bg-danger/10 rounded-control transition-colors flex items-center gap-1.5"
          >
            <Icon icon="ic:baseline-stop-circle" class="text-base" />
            Stop
          </button>
        </div>

        <!-- Clock, progress and pause -->
        <div class="flex items-center gap-3">
          <button
            onclick={() => store.togglePause()}
            class="shrink-0 w-11 h-11 rounded-full grid place-items-center transition-all active:scale-90 {store.isPaused ? 'bg-success text-app-bg' : 'bg-surface-elevated text-content border border-border-strong'}"
            aria-label={store.isPaused ? 'Resume session' : 'Pause session'}
          >
            <Icon icon={store.isPaused ? 'ic:baseline-play-arrow' : 'ic:baseline-pause'} class="text-2xl" />
          </button>
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-metric text-content tabular-nums {overrun ? 'text-warning' : ''}">
                {formatClock(store.elapsedMs)}
              </span>
              <span class="text-caption text-content-subtle tabular-nums">
                {expected > 0 ? `of ~${formatMinutes(expected)} · ` : ''}{progress.settled}/{progress.total} done
              </span>
            </div>
            <div class="h-1.5 bg-surface-elevated rounded-control overflow-hidden">
              <div
                class="h-full rounded-control transition-all duration-500 {overrun ? 'bg-warning' : 'bg-primary'}"
                style="width: {expected > 0 ? Math.min(100, (elapsed / expected) * 100) : 0}%"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Exercise list -->
    <div class="flex-1 overflow-y-auto no-scrollbar">
      <div class="max-w-lg mx-auto w-full px-4 py-4 pb-40 space-y-2.5">
        {#if exercises.length === 0}
          <div class="py-12 border-2 border-dashed border-border rounded-card text-center bg-surface/10 space-y-3">
            <p class="text-caption text-content-subtle italic">Nothing in this session yet.</p>
            <button
              onclick={() => isAddingExercise = true}
              class="text-label font-bold text-primary hover:underline"
            >
              Add your first exercise
            </button>
          </div>
        {:else if isEditingPlan}
          <!-- Edit mode: drag to reorder, remove, add. Deliberately a
               separate mode rather than handles always on show - the
               normal path is going through the list, not rearranging it. -->
          <section
            class="space-y-2.5 outline-none"
            use:dndzone={{ items: exercises, dropTargetStyle: {}, delayTouchStart: true }}
            onconsider={handleDnd}
            onfinalize={handleDnd}
          >
            {#each exercises as slot (slot.id)}
              <div animate:flip={{ duration: motionMs(200) }} class="p-3 bg-surface/60 border border-border rounded-card flex items-center gap-2.5">
                <Icon icon="ic:baseline-drag-indicator" class="text-xl text-content-subtle shrink-0 cursor-grab active:cursor-grabbing" />
                <div class="min-w-0 flex-1">
                  <p class="text-body font-bold text-content truncate">{slotTypeName(slot, trainingState.exerciseTypes)}</p>
                  <p class="text-caption text-content-subtle truncate">{slotSummary(slot) || '—'}</p>
                </div>
                <button
                  onclick={() => store.removeExercise(slot.id)}
                  class="p-2 text-content-subtle hover:text-danger transition-colors shrink-0"
                  aria-label="Remove exercise"
                >
                  <Icon icon="ic:baseline-delete" class="text-base" />
                </button>
              </div>
            {/each}
          </section>
        {:else}
          {#each exercises as slot, index (slot.id)}
            {@const status = slotStatus(slot)}
            {@const isCurrent = index === store.currentIndex}
            {@const groupStart = groupStarts.get(slot.id)}
            {#if groupStart}
              <p class="px-1 pt-1 text-caption text-content-subtle flex items-center gap-1 min-w-0">
                <Icon icon="ic:baseline-repeat" class="text-sm shrink-0" />
                <span class="font-bold text-content-muted truncate">{groupStart.name || 'Circuit'}</span>
                <span class="truncate flex-1">· {groupSummary(groupStart)}</span>
                {#if !store.isComplete}
                  <button
                    onclick={() => openCircuit(groupStart.id)}
                    disabled={!!circuitGroupId && circuitGroupId !== groupStart.id}
                    class="shrink-0 px-2 py-0.5 rounded-full text-caption font-bold transition-colors disabled:opacity-40 {circuitGroupId === groupStart.id ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/20'} flex items-center gap-0.5"
                  >
                    <Icon icon="ic:baseline-play-arrow" class="text-sm" /> {circuitGroupId === groupStart.id ? 'Resume' : 'Start'}
                  </button>
                {/if}
              </p>
            {/if}
            <div
              class="rounded-card border transition-all {isCurrent
                ? 'bg-surface border-primary/50 shadow-card'
                : status === 'pending'
                  ? 'bg-surface/40 border-border'
                  : 'bg-surface/20 border-border/60'}"
            >
              <div class="flex items-center gap-3 p-3.5">
                <!-- Status pip doubles as the jump-to target -->
                <button
                  onclick={() => store.focusExercise(index)}
                  class="shrink-0 w-8 h-8 rounded-full grid place-items-center text-caption font-bold transition-colors {status === 'done'
                    ? 'bg-success/15 text-success'
                    : status === 'skipped'
                      ? 'bg-surface-elevated text-content-subtle'
                      : isCurrent
                        ? 'bg-primary text-white'
                        : 'bg-surface-elevated text-content-subtle'}"
                  aria-label="Go to exercise {index + 1}"
                >
                  {#if status === 'done'}
                    <Icon icon="ic:baseline-check" class="text-base" />
                  {:else if status === 'skipped'}
                    <Icon icon="ic:baseline-remove" class="text-base" />
                  {:else}
                    {index + 1}
                  {/if}
                </button>

                <button onclick={() => store.focusExercise(index)} class="min-w-0 flex-1 text-left">
                  <p class="text-body font-bold truncate {status === 'pending' ? 'text-content' : 'text-content-muted'}">
                    {slotTypeName(slot, trainingState.exerciseTypes)}
                  </p>
                  <p class="text-caption text-content-subtle truncate flex items-center gap-1.5">
                    {#if status === 'skipped'}
                      <span class="text-content-subtle">Skipped</span>
                    {:else if !slot.prescribed}
                      <span class="text-primary/80">Extra</span>
                      {#if slotSummary(slot)}&middot; {slotSummary(slot)}{/if}
                    {:else}
                      {slotSummary(slot) || '—'}
                    {/if}
                  </p>
                </button>

                {#if isCurrent && status === 'pending'}
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
                  <span class="shrink-0 text-caption text-content-subtle tabular-nums" title="Time spent on this exercise">{Math.round(store.slotElapsedMs(slot.id) / 60_000)} min</span>
                {/if}

                {#if status !== 'pending'}
                  <button
                    onclick={() => store.unfinishExercise(slot.id)}
                    class="shrink-0 p-2 text-content-subtle hover:text-primary transition-colors"
                    aria-label="Reopen this exercise"
                    title="Reopen — correct what you logged"
                  >
                    <Icon icon="ic:baseline-undo" class="text-base" />
                  </button>
                {/if}
              </div>

              <!-- The current exercise opens up: what to do, then the actions -->
              {#if isCurrent && status === 'pending'}
                <div class="px-3.5 pb-3.5 space-y-3 animate-in fade-in duration-200">
                  <ExerciseDetails {slot} />

                  <div class="flex gap-2">
                    <button
                      onclick={() => store.skipExercise(slot.id)}
                      class="shrink-0 px-4 py-3 bg-surface-elevated/50 hover:bg-surface-elevated text-content-subtle hover:text-content text-label font-bold rounded-control border border-border-strong/50 transition-all active:scale-[0.98]"
                    >
                      Skip
                    </button>
                    {#if groupIdOf(slot)}
                      <button
                        onclick={() => openCircuit(groupIdOf(slot)!)}
                        disabled={!!circuitGroupId && circuitGroupId !== slot.groupId}
                        class="shrink-0 px-4 py-3 bg-surface-elevated/50 hover:bg-surface-elevated text-content hover:text-primary text-label font-bold rounded-control border border-border-strong/50 transition-all active:scale-[0.98] flex items-center gap-1.5 disabled:opacity-40"
                        aria-label="Run the circuit"
                      >
                        <Icon icon="ic:baseline-repeat" class="text-base" />
                        {circuitGroupId === slot.groupId ? 'Resume' : 'Circuit'}
                      </button>
                    {:else if hasIntervalTiming(slotValues(slot))}
                      <!-- Opens the timer that fits: the interval protocol
                           for timed work (hangs), the set timer with rests
                           for strength sets. The floating pill below also
                           offers stopwatch and countdown for anything else. -->
                      <button
                        onclick={() => timer?.openForExercise()}
                        class="shrink-0 px-4 py-3 bg-surface-elevated/50 hover:bg-surface-elevated text-content hover:text-primary text-label font-bold rounded-control border border-border-strong/50 transition-all active:scale-[0.98] flex items-center gap-1.5"
                        aria-label="Open the timer for this exercise"
                      >
                        <Icon icon="ic:baseline-timer" class="text-base" />
                        Timer
                      </button>
                    {/if}
                    <button
                      onclick={() => openFinish(slot)}
                      class="flex-1 min-w-0 py-3 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <Icon icon="ic:baseline-check" class="text-base" />
                      Finish exercise
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Footer: the quiet session-shape controls, and finishing -->
    <footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
      <div class="max-w-lg mx-auto w-full px-4 py-3 flex items-center gap-2">
        <button
          onclick={() => isEditingPlan = !isEditingPlan}
          disabled={exercises.length === 0}
          class="px-3 py-2.5 rounded-control text-label font-bold transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed {isEditingPlan
            ? 'bg-primary/15 text-primary'
            : 'text-content-subtle hover:text-content'}"
          title={exercises.length === 0 ? 'Nothing to reorder yet' : 'Reorder or remove exercises'}
        >
          <Icon icon={isEditingPlan ? 'ic:baseline-check' : 'ic:baseline-tune'} class="text-base" />
          {isEditingPlan ? 'Done' : 'Edit'}
        </button>
        <button
          onclick={() => isAddingExercise = true}
          class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center gap-1.5"
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
            class="h-10 min-w-10 px-3 rounded-full flex items-center justify-center gap-1.5 border text-label font-bold tabular-nums transition-colors {t.running ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface-elevated/50 border-border-strong/50 text-content-subtle hover:text-content'}"
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
            class="px-5 py-2.5 bg-success hover:bg-success-hover text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
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
    bottomClass="bottom-[80px]"
    docked
    visible={store.isModalOpen && !circuitRun}
    onLogInterval={current ? handleIntervalLogged : null}
  />
{/if}

{#if session && circuitRun}
  {#key circuitGroupId}
    <CircuitRunner
      sessionKey={session.startedAt}
      group={circuitRun.group}
      slots={circuitRun.slots}
      visible={store.isModalOpen && circuitVisible}
      onLog={handleCircuitLogged}
      onClose={() => { circuitGroupId = null; circuitVisible = false; }}
      onMinimize={() => (circuitVisible = false)}
    />
  {/key}
{/if}

{#if loggingSlot}
  {#key sheetKey}
    <svelte:boundary onerror={handleSheetError}>
      <ExerciseLogSheet
        slot={loggingSlot}
        seed={intervalSeed}
        onSave={handleLogged}
        onCancel={() => { loggingSlotId = null; seedFor = null; }}
        onEditFull={openFullEditor}
      />
    </svelte:boundary>
  {/key}
{/if}

{#if isAddingExercise || editingSlot}
  <div class="fixed inset-0 z-[120] safe-y bg-app-bg overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full p-4 space-y-4 pb-12">
      <button
        onclick={() => { isAddingExercise = false; editingSlotId = null; }}
        class="text-label text-content-subtle hover:text-content flex items-center gap-2 px-1"
      >
        <Icon icon="ic:baseline-arrow-back" class="text-sm" />
        Back to session
      </button>
      {#if isAddingExercise}
        <!-- The setting is changed here rather than linked to. This screen
             is a `fixed inset-0` overlay above the session modal, so the
             old "Change" link navigated to Settings *behind* it - the view
             really did change, you just couldn't see it. Bouncing someone
             out to Settings mid-session would be the wrong answer even if
             it had worked; this writes the same preference in place. -->
        <div class="px-1 space-y-2">
          <p class="text-caption text-content-subtle">
            Logged as done, with what you enter below. This one counts as:
          </p>
          <div class="flex bg-surface-elevated/50 p-1 rounded-control">
            <button
              onclick={() => trainingState.setAddedExerciseTarget('none')}
              class="flex-1 py-2 text-label rounded-control transition-all {trainingState.addedExerciseTarget === 'none' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
            >
              Extra work
            </button>
            <button
              onclick={() => trainingState.setAddedExerciseTarget('mirror')}
              class="flex-1 py-2 text-label rounded-control transition-all {trainingState.addedExerciseTarget === 'mirror' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
            >
              Part of the plan
            </button>
          </div>
          <p class="text-caption text-content-subtle/80">
            {#if trainingState.addedExerciseTarget === 'none'}
              No target is recorded, so it adds nothing to planned load and adherence still measures the original plan.
            {:else}
              What you did is copied in as the target too, so it counts toward planned load and the session reports full adherence.
            {/if}
          </p>
        </div>
      {/if}
      <svelte:boundary onerror={handleEditorError}>
        <ExerciseForm initialSlot={editingSlot} mode="logged" onSave={handleFormSave} />
      </svelte:boundary>
    </div>
  </div>
{/if}

{#if showNotes && session}
  <SessionNotesSheet onClose={() => showNotes = false} />
{/if}

{#if isExiting && session}
  <SessionExitModal
    {progress}
    elapsedLabel={formatMinutes(elapsed)}
    onSave={handleSaveAndFinish}
    onDiscard={handleDiscard}
    onCancel={() => isExiting = false}
  />
{/if}
