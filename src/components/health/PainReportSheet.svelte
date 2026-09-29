<script lang="ts">
  /**
   * A new pain issue with its first check-in - or, given `issue`, editing
   * that issue (what it's called, where, dates, what aggravates it).
   *
   * Where: a region, a side and an optional detail build the name ("Left
   * finger - ring A2"), which can still be typed over. What aggravates it:
   * the analytics categories whose sessions get a warning while it's open
   * - the finger-load set for hand and forearm regions, until changed.
   */
  import { portal } from '../../lib/ui/portal';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { getWeekId, localIsoDate } from '../../lib/dateUtils';
  import { fingerCategoryIds } from '../../lib/analytics/proMetrics';
  import {
    bodyPartLabel, defaultWatchCategories, REGION_LABELS, SIDE_LABELS, KIND_LABELS, TIMING_LABELS,
  } from '../../lib/pain/issues';
  import type { PainIssue, PainKind, PainRegion, PainSide, PainTiming } from '../../lib/types';
  import RangeSlider from '../common/RangeSlider.svelte';
  import Icon from '@iconify/svelte';

  let { issue = null, onClose, onSaved }: {
    issue?: PainIssue | null;
    onClose: () => void;
    onSaved?: (issueId: string) => void;
  } = $props();

  // A draft, seeded once when the sheet opens.
  // svelte-ignore state_referenced_locally
  const editing = issue;
  let region = $state<PainRegion | undefined>(editing?.region);
  let side = $state<PainSide | undefined>(editing?.side);
  let detail = $state(editing?.detail ?? '');
  let name = $state(editing?.bodyPart ?? '');
  /** The name was typed by hand - stop rebuilding it from region/side/detail. */
  let nameTouched = $state(!!editing && !editing.region);
  let startDate = $state(editing?.startDate ?? localIsoDate());
  let endDate = $state(editing?.endDate ?? '');
  let severity = $state(4);
  let kinds = $state<PainKind[]>([]);
  let timing = $state<PainTiming[]>([]);
  let notes = $state(editing?.notes ?? '');
  let checkInNote = $state('');
  let triggerTypeId = $state(editing?.triggerTypeId ?? '');
  let watch = $state<string[]>(editing?.watchCategories ?? []);
  let watchTouched = $state(!!editing);

  const categories = $derived(trainingState.analyticsCategories.filter((c) => !c.archived));
  const fingerNames = $derived.by(() => {
    const ids = fingerCategoryIds(trainingState.analyticsCategories, trainingState.fingerCategoryIds);
    return trainingState.analyticsCategories.filter((c) => ids.has(c.id)).map((c) => c.name);
  });
  const types = $derived(trainingState.exerciseTypes.filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name)));

  $effect(() => {
    const auto = bodyPartLabel(region, side, detail);
    if (!nameTouched) name = region || detail.trim() ? auto : name;
  });
  $effect(() => {
    const defaults = defaultWatchCategories(region, fingerNames);
    if (!watchTouched) watch = defaults;
  });

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const canSave = $derived(name.trim().length > 0 && !!startDate && (!endDate || endDate >= startDate));

  async function save() {
    if (!canSave) return;
    const base: PainIssue = {
      id: editing?.id ?? generateId(),
      bodyPart: name.trim(),
      ...(region ? { region } : {}),
      ...(side ? { side } : {}),
      ...(detail.trim() ? { detail: detail.trim() } : {}),
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(editing?.endEstimated && endDate === editing.endDate ? { endEstimated: true as const } : {}),
      ...(watch.length ? { watchCategories: watch } : {}),
      ...(triggerTypeId ? { triggerTypeId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    if (editing) {
      await trainingState.savePainIssue(base);
    } else {
      await trainingState.reportPain(base, {
        id: generateId(),
        date: startDate,
        weekId: getWeekId(new Date(`${startDate}T12:00:00`)),
        bodyPart: base.bodyPart,
        severity,
        ...(kinds.length ? { kinds } : {}),
        ...(timing.length ? { timing } : {}),
        ...(checkInNote.trim() ? { notes: checkInNote.trim() } : {}),
      });
    }
    onSaved?.(base.id);
    onClose();
  }

  backWhile(() => true, () => onClose());

  const REGIONS = Object.keys(REGION_LABELS) as PainRegion[];
  const SIDES = Object.keys(SIDE_LABELS) as PainSide[];
  const chipOn = 'bg-primary/10 border-primary/40 text-primary font-bold';
  const chipOff = 'text-content-muted hover:text-content';
  const inputClass = 'w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50';
</script>

<div use:portal class="fixed inset-0 pb-safe z-[118] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div use:sheetDrag={onClose} class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[92vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-4 duration-200">
    <div class="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-caption uppercase text-content-subtle">{editing ? 'Edit issue' : 'New pain issue'}</p>
        <h3 class="text-title text-content truncate">{name.trim() || 'Where does it hurt?'}</h3>
      </div>
      <button onclick={onClose} class="p-2 -mr-2 text-content-subtle hover:text-content shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <div class="p-5 space-y-5">
      <div class="space-y-2">
        <span class="text-label text-content-subtle block">Where</span>
        <div class="flex flex-wrap gap-1.5">
          {#each REGIONS as r}
            <button type="button" onclick={() => region = region === r ? undefined : r} class="chip {region === r ? chipOn : chipOff}">{REGION_LABELS[r]}</button>
          {/each}
        </div>
        <div class="flex bg-surface-elevated/50 p-1 rounded-control">
          {#each SIDES as s}
            <button type="button" onclick={() => side = side === s ? undefined : s} class="flex-1 py-1.5 text-label rounded-control transition-all {side === s ? 'bg-primary text-white shadow-md' : 'text-content-muted'}">{SIDE_LABELS[s]}</button>
          {/each}
        </div>
        <input bind:value={detail} placeholder={region === 'finger' ? 'Detail, e.g. ring A2' : 'Detail (optional)'} class={inputClass} />
        <label class="block space-y-1">
          <span class="text-caption text-content-subtle">Called</span>
          <input bind:value={name} oninput={() => nameTouched = true} placeholder="e.g. Left ring finger A2" class={inputClass} />
        </label>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="space-y-1 min-w-0">
          <span class="text-label text-content-subtle">Started</span>
          <input type="date" bind:value={startDate} max={localIsoDate()} class={inputClass} />
        </label>
        {#if editing?.endDate || endDate}
          <label class="space-y-1 min-w-0">
            <span class="text-label text-content-subtle">Gone since{editing?.endEstimated && endDate === editing.endDate ? ' (estimated)' : ''}</span>
            <input type="date" bind:value={endDate} min={startDate} class={inputClass} />
          </label>
        {/if}
      </div>

      {#if !editing}
        <div class="space-y-1">
          <span class="flex justify-between text-label text-content-subtle"><span>How bad</span><span class="tabular-nums text-content">{severity}/10</span></span>
          <RangeSlider bind:value={severity} label="How bad" />
        </div>
        <div class="space-y-2">
          <span class="text-label text-content-subtle block">What it's like</span>
          <div class="flex flex-wrap gap-1.5">
            {#each Object.entries(KIND_LABELS) as [k, label]}
              <button type="button" onclick={() => kinds = toggle(kinds, k as PainKind)} class="chip {kinds.includes(k as PainKind) ? chipOn : chipOff}">{label}</button>
            {/each}
          </div>
        </div>
        <div class="space-y-2">
          <span class="text-label text-content-subtle block">When it hurts</span>
          <div class="flex flex-wrap gap-1.5">
            {#each Object.entries(TIMING_LABELS) as [t, label]}
              <button type="button" onclick={() => timing = toggle(timing, t as PainTiming)} class="chip {timing.includes(t as PainTiming) ? chipOn : chipOff}">{label}</button>
            {/each}
          </div>
        </div>
        <textarea bind:value={checkInNote} rows="2" placeholder="What happened? (optional)" class="{inputClass} resize-y"></textarea>
      {/if}

      <div class="space-y-2">
        <span class="text-label text-content-subtle block">Warn me before sessions with</span>
        <div class="flex flex-wrap gap-1.5">
          {#each categories as c}
            <button type="button" onclick={() => { watch = toggle(watch, c.name); watchTouched = true; }} class="chip {watch.includes(c.name) ? chipOn : chipOff}">{c.name}</button>
          {/each}
        </div>
        <span class="block text-caption text-content-subtle">While it's open, sessions with these get a heads-up on Plan and Home.</span>
      </div>

      <label class="block space-y-1">
        <span class="text-label text-content-subtle">Started during <span class="text-content-subtle/70">(optional)</span></span>
        <select bind:value={triggerTypeId} class={inputClass}>
          <option value="">—</option>
          {#each types as t}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>

      {#if editing}
        <textarea bind:value={notes} rows="3" placeholder="Notes about this issue - what helps, what the physio said…" class="{inputClass} resize-y"></textarea>
      {/if}
    </div>

    <div class="sticky bottom-0 bg-surface/95 backdrop-blur-sm border-t border-border px-5 py-4 flex gap-2">
      <button onclick={save} disabled={!canSave} class="flex-1 py-3 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control disabled:opacity-40 active:scale-[0.98]">
        {editing ? 'Save' : 'Log it'}
      </button>
      <button onclick={onClose} class="px-5 py-3 bg-surface-elevated text-content-muted text-label font-bold rounded-control">Cancel</button>
    </div>
  </div>
</div>
