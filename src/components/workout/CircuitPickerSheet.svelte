<script lang="ts">
  /**
   * First step of adding a circuit, in a session and in a plan: look among the saved ones, or start a new one. A saved
   * circuit opens in the builder to be adjusted before it is added; "New circuit" opens it empty (with what was typed as
   * its name). The session adds one more way in (`extra`): turn exercises already in it into a circuit.
   */
  import type { Snippet } from 'svelte';
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { circuitLine, searchCircuits } from '../../lib/exercise/circuitDraft';
  import { formatWeight } from '../../lib/units';
  import type { Circuit } from '../../lib/types';

  let { onPick, onNew, onClose, extra }: {
    /** A saved circuit was chosen: to adjust and add. */
    onPick: (circuit: Circuit) => void;
    /** Start a new one; `name` is what was typed in the search, if anything. */
    onNew: (name: string) => void;
    onClose: () => void;
    extra?: Snippet;
  } = $props();

  let query = $state('');
  const nameOf = (slot: Parameters<typeof slotTypeName>[0]) => slotTypeName(slot, trainingState.exerciseTypes);
  const found = $derived(searchCircuits(trainingState.circuits, query, nameOf));
  const hasSaved = $derived(trainingState.circuits.length > 0);
</script>

<Sheet title="Add a circuit" subtitle="Pick one of yours, or make a new one" level="nested" {onClose}>
  <div class="space-y-2">
    {#if hasSaved}
      <label class="block">
        <span class="sr-only">Search your circuits</span>
        <input bind:value={query} type="search" placeholder="Search your circuits" class="field" autocomplete="off" />
      </label>
    {/if}

    <button onclick={() => onNew(query.trim())} class="w-full p-3 rounded-card border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-left">
      <p class="text-body font-bold text-primary flex items-center gap-1.5"><Icon icon="ic:baseline-plus" class="text-base" /> {query.trim() && found.length === 0 ? `New circuit "${query.trim()}"` : 'New circuit'}</p>
      <p class="text-caption text-content-subtle">Rounds, and for each exercise its reps or seconds. You can save it for next time.</p>
    </button>

    {#if extra}{@render extra()}{/if}

    {#if hasSaved}
      <p class="text-caption uppercase text-content-subtle px-1 pt-1">{query.trim() ? `Matches (${found.length})` : 'Your circuits'}</p>
      {#each found as c (c.id)}
        <button onclick={() => onPick(c)} class="w-full p-3 rounded-card border border-border bg-surface/60 hover:border-border-strong text-left">
          <p class="text-body font-bold text-content truncate">{c.name}</p>
          <p class="text-caption text-content-subtle line-clamp-2">{circuitLine(c, nameOf, (kg) => formatWeight(kg, trainingState.units.weight))}</p>
        </button>
      {:else}
        <p class="text-caption text-content-subtle px-1">No saved circuit matches. Make a new one above.</p>
      {/each}
      {#if found.length > 0}<p class="text-caption text-content-subtle px-1">You can change the rounds, reps and rests before it is added; the saved one stays as it is unless you tell it to update.</p>{/if}
    {/if}
  </div>
</Sheet>
