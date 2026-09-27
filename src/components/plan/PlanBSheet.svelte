<script lang="ts">
  /**
   * Settings for one Plan B: its name, which plan is the outdoor one (for
   * the weather hint and the evening-before reminder), which plan counts
   * by default, and whether it repeats every week. For a repeating Plan B,
   * this week can be skipped on its own.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { allOccurrenceKeys, describeChanges, occurrenceDaysLabel } from '../../lib/planning/planB';
  import { incrementWeekId, getWeekIdRange, getWeekDateRange } from '../../lib/dateUtils';
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

  async function remove() {
    // Taken before closing: the sheet's props read through to state that
    // closing clears (the same trap as the session viewer's Delete).
    const id = alt.id;
    onClose();
    await trainingState.deletePlanB(id);
  }

  backWhile(() => true, () => onClose());
</script>

<div class="fixed inset-0 pb-safe bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-md">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1" aria-label="Close"></div>
  <div class="relative bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-title text-content flex items-center gap-2">
          <Icon icon="ic:baseline-call-split" class="text-primary text-xl shrink-0" />
          <span class="truncate">Plan B</span>
        </h3>
        <p class="text-caption text-content-subtle mt-0.5">{occurrenceDaysLabel(alt, occurrence)} · {getWeekDateRange(occurrence)}</p>
      </div>
      <button onclick={onClose} class="text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <label class="block space-y-1">
      <span class="text-label text-content-subtle">Name</span>
      <input
        bind:value={label}
        placeholder="Outdoor if dry"
        class="w-full bg-surface-elevated/50 text-content px-3 py-2.5 rounded-control border border-border-strong outline-none text-sm focus:border-primary/60"
      />
    </label>

    <div class="space-y-1">
      <span class="text-label text-content-subtle block">What Plan B does differently</span>
      {#each changes as line}
        <p class="text-caption text-content">{line}</p>
      {:else}
        <p class="text-caption text-content-subtle italic">Nothing yet - tap Edit B and change, add or remove sessions.</p>
      {/each}
    </div>

    <div class="space-y-1.5">
      <span class="text-label text-content-subtle block">Outdoor plan <span class="text-caption">(weather hint, evening-before reminder)</span></span>
      <div class="seg" role="group" aria-label="Outdoor plan">
        {#each [['', 'Neither'], ['A', 'Plan A'], ['B', 'Plan B']] as [value, text]}
          <button onclick={() => outdoor = value as PlanSide | ''} class="seg-item flex-1 py-1.5 text-label {outdoor === value ? 'bg-primary text-white' : 'hover:text-content'}" aria-pressed={outdoor === value}>{text}</button>
        {/each}
      </div>
    </div>

    <div class="space-y-1.5">
      <span class="text-label text-content-subtle block">Counts until you decide <span class="text-caption">(load, week totals, reminders)</span></span>
      <div class="seg" role="group" aria-label="Plan that counts by default">
        {#each ['A', 'B'] as const as side}
          <button onclick={() => likely = side} class="seg-item flex-1 py-1.5 text-label {likely === side ? 'bg-primary text-white' : 'hover:text-content'}" aria-pressed={likely === side}>Plan {side}</button>
        {/each}
      </div>
    </div>

    <label class="flex items-center gap-2 flex-wrap">
      <Icon icon="ic:baseline-repeat" class="text-base text-primary shrink-0" />
      <span class="text-label text-content">Repeat for</span>
      <select bind:value={repeatWeeks} class="bg-surface-elevated text-content px-2 py-1 rounded-control border border-border-strong outline-none text-label" aria-label="Number of weeks">
        {#each Array.from({ length: 26 }, (_, i) => i + 1) as n}<option value={n}>{n === 1 ? 'this week only' : `${n} weeks`}</option>{/each}
      </select>
    </label>

    <div class="flex gap-2">
      <button onclick={save} disabled={saving} class="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-control disabled:opacity-40 transition-opacity">Save</button>
      <button onclick={onClose} class="px-4 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
    </div>

    <div class="pt-3 border-t border-border/60 flex flex-wrap gap-2">
      {#if isRepeating}
        <button onclick={toggleSkip} class="chip text-content-subtle hover:text-content transition-colors">
          <Icon icon={skippedHere ? 'ic:baseline-undo' : 'ic:baseline-block'} class="text-sm" />{skippedHere ? 'Use it this week again' : 'Not this week'}
        </button>
      {/if}
      <button onclick={remove} class="chip text-danger hover:bg-danger/10 transition-colors ml-auto">
        <Icon icon="ic:baseline-delete" class="text-sm" />Delete Plan B
      </button>
    </div>
  </div>
</div>
