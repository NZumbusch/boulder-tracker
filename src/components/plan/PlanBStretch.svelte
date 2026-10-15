<script lang="ts">
  /**
   * One Plan B stretch in the Plan week: which plan counts (A|B - the
   * numbers follow it until it is decided), deciding, the outdoor weather
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

  /** The logged session that locked the stretch, by name - "Konstanz Unseen-Set Session". */
  const lockedBy = $derived(
    !decidedByLog ? undefined
      : (occ.decided === 'B' ? occ.bOnly : occ.aOnly).find((w) => w.status === 'completed')?.notes || 'a session',
  );

  const hints = $derived.by(() => {
    if (!alt.outdoor || occ.decided) return [];
    return outdoorDayHints(sideDates(occ, alt.outdoor), trainingState.outdoorForecasts, trainingState.frictionConfig);
  });

  function pick(side: PlanSide) {
    if (occ.decided) return;
    trainingState.setPlanBOccurrence(alt.id, occ.key, { likely: side === (alt.likely ?? 'A') ? undefined : side });
  }
  const sideLabel = (side: PlanSide) => (alt.outdoor === side ? `Plan ${side} · outdoor` : `Plan ${side}`);
  /** The explanation lives behind one (?) instead of under the control it is about. */
  let showHelp = $state(false);
  const stateText = $derived(
    occ.decided ? `Plan ${occ.decided} ${decidedByLog ? 'locked in' : 'chosen'}` : `Undecided, counting Plan ${occ.active}`,
  );
</script>

<div class="rounded-control bg-surface-elevated/40 p-3 space-y-2.5">
  <div class="flex items-start gap-2">
    <Icon icon="ic:baseline-call-split" class="text-primary text-lg shrink-0 mt-0.5" />
    <div class="min-w-0 flex-1">
      <p class="text-label font-semibold text-content break-words">{alt.label || 'Plan B'}</p>
      <p class="text-caption text-content-subtle">{occurrenceDaysLabel(alt, occ.key)}{alt.repeatUntilWeekId ? ' · every week' : ''}</p>
    </div>
    <!-- One way in: the sheet changes the sessions of Plan B and its settings. -->
    {#if !editingThis}
      <button onclick={onSettings} class="chip transition-colors text-content-subtle hover:text-content shrink-0" aria-label="Edit Plan B: its sessions and settings">
        <Icon icon="ic:baseline-edit" class="text-sm" />Edit
      </button>
    {/if}
  </div>

  <!-- What Plan B actually does differently - the point of the whole card. -->
  {#if alt.changes.length}
    <ul class="text-caption text-content-muted space-y-0.5 pl-7">
      {#each describeChanges(alt, occ.key) as line}<li>Plan B · {line}</li>{/each}
    </ul>
  {:else}
    <p class="text-caption text-content-subtle pl-7">No differences yet - tap Edit to change, remove or add sessions.</p>
  {/if}

  <div class="flex items-center gap-2">
    <!-- Which plan counts: a setting, so the filled segment. Once decided it only shows the choice. -->
    <div class="seg flex-1" role="group" aria-label="Which plan counts">
      {#each ['A', 'B'] as const as side}
        {@const on = (occ.decided ?? occ.active) === side}
        <button
          onclick={() => pick(side)}
          disabled={!!occ.decided}
          class="seg-item flex-1 py-1.5 text-label transition-colors {on ? 'bg-primary text-on-primary' : 'hover:text-content'} {occ.decided && !on ? 'opacity-50' : ''}"
          aria-pressed={on}
        >{sideLabel(side)}</button>
      {/each}
    </div>
    {#if !occ.decided}
      <button
        onclick={() => trainingState.setPlanBOccurrence(alt.id, occ.key, { chosen: occ.active })}
        class="chip min-h-11 text-primary border-primary/30 hover:bg-primary/10 transition-colors shrink-0"
        title="Go with Plan {occ.active}; the other one stays visible as not chosen"
      >
        <Icon icon="ic:baseline-check" class="text-sm" />Decide
      </button>
    {:else if !decidedByLog}
      <button
        onclick={() => trainingState.setPlanBOccurrence(alt.id, occ.key, { chosen: undefined })}
        class="chip min-h-11 text-content-subtle hover:text-content transition-colors shrink-0"
      >
        <Icon icon="ic:baseline-undo" class="text-sm" />Reopen
      </button>
    {/if}
  </div>

  <!-- The state, said once; what it means and what changes it is one tap away. -->
  <div class="flex items-center gap-1">
    <p class="text-caption text-content-muted flex-1">{stateText}</p>
    <button
      onclick={() => (showHelp = !showHelp)}
      class="btn-icon min-w-9 min-h-9 -my-1.5 -mr-1.5"
      aria-label="How Plan A and Plan B work"
      aria-expanded={showHelp}
    >
      <Icon icon="ic:outline-help-outline" class="text-base" />
    </button>
  </div>
  {#if showHelp}
    <p class="text-caption text-content-subtle leading-relaxed">
      {#if !occ.decided}
        The numbers count Plan {occ.active} for now. It locks by itself when you log a session only one plan has, or when you tap Decide.
      {:else if decidedByLog}
        You logged {lockedBy}, which only Plan {occ.decided} has. Plan {occ.decided === 'A' ? 'B' : 'A'}'s sessions stay greyed out; delete the logged session to unlock.
      {:else}
        Plan {occ.decided === 'A' ? 'B' : 'A'}'s sessions stay greyed out; Reopen to change your mind.
      {/if}
    </p>
  {/if}

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
