<script lang="ts">
  /**
   * One pain issue: where it stands, its course (severity over time from
   * the check-ins), a check-in, its history, and editing / closing /
   * reopening / deleting it. Opened from anywhere via `lib/pain/painUi`.
   */
  import { portal } from '../../lib/ui/portal';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { keyboardAware } from '../../lib/ui/keyboardAware';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { localIsoDate, formatDate } from '../../lib/dateUtils';
  import { checkInsFor, issueState, daysBetween, STATUS_LABELS, KIND_LABELS, TIMING_LABELS, TREND_LABELS, REGION_LABELS } from '../../lib/pain/issues';
  import type { PainTrend } from '../../lib/types';
  import PainCheckInButtons from './PainCheckInButtons.svelte';
  import PainReportSheet from './PainReportSheet.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';
  import Icon from '@iconify/svelte';

  let { issueId, onClose }: { issueId: string; onClose: () => void } = $props();

  const today = localIsoDate();
  const issue = $derived(trainingState.painIssues.find((i) => i.id === issueId) ?? null);
  const checkIns = $derived(issue ? checkInsFor(issue.id, trainingState.painLogs) : []);
  const st = $derived(issue ? issueState(issue, trainingState.painLogs, today) : null);
  const trigger = $derived(issue?.triggerTypeId ? trainingState.exerciseTypes.find((t) => t.id === issue!.triggerTypeId)?.name : undefined);

  let editing = $state(false);
  // A check-in with more than a tap: severity and a note.
  let detailed = $state(false);
  let severity = $state(3);
  let note = $state('');
  $effect(() => { if (st?.severity) severity = Math.max(1, st.severity); });

  async function answer(trend: PainTrend) {
    if (!issue) return;
    await trainingState.checkInPain(issue.id, trend, detailed ? { severity: trend === 'gone' ? 0 : severity, ...(note.trim() ? { notes: note.trim() } : {}) } : {});
    detailed = false;
    note = '';
  }

  // --- The course: severity over time ---
  const W = 300;
  const H = 90;
  const chart = $derived.by(() => {
    if (!issue || checkIns.length === 0) return null;
    const end = issue.endDate ?? today;
    const span = Math.max(1, daysBetween(issue.startDate, end));
    const x = (d: string) => (Math.min(span, Math.max(0, daysBetween(issue.startDate, d))) / span) * (W - 12) + 6;
    const y = (s: number) => H - 6 - (s / 10) * (H - 12);
    const points = checkIns.map((l) => ({ x: x(l.date), y: y(l.severity), s: l.severity, id: l.id }));
    return { points, line: points.map((p) => `${p.x},${p.y}`).join(' '), span };
  });
  const tone = (s: number) => (s >= 7 ? 'var(--color-status-risk)' : s >= 4 ? 'var(--color-status-caution)' : s === 0 ? 'var(--color-status-good)' : 'var(--color-status-neutral)');

  const STATUS_TONE: Record<string, string> = {
    resolved: 'bg-success/15 text-success', worse: 'bg-danger/15 text-danger', improving: 'bg-success/10 text-success',
    steady: 'bg-surface-elevated text-content-muted', new: 'bg-primary/10 text-primary',
  };

  backWhile(() => !editing, () => onClose());
</script>

{#if issue && st}
  <div use:portal class="fixed inset-0 pb-safe z-[117] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div use:sheetDrag={onClose} use:keyboardAware class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[92vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-4 duration-200">
      <div class="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-caption flex items-center gap-2">
            <span class="px-1.5 py-0.5 rounded-control font-bold {STATUS_TONE[st.status]}">{STATUS_LABELS[st.status]}</span>
            <span class="text-content-subtle">{issue.region ? REGION_LABELS[issue.region] : 'Pain'}</span>
          </p>
          <h3 class="text-title text-content break-words mt-1">{issue.bodyPart}</h3>
          <p class="text-caption text-content-subtle tabular-nums">
            {formatDate(issue.startDate)} – {issue.endDate ? `${formatDate(issue.endDate)}${issue.endEstimated ? ' (est.)' : ''}` : 'now'} · {st.durationDays + 1} day{st.durationDays === 0 ? '' : 's'}{st.checkIns ? ` · peak ${st.peak}/10` : ''}
          </p>
        </div>
        <button onclick={onClose} class="p-2 -mr-2 text-content-subtle hover:text-content shrink-0" aria-label="Close">
          <Icon icon="ic:baseline-close" class="text-xl" />
        </button>
      </div>

      <div class="p-5 space-y-5">
        {#if chart}
          <div class="space-y-1">
            <svg viewBox="0 0 {W} {H}" class="w-full h-24" role="img" aria-label="Severity over time">
              {#each [0, 5, 10] as g}
                <line x1="0" x2={W} y1={H - 6 - (g / 10) * (H - 12)} y2={H - 6 - (g / 10) * (H - 12)} stroke="var(--color-border)" stroke-width="0.5" stroke-dasharray={g === 0 ? '' : '2 3'} />
              {/each}
              {#if chart.points.length > 1}
                <polyline points={chart.line} fill="none" stroke="var(--color-content-subtle)" stroke-width="1.5" stroke-linejoin="round" />
              {/if}
              {#each chart.points as p (p.id)}
                <circle cx={p.x} cy={p.y} r="3.5" fill={tone(p.s)} />
              {/each}
            </svg>
            <p class="text-caption text-content-subtle flex justify-between tabular-nums">
              <span>{formatDate(issue.startDate)}</span><span>severity 0–10</span><span>{issue.endDate ? formatDate(issue.endDate) : 'today'}</span>
            </p>
          </div>
        {/if}

        {#if !issue.endDate}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-label text-content-subtle">How is it today?</span>
              <button onclick={() => detailed = !detailed} class="text-caption text-content-subtle hover:text-primary">{detailed ? 'Just a tap' : 'Add a number / note'}</button>
            </div>
            {#if detailed}
              <div class="space-y-1">
                <span class="flex justify-between text-caption text-content-subtle"><span>Severity</span><span class="tabular-nums text-content">{severity}/10</span></span>
                <RangeSlider bind:value={severity} label="Severity" />
              </div>
              <input bind:value={note} placeholder="Note (optional)" class="w-full px-3 py-2 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none" />
            {/if}
            <PainCheckInButtons onPick={answer} />
            {#if st.lastCheckIn}
              <p class="text-caption text-content-subtle">Last check-in {st.daysSinceCheckIn === 0 ? 'today' : `${st.daysSinceCheckIn} day${st.daysSinceCheckIn === 1 ? '' : 's'} ago`}.</p>
            {/if}
          </div>
        {/if}

        {#if issue.watchCategories?.length || trigger || issue.notes}
          <div class="space-y-1.5 text-caption">
            {#if issue.watchCategories?.length}<p class="text-content-muted"><span class="text-content-subtle">Warns before:</span> {issue.watchCategories.join(', ')}</p>{/if}
            {#if trigger}<p class="text-content-muted"><span class="text-content-subtle">Started during:</span> {trigger}</p>{/if}
            {#if issue.notes}<p class="text-content whitespace-pre-wrap break-words">{issue.notes}</p>{/if}
          </div>
        {/if}

        <div class="space-y-2">
          <h4 class="text-section uppercase text-content-muted">Check-ins · {checkIns.length}</h4>
          {#each [...checkIns].reverse() as l (l.id)}
            <div class="flex items-start gap-2.5 py-1.5 border-b border-border/60 last:border-0">
              <span class="shrink-0 w-8 text-center py-0.5 rounded-control text-caption font-bold tabular-nums" style="background: color-mix(in srgb, {tone(l.severity)} 18%, transparent); color: {tone(l.severity)};">{l.severity}</span>
              <div class="min-w-0 flex-1">
                <p class="text-label text-content tabular-nums">{formatDate(l.date)}{l.trend ? ` · ${TREND_LABELS[l.trend]}` : ''}</p>
                {#if l.kinds?.length || l.timing?.length}
                  <p class="text-caption text-content-subtle">{[...(l.kinds ?? []).map((k) => KIND_LABELS[k]), ...(l.timing ?? []).map((t) => TIMING_LABELS[t])].join(' · ')}</p>
                {/if}
                {#if l.notes}<p class="text-caption text-content-muted break-words">{l.notes}</p>{/if}
              </div>
              <button onclick={() => trainingState.deletePainLog(l.id)} class="shrink-0 p-1 text-content-subtle hover:text-danger" aria-label="Delete this check-in">
                <Icon icon="ic:baseline-close" class="text-sm" />
              </button>
            </div>
          {:else}
            <p class="text-caption text-content-subtle italic">No check-ins yet.</p>
          {/each}
        </div>

        <div class="pt-2 border-t border-border grid grid-cols-2 gap-2">
          <button onclick={() => editing = true} class="py-2.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content text-label font-bold rounded-control flex items-center justify-center gap-1.5">
            <Icon icon="ic:baseline-edit" class="text-base" /> Edit
          </button>
          {#if issue.endDate}
            <button onclick={() => trainingState.reopenPainIssue(issue!.id)} class="py-2.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content text-label font-bold rounded-control flex items-center justify-center gap-1.5">
              <Icon icon="ic:baseline-replay" class="text-base" /> It's back
            </button>
          {:else}
            <button onclick={() => answer('gone')} class="py-2.5 bg-success/10 hover:bg-success/15 text-success text-label font-bold rounded-control flex items-center justify-center gap-1.5">
              <Icon icon="ic:baseline-check-circle" class="text-base" /> It's gone
            </button>
          {/if}
          <button onclick={() => { const id = issue!.id; onClose(); void trainingState.deletePainIssue(id); }} class="col-span-2 py-2 text-label text-content-subtle hover:text-danger">
            Delete this issue and its check-ins
          </button>
        </div>
      </div>
    </div>
    <!-- Inside the portalled root: it must stay this block's only node. -->
    {#if editing}
      <PainReportSheet issue={issue} onClose={() => editing = false} />
    {/if}
  </div>
{/if}
