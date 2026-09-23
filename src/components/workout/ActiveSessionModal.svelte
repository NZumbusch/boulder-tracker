<script lang="ts">
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
  import { formatWeight, displayWeight } from '../../lib/units';
  import { trainingState } from '../../lib/state.svelte';
  import type { ExerciseSlot, ExerciseValues, ParameterBlock } from '../../lib/types';
  import { slotValues, slotTypeName } from '../../lib/exerciseSlot';
  import { slotStatus } from '../../lib/session/activeSession';
  import { formatClock, formatMinutes } from '../../lib/session/formatSession';
  import { estimateSlotDuration } from '../../lib/planning/sessionDuration';
  import { generateId } from '../../lib/utils';
  import { PARAMETER_LABELS } from '../../lib/constants';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import ExerciseForm from './ExerciseForm.svelte';
  import ExerciseLogSheet from './ExerciseLogSheet.svelte';
  import SessionExitModal from './SessionExitModal.svelte';
  import TimerWidget from './TimerWidget.svelte';
  import Icon from '@iconify/svelte';

  const store = trainingState.sessionStore;

  // --- Local view state ---
  /** The slot whose "what did you do" sheet is open, if any. */
  let loggingSlotId = $state<string | null>(null);
  /** The slot open in the full ExerciseForm, or 'new' while adding one. */
  let editingSlotId = $state<string | null>(null);
  let isAddingExercise = $state(false);
  let isExiting = $state(false);
  /** The tucked-away "change the session" mode - reorder handles, remove, add. */
  let isEditingPlan = $state(false);
  /** Values handed over by a finished interval run, seeding the finish sheet once. */
  let intervalSeed = $state<ExerciseValues | null>(null);

  const session = $derived(store.session);
  const exercises = $derived(store.exercises);
  const progress = $derived(store.progress);
  const current = $derived(store.currentSlot);
  const expected = $derived(store.expectedMinutes);
  const elapsed = $derived(store.elapsedMinutes);

  const loggingSlot = $derived(exercises.find((e) => e.id === loggingSlotId) ?? null);
  const editingSlot = $derived(exercises.find((e) => e.id === editingSlotId) ?? null);

  const overrun = $derived(expected > 0 && elapsed > expected);

  /** A one-line summary of what a slot asks for, for the collapsed rows. */
  function slotSummary(slot: ExerciseSlot): string {
    const v = slotValues(slot);
    const parts: string[] = [];
    if (v.sets) parts.push(`${v.sets}${v.reps ? `×${v.reps}` : ' sets'}`);
    else if (v.reps) parts.push(`${v.reps} reps`);
    if (v.weight) parts.push(formatWeight(v.weight, trainingState.units.weight));
    if (v.minGrade) parts.push(v.maxGrade && v.maxGrade !== v.minGrade ? `${v.minGrade}–${v.maxGrade}` : v.minGrade);
    const mins = estimateSlotDuration(slot);
    if (mins) parts.push(`${mins}m`);
    return parts.join(' · ');
  }

  /** Everything the current exercise prescribes, as label/value pairs. */
  function detailPairs(slot: ExerciseSlot): { label: string; value: string }[] {
    const v = slot.prescribed ?? slotValues(slot);
    const params = slot.activeParameters
      ?? trainingState.exerciseTypes.find((t) => t.id === slot.typeId)?.parameters
      ?? [];
    const pairs: { label: string; value: string }[] = [];
    const push = (param: ParameterBlock, value: unknown, suffix = '') => {
      if (!params.includes(param)) return;
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value) && value.length === 0) return;
      pairs.push({
        label: PARAMETER_LABELS[param],
        value: `${Array.isArray(value) ? value.join(', ') : value}${suffix}`,
      });
    };
    push('duration', v.duration, ' min');
    push('sets', v.sets);
    push('reps', v.reps);
    push('weight', typeof v.weight === 'number' ? Math.round(displayWeight(v.weight, trainingState.units.weight) * 10) / 10 : v.weight, ` ${trainingState.units.weight}`);
    push('holdSize', v.holdSize, ' mm');
    push('holdType', v.holdType);
    push('timeOn', v.timeOn, ' s');
    push('timeOff', v.timeOff, ' s');
    push('restTime', v.timeBetweenSets, ' s');
    push('cadence', v.cadence);
    push('distance', v.distance, ' km');
    push('boardType', v.boardType);
    push('boardAngle', v.boardAngle, '°');
    push('climbingStyle', v.climbingStyle);
    push('leadStyle', v.leadStyle);
    push('mobilityType', v.mobilityType);
    push('movesPerRoute', v.movesPerRoute);
    push('bodyweightPercent', v.bodyweightPercent, '%');
    push('maxWeightPercent', v.maxWeightPercent, '%');
    push('routeDifficulty', v.routeDifficulty);
    push('difficulty', v.difficulty);
    if (params.includes('grades') || params.includes('boulderingGrades') || params.includes('routeGrades')) {
      if (v.minGrade) {
        pairs.push({
          label: 'Grades',
          value: v.maxGrade && v.maxGrade !== v.minGrade ? `${v.minGrade}–${v.maxGrade}` : v.minGrade,
        });
      }
    }
    return pairs;
  }

  // --- Handlers ---

  function handleLogged(values: ExerciseValues) {
    if (loggingSlotId) store.logExercise(loggingSlotId, values);
    loggingSlotId = null;
    intervalSeed = null;
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
    intervalSeed = { ...slotValues(slot), ...values };
    loggingSlotId = slot.id;
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
  <div class="fixed inset-0 z-[110] bg-app-bg flex flex-col animate-in fade-in duration-200">
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
          </div>
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
                {#if expected > 0}of ~{formatMinutes(expected)} &middot; {/if}{progress.settled}/{progress.total} done
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
              <div animate:flip={{ duration: 200 }} class="p-3 bg-surface/60 border border-border rounded-card flex items-center gap-2.5">
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
                  {#if detailPairs(slot).length > 0}
                    <div class="grid grid-cols-2 gap-x-3 gap-y-2 p-3 bg-surface-elevated/40 rounded-control border border-border-strong/30">
                      {#each detailPairs(slot) as pair}
                        <div class="min-w-0">
                          <p class="text-caption text-content-subtle truncate">{pair.label}</p>
                          <p class="text-label font-bold text-content truncate tabular-nums">{pair.value}</p>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  {#if slotValues(slot).notes}
                    <p class="text-caption text-content-muted italic px-1">{slotValues(slot).notes}</p>
                  {/if}

                  <div class="flex gap-2">
                    <button
                      onclick={() => store.skipExercise(slot.id)}
                      class="shrink-0 px-4 py-3 bg-surface-elevated/50 hover:bg-surface-elevated text-content-subtle hover:text-content text-label font-bold rounded-control border border-border-strong/50 transition-all active:scale-[0.98]"
                    >
                      Skip
                    </button>
                    <button
                      onclick={() => loggingSlotId = slot.id}
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
    currentSlot={current ?? null}
    bottomClass="bottom-[80px]"
    visible={store.isModalOpen}
    onLogInterval={current ? handleIntervalLogged : null}
  />
{/if}

{#if loggingSlot}
  <ExerciseLogSheet
    slot={loggingSlot}
    seed={intervalSeed}
    onSave={handleLogged}
    onCancel={() => { loggingSlotId = null; intervalSeed = null; }}
    onEditFull={openFullEditor}
  />
{/if}

{#if isAddingExercise || editingSlot}
  <div class="fixed inset-0 z-[120] bg-app-bg overflow-y-auto no-scrollbar">
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
      <ExerciseForm initialSlot={editingSlot} mode="logged" onSave={handleFormSave} />
    </div>
  </div>
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
