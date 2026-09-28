<script lang="ts">
  import RangeSlider from '../common/RangeSlider.svelte';
  /**
   * Pain and discomfort: log an entry, and see, edit or delete past ones -
   * the counterpart to BodyweightLog, in the quick-log sheet. Tapping an
   * entry loads it into the form; saving then updates that entry.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { formatDate, getWeekId, localIsoDate } from '../../lib/dateUtils';
  import type { PainLog } from '../../lib/types';
  import Icon from '@iconify/svelte';

  const todayIso = () => localIsoDate();

  let editingId = $state<string | null>(null);
  let date = $state(todayIso());
  let bodyPart = $state('');
  let severity = $state(3);
  let notes = $state('');

  const entries = $derived(trainingState.painLogs.slice().sort((a, b) => b.date.localeCompare(a.date)));
  const knownBodyParts = $derived([...new Set(trainingState.painLogs.map((p) => p.bodyPart))].sort());

  function resetForm() {
    editingId = null;
    date = todayIso();
    bodyPart = '';
    severity = 3;
    notes = '';
  }

  function startEdit(log: PainLog) {
    editingId = log.id;
    date = log.date;
    bodyPart = log.bodyPart;
    severity = log.severity;
    notes = log.notes ?? '';
  }

  async function save() {
    if (!bodyPart.trim()) return;
    await trainingState.savePainLog({
      id: editingId ?? generateId(),
      date,
      weekId: getWeekId(new Date(date)),
      bodyPart: bodyPart.trim(),
      severity,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    resetForm();
  }

  async function remove(id: string) {
    await trainingState.deletePainLog(id);
    if (editingId === id) resetForm();
  }

  /** Severity as a colour: mild, noticeable, bad. */
  const severityClass = (s: number) => (s >= 7 ? 'bg-status-risk/15 text-status-risk' : s >= 4 ? 'bg-status-caution/15 text-status-caution' : 'bg-surface-elevated text-content-muted');
  const inputClass = 'w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm focus:border-primary/60';
</script>

<div class="card space-y-4">
  <div class="flex items-center justify-between px-1">
    <div>
      <h3 class="text-section uppercase text-content-muted">Pain & discomfort</h3>
      <p class="text-caption text-content-subtle mt-0.5">
        {#if editingId}Editing an entry{:else if entries[0]}Latest: {entries[0].bodyPart} ({formatDate(entries[0].date)}){:else}No entries yet{/if}
      </p>
    </div>
    <div class="p-2 bg-primary-hover/10 rounded-control text-primary">
      <Icon icon="ic:baseline-healing" class="text-lg" />
    </div>
  </div>

  <form onsubmit={(e) => { e.preventDefault(); save(); }} class="space-y-3">
    <div class="grid grid-cols-[auto_1fr] gap-2">
      <input type="date" bind:value={date} aria-label="Date" class="{inputClass} w-auto" />
      <input bind:value={bodyPart} list="pain-bodyparts" placeholder="Body part, e.g. Left ring finger A2" aria-label="Body part" class={inputClass} />
    </div>
    <datalist id="pain-bodyparts">
      {#each knownBodyParts as part}<option value={part}></option>{/each}
    </datalist>
    <div class="space-y-1">
      <div class="flex justify-between text-label text-content-subtle"><span>Severity</span><span class="tabular-nums text-content">{severity}/10</span></div>
      <RangeSlider bind:value={severity} label="Severity" />
    </div>
    <textarea bind:value={notes} rows="2" placeholder="Notes (optional)" class="{inputClass} resize-y"></textarea>
    <div class="flex gap-2">
      {#if editingId}
        <button type="button" onclick={resetForm} class="px-4 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
      {/if}
      <button type="submit" disabled={!bodyPart.trim()} class="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-control disabled:opacity-40">
        {editingId ? 'Save changes' : 'Save'}
      </button>
    </div>
  </form>

  {#if entries.length > 0}
    <div class="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
      {#each entries as log (log.id)}
        <div class="flex items-center gap-2 p-2.5 rounded-control border {editingId === log.id ? 'bg-primary/5 border-primary/40' : 'bg-surface-elevated/50 border-border-strong/50'}">
          <button onclick={() => startEdit(log)} class="min-w-0 flex-1 text-left" aria-label="Edit {log.bodyPart}, {formatDate(log.date)}">
            <span class="flex items-center gap-2">
              <span class="shrink-0 px-1.5 py-0.5 rounded-control text-caption font-bold tabular-nums {severityClass(log.severity)}">{log.severity}</span>
              <span class="text-label text-content truncate">{log.bodyPart}</span>
            </span>
            <span class="block text-caption text-content-subtle truncate mt-0.5">{formatDate(log.date)}{log.notes ? ` · ${log.notes}` : ''}</span>
          </button>
          <button onclick={() => remove(log.id)} class="shrink-0 p-1 text-content-subtle hover:text-danger transition-colors" aria-label="Delete entry">
            <Icon icon="ic:baseline-close" class="text-sm" />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
