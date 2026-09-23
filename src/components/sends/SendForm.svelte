<script lang="ts">
  /**
   * Add or edit one outdoor send. Shared by History's Sends tab and Home's
   * quick log. During a trip (or when `defaults` say so) the crag and date
   * are pre-filled from it.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { OutdoorAscent } from '../../lib/types';

  let { ascent, defaults = {}, onDone }: {
    ascent?: OutdoorAscent;
    defaults?: { crag?: string; date?: string };
    onDone: () => void;
  } = $props();

  const todayIso = new Date().toISOString().split('T')[0];
  // Seeded once from the send being edited, or the defaults.
  // svelte-ignore state_referenced_locally
  let name = $state(ascent?.name ?? '');
  // svelte-ignore state_referenced_locally
  let grade = $state(ascent?.grade ?? '');
  // svelte-ignore state_referenced_locally
  let style = $state(ascent?.style ?? '');
  // svelte-ignore state_referenced_locally
  let crag = $state(ascent?.crag ?? defaults.crag ?? '');
  // svelte-ignore state_referenced_locally
  let date = $state((ascent?.date ?? defaults.date ?? todayIso).slice(0, 10));
  // svelte-ignore state_referenced_locally
  let notes = $state(ascent?.notes ?? '');

  const STYLES = ['Flash', 'Onsight', 'Redpoint'];
  const knownCrags = $derived(
    [...new Set([
      ...trainingState.crags.map((c) => c.name),
      ...trainingState.goals.filter((g) => g.location).map((g) => g.location!.name),
      ...trainingState.outdoorAscents.map((a) => a.crag).filter((c): c is string => !!c),
    ])].sort(),
  );
  const listId = `send-crags-${Math.random().toString(36).slice(2, 8)}`;

  async function save() {
    if (!grade.trim() || !date) return;
    // Keep an imported send's original timestamp when its day didn't change.
    const keepDate = ascent && ascent.date.slice(0, 10) === date ? ascent.date : date;
    const saved: OutdoorAscent = {
      id: ascent?.id ?? generateId(),
      date: keepDate,
      grade: grade.trim(),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(style ? { style } : {}),
      ...(crag.trim() ? { crag: crag.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    await trainingState.saveOutdoorAscent(saved);
    onDone();
  }

  async function remove() {
    if (!ascent) return;
    await trainingState.deleteOutdoorAscent(ascent.id);
    onDone();
  }

  const inputClass = 'w-full bg-surface-elevated/50 text-content p-3 rounded-control border border-border-strong outline-none text-sm focus:border-primary/60';
</script>

<div class="space-y-3">
  <input bind:value={name} placeholder="Problem name (optional)" class={inputClass} />
  <div class="flex gap-2">
    <input bind:value={grade} placeholder="Grade, e.g. 7A" class="{inputClass} flex-1" />
    <select bind:value={style} class="{inputClass} flex-1 appearance-none">
      <option value="">Style</option>
      {#each STYLES as s}<option value={s}>{s}</option>{/each}
      {#if style && !STYLES.includes(style)}<option value={style}>{style}</option>{/if}
    </select>
  </div>
  <input bind:value={crag} list={listId} placeholder="Crag (optional)" class={inputClass} />
  <datalist id={listId}>
    {#each knownCrags as c}<option value={c}></option>{/each}
  </datalist>
  <input type="date" bind:value={date} class={inputClass} />
  <input bind:value={notes} placeholder="Notes (optional)" class={inputClass} />
  <div class="flex gap-2">
    <button onclick={save} disabled={!grade.trim() || !date} class="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-control disabled:opacity-40">Save</button>
    {#if ascent}
      <button onclick={remove} class="px-4 py-3 bg-surface-elevated text-content-muted hover:text-danger text-sm font-bold rounded-control">Delete</button>
    {/if}
    <button onclick={onDone} class="px-4 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
  </div>
</div>
