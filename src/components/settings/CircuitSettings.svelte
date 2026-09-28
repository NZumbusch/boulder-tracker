<script lang="ts">
  /**
   * Settings -> Customization -> Circuits: the saved-circuit library. Each
   * circuit is added to a session or phase template as a copy (see
   * lib/exercise/circuits.ts), so editing one here changes only future adds.
   */
  import type { Circuit } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { groupSummary, groupMinutes } from '../../lib/exercise/groups';
  import { circuitAsWorkout } from '../../lib/exercise/circuits';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { formatMinutes } from '../../lib/session/formatSession';
  import ListRow from '../common/ListRow.svelte';
  import CircuitEditor from './CircuitEditor.svelte';
  import Icon from '@iconify/svelte';

  /** The circuit open in the editor; `null` for a new one, `undefined` when closed. */
  let editing = $state<Circuit | null | undefined>(undefined);

  function meta(c: Circuit): string {
    const w = circuitAsWorkout(c);
    const minutes = groupMinutes(w, 'planned').get('circuit');
    const g = w.groups[0];
    return `${c.exercises.length} exercise${c.exercises.length === 1 ? '' : 's'} · ${groupSummary(g)}${minutes ? ` · ~${formatMinutes(Math.ceil(minutes))}` : ''}`;
  }
</script>

<div class="card space-y-3">
  <div class="px-1">
    <h3 class="text-section uppercase text-content-muted">Circuits</h3>
    <p class="text-caption text-content-subtle">Saved circuits and supersets to add to any session or phase template.</p>
  </div>
  {#if trainingState.circuits.length > 0}
    <div class="divide-y divide-border px-1">
      {#each trainingState.circuits as c (c.id)}
        <ListRow
          title={c.name}
          meta={meta(c)}
          detail={c.exercises.map((s) => slotTypeName(s, trainingState.exerciseTypes)).join(' · ')}
          onclick={() => (editing = c)}
        />
      {/each}
    </div>
  {:else}
    <p class="px-1 text-caption text-content-subtle italic">None yet. Make one here, or group exercises in a session and tap Save as circuit.</p>
  {/if}
  <button
    onclick={() => (editing = null)}
    class="w-full py-2.5 border border-dashed border-border rounded-control text-label font-bold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5"
  >
    <Icon icon="ic:baseline-plus" class="text-base" /> New circuit
  </button>
</div>

{#if editing !== undefined}
  <CircuitEditor circuit={editing} onClose={() => (editing = undefined)} />
{/if}
