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
  import { onMount, tick } from 'svelte';
  import { portal } from '../../lib/ui/portal';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { toast } from '../../lib/toast.svelte';
  import { getWeekId, localIsoDate } from '../../lib/dateUtils';
  import { fingerCategoryIds } from '../../lib/analytics/proMetrics';
  import {
    bodyPartLabel, defaultWatchCategories, REGION_LABELS, SIDE_LABELS, KIND_LABELS, TIMING_LABELS,
  } from '../../lib/pain/issues';
  import type { PainIssue, PainKind, PainRegion, PainSide, PainTiming } from '../../lib/types';
  import RangeSlider from '../common/RangeSlider.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Segmented from '../ui/Segmented.svelte';

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
  let startDate = $state(editing?.startDate ?? trainingState.todayIso);
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
  /** Why Save is off, in words - never a silently greyed button. */
  const whyNot = $derived(
    name.trim().length === 0
      ? 'Choose where it hurts, or type a name, to save.'
      : !startDate
        ? 'Pick the day it started.'
        : endDate && endDate < startDate
          ? 'The end date is before the start date.'
          : '',
  );

  // Closing with something filled in asks first: a stray tap on the scrim should not lose a form.
  const signature = () => JSON.stringify([region, side, detail, name, startDate, endDate, severity, kinds, timing, notes, checkInNote, triggerTypeId, watch]);
  let baseline = $state<string | null>(null);
  // Taken once the first effects have settled (the name and the watch list are derived from the region on mount).
  onMount(() => { void tick().then(() => (baseline = signature())); });
  const dirty = $derived(baseline !== null && signature() !== baseline);

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
    toast.show(editing ? 'Issue updated' : `${base.bodyPart} logged`);
    onSaved?.(base.id);
    onClose();
  }

  const REGIONS = Object.keys(REGION_LABELS) as PainRegion[];
  const SIDES = Object.keys(SIDE_LABELS) as PainSide[];
  const sideOptions = SIDES.map((s) => ({ value: s, label: SIDE_LABELS[s] }));
  const chipOn = 'bg-primary/10 border-primary/40 text-primary font-bold';
  const chipOff = 'text-content-muted hover:text-content';
</script>

<div use:portal>
  <Sheet title={name.trim() || 'Where does it hurt?'} subtitle={editing ? 'Edit issue' : 'New pain issue'} level="top" {dirty} discardMessage="What you entered here will be lost." {onClose}>
    <div class="space-y-5">
      <div class="space-y-2">
        <span class="text-label text-content-subtle block">Where</span>
        <div class="flex flex-wrap gap-1.5">
          {#each REGIONS as r}
            <button type="button" aria-pressed={region === r} onclick={() => region = region === r ? undefined : r} class="chip {region === r ? chipOn : chipOff}">{REGION_LABELS[r]}</button>
          {/each}
        </div>
        <Segmented label="Side" options={sideOptions} value={side ?? ''} onChange={(v) => (side = side === v ? undefined : (v as PainSide))} full />
        <label class="block space-y-1">
          <span class="text-caption text-content-subtle">Detail</span>
          <input bind:value={detail} placeholder={region === 'finger' ? 'e.g. ring A2' : 'Optional'} enterkeyhint="next" class="field" />
        </label>
        <label class="block space-y-1">
          <span class="text-caption text-content-subtle">Name (built from the above; change it if you like)</span>
          <input bind:value={name} oninput={() => nameTouched = true} placeholder="e.g. Left ring finger A2" enterkeyhint="next" class="field" />
        </label>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="space-y-1 min-w-0">
          <span class="text-label text-content-subtle">Started on</span>
          <input type="date" bind:value={startDate} max={localIsoDate()} class="field" />
        </label>
        {#if editing?.endDate || endDate}
          <label class="space-y-1 min-w-0">
            <span class="text-label text-content-subtle">Gone since{editing?.endEstimated && endDate === editing.endDate ? ' (estimated)' : ''}</span>
            <input type="date" bind:value={endDate} min={startDate} class="field" />
          </label>
        {/if}
      </div>

      {#if !editing}
        <div class="space-y-1">
          <span class="flex justify-between text-label text-content-subtle"><span>How bad</span><span class="tabular-nums text-content">{severity}/10</span></span>
          <RangeSlider bind:value={severity} label="How bad" />
          <span class="flex justify-between text-caption text-content-subtle"><span>0 none</span><span>10 the worst</span></span>
        </div>
        <div class="space-y-2">
          <span class="text-label text-content-subtle block">What it's like</span>
          <div class="flex flex-wrap gap-1.5">
            {#each Object.entries(KIND_LABELS) as [k, label]}
              <button type="button" aria-pressed={kinds.includes(k as PainKind)} onclick={() => kinds = toggle(kinds, k as PainKind)} class="chip {kinds.includes(k as PainKind) ? chipOn : chipOff}">{label}</button>
            {/each}
          </div>
        </div>
        <div class="space-y-2">
          <span class="text-label text-content-subtle block">When it hurts</span>
          <div class="flex flex-wrap gap-1.5">
            {#each Object.entries(TIMING_LABELS) as [t, label]}
              <button type="button" aria-pressed={timing.includes(t as PainTiming)} onclick={() => timing = toggle(timing, t as PainTiming)} class="chip {timing.includes(t as PainTiming) ? chipOn : chipOff}">{label}</button>
            {/each}
          </div>
        </div>
        <textarea bind:value={checkInNote} rows="2" aria-label="What happened" placeholder="What happened? (optional)" class="field resize-y"></textarea>
      {/if}

      <div class="space-y-2">
        <span class="text-label text-content-subtle block">Warn me before sessions with</span>
        <div class="flex flex-wrap gap-1.5">
          {#each categories as c}
            <button type="button" aria-pressed={watch.includes(c.name)} onclick={() => { watch = toggle(watch, c.name); watchTouched = true; }} class="chip {watch.includes(c.name) ? chipOn : chipOff}">{c.name}</button>
          {/each}
        </div>
        <span class="block text-caption text-content-subtle">{watch.length === 0 ? 'None chosen, so no session is flagged. ' : ''}While it's open, sessions with these get a heads-up on Plan and Home.</span>
      </div>

      <label class="block space-y-1">
        <span class="text-label text-content-subtle">What you were doing when it started <span class="text-content-subtle">(optional)</span></span>
        <select bind:value={triggerTypeId} class="field">
          <option value="">Not sure</option>
          {#each types as t}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>

      {#if editing}
        <textarea bind:value={notes} rows="3" aria-label="Notes about this issue" placeholder="Notes about this issue: what helps, what the physio said…" class="field resize-y"></textarea>
      {/if}
    </div>

    {#snippet footer()}
      <div class="flex-1 min-w-0 space-y-2">
        {#if whyNot}<p class="text-caption text-content-subtle" role="status">{whyNot}</p>{/if}
        <div class="flex gap-2">
          <button onclick={save} disabled={!canSave} class="btn btn-primary flex-1">{editing ? 'Save' : 'Log it'}</button>
          <button onclick={onClose} class="btn btn-ghost">Cancel</button>
        </div>
      </div>
    {/snippet}
  </Sheet>
</div>
