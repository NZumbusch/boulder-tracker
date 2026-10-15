<script lang="ts">
  import Sheet from '../ui/Sheet.svelte';
  /**
   * Settings for one Plan B: its name, which plan is the outdoor one (for
   * the weather hint and the evening-before reminder), which plan counts
   * by default, and whether it repeats every week. For a repeating Plan B,
   * this week can be skipped on its own.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { allOccurrenceKeys, describeChanges, occurrenceDaysLabel } from '../../lib/planning/planB';
  import { incrementWeekId, getWeekIdRange, getWeekDateRange, formatWeek } from '../../lib/dateUtils';
  import type { PlanAlternative, PlanSide } from '../../lib/types';

  let { alt, occurrence, onClose }: { alt: PlanAlternative; occurrence: string; onClose: () => void } = $props();

  // Seeded once from the Plan B as it was when the sheet opened.
  // svelte-ignore state_referenced_locally
  let label = $state(alt.label ?? '');
  // svelte-ignore state_referenced_locally
  let outdoor = $state<PlanSide | ''>(alt.outdoor ?? '');
  // svelte-ignore state_referenced_locally
  let likely = $state<PlanSide>(alt.likely ?? 'A');
  // svelte-ignore state_referenced_locally
  let repeatWeeks = $state(alt.repeatUntilWeekId ? getWeekIdRange(alt.startWeekId, alt.repeatUntilWeekId).length : 1);
  let saving = $state(false);

  const changes = $derived(describeChanges(alt, occurrence));
  const skippedHere = $derived(!!alt.occurrences?.[occurrence]?.skipped);
  const isRepeating = $derived(allOccurrenceKeys(alt).length > 1);

  function untilWeek(weeks: number): string | undefined {
    if (weeks <= 1) return undefined;
    let week = alt.startWeekId;
    for (let i = 1; i < weeks; i++) week = incrementWeekId(week);
    return week;
  }

  async function save() {
    saving = true;
    try {
      const { label: _l, outdoor: _o, likely: _k, repeatUntilWeekId: _r, ...rest } = $state.snapshot(alt) as PlanAlternative;
      const until = untilWeek(repeatWeeks);
      await trainingState.savePlanB({
        ...rest,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(outdoor ? { outdoor } : {}),
        ...(likely !== 'A' ? { likely } : {}),
        ...(until ? { repeatUntilWeekId: until } : {}),
      });
      onClose();
    } finally {
      saving = false;
    }
  }

  async function toggleSkip() {
    await trainingState.setPlanBOccurrence(alt.id, occurrence, { skipped: skippedHere ? undefined : true });
    onClose();
  }

  /** Closes this sheet and puts the week into the mode where Plan B's own sessions are changed, added or removed. */
  function editSessions() {
    trainingState.planBEditing = { altId: alt.id, key: occurrence };
    onClose();
  }

  async function remove() {
    // Taken before closing: the sheet's props read through to state that
    // closing clears (the same trap as the session viewer's Delete).
    const id = alt.id;
    onClose();
    await trainingState.deletePlanB(id);
  }

  /** "this week only", then steps; the weeks a stretch already repeats for stay selectable. */
  const REPEAT_STEPS = [1, 2, 3, 4, 6, 8, 12, 16, 26];
  const repeatOptions = $derived([...new Set([...REPEAT_STEPS, repeatWeeks])].sort((a, b) => a - b));
</script>

<Sheet title="Plan B" icon="ic:baseline-call-split" subtitle="{occurrenceDaysLabel(alt, occurrence)} · {formatWeek(occurrence)} · {getWeekDateRange(occurrence)}" {onClose}>
  <label class="block space-y-1">
    <span class="text-label text-content-subtle">Name</span>
    <input bind:value={label} placeholder="Outdoor if dry" class="field" />
  </label>

  <div class="space-y-1">
    <span class="text-label text-content-subtle block">What Plan B does differently</span>
    {#each changes as line}
      <p class="text-caption text-content">{line}</p>
    {:else}
      <p class="text-caption text-content-subtle">Nothing yet.</p>
    {/each}
    <button onclick={editSessions} class="btn btn-secondary w-full mt-1"><Icon icon="ic:baseline-edit" class="text-base" />Change Plan B's sessions</button>
  </div>

  <div class="space-y-1.5">
    <span class="text-label text-content-subtle block">Which one is the outdoor plan?</span>
    <p class="text-caption text-content-subtle">Used for the weather hint and the evening-before reminder.</p>
    <div class="seg" role="group" aria-label="Outdoor plan">
      {#each [['', 'Neither'], ['A', 'Plan A'], ['B', 'Plan B']] as [value, text]}
        <button onclick={() => outdoor = value as PlanSide | ''} class="seg-item flex-1 text-label {outdoor === value ? 'bg-primary text-on-primary' : 'hover:text-content'}" aria-pressed={outdoor === value}>{text}</button>
      {/each}
    </div>
  </div>

  <div class="space-y-1.5">
    <span class="text-label text-content-subtle block">Which plan do you expect to do?</span>
    <p class="text-caption text-content-subtle">Totals and reminders follow it until you choose.</p>
    <div class="seg" role="group" aria-label="Plan that counts by default">
      {#each ['A', 'B'] as const as side}
        <button onclick={() => likely = side} class="seg-item flex-1 text-label {likely === side ? 'bg-primary text-on-primary' : 'hover:text-content'}" aria-pressed={likely === side}>Plan {side}</button>
      {/each}
    </div>
  </div>

  <div class="flex items-center gap-2 flex-wrap">
    <Icon icon="ic:baseline-repeat" class="text-base text-primary shrink-0" />
    <label for="planb-repeat" class="text-label text-content">Repeat for</label>
    <select id="planb-repeat" bind:value={repeatWeeks} class="field w-auto">
      {#each repeatOptions as n}<option value={n}>{n === 1 ? 'this week only' : `${n} weeks`}</option>{/each}
    </select>
  </div>

  <div class="flex flex-wrap gap-2 pt-1">
    {#if isRepeating}
      <button onclick={toggleSkip} class="btn btn-ghost">
        <Icon icon={skippedHere ? 'ic:baseline-undo' : 'ic:baseline-block'} class="text-base" />{skippedHere ? 'Use it this week again' : 'Not this week'}
      </button>
    {/if}
    <button onclick={remove} class="btn btn-danger ml-auto">
      <Icon icon="ic:baseline-delete" class="text-base" />Delete Plan B
    </button>
  </div>

  {#snippet footer()}
    <button onclick={save} disabled={saving} class="btn btn-primary flex-1">Save</button>
    <button onclick={onClose} class="btn btn-secondary">Cancel</button>
  {/snippet}
</Sheet>
