<script lang="ts">
  /**
   * The phases of the plan on their own page: a timeline of every block (drag the ends of the selected one to change
   * its days, drag the body to move it), what is wrong with the plan (days with no phase, blocks sharing days), the
   * operations that used to take several edits - split, shift a block and everything after it, repeat a cycle - and
   * the full list. A phase is a range of days; placing one over days another block of the same priority has trims
   * that block (`placeBlock`), and the page says so before and after. Opened from the Plan; `focusDate` brings a day
   * into view and selects the phase on it (or offers to start one there).
   */
  import { onMount, untrack } from 'svelte';
  import Icon from '@iconify/svelte';
  import AppBar from '../nav/AppBar.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import PhaseTimeline from './PhaseTimeline.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { TrainingBlock } from '../../lib/types';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { sortBlocks, classifyBlock } from '../../lib/planning/blockPaging';
  import { phaseOnDay, blockFirstWeekId } from '../../lib/planning/trainingBlocks';
  import { placeBlock, describeBlockChanges, daysWithoutPhase, shortDate } from '../../lib/planning/blockEdit';
  import {
    blockLength, canSplitAt, gapsInPlan, overlaps, repeatCycle, repeatEnd, setBlockDays, shiftBlock, splitBlock, daysBetween,
  } from '../../lib/planning/phaseTimeline';
  import { addDaysIso, formatDay } from '../../lib/dateUtils';
  import { openBlockReview } from '../../lib/analytics/blockReview.svelte';

  let { onClose, focusDate }: { onClose: () => void; focusDate?: string } = $props();
  backWhile(() => true, () => onClose());

  const SCALES = { month: 18, quarter: 6, year: 2.2 } as const;
  type Scale = keyof typeof SCALES;
  const SCALE_KEY = 'plan.phaseScale';
  let scale = $state<Scale>((() => { try { const v = localStorage.getItem(SCALE_KEY); if (v === 'month' || v === 'quarter' || v === 'year') return v; } catch { /* default */ } return 'quarter'; })());
  function setScale(s: Scale) {
    scale = s;
    try { localStorage.setItem(SCALE_KEY, s); } catch { /* per-viewer convenience only */ }
  }

  const today = $derived(trainingState.todayIso);
  const blocks = $derived(sortBlocks(trainingState.trainingBlocks));
  const phaseDefs = $derived([...trainingState.phaseDefs].filter((p) => !p.archived));
  const phaseName = (id: string) => trainingState.phaseDefs.find((p) => p.id === id)?.name ?? 'Unknown phase';
  const colorOf = (b: TrainingBlock) => b.color || trainingState.phaseDefs.find((p) => p.id === b.phaseId)?.color || 'bg-status-neutral';
  const range = (b: { startDate: string; endDate: string }) => `${shortDate(b.startDate)} – ${shortDate(b.endDate)}`;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const weeksText = (days: number) => (days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day'));
  const snapshot = () => $state.snapshot(trainingState.trainingBlocks) as TrainingBlock[];

  let selectedId = $state<string | null>(null);
  const selected = $derived(blocks.find((b) => b.id === selectedId));
  let viewDate = $state<string | undefined>(untrack(() => focusDate));

  const now = $derived(phaseOnDay(blocks, today));
  const subtitle = $derived(now ? `Now: ${now.name} · until ${shortDate(now.endDate)}` : 'Which phase runs on which days');

  async function save(next: TrainingBlock[], label: string) {
    await trainingState.setTrainingBlocks(next, label);
  }

  // --- Timeline drags ---
  let draft = $state<{ id: string; start: string; end: string } | null>(null);
  const draftNote = $derived.by(() => {
    if (!draft) return undefined;
    const b = blocks.find((x) => x.id === draft!.id);
    if (!b) return undefined;
    const current = snapshot();
    const after = setBlockDays(current, b.id, draft.start, draft.end, () => 'preview');
    const own = `${b.name}: ${range({ startDate: draft.start, endDate: draft.end })} · ${weeksText(daysBetween(draft.start, draft.end) + 1)}`;
    return { own, lines: describeBlockChanges(current, after, b.id), gaps: daysWithoutPhase(current, after) };
  });
  async function commitDrag(id: string, start: string, end: string) {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    await save(setBlockDays(snapshot(), id, start, end, generateId), `"${b.name}" now ${range({ startDate: start, endDate: end })}`);
  }

  // --- What needs a look ---
  const gaps = $derived(gapsInPlan(blocks));
  const shared = $derived(overlaps(blocks));

  // --- Sheets ---
  type SheetKind = 'edit' | 'split' | 'shift' | 'repeat';
  let sheet = $state<SheetKind | null>(null);

  // Edit / new
  let form = $state<TrainingBlock | null>(null);
  let nameTouched = false;
  function defaultEnd(start: string): string {
    const next = blocks.map((b) => b.startDate).filter((d) => d > start).sort()[0];
    return next ? (daysBetween(start, next) > 28 ? addDaysIso(start, 6) : addDaysIso(next, -1)) : addDaysIso(start, 6);
  }
  function startNew(date?: string) {
    const lastEnd = blocks.map((b) => b.endDate).sort().reverse()[0];
    const start = date ?? (lastEnd && lastEnd >= today ? addDaysIso(lastEnd, 1) : today);
    const phase = phaseDefs[0];
    nameTouched = false;
    form = { id: generateId(), name: phase?.name ?? 'New block', phaseId: phase?.id ?? '', startDate: start, endDate: defaultEnd(start), priority: 0 };
    sheet = 'edit';
  }
  function startEdit(b: TrainingBlock) {
    nameTouched = true;
    form = { ...b };
    sheet = 'edit';
  }
  function pickPhase(id: string) {
    if (!form) return;
    const before = phaseName(form.phaseId);
    form.phaseId = id;
    if (!nameTouched || form.name === before) form.name = phaseName(id);
  }
  function setLength(weeks: number) {
    if (form) form.endDate = addDaysIso(form.startDate, weeks * 7 - 1);
  }
  const ready = $derived.by(() => {
    if (!form) return undefined;
    const { notes, ...block } = $state.snapshot(form);
    if (!block.name.trim() || !block.phaseId || !block.startDate || !block.endDate) return undefined;
    const [startDate, endDate] = block.endDate < block.startDate ? [block.endDate, block.startDate] : [block.startDate, block.endDate];
    return { ...block, startDate, endDate, ...(notes?.trim() ? { notes: notes.trim() } : {}) } as TrainingBlock;
  });
  const formNote = $derived.by(() => {
    if (!ready) return undefined;
    const current = snapshot();
    const placed = placeBlock(current, ready, () => 'preview');
    return { changes: describeBlockChanges(current, placed, ready.id), gaps: daysWithoutPhase(current, placed) };
  });
  async function saveForm() {
    if (!ready) return;
    const isNew = !blocks.some((b) => b.id === ready!.id);
    await save(placeBlock(snapshot(), ready, generateId), `"${ready.name}" saved`);
    sheet = null;
    selectedId = ready.id;
    viewDate = ready.startDate;
    void isNew;
  }

  // Split
  let splitAt = $state('');
  function openSplit() {
    if (!selected) return;
    const mid = addDaysIso(selected.startDate, Math.max(1, Math.floor(blockLength(selected) / 2)));
    splitAt = mid;
    sheet = 'split';
  }
  const splitOk = $derived(!!selected && canSplitAt(selected, splitAt));
  async function doSplit() {
    if (!selected || !splitOk) return;
    const name = selected.name;
    await save(splitBlock(snapshot(), selected.id, splitAt, generateId), `"${name}" split at ${shortDate(splitAt)}`);
    sheet = null;
  }

  // Shift
  let shiftDays = $state(7);
  let shiftFollowing = $state(true);
  function openShift() { shiftDays = 7; shiftFollowing = true; sheet = 'shift'; }
  const shiftNote = $derived.by(() => {
    if (!selected || shiftDays === 0) return undefined;
    const current = snapshot();
    const after = shiftBlock(current, selected.id, shiftDays, shiftFollowing, () => 'preview');
    const moved = after.filter((b) => { const o = current.find((x) => x.id === b.id); return o && (o.startDate !== b.startDate || o.endDate !== b.endDate); }).length;
    return { moved, lines: describeBlockChanges(current, after, selected.id), gaps: daysWithoutPhase(current, after) };
  });
  async function doShift() {
    if (!selected || shiftDays === 0) return;
    const dir = shiftDays > 0 ? 'later' : 'earlier';
    await save(shiftBlock(snapshot(), selected.id, shiftDays, shiftFollowing, generateId), `Moved ${weeksText(Math.abs(shiftDays))} ${dir}`);
    sheet = null;
  }

  // Repeat
  let repeatMore = $state(0);
  let repeatTimes = $state(1);
  const cycleIds = $derived.by(() => {
    if (!selected) return [] as string[];
    const i = blocks.findIndex((b) => b.id === selected!.id);
    return blocks.slice(i, i + 1 + repeatMore).map((b) => b.id);
  });
  function openRepeat() { repeatMore = 0; repeatTimes = 1; sheet = 'repeat'; }
  const repeatNote = $derived.by(() => {
    if (!selected || repeatTimes < 1) return undefined;
    const current = snapshot();
    const after = repeatCycle(current, cycleIds, repeatTimes, () => 'preview');
    const first = blocks.find((b) => b.id === cycleIds[0])!;
    return { added: after.length - current.length, end: repeatEnd(current, cycleIds, repeatTimes), replaced: current.length - after.filter((b) => current.some((c) => c.id === b.id)).length, from: first.startDate };
  });
  async function doRepeat() {
    if (!selected || repeatTimes < 1) return;
    await save(repeatCycle(snapshot(), cycleIds, repeatTimes, generateId), `Repeated ${plural(cycleIds.length, 'block')} ${repeatTimes}×`);
    sheet = null;
  }

  async function remove(id: string) {
    await trainingState.deleteTrainingBlock(id);
    if (selectedId === id) selectedId = null;
  }

  /** A tap on empty timeline or a gap: the phase there, or a new one starting on that day. */
  function pickDay(iso: string) {
    const here = phaseOnDay(blocks, iso);
    if (here) { selectedId = here.id; return; }
    startNew(iso);
  }

  function select(id: string | null) {
    selectedId = id;
    const b = blocks.find((x) => x.id === id);
    if (b) viewDate = b.startDate;
  }

  onMount(() => {
    if (!focusDate) return;
    const here = phaseOnDay(blocks, focusDate);
    if (here) selectedId = here.id;
    else startNew(focusDate);
  });

  // The list: what is on now and next, and the rest below.
  const currentWeek = $derived(trainingState.currentWeekId);
  const groups = $derived([
    { id: 'now', title: 'Now and next', items: blocks.filter((b) => classifyBlock(b, currentWeek) !== 'past') },
    { id: 'past', title: 'Past', items: blocks.filter((b) => classifyBlock(b, currentWeek) === 'past').reverse() },
  ].filter((g) => g.items.length > 0));
  const badgeOf = (b: TrainingBlock) => { const c = classifyBlock(b, currentWeek); return c === 'current' ? 'Now' : ''; };
</script>

<div class="fixed inset-0 z-[110] safe-y bg-app-bg overflow-y-auto" data-phase-planner>
  <div class="max-w-3xl mx-auto w-full px-4 pb-16 space-y-4">
    <AppBar title="Phases" {subtitle} onBack={onClose}>
      {#snippet actions()}
        <button onclick={() => startNew()} class="btn-icon" aria-label="Add a phase" title="Add a phase"><Icon icon="ic:baseline-plus" class="text-2xl" /></button>
      {/snippet}
    </AppBar>

    <div class="flex items-center justify-between gap-2">
      <Segmented label="Timeline scale" options={[{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }]} value={scale} onChange={setScale} />
      <button onclick={() => (viewDate = today)} class="btn-quiet px-2 text-caption rounded-control hover:bg-surface-elevated text-primary">Today</button>
    </div>

    <PhaseTimeline
      {blocks}
      {phaseDefs}
      {today}
      pxPerDay={SCALES[scale]}
      selectedId={selectedId}
      focusDate={viewDate}
      onSelect={select}
      onDraft={(d) => (draft = d)}
      onCommit={commitDrag}
      onPickDay={pickDay}
    />

    <!-- One line under the timeline: a hint, or - while a bar is being dragged - what the drag would do. -->
    <div class="min-h-10 text-caption space-y-0.5" aria-live="polite">
      {#if draftNote}
        <p class="text-content">{draftNote.own}</p>
        {#each draftNote.lines as line}<p class="text-content-muted">{line}</p>{/each}
        {#each draftNote.gaps as gap}<p class="text-warning">Leaves {gap.from === gap.to ? formatDay(gap.from) : `${formatDay(gap.from)} – ${formatDay(gap.to)}`} without a phase</p>{/each}
      {:else if blocks.length === 0}
        <p class="text-content-subtle">No phases yet. Tap + to add one, or tap the timeline on a day.</p>
      {:else if !selected}
        <p class="text-content-subtle">Tap a phase to select it, then drag its ends to change the days. Tap an empty day to start one there.</p>
      {:else}
        <p class="text-content-subtle">Drag the ends to change the first or last day; drag the bar to move it.</p>
      {/if}
    </div>

    {#if selected}
      <section class="p-4 bg-surface-elevated/50 rounded-card space-y-3" aria-label="Selected phase">
        <div class="flex items-start gap-2.5">
          <span class="w-2.5 h-2.5 mt-1.5 rounded-control shrink-0 {colorOf(selected)}"></span>
          <div class="min-w-0 flex-1">
            <p class="text-body font-bold text-content truncate">{selected.name}</p>
            <p class="text-caption text-content-subtle mt-0.5">{selected.name === phaseName(selected.phaseId) ? '' : `${phaseName(selected.phaseId)} · `}{formatDay(selected.startDate)} – {formatDay(selected.endDate)} · {weeksText(blockLength(selected))}{selected.priority ? ` · priority ${selected.priority}` : ''}</p>
            {#if selected.notes}<p class="text-caption text-content-muted mt-1.5 line-clamp-3">{selected.notes}</p>{/if}
          </div>
          <button onclick={() => select(null)} class="btn-icon -mt-1 -mr-2" aria-label="Deselect"><Icon icon="ic:baseline-close" class="text-xl" /></button>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button onclick={() => startEdit(selected)} class="btn btn-secondary"><Icon icon="ic:baseline-edit" /><span>Edit</span></button>
          <button onclick={openSplit} disabled={blockLength(selected) < 2} class="btn btn-secondary"><Icon icon="ic:baseline-call-split" /><span>Split</span></button>
          <button onclick={openShift} class="btn btn-secondary"><Icon icon="ic:baseline-swap-horiz" /><span>Move</span></button>
          <button onclick={openRepeat} class="btn btn-secondary"><Icon icon="ic:baseline-repeat" /><span>Repeat</span></button>
          {#if blockFirstWeekId(selected) <= currentWeek}
            <button onclick={() => openBlockReview(selected.id)} class="btn btn-secondary"><Icon icon="ic:baseline-insights" /><span>Review</span></button>
          {:else}
            <span></span>
          {/if}
          <button onclick={() => remove(selected.id)} class="btn btn-secondary hover:text-danger"><Icon icon="ic:baseline-delete" /><span>Delete</span></button>
        </div>
      </section>
    {/if}

    {#if gaps.length || shared.length}
      <section class="space-y-1" aria-label="Needs a look">
        <h2 class="text-label text-content-subtle px-1">Needs a look</h2>
        {#each gaps as g (g.from)}
          <button onclick={() => startNew(g.from)} class="w-full flex items-center gap-2.5 text-left min-h-11 px-3 rounded-control hover:bg-surface-elevated/60 transition-colors">
            <Icon icon="ic:baseline-warning-amber" class="text-lg text-warning shrink-0" />
            <span class="flex-1 min-w-0 text-label text-content">{plural(g.days, 'day')} without a phase</span>
            <span class="text-caption text-content-subtle shrink-0">{range({ startDate: g.from, endDate: g.to })}</span>
            <span class="text-caption text-primary shrink-0">Fill</span>
          </button>
        {/each}
        {#each shared as o (o.a.id + o.b.id)}
          <button onclick={() => select(o.b.id)} class="w-full flex items-center gap-2.5 text-left min-h-11 px-3 rounded-control hover:bg-surface-elevated/60 transition-colors">
            <Icon icon="ic:baseline-info" class="text-lg text-content-subtle shrink-0" />
            <span class="flex-1 min-w-0 text-label text-content truncate">{o.a.name} and {o.b.name} run together{(o.a.priority ?? 0) === (o.b.priority ?? 0) ? ' (same priority)' : ''}</span>
            <span class="text-caption text-content-subtle shrink-0">{range({ startDate: o.from, endDate: o.to })}</span>
          </button>
        {/each}
      </section>
    {/if}

    {#if blocks.length > 0}
      <section class="space-y-3" aria-label="All phases">
        {#each groups as group (group.id)}
          <details open={group.id === 'now'}>
            <summary class="text-label text-content-subtle px-1 min-h-11 flex items-center cursor-pointer">{group.title} · {group.items.length}</summary>
            <div class="space-y-1">
              {#each group.items as b (b.id)}
                <button onclick={() => select(b.id)} class="w-full flex items-center gap-2.5 text-left min-h-12 px-3 py-2 rounded-control transition-colors {selectedId === b.id ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/50'}">
                  <span class="w-2.5 h-2.5 rounded-control shrink-0 {colorOf(b)}"></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-body text-content truncate">{b.name}</span>
                    <span class="block text-caption text-content-subtle">{b.name === phaseName(b.phaseId) ? '' : `${phaseName(b.phaseId)} · `}{range(b)} · {weeksText(blockLength(b))}</span>
                  </span>
                  {#if badgeOf(b)}<span class="text-caption text-primary shrink-0">{badgeOf(b)}</span>{/if}
                </button>
              {/each}
            </div>
          </details>
        {/each}
      </section>
    {/if}
  </div>
</div>

{#if sheet === 'edit' && form}
  <Sheet title={blocks.some((b) => b.id === form?.id) ? 'Edit phase' : 'New phase'} subtitle="Which phase runs on which days" onClose={() => (sheet = null)}>
    <div class="space-y-3">
      <div class="space-y-1">
        <label for="ph-phase" class="text-label text-content-subtle ml-1">Phase</label>
        <select id="ph-phase" value={form.phaseId} onchange={(e) => pickPhase(e.currentTarget.value)} class="field">
          {#each phaseDefs as phase}<option value={phase.id}>{phase.name}</option>{/each}
        </select>
      </div>
      <div class="space-y-1">
        <label for="ph-name" class="text-label text-content-subtle ml-1">Name</label>
        <input id="ph-name" bind:value={form.name} oninput={() => (nameTouched = true)} class="field" placeholder="e.g. Finger strength block" />
      </div>
      <div class="flex gap-3">
        <div class="flex-1 space-y-1">
          <label for="ph-start" class="text-label text-content-subtle ml-1">First day</label>
          <input id="ph-start" type="date" bind:value={form.startDate} class="field" />
        </div>
        <div class="flex-1 space-y-1">
          <label for="ph-end" class="text-label text-content-subtle ml-1">Last day</label>
          <input id="ph-end" type="date" bind:value={form.endDate} class="field" />
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Length">
        {#each [1, 2, 3, 4, 6, 8] as w}
          <button onclick={() => setLength(w)} class="chip hover:bg-surface-elevated transition-colors">{w} wk</button>
        {/each}
      </div>
      {#if formNote && (formNote.changes.length || formNote.gaps.length)}
        <div class="space-y-0.5 text-caption" aria-live="polite">
          {#each formNote.changes as line}<p class="text-content-muted">{line}</p>{/each}
          {#each formNote.gaps as gap}<p class="text-warning">Leaves {gap.from === gap.to ? formatDay(gap.from) : `${formatDay(gap.from)} – ${formatDay(gap.to)}`} without a phase</p>{/each}
        </div>
      {/if}
      <div class="space-y-1">
        <label for="ph-notes" class="text-label text-content-subtle ml-1">Notes</label>
        <textarea id="ph-notes" bind:value={form.notes} rows="3" class="field leading-relaxed resize-y" placeholder="What this block is for, how to progress it…"></textarea>
      </div>
      <details open={!!form.priority}>
        <summary class="text-label text-content-subtle cursor-pointer min-h-11 flex items-center">Advanced: priority</summary>
        <div class="space-y-1 pb-1">
          <label for="ph-priority" class="text-label text-content-subtle ml-1">Priority (higher wins on overlap)</label>
          <input id="ph-priority" type="number" inputmode="numeric" bind:value={form.priority} class="field" />
          <p class="text-caption text-content-subtle ml-1">Only matters when two blocks cover the same day: the higher number is the phase shown. Leave at 0 for a normal plan. A block with a different priority runs alongside the others instead of replacing them.</p>
        </div>
      </details>
    </div>
    {#snippet footer()}
      <button onclick={saveForm} disabled={!ready} class="btn btn-primary flex-1">Save</button>
    {/snippet}
  </Sheet>
{/if}

{#if sheet === 'split' && selected}
  <Sheet title="Split {selected.name}" subtitle={range(selected)} onClose={() => (sheet = null)}>
    <div class="space-y-3">
      <div class="space-y-1">
        <label for="ph-split" class="text-label text-content-subtle ml-1">Second part starts on</label>
        <input id="ph-split" type="date" bind:value={splitAt} class="field" />
      </div>
      {#if splitOk}
        <p class="text-caption text-content-muted">{range({ startDate: selected.startDate, endDate: addDaysIso(splitAt, -1) })} and {range({ startDate: splitAt, endDate: selected.endDate })}. Both keep the phase, notes and priority; change one afterwards.</p>
      {:else}
        <p class="text-caption text-warning">Pick a day after {formatDay(selected.startDate)}, up to {formatDay(selected.endDate)}.</p>
      {/if}
    </div>
    {#snippet footer()}<button onclick={doSplit} disabled={!splitOk} class="btn btn-primary flex-1">Split</button>{/snippet}
  </Sheet>
{/if}

{#if sheet === 'shift' && selected}
  <Sheet title="Move {selected.name}" subtitle={range(selected)} onClose={() => (sheet = null)}>
    <div class="space-y-3">
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Move by">
        {#each [-14, -7, -1, 1, 7, 14] as d}
          <button onclick={() => (shiftDays += d)} class="chip hover:bg-surface-elevated transition-colors">{d > 0 ? '+' : '−'}{Math.abs(d) % 7 === 0 ? `${Math.abs(d) / 7} wk` : `${Math.abs(d)} d`}</button>
        {/each}
      </div>
      <div class="space-y-1">
        <label for="ph-shift" class="text-label text-content-subtle ml-1">Days later (negative = earlier)</label>
        <input id="ph-shift" type="number" inputmode="numeric" bind:value={shiftDays} class="field" />
      </div>
      <Toggle checked={shiftFollowing} onChange={(v) => (shiftFollowing = v)} label="Move everything after it too" hint="Keeps the plan's rhythm: every later phase shifts by the same days." />
      {#if shiftNote}
        <div class="space-y-0.5 text-caption" aria-live="polite">
          <p class="text-content-muted">Moves {plural(shiftNote.moved, 'block')} {weeksText(Math.abs(shiftDays))} {shiftDays > 0 ? 'later' : 'earlier'}.</p>
          {#each shiftNote.lines as line}<p class="text-content-muted">{line}</p>{/each}
          {#each shiftNote.gaps as gap}<p class="text-warning">Leaves {gap.from === gap.to ? formatDay(gap.from) : `${formatDay(gap.from)} – ${formatDay(gap.to)}`} without a phase</p>{/each}
        </div>
      {/if}
    </div>
    {#snippet footer()}<button onclick={doShift} disabled={shiftDays === 0} class="btn btn-primary flex-1">Move</button>{/snippet}
  </Sheet>
{/if}

{#if sheet === 'repeat' && selected}
  <Sheet title="Repeat" subtitle={selected.name} onClose={() => (sheet = null)}>
    <div class="space-y-3">
      <div class="space-y-1">
        <label for="ph-more" class="text-label text-content-subtle ml-1">Also include the next … blocks in the cycle</label>
        <input id="ph-more" type="number" inputmode="numeric" min="0" max={Math.max(0, blocks.length - 1 - blocks.findIndex((b) => b.id === selected.id))} bind:value={repeatMore} class="field" />
        <p class="text-caption text-content-subtle ml-1">E.g. three weeks of load and a deload week: select the first and include 1.</p>
      </div>
      <div class="space-y-1">
        <label for="ph-times" class="text-label text-content-subtle ml-1">Copies</label>
        <input id="ph-times" type="number" inputmode="numeric" min="1" max="26" bind:value={repeatTimes} class="field" />
      </div>
      {#if repeatNote}
        <p class="text-caption text-content-muted" aria-live="polite">Adds {plural(repeatNote.added, 'block')}, the last one ending {repeatNote.end ? formatDay(repeatNote.end) : ''}. Blocks of the same priority in the way are shortened.</p>
      {/if}
    </div>
    {#snippet footer()}<button onclick={doRepeat} disabled={repeatTimes < 1} class="btn btn-primary flex-1">Repeat</button>{/snippet}
  </Sheet>
{/if}
