<script lang="ts">
  import { planNote, logNote } from '../../lib/exerciseSlot';
  import RangeSlider from '../common/RangeSlider.svelte';
  import { onMount, untrack } from 'svelte';
  import SetRowsEditor from './SetRowsEditor.svelte';
  import { perSetKeysFor, setRows, withSetRows, hasPerSet, type SetRow } from '../../lib/exercise/setRows';
  import type { PerSetKey } from '../../lib/types';
  import { storage } from '../../lib/storage';
  import { trainingState } from '../../lib/state.svelte';
  import type { ExerciseSlot, ExerciseTypeDef, ExerciseValues, ParameterBlock } from '../../lib/types';
  import { PARAMETER_LABELS, BODYWEIGHT_METRIC_ID } from '../../lib/constants';
  import {
    BOULDER_GRADES, ROUTE_GRADES, CLIMBING_STYLES, BOARD_TYPES, BOARD_ANGLES,
    HOLD_TYPES, CAMPUS_TYPES, MOBILITY_TYPES, LEAD_STYLES,
  } from '../../lib/ai/valueSpec';
  import TargetHint from './TargetHint.svelte';
  import ExercisePicker from './ExercisePicker.svelte';
  import { exerciseGroup } from '../../lib/exercise/library';
  import { repsRepresentative } from '../../lib/exercise/reps';
  import { displayWeight, toKg, formatWeight } from '../../lib/units';
  import { loggedMetrics } from '../../lib/analytics/metricValues';
  import { isCustomParam, customIdOf, paramLabel } from '../../lib/exercise/valueDefs';
  import Icon from '@iconify/svelte';

  // --- Props ---
  let {
    initialSlot = null,
    mode = 'prescribed',
    inGroup = false,
    onSave
  } = $props<{
    initialSlot?: ExerciseSlot | null,
    /** Which ExerciseValues bucket on the slot this form edits - "prescribed" (the plan) or "logged" (what happened). */
    mode?: 'prescribed' | 'logged',
    /** The slot is (or joins) a circuit: one set of it is timed or counted, whatever its type usually tracks. */
    inGroup?: boolean,
    onSave: (data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues; planNote?: string }) => void
  }>();

  // --- State ---
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  let selectedTypeId = $state<string>('');
  let activeLoadTab = $state<'weight' | 'bodyweightPercent' | 'maxWeightPercent'>('weight');

  // Local form state - Initialized with defaults, updated via $effect
  let duration = $state(60);
  let minGrade = $state('6A');
  let maxGrade = $state('6B');
  let cadence = $state(5);
  let climbingStyle = $state<NonNullable<ExerciseValues['climbingStyle']>>(['Power']);
  let boardType = $state<ExerciseValues['boardType']>('Kilterboard');
  let boardAngle = $state(40);
  let sets = $state<number | undefined>(4);
  let reps = $state<number | undefined>(1);
  let originalReps = $state<number | number[] | undefined>(undefined);
  let repsEdited = $state(false);
  let movesPerRoute = $state<number | undefined>();
  let holdType = $state<ExerciseValues['holdType']>('Half Crimp');
  let timeOn = $state(7);
  let timeOff = $state(3);
  /** Circuit members: seconds of rest after this exercise as text; blank = the circuit's own switch time. */
  let restAfterText = $state('');
  let timeBetweenSets = $state(180);
  let weight = $state(0);
  let holdSize = $state(20);
  let distance = $state(0);
  let campusType = $state<ExerciseValues['campusType']>('Jumps');
  let mobilityType = $state<NonNullable<ExerciseValues['mobilityType']>>(['Hamstrings']);
  let leadStyle = $state<NonNullable<ExerciseValues['leadStyle']>>(['Redpoint']);
  let difficulty = $state(5);
  let routeDifficulty = $state<"Easy" | "Moderate" | "Hard">("Moderate");
  let bodyweightPercent = $state(100);
  let maxWeightPercent = $state(80);
  let plannedLoad = $state(5);
  let notes = $state('');
  /** Logged mode only: the plan's own note, edited here beside "how it went". */
  let planNoteText = $state('');
  let categoryOverride = $state<string>('');
  /** The athlete's own value types, as typed: text per def id, "" = not set. */
  let customDraft = $state<Record<string, string>>({});


  // Optional convenience: shows the absolute added weight
  // implied by the bodyweightPercent slider, using the most recently logged
  // bodyweight entry - doesn't change what's stored (still a %, same as
  // before), just a display hint.
  const latestBodyweightKg = $derived.by(() => {
    const entries = loggedMetrics(trainingState.dailyMetrics)
      .filter((m) => m.metricId === BODYWEIGHT_METRIC_ID)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
    return entries[0]?.value;
  });

  /** A stored kg value in the chosen weight unit, one decimal. */
  const toDisplayWeight = (kg: number) => Math.round(displayWeight(kg, trainingState.units.weight) * 10) / 10;

  // --- Lifecycle ---
  onMount(async () => {
    exerciseTypes = await storage.getExerciseTypes();
    if (initialSlot) {
      selectedTypeId = initialSlot.typeId;
    } else {
      pickerOpen = true;
    }
  });

  let activeParams = $state<ParameterBlock[]>([]);

  /** The custom fields shown: active ones, in the order they were switched on. A def archived since still shows while it is on. */
  const customFields = $derived(
    activeParams.filter(isCustomParam).flatMap((p) => {
      const def = trainingState.valueDefs.find((d) => d.id === customIdOf(p));
      return def ? [def] : [];
    }),
  );

  // --- Derived State ---
  const activeTypeDef = $derived(exerciseTypes.find(t => t.id === selectedTypeId));

  /** The library picker (`ExercisePicker`). A new exercise opens it straight away - choosing is the first step. */
  let pickerOpen = $state(false);

  // The values bucket being edited - the current mode's bucket if it has
  // data, else fall back to prescribed as a sensible starting point (e.g.
  // adding a brand-new exercise directly onto an already-active session).
  const editingValues = $derived<ExerciseValues>(
    (initialSlot?.[mode as 'prescribed' | 'logged']) ?? initialSlot?.prescribed ?? {},
  );

  // Inline prescribed-target hints - only meaningful in
  // `logged` mode, and only once there's a real `prescribed` bucket to
  // compare against (a brand-new slot added directly while logging has
  // none). Read-only - `handleSubmit` below never writes to `prescribed`.
  const targetValues = $derived<ExerciseValues>(
    mode === 'logged' ? (initialSlot?.prescribed ?? {}) : {},
  );

  $effect(() => {
    if (initialSlot?.activeParameters) {
      activeParams = initialSlot.activeParameters;
    } else if (activeTypeDef) {
      activeParams = inGroup ? circuitDefaults(activeTypeDef.parameters) : [...activeTypeDef.parameters];
    }
  });

  /** In a circuit, sets, reps and a time per set are always on offer, whatever the type lists. */
  const CIRCUIT_PARAMS: ParameterBlock[] = ['sets', 'reps', 'timeOn'];
  const customizable = $derived.by(() => {
    const base = activeTypeDef?.possibleParameters || activeTypeDef?.parameters || [];
    const offered = inGroup ? [...base, ...CIRCUIT_PARAMS.filter((p) => !base.includes(p))] : base;
    // An archived value type is not offered for switching on - unless it already is.
    return offered.filter((p) => !isCustomParam(p) || activeParams.includes(p) || trainingState.valueDefs.some((d) => d.id === customIdOf(p) && !d.archived));
  });

  /**
   * A new circuit member whose type tracks neither a time per set nor reps
   * (Core Training tracks only a duration) starts with a time per set in
   * place of the duration - a round is one set of it.
   */
  function circuitDefaults(params: ParameterBlock[]): ParameterBlock[] {
    if (params.includes('timeOn') || params.includes('reps')) return [...params];
    return [...params.filter((p) => p !== 'duration'), 'timeOn'];
  }

  // Sync internal state with incoming props
  $effect(() => {
    const v = editingValues;
    duration = v.duration ?? 60;
    minGrade = v.minGrade || '6A';
    maxGrade = v.maxGrade || '6B';
    cadence = v.cadence ?? 5;
    climbingStyle = Array.isArray(v.climbingStyle) ? v.climbingStyle : ['Power'];
    boardType = v.boardType || 'Kilterboard';
    boardAngle = v.boardAngle ?? 40;
    sets = v.sets ?? 4;
    // Per-set reps can't be shown in one field, so the mean stands in.
    // `originalReps` keeps the real value: saving without touching this
    // field writes the array back untouched rather than flattening months
    // of per-set detail into its average.
    originalReps = v.reps;
    repsEdited = false;
    reps = repsRepresentative(v.reps) ?? 1;
    movesPerRoute = v.movesPerRoute;
    holdType = v.holdType || 'Half Crimp';
    // A circuit's timed exercise is usually a minute; a hang is usually 7 seconds.
    timeOn = v.timeOn ?? (inGroup ? 60 : 7);
    timeOff = v.timeOff ?? 3;
    restAfterText = typeof v.restAfter === 'number' ? String(v.restAfter) : '';
    timeBetweenSets = v.timeBetweenSets ?? 180;
    weight = v.weight !== undefined ? toDisplayWeight(v.weight) : 0;
    holdSize = v.holdSize ?? 20;
    distance = v.distance ?? 0;
    campusType = v.campusType || 'Jumps';
    mobilityType = Array.isArray(v.mobilityType) ? v.mobilityType : ['Hamstrings'];
    leadStyle = Array.isArray(v.leadStyle) ? v.leadStyle : ['Redpoint'];
    difficulty = v.difficulty ?? 5;
    routeDifficulty = v.routeDifficulty || 'Moderate';
    bodyweightPercent = v.bodyweightPercent ?? 100;
    maxWeightPercent = v.maxWeightPercent ?? 80;
    plannedLoad = v.plannedLoad ?? (activeTypeDef?.defaultPlannedLoad ?? 5);
    // Logged mode: `notes` is the how-it-went note, apart from the plan's.
    notes = mode === 'logged' ? (initialSlot ? logNote(initialSlot) : '') : v.notes || '';
    planNoteText = initialSlot ? planNote(initialSlot) : '';
    customDraft = Object.fromEntries(Object.entries(v.custom ?? {}).map(([k, x]) => [k, String(x)]));
    categoryOverride = initialSlot?.categoryId || '';
  });

  // Watch for modality changes to set default planned load
  $effect(() => {
    if (!initialSlot && activeTypeDef) {
      plannedLoad = activeTypeDef.defaultPlannedLoad ?? 5;
    }
  });

  const validationErrors = $derived.by(() => {
    const errors: Record<string, string> = {};
    if (activeParams.includes('duration') && duration <= 0) {
      errors.duration = 'Duration must be greater than 0.';
    }
    if (activeParams.includes('holdSize') && holdSize <= 0) {
      errors.holdSize = 'Hold size must be greater than 0.';
    }
    if (activeParams.includes('sets') && (sets || 0) < 0) {
      errors.sets = 'Sets cannot be negative.';
    }
    return errors;
  });

  const isValid = $derived(Object.keys(validationErrors).length === 0);

  // --- Per set: rows for the numbers that differ set to set ---
  const perSetKeys = $derived(perSetKeysFor(activeParams, activeTypeDef?.perSetParameters));
  let perSetOpen = $state(false);
  let rowsValue = $state<SetRow[]>([]);
  let rowsKey = $state(0);
  /** The plain numbers repeated `sets` times - where the rows start from. */
  function plainRows(): SetRow[] {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const base: SetRow = {};
    const set = (k: PerSetKey, v: number | undefined) => { if (v !== undefined && perSetKeys.includes(k)) base[k] = v; };
    set('reps', num(reps));
    set('weight', num(weight) === undefined ? undefined : Math.round(toKg(num(weight)!, trainingState.units.weight) * 100) / 100);
    set('timeOn', num(timeOn));
    set('bodyweightPercent', num(bodyweightPercent));
    set('maxWeightPercent', num(maxWeightPercent));
    set('boardAngle', num(boardAngle));
    set('holdSize', num(holdSize));
    set('distance', num(distance));
    return Array.from({ length: Math.max(1, Math.round(num(sets) ?? 1)) }, () => ({ ...base }));
  }
  function openPerSet() {
    rowsValue = hasPerSet(editingValues) ? setRows(editingValues, perSetKeys) : plainRows();
    rowsKey++;
    perSetOpen = true;
  }
  $effect(() => {
    // An exercise that already has sets of its own numbers opens that way.
    const v = editingValues;
    untrack(() => {
      if (perSetKeys.length > 0 && hasPerSet(v)) { rowsValue = setRows(v, perSetKeys); rowsKey++; perSetOpen = true; }
    });
  });

  // --- Handlers ---
  async function handleSubmit() {
    if (!activeTypeDef) return;

    if (!isValid) return;

    // An emptied number field comes back as null (or NaN): store "not set",
    // never null - null used to be saved and shown as "null", or read as 0.
    const n = (v: number | null | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const cleanDuration = Math.max(0, n(duration) ?? 0);
    // Typed in the chosen unit, stored in kg. Can be negative (assisted).
    const cleanWeight = n(weight) === undefined ? undefined : Math.round(toKg(n(weight)!, trainingState.units.weight) * 100) / 100;
    const cleanSize = Math.max(0, n(holdSize) ?? 0);

    const values: ExerciseValues = {
      plannedLoad: n(Number(plannedLoad)),
      notes: notes.trim() || undefined
    };

    const params = activeParams;

    if (params.includes('duration')) values.duration = cleanDuration;
    if (params.includes('boulderingGrades') || params.includes('grades')) {
      values.minGrade = minGrade;
      values.maxGrade = maxGrade;
    }
    if (params.includes('routeGrades')) {
      values.minGrade = minGrade;
      values.maxGrade = maxGrade;
    }
    if (params.includes('cadence')) values.cadence = n(cadence);
    if (params.includes('climbingStyle')) values.climbingStyle = climbingStyle;
    if (params.includes('boardType')) values.boardType = boardType;
    if (params.includes('boardAngle')) values.boardAngle = boardAngle;
    if (params.includes('sets')) values.sets = n(sets);
    if (params.includes('reps')) {
      values.reps = !repsEdited && Array.isArray(originalReps) ? originalReps : n(reps);
    }
    if (params.includes('movesPerRoute')) values.movesPerRoute = n(movesPerRoute);

    if (params.includes('holdType')) values.holdType = holdType;
    if (params.includes('timeOn')) values.timeOn = n(timeOn);
    if (params.includes('timeOff')) values.timeOff = n(timeOff);
    if (inGroup && mode === 'prescribed' && restAfterText.trim() !== '' && Number.isFinite(Number(restAfterText))) values.restAfter = Math.max(0, Math.round(Number(restAfterText)));
    if (params.includes('restTime')) values.timeBetweenSets = n(timeBetweenSets);
    if (params.includes('holdSize')) values.holdSize = cleanSize;
    if (params.includes('weight')) values.weight = cleanWeight;
    if (params.includes('distance')) values.distance = n(distance);
    if (params.includes('campusStyle')) values.campusType = campusType;
    if (params.includes('mobilityType')) values.mobilityType = mobilityType;
    if (params.includes('leadStyle')) values.leadStyle = leadStyle;
    if (params.includes('difficulty')) values.difficulty = n(difficulty);
    if (params.includes('routeDifficulty')) values.routeDifficulty = routeDifficulty;
    if (params.includes('bodyweightPercent')) values.bodyweightPercent = n(bodyweightPercent);
    if (params.includes('maxWeightPercent')) values.maxWeightPercent = n(maxWeightPercent);

    const custom: Record<string, number | string> = {};
    for (const def of customFields) {
      const raw = (customDraft[def.id] ?? '').trim();
      if (raw === '') continue;
      if (def.kind === 'number') {
        const num = Number(raw);
        if (Number.isFinite(num)) custom[def.id] = num;
      } else {
        custom[def.id] = raw;
      }
    }
    if (Object.keys(custom).length) values.custom = custom;

    onSave({
      typeId: activeTypeDef.id,
      categoryId: categoryOverride || undefined,
      activeParameters: activeParams,
      values: perSetOpen ? withSetRows(values, rowsValue, perSetKeys) : values,
      ...(mode === 'logged' && initialSlot?.prescribed ? { planNote: planNoteText.trim() } : {}),
    });
  }

  // Constants. Sourced from lib/ai/valueSpec.ts rather than written out
  // here, so this form's dropdowns, the AI prompt's allowed-value lists and
  // the AI importer's validation are provably the same set. They used to be
  // three independent copies, which is how the importer came to accept
  // board types like "Kilter" that no dropdown here can display.
  const bGrades = [...BOULDER_GRADES];
  const rGrades = [...ROUTE_GRADES];
  const climbingStyles: NonNullable<ExerciseValues['climbingStyle']>[number][] = [...CLIMBING_STYLES];
  const boardTypes: ExerciseValues['boardType'][] = [...BOARD_TYPES];
  const boardAngles = [...BOARD_ANGLES];
  const holdTypes: ExerciseValues['holdType'][] = [...HOLD_TYPES];
  const campusStyles: ExerciseValues['campusType'][] = [...CAMPUS_TYPES];
  const mobilityTypes: NonNullable<ExerciseValues['mobilityType']>[number][] = [...MOBILITY_TYPES];
  const leadStyles: NonNullable<ExerciseValues['leadStyle']>[number][] = [...LEAD_STYLES];
</script>

<div class="form-grid bg-surface/50 border border-border rounded-card p-5 backdrop-blur-sm animate-in zoom-in-95 duration-300">
  <div class="space-y-1.5">
    <span class="text-label text-content-subtle ml-1 block">Exercise</span>
    <button
      type="button"
      onclick={() => pickerOpen = true}
      class="w-full bg-surface-elevated text-left p-3.5 rounded-control border border-border-strong hover:border-primary/50 transition-all flex items-center gap-3"
    >
      <span class="min-w-0 flex-1">
        {#if activeTypeDef}
          <span class="block text-sm font-medium text-content truncate">{activeTypeDef.name}</span>
          <span class="block text-caption text-content-subtle truncate">{exerciseGroup(activeTypeDef)}{activeTypeDef.archived ? ' · archived' : ''}</span>
        {:else}
          <span class="block text-sm font-medium text-content-subtle">Choose an exercise…</span>
        {/if}
      </span>
      <Icon icon="ic:baseline-unfold-more" class="text-lg text-content-subtle shrink-0" />
    </button>
    {#if activeTypeDef?.description}
      <p class="text-caption text-content-muted px-1 whitespace-pre-wrap break-words">{activeTypeDef.description}</p>
    {/if}
  </div>

  {#if activeParams.includes('duration')}
    <div class="space-y-1.5">
      <div class="flex justify-between items-center ml-1">
        <label for="ex-duration" class="text-label text-content-subtle">Duration (min)</label>
        <TargetHint prescribed={targetValues.duration} current={duration} unit="m" />
      </div>
      <input id="ex-duration" type="number" bind:value={duration} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none transition-all text-sm {validationErrors.duration ? 'border-danger/50 focus:border-danger' : ''}" />
      {#if validationErrors.duration}<p class="text-label text-danger ml-1">{validationErrors.duration}</p>{/if}
    </div>
  {/if}

  <div class="form-grid fields-grid pt-1">
    {#if activeParams.includes('boulderingGrades') || activeParams.includes('grades')}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5"><label for="ex-min-grade" class="text-label text-content-subtle ml-1">Min Grade</label><select id="ex-min-grade" bind:value={minGrade} class="w-full bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-xs">{#each bGrades as g} <option value={g}>{g}</option> {/each}</select></div>
        <div class="space-y-1.5"><label for="ex-max-grade" class="text-label text-content-subtle ml-1">Max Grade</label><select id="ex-max-grade" bind:value={maxGrade} class="w-full bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-xs">{#each bGrades as g} <option value={g}>{g}</option> {/each}</select></div>
      </div>
    {/if}

    {#if activeParams.includes('routeGrades')}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5"><label for="ex-min-rgrade" class="text-label text-content-subtle ml-1">Min Grade</label><select id="ex-min-rgrade" bind:value={minGrade} class="w-full bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-xs">{#each rGrades as g} <option value={g}>{g}</option> {/each}</select></div>
        <div class="space-y-1.5"><label for="ex-max-rgrade" class="text-label text-content-subtle ml-1">Max Grade</label><select id="ex-max-rgrade" bind:value={maxGrade} class="w-full bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-xs">{#each rGrades as g} <option value={g}>{g}</option> {/each}</select></div>
      </div>
    {/if}

    {#if activeParams.includes('cadence')}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-cadence" class="text-label text-content-subtle">Cadence (boulders or routes / min)</label><TargetHint prescribed={targetValues.cadence} current={cadence} /></div><input id="ex-cadence" type="number" bind:value={cadence} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('climbingStyle')}
      <div class="space-y-1.5">
        <p class="text-label text-content-subtle ml-1">Climbing Style</p>
        <div class="flex flex-wrap gap-2">
          {#each climbingStyles as style}
            <button
              type="button"
              onclick={() => {
                if (climbingStyle.includes(style)) {
                  climbingStyle = climbingStyle.filter(s => s !== style);
                } else {
                  climbingStyle = [...climbingStyle, style];
                }
              }}
              class="px-3 py-1.5 rounded-control border text-label transition-all {climbingStyle.includes(style) ? 'bg-primary-hover border-primary text-white' : 'bg-surface-elevated border-border-strong text-content-muted hover:text-content'}"
            >
              {style}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if activeParams.includes('boardType')}<div class="space-y-1.5"><label for="ex-board-type" class="text-label text-content-subtle ml-1">Board Type</label><select id="ex-board-type" bind:value={boardType} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm">{#each boardTypes as type} <option value={type}>{type}</option> {/each}</select></div>{/if}
    {#if activeParams.includes('boardAngle') && !(perSetOpen && perSetKeys.includes('boardAngle'))}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-board-angle" class="text-label text-content-subtle">Board Angle (°)</label><TargetHint prescribed={targetValues.boardAngle} current={boardAngle} unit="°" /></div><select id="ex-board-angle" bind:value={boardAngle} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm">{#each boardAngles as angle} <option value={angle}>{angle}°</option> {/each}</select></div>{/if}

    <div class="grid grid-cols-2 gap-3">
      {#if activeParams.includes('sets') && !perSetOpen}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-sets" class="text-label text-content-subtle">Sets</label><TargetHint prescribed={targetValues.sets} current={sets} /></div><input id="ex-sets" type="number" bind:value={sets} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm {validationErrors.sets ? 'border-danger/50' : ''}" />{#if validationErrors.sets}<p class="text-label text-danger ml-1">{validationErrors.sets}</p>{/if}</div>{/if}
      {#if activeParams.includes('reps') && !(perSetOpen && perSetKeys.includes('reps'))}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-reps" class="text-label text-content-subtle">Reps</label><TargetHint prescribed={repsRepresentative(targetValues.reps)} current={reps} /></div><input id="ex-reps" type="number" bind:value={reps} oninput={() => repsEdited = true} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" />{#if !repsEdited && Array.isArray(originalReps)}<p class="text-caption text-content-subtle ml-1">Per set: {originalReps.join(', ')} &mdash; editing replaces all sets</p>{/if}</div>{/if}
      {#if activeParams.includes('movesPerRoute')}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-moves" class="text-label text-content-subtle">Moves per route</label><TargetHint prescribed={targetValues.movesPerRoute} current={movesPerRoute} /></div><input id="ex-moves" type="number" bind:value={movesPerRoute} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" /></div>{/if}
    </div>
    {#if activeParams.includes('holdType')}<div class="space-y-1.5"><label for="ex-hold" class="text-label text-content-subtle ml-1">Hold Type</label><select id="ex-hold" bind:value={holdType} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm">{#each holdTypes as h} <option value={h}>{h}</option> {/each}</select></div>{/if}
    {#if activeParams.includes('timeOn') && !(perSetOpen && perSetKeys.includes('timeOn'))}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-on" class="text-label text-content-subtle">Time On (s)</label><TargetHint prescribed={targetValues.timeOn} current={timeOn} unit="s" /></div><input id="ex-on" type="number" bind:value={timeOn} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('timeOff')}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-off" class="text-label text-content-subtle">Time Off (s)</label><TargetHint prescribed={targetValues.timeOff} current={timeOff} unit="s" /></div><input id="ex-off" type="number" bind:value={timeOff} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('restTime')}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-rest" class="text-label text-content-subtle">Between Sets (s)</label><TargetHint prescribed={targetValues.timeBetweenSets} current={timeBetweenSets} unit="s" /></div><input id="ex-rest" type="number" bind:value={timeBetweenSets} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('holdSize') && !(perSetOpen && perSetKeys.includes('holdSize'))}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-size" class="text-label text-content-subtle">Hold Size (mm)</label><TargetHint prescribed={targetValues.holdSize} current={holdSize} unit="mm" /></div><input id="ex-size" type="number" bind:value={holdSize} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm {validationErrors.holdSize ? 'border-danger/50' : ''}" />{#if validationErrors.holdSize}<p class="text-label text-danger ml-1">{validationErrors.holdSize}</p>{/if}</div>{/if}
    {#if activeParams.includes('weight') && !(perSetOpen && perSetKeys.includes('weight'))}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-weight" class="text-label text-content-subtle">Weight ({trainingState.units.weight})</label><TargetHint prescribed={targetValues.weight !== undefined ? toDisplayWeight(targetValues.weight) : undefined} current={weight} unit={trainingState.units.weight} /></div><input id="ex-weight" type="number" bind:value={weight} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" placeholder="e.g. 10" /></div>{/if}
    {#if activeParams.includes('bodyweightPercent') && !(perSetOpen && perSetKeys.includes('bodyweightPercent'))}<div class="space-y-4 pt-1"><label for="ex-bw" class="flex justify-between text-label text-content-subtle ml-1"><span>Added Weight (% of BW)</span><span class="flex items-center gap-2"><TargetHint prescribed={targetValues.bodyweightPercent} current={bodyweightPercent} unit="%" /><span class="text-primary font-mono text-caption tabular-nums">{bodyweightPercent}%{#if latestBodyweightKg} <span class="text-content-subtle">(≈ {formatWeight(latestBodyweightKg * bodyweightPercent / 100, trainingState.units.weight)})</span>{/if}</span></span></label><RangeSlider id="ex-bw" min={50} max={220} bind:value={bodyweightPercent} /><div class="flex justify-between text-caption text-content-muted px-1 mt-1"><span>50%</span><span>100% (BW)</span><span>220%</span></div></div>{/if}
    {#if activeParams.includes('maxWeightPercent') && !(perSetOpen && perSetKeys.includes('maxWeightPercent'))}<div class="space-y-4 pt-1"><label for="ex-mw" class="flex justify-between text-label text-content-subtle ml-1"><span>Load (% of Max)</span><span class="flex items-center gap-2"><TargetHint prescribed={targetValues.maxWeightPercent} current={maxWeightPercent} unit="%" /><span class="text-success font-mono text-caption tabular-nums">{maxWeightPercent}%</span></span></label><RangeSlider id="ex-mw" min={10} max={150} bind:value={maxWeightPercent} tone="success" /><div class="flex justify-between text-caption text-content-muted px-1 mt-1"><span>10%</span><span>100% (Max)</span><span>150%</span></div></div>{/if}
    {#if activeParams.includes('distance') && !(perSetOpen && perSetKeys.includes('distance'))}<div class="space-y-1.5"><div class="flex justify-between items-center ml-1"><label for="ex-distance" class="text-label text-content-subtle">Distance (km)</label><TargetHint prescribed={targetValues.distance} current={distance} unit="km" /></div><input id="ex-distance" type="number" step="0.1" bind:value={distance} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('campusStyle')}<div class="space-y-1.5"><label for="ex-campus" class="text-label text-content-subtle ml-1">Campus Style</label><select id="ex-campus" bind:value={campusType} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm">{#each campusStyles as c} <option value={c}>{c}</option> {/each}</select></div>{/if}
    {#if activeParams.includes('mobilityType')}
      <div class="space-y-1.5">
        <p class="text-label text-content-subtle ml-1">Mobility Focus</p>
        <div class="flex flex-wrap gap-2">
          {#each mobilityTypes as type}
            <button
              type="button"
              onclick={() => {
                if (mobilityType.includes(type)) {
                  mobilityType = mobilityType.filter(t => t !== type);
                } else {
                  mobilityType = [...mobilityType, type];
                }
              }}
              class="px-3 py-1.5 rounded-control border text-label transition-all {mobilityType.includes(type) ? 'bg-primary-hover border-primary text-white' : 'bg-surface-elevated border-border-strong text-content-muted hover:text-content'}"
            >
              {type}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if activeParams.includes('leadStyle')}
      <div class="space-y-1.5">
        <p class="text-label text-content-subtle ml-1">Style</p>
        <div class="flex flex-wrap gap-2">
          {#each leadStyles as style}
            <button
              type="button"
              onclick={() => {
                if (leadStyle.includes(style)) {
                  leadStyle = leadStyle.filter(s => s !== style);
                } else {
                  leadStyle = [...leadStyle, style];
                }
              }}
              class="px-3 py-1.5 rounded-control border text-label transition-all {leadStyle.includes(style) ? 'bg-primary-hover border-primary text-white' : 'bg-surface-elevated border-border-strong text-content-muted hover:text-content'}"
            >
              {style}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if activeParams.includes('difficulty')}<div class="space-y-4 pt-1"><label for="ex-diff" class="flex justify-between text-label text-content-subtle ml-1"><span>Difficulty</span><span class="flex items-center gap-2"><TargetHint prescribed={targetValues.difficulty} current={difficulty} unit="/10" /><span class="text-primary font-mono text-caption tabular-nums">{difficulty}/10</span></span></label><RangeSlider id="ex-diff" bind:value={difficulty} /></div>{/if}
    {#each customFields as def (def.id)}
      <div class="space-y-1.5">
        <div class="flex justify-between items-center ml-1">
          <label for="ex-custom-{def.id}" class="text-label text-content-subtle">{def.name}{def.kind === 'number' && def.unit ? ` (${def.unit})` : ''}</label>
          {#if def.kind === 'number'}<TargetHint prescribed={typeof targetValues.custom?.[def.id] === 'number' ? (targetValues.custom[def.id] as number) : undefined} current={customDraft[def.id] === undefined || customDraft[def.id] === '' ? undefined : Number(customDraft[def.id])} unit={def.unit ?? ''} />{/if}
        </div>
        {#if def.kind === 'number'}
          <input id="ex-custom-{def.id}" type="number" inputmode="decimal" step="any" value={customDraft[def.id] ?? ''} oninput={(e) => customDraft[def.id] = e.currentTarget.value} placeholder="—" class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm" />
        {:else}
          <select id="ex-custom-{def.id}" value={customDraft[def.id] ?? ''} onchange={(e) => customDraft[def.id] = e.currentTarget.value} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm appearance-none cursor-pointer">
            <option value="">—</option>
            {#each def.options ?? [] as option}<option value={option}>{option}</option>{/each}
            {#if customDraft[def.id] && !(def.options ?? []).includes(customDraft[def.id])}<option value={customDraft[def.id]}>{customDraft[def.id]}</option>{/if}
          </select>
        {/if}
      </div>
    {/each}
    {#if activeParams.includes('routeDifficulty')}<div class="space-y-1.5"><label for="ex-route-diff" class="text-label text-content-subtle ml-1">Route Difficulty</label><select id="ex-route-diff" bind:value={routeDifficulty} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm appearance-none cursor-pointer"><option value="Easy">Easy</option><option value="Moderate">Moderate</option><option value="Hard">Hard</option></select></div>{/if}

    <details class="group border-t border-border/50 pt-4">
      <summary class="flex justify-between items-center cursor-pointer list-none text-section uppercase text-content-subtle hover:text-content outline-none transition-colors">
        <span>Customize Tracked Fields</span>
        <Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg group-open:rotate-180 transition-transform" />
      </summary>
      <div class="grid grid-cols-2 gap-2 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
        {#each customizable as id}
          <button
            type="button"
            onclick={() => {
              if (activeParams.includes(id)) {
                activeParams = activeParams.filter(p => p !== id);
              } else {
                activeParams = [...activeParams, id];
              }
            }}
            class="px-3 py-2 rounded-control text-label border transition-all flex items-center gap-2 {activeParams.includes(id) ? 'bg-primary-hover/10 border-primary/50 text-primary-hover' : 'bg-surface border-border text-content-subtle'}"
          >
            <Icon icon={activeParams.includes(id) ? 'ic:baseline-check-box' : 'ic:baseline-check-box-outline-blank'} class="text-sm" />
            <span class="text-left flex-1">{paramLabel(id, trainingState.valueDefs)}</span>
          </button>
        {/each}
      </div>
    </details>

    <div class="space-y-1.5 pt-4 border-t border-border/50">
      <label for="ex-category" class="text-label text-content-subtle ml-1">Analytics Type</label>
      <select id="ex-category" bind:value={categoryOverride} class="w-full bg-surface-elevated/50 text-content p-3.5 rounded-control border border-border-strong outline-none text-sm appearance-none cursor-pointer">
        <option value="">Default ({activeTypeDef?.category || 'Other'})</option>
        {#each trainingState.analyticsCategories as cat}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>

    {#if perSetKeys.length > 0}
      <div class="pt-4 border-t border-border/50">
        {#if !perSetOpen}
          <button type="button" onclick={openPerSet} class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-control border border-dashed border-border-strong text-label font-bold text-content-subtle hover:text-primary hover:border-primary/50 transition-colors">
            <Icon icon="ic:baseline-format-list-numbered" class="text-base" /> Per set
            <span class="font-normal text-caption">({perSetKeys.map((k) => PARAMETER_LABELS[k as keyof typeof PARAMETER_LABELS] ?? k).join(', ')} set by set)</span>
          </button>
        {:else}
          {#key rowsKey}
            <SetRowsEditor keys={perSetKeys} rows={rowsValue} onchange={(r) => (rowsValue = r)} />
          {/key}
        {/if}
      </div>
    {/if}

    {#if inGroup && mode === 'prescribed'}
      <div class="space-y-1.5 pt-4 border-t border-border/50">
        <label for="ex-rest-after" class="text-label text-content-subtle ml-1">Rest after it (s)</label>
        <input id="ex-rest-after" type="number" min="0" inputmode="numeric" placeholder="Same as the circuit's switch time" value={restAfterText} oninput={(e) => (restAfterText = e.currentTarget.value)} class="w-full bg-surface-elevated/50 text-content p-3.5 rounded-control border border-border-strong outline-none text-sm placeholder:text-content-subtle" />
        <p class="text-caption text-content-subtle ml-1">Only for this exercise, in this circuit. Leave empty to use the circuit's.</p>
      </div>
    {/if}

    <div class="space-y-1.5 pt-4 border-t border-border/50">
      {#if mode === 'logged' && initialSlot?.prescribed}
        <label for="ex-plan-notes" class="text-label text-content-subtle ml-1">Plan note</label>
        <textarea id="ex-plan-notes" bind:value={planNoteText} placeholder="Focus on footwork..." class="w-full bg-surface-elevated/50 text-content p-3.5 rounded-control border border-border-strong outline-none transition-all placeholder:text-content-subtle text-sm" rows="2"></textarea>
      {/if}
      <label for="ex-notes" class="text-label text-content-subtle ml-1">{mode === 'logged' ? 'How it went' : 'Exercise Notes'}</label>
      <textarea id="ex-notes" bind:value={notes} placeholder={mode === 'logged' ? 'How did it feel? Anything worth remembering?' : 'Focus on footwork...'} class="w-full bg-surface-elevated/50 text-content p-3.5 rounded-control border border-border-strong outline-none transition-all placeholder:text-content-subtle text-sm" rows="2"></textarea>
    </div>

    <div class="space-y-4 pt-4 border-t border-border/50">
      <label for="ex-planned-load" class="flex justify-between text-label text-success ml-1">
        <span>Target Intensity / Load</span>
        <span class="flex items-center gap-2">
          <TargetHint prescribed={targetValues.plannedLoad} current={plannedLoad} unit="/10" />
          <span class="text-success font-mono text-caption tabular-nums">{plannedLoad}/10</span>
        </span>
      </label>
      <RangeSlider id="ex-planned-load" bind:value={plannedLoad} tone="success" />
      <p class="text-caption text-content-subtle italic ml-1 leading-relaxed">Estimated stress for this specific exercise.</p>
    </div>
  </div>

  <button
    onclick={handleSubmit}
    disabled={!isValid || !activeTypeDef}
    class="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-4 rounded-control shadow-xl shadow-primary/20 transition-all active:scale-[0.98]"
  >
    {initialSlot ? 'Update Exercise' : 'Add Exercise'}
  </button>
</div>

{#if pickerOpen}
  <ExercisePicker
    types={exerciseTypes}
    selectedId={selectedTypeId}
    onPick={(id) => selectedTypeId = id}
    onCreated={(type) => exerciseTypes = [...exerciseTypes.filter((t) => t.id !== type.id), type]}
    onClose={() => pickerOpen = false}
  />
{/if}

<style>
  /* Number fields sit two to a row, in equal columns, so singles and pairs line up; everything else spans the width. */
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 0.75rem; }
  .fields-grid { row-gap: 1.25rem; }
  .form-grid > :global(*) { grid-column: 1 / -1; }
  .form-grid > :global(div:has(> input[type='number'])) { grid-column: auto; }
</style>
