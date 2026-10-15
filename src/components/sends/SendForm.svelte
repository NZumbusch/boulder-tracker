<script lang="ts">
    /**
   * Add or edit one outdoor send. Shared by History's Sends tab and Home's
   * quick log. During a trip (or when `defaults` say so) the crag and date
   * are pre-filled from it.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { toast } from '../../lib/toast.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import type { OutdoorAscent } from '../../lib/types';
  import { displayGrade, gradeFromInput, isKnownGrade } from '../../lib/sends/gradeScale';

  let { ascent, defaults = {}, onDone }: {
    ascent?: OutdoorAscent;
    defaults?: { crag?: string; date?: string };
    onDone: () => void;
  } = $props();

  const todayIso = trainingState.todayIso;
  // Seeded once from the send being edited, or the defaults.
  // svelte-ignore state_referenced_locally
  let name = $state(ascent?.name ?? '');
  // svelte-ignore state_referenced_locally
  // Shown in the chosen scale. Saved unchanged, the stored grade is kept as
  // is - V bands cover several Font grades, so converting back would turn
  // a 7B+ into a 7B just by opening and saving the send.
  // svelte-ignore state_referenced_locally
  const shownGrade = ascent ? displayGrade(ascent.grade, trainingState.units.grades) : '';
  let grade = $state(shownGrade);
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
  /** The crags used most recently, one tap each - the datalist below is not offered on every Android WebView. */
  const recentCrags = $derived(
    [...new Set(
      [...trainingState.outdoorAscents]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => a.crag)
        .filter((c): c is string => !!c),
    )].slice(0, 4),
  );
  const styleOptions = $derived([...STYLES, ...(style && !STYLES.includes(style) ? [style] : [])].map((s) => ({ value: s, label: s })));
  /** What the grade field says about what was typed: nothing while empty, a hint when it is not a grade the app knows (it is still saved as typed). */
  const gradeHint = $derived(grade.trim() && !isKnownGrade(grade) ? `"${grade.trim()}" is not a grade the charts know - it is saved as typed.` : '');
  const whyDisabled = $derived(!grade.trim() ? 'Enter a grade to save.' : !date ? 'Pick a date to save.' : '');
  let saving = $state(false);
  let gradeInput = $state<HTMLInputElement>();

  async function save(another = false) {
    if (!grade.trim() || !date || saving) return;
    saving = true;
    // Keep an imported send's original timestamp when its day didn't change.
    const keepDate = ascent && ascent.date.slice(0, 10) === date ? ascent.date : date;
    const saved: OutdoorAscent = {
      id: ascent?.id ?? generateId(),
      date: keepDate,
      grade: ascent && grade.trim() === shownGrade ? ascent.grade : gradeFromInput(grade),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(style ? { style } : {}),
      ...(crag.trim() ? { crag: crag.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      await trainingState.saveOutdoorAscent(saved);
    } finally {
      saving = false;
    }
    toast.show(ascent ? 'Send updated' : 'Send saved');
    if (another && !ascent) {
      // The crag and the day stay: a session's worth of sends shares them.
      name = '';
      grade = '';
      style = '';
      notes = '';
      gradeInput?.focus();
    } else onDone();
  }

  async function remove() {
    if (!ascent) return;
    await trainingState.deleteOutdoorAscent(ascent.id);
    onDone();
  }

</script>

<div class="space-y-3">
  <label class="block space-y-1">
    <span class="text-label text-content-subtle ml-1">Problem name <span class="text-content-subtle">(optional)</span></span>
    <input bind:value={name} placeholder="e.g. The Wave" autocomplete="off" enterkeyhint="next" class="field" />
  </label>
  <label class="block space-y-1">
    <span class="text-label text-content-subtle ml-1">Grade</span>
    <input
      bind:this={gradeInput}
      bind:value={grade}
      placeholder={trainingState.units.grades === 'v' ? 'e.g. V6' : 'e.g. 7A'}
      autocomplete="off"
      autocapitalize="characters"
      enterkeyhint="next"
      aria-invalid={gradeHint !== ''}
      aria-describedby={gradeHint ? `${listId}-grade` : undefined}
      class="field"
    />
    {#if gradeHint}<span id="{listId}-grade" class="block text-caption text-warning ml-1" role="status">{gradeHint}</span>{/if}
  </label>
  <div class="space-y-1">
    <span class="text-label text-content-subtle ml-1 block">Style <span class="text-content-subtle">(optional)</span></span>
    <Segmented label="Style" options={styleOptions} value={style} onChange={(v) => (style = style === v ? '' : v)} full />
  </div>
  <label class="block space-y-1">
    <span class="text-label text-content-subtle ml-1">Crag <span class="text-content-subtle">(optional)</span></span>
    <input bind:value={crag} list={listId} placeholder="e.g. Fontainebleau" autocomplete="off" enterkeyhint="next" class="field" />
  </label>
  <datalist id={listId}>
    {#each knownCrags as c}<option value={c}></option>{/each}
  </datalist>
  {#if recentCrags.length > 0}
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Recent crags">
      {#each recentCrags as c}
        <button type="button" onclick={() => (crag = c)} aria-pressed={crag === c} class="chip transition-colors {crag === c ? 'bg-primary/15 border-primary/40 text-content' : 'text-content-muted hover:text-content'}">{c}</button>
      {/each}
    </div>
  {/if}
  <label class="block space-y-1">
    <span class="text-label text-content-subtle ml-1">Date</span>
    <input type="date" bind:value={date} class="field" />
  </label>
  <label class="block space-y-1">
    <span class="text-label text-content-subtle ml-1">Notes <span class="text-content-subtle">(optional)</span></span>
    <input bind:value={notes} placeholder="Beta, conditions, how it felt" enterkeyhint="done" class="field" />
  </label>
  {#if whyDisabled}<p class="text-caption text-content-subtle ml-1" role="status">{whyDisabled}</p>{/if}
  <div class="flex gap-2">
    <button onclick={() => save()} disabled={!grade.trim() || !date || saving} class="btn btn-primary flex-1">Save</button>
    {#if !ascent}
      <button onclick={() => save(true)} disabled={!grade.trim() || !date || saving} class="btn btn-secondary">Save and add another</button>
    {/if}
    <button onclick={onDone} class="btn btn-ghost">Cancel</button>
  </div>
  {#if ascent}
    <button onclick={remove} class="btn btn-danger w-full">Delete this send</button>
  {/if}
</div>
