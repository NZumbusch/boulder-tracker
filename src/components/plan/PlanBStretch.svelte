<script lang="ts">
  /**
   * One Plan B stretch in the Plan week: which plan counts (A|B - the
   * numbers follow it until you decide), deciding, the outdoor weather
   * hint, anything that no longer matches Plan A, and the ways in to edit
   * it. See `lib/planning/planB.ts`.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { occurrenceDaysLabel, sideDates, describeChanges, type ResolvedOccurrence } from '../../lib/planning/planB';
  import { outdoorDayHints, hintText, looksGood } from '../../lib/weather/planBHint';
  import type { PlanSide } from '../../lib/types';

  let { occ, onSettings }: { occ: ResolvedOccurrence; onSettings: () => void } = $props();

  const alt = $derived(occ.alt);
  const editingThis = $derived(trainingState.planBEditing?.altId === alt.id && trainingState.planBEditing?.key === occ.key);
  const chosenByHand = $derived(alt.occurrences?.[occ.key]?.chosen);
  /** Decided by logging a session only one plan has - that can't be undone from here. */
  const decidedByLog = $derived(!!occ.decided && occ.decided !== chosenByHand);

  const hints = $derived.by(() => {
    if (!alt.outdoor || occ.decided) return [];
    return outdoorDayHints(sideDates(occ, alt.outdoor), trainingState.outdoorForecasts, trainingState.frictionConfig);
  });

  function pick(side: PlanSide) {
    if (occ.decided) return;
    trainingState.setPlanBOccurrence(alt.id, occ.key, { likely: side === (alt.likely ?? 'A') ? undefined : side });
  }
  const sideLabel = (side: PlanSide) => (alt.outdoor === side ? `Plan ${side} · outdoor` : `Plan ${side}`);
</script>

<div class="rounded-control bg-surface-elevated/40 p-3 space-y-2.5">
  <div class="flex items-start gap-2">
    <Icon icon="ic:baseline-call-split" class="text-primary text-lg shrink-0 mt-0.5" />
    <div class="min-w-0 flex-1">
      <p class="text-label font-semibold text-content truncate">{alt.label || 'Plan B'}</p>
      <p class="text-caption text-content-subtle">
        {occurrenceDaysLabel(alt, occ.key)}{alt.repeatUntilWeekId ? ' · every week' : ''} ·
        {#if occ.decided}
          Plan {occ.decided} {decidedByLog ? 'done' : 'chosen'}
        {:else}
          undecided, counting Plan {occ.active}
        {/if}
      </p>
    </div>
    <!-- While editing, the banner above has the one Done button. -->
    {#if !editingThis}
      <button
        onclick={() => (trainingState.planBEditing = { altId: alt.id, key: occ.key })}
        class="chip transition-colors text-content-subtle hover:text-content"
      >
        <Icon icon="ic:baseline-edit" class="text-sm" />Edit B
      </button>
    {/if}
    <button onclick={onSettings} class="p-1 text-content-subtle hover:text-content transition-colors" aria-label="Plan B settings" title="Plan B settings">
      <Icon icon="ic:baseline-tune" class="text-lg" />
    </button>
  </div>

  <!-- What Plan B actually does differently - the point of the whole card. -->
  {#if alt.changes.length}
    <ul class="text-caption text-content-muted space-y-0.5 pl-7">
      {#each describeChanges(alt, occ.key) as line}<li>Plan B · {line}</li>{/each}
    </ul>
  {:else}
    <p class="text-caption text-content-subtle pl-7">No differences yet - tap Edit B, then change, remove or add sessions.</p>
  {/if}

  <div class="flex items-center gap-2">
    <!-- Which plan counts: a setting, so the filled segment. Once decided it only shows the choice. -->
    <div class="seg flex-1" role="group" aria-label="Which plan counts">
      {#each ['A', 'B'] as const as side}
        {@const on = (occ.decided ?? occ.active) === side}
        <button
          onclick={() => pick(side)}
          disabled={!!occ.decided}
          class="seg-item flex-1 py-1.5 text-label transition-colors {on ? 'bg-primary text-white' : 'hover:text-content'} {occ.decided && !on ? 'opacity-50' : ''}"
          aria-pressed={on}
        >{sideLabel(side)}</button>
      {/each}
    </div>
    {#if !occ.decided}
      <button
        onclick={() => trainingState.setPlanBOccurrence(alt.id, occ.key, { chosen: occ.active })}
        class="chip text-primary border-primary/30 hover:bg-primary/10 transition-colors shrink-0"
        title="Go with Plan {occ.active}; the other one stays visible as not chosen"
      >
        <Icon icon="ic:baseline-check" class="text-sm" />Decide
      </button>
    {:else if !decidedByLog}
      <button
        onclick={() => trainingState.setPlanBOccurrence(alt.id, occ.key, { chosen: undefined })}
        class="chip text-content-subtle hover:text-content transition-colors shrink-0"
      >
        <Icon icon="ic:baseline-undo" class="text-sm" />Reopen
      </button>
    {/if}
  </div>

  {#each hints as hint (hint.date)}
    <p class="text-caption flex items-center gap-1.5 {looksGood(hint) ? 'text-status-good' : 'text-content-subtle'}">
      <Icon icon={looksGood(hint) ? 'ic:baseline-wb-sunny' : hint.label === 'Wet' ? 'ic:baseline-water-drop' : 'ic:baseline-cloud'} class="text-sm shrink-0" />
      {hintText(hint)}
    </p>
  {/each}

  {#each occ.stale as line}
    <p class="text-caption text-status-caution flex items-center gap-1.5">
      <Icon icon="ic:baseline-warning-amber" class="text-sm shrink-0" />{line}
    </p>
  {/each}
</div>
