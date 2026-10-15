<script lang="ts">
    /**
   * Add/edit one goal. A competition is a name and a day; a trip adds an
   * end day (defaults to the start - a day trip is fine), a place (search
   * any location, or tap a saved crag) and projects to go for. Notes are
   * edited through the shared note sheet from the goals list, not here.
   */
  import { displayGrade, gradeFromInput } from '../../lib/sends/gradeScale';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { GoalEvent, GoalKind, TripProject } from '../../lib/types';
  import LocationEditor from '../settings/LocationEditor.svelte';
  import Icon from '@iconify/svelte';
  import { GOAL_STYLE } from '../../lib/planning/goalStyle';

  let { goal, kind, onDone }: {
    /** The goal to edit, or undefined to add a new one of `kind`. */
    goal?: GoalEvent;
    kind: GoalKind;
    onDone: () => void;
  } = $props();

  const todayIso = trainingState.todayIso;
  // Seeded once from the goal being edited (or a fresh one).
  // svelte-ignore state_referenced_locally
  let draft = $state<GoalEvent>(
    goal
      ? structuredClone($state.snapshot(goal)) as GoalEvent
      : { id: generateId(), kind, name: '', date: todayIso, ...(kind === 'trip' ? { endDate: todayIso, projects: [] } : {}) },
  );
  const isTrip = $derived(draft.kind === 'trip');

  // Keep the end on or after the start as the start moves.
  function setStart(value: string) {
    draft.date = value;
    if (isTrip && (!draft.endDate || draft.endDate < value)) draft.endDate = value;
  }

  // --- Projects ---
  let projectName = $state('');
  let projectGrade = $state('');
  let projectFlash = $state(false);
  function addProject() {
    const name = projectName.trim();
    const grade = gradeFromInput(projectGrade);
    if (!name && !grade) return;
    const project: TripProject = {
      id: generateId(),
      ...(name ? { name } : {}),
      ...(grade ? { grade } : {}),
      ...(!name && projectFlash ? { flash: true } : {}),
    };
    draft.projects = [...(draft.projects ?? []), project];
    projectName = '';
    projectGrade = '';
    projectFlash = false;
  }
  function removeProject(id: string) {
    draft.projects = (draft.projects ?? []).filter((p) => p.id !== id);
  }

  async function save() {
    if (!draft.name.trim() || !draft.date) return;
    const clean: GoalEvent = { ...$state.snapshot(draft) as GoalEvent, name: draft.name.trim() };
    if (clean.kind === 'trip') {
      if (!clean.endDate || clean.endDate < clean.date) clean.endDate = clean.date;
      if (!clean.location) delete clean.location;
    } else {
      delete clean.endDate;
      delete clean.location;
      delete clean.projects;
    }
    await trainingState.saveGoal(clean);
    onDone();
  }

  const inputClass = 'field';

  /** A stored (Font) grade in the chosen display scale. */
  const G = (grade: string | undefined) => (grade ? displayGrade(grade, trainingState.units.grades) : '');
</script>

<div class="p-4 bg-surface-elevated/50 rounded-card space-y-3">
  <p class="text-label text-content-subtle flex items-center gap-1.5">
    <Icon icon={GOAL_STYLE[draft.kind].icon} class="text-primary" />
    {goal ? 'Edit' : 'New'} {isTrip ? 'outdoor trip' : 'competition'}
  </p>
  <label class="block space-y-1">
    <span class="text-caption text-content-subtle ml-1">Name</span>
    <input bind:value={draft.name} placeholder={isTrip ? 'e.g. Font autumn' : 'e.g. Regional cup'} class={inputClass} />
  </label>

  {#if isTrip}
    <div class="flex gap-2">
      <label class="flex-1 min-w-0 space-y-1">
        <span class="text-caption text-content-subtle ml-1">From</span>
        <input type="date" value={draft.date} oninput={(e) => setStart(e.currentTarget.value)} class="{inputClass} min-w-0" />
      </label>
      <label class="flex-1 min-w-0 space-y-1">
        <span class="text-caption text-content-subtle ml-1">To <span class="whitespace-nowrap">(or same day)</span></span>
        <input type="date" bind:value={draft.endDate} min={draft.date} class="{inputClass} min-w-0" />
      </label>
    </div>

    <LocationEditor
      label="Where"
      location={draft.location ?? null}
      onSet={(loc) => draft.location = loc}
      onClear={() => delete draft.location}
    />
    {#if trainingState.crags.length > 0}
      <div class="flex flex-wrap gap-1.5 -mt-1">
        {#each trainingState.crags as crag}
          <button
            onclick={() => draft.location = { ...crag }}
            class="px-2.5 py-1 rounded-full border text-caption transition-colors {draft.location?.name === crag.name ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border-strong/60 text-content-subtle hover:text-content'}"
          >
            {crag.name}
          </button>
        {/each}
      </div>
    {/if}

    <div class="space-y-2">
      <p class="text-caption text-content-subtle ml-1">Projects - a problem (name, grade optional) or just a grade to tick</p>
      {#each draft.projects ?? [] as project (project.id)}
        <div class="flex items-center gap-2 p-2 rounded-control bg-surface border border-border-strong/40">
          <Icon icon={project.name ? 'ic:baseline-star-outline' : 'ic:baseline-trending-up'} class="text-primary text-sm shrink-0" />
          <span class="text-label text-content flex-1 truncate">
            {project.name ?? `Any ${G(project.grade)}`}{project.name && project.grade ? ` ${G(project.grade)}` : ''}{project.flash ? ' · flash' : ''}
          </span>
          <button onclick={() => removeProject(project.id)} class="btn-icon -my-2 -mr-2 hover:text-danger" aria-label="Remove project {project.name ?? G(project.grade)}">
            <Icon icon="ic:baseline-close" class="text-base" />
          </button>
        </div>
      {/each}
      <div class="flex flex-wrap gap-2">
        <input data-own-enter bind:value={projectName} aria-label="Problem name (optional)" placeholder="Problem (optional)" class="{inputClass} basis-full min-[420px]:basis-0 min-[420px]:flex-[2]" onkeydown={(e) => e.key === 'Enter' && addProject()} />
        <input data-own-enter bind:value={projectGrade} aria-label="Grade" placeholder={trainingState.units.grades === 'v' ? 'Grade, e.g. V6' : 'Grade, e.g. 7A'} class="{inputClass} flex-1 min-w-0" onkeydown={(e) => e.key === 'Enter' && addProject()} />
        <button onclick={addProject} class="btn btn-secondary text-primary" aria-label="Add this project"><Icon icon="ic:baseline-plus" />Add</button>
      </div>
      {#if !projectName.trim() && projectGrade.trim()}
        <label class="flex items-center gap-2 text-caption text-content-subtle ml-1">
          <input type="checkbox" bind:checked={projectFlash} class="accent-primary" /> Must be a flash
        </label>
      {/if}
    </div>
  {:else}
    <label class="block space-y-1">
      <span class="text-caption text-content-subtle ml-1">Date</span>
      <input type="date" bind:value={draft.date} class={inputClass} />
    </label>
  {/if}

  {#if !draft.name.trim() || !draft.date}
    <p class="text-caption text-content-subtle ml-1">{!draft.name.trim() ? 'Give it a name to save.' : 'Pick a date to save.'}</p>
  {/if}
  <div class="flex gap-2">
    <button onclick={save} disabled={!draft.name.trim() || !draft.date} class="btn btn-primary flex-1">Save</button>
    <button onclick={onDone} class="btn btn-secondary">Cancel</button>
  </div>
</div>
