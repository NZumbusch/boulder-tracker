<script lang="ts">
  /**
   * Pain in the quick-log sheet: your open issues (tap for the issue page,
   * check in right here), a new issue, and the resolved ones - folded.
   * Replaces the old flat list of entries (PAIN_PLAN.md).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { localIsoDate, formatDate } from '../../lib/dateUtils';
  import { issueState, STATUS_LABELS } from '../../lib/pain/issues';
  import { openPainIssue, openPainReport } from '../../lib/pain/painUi.svelte';
  import Icon from '@iconify/svelte';

  const today = localIsoDate();
  const withState = $derived(
    trainingState.painIssues
      .map((issue) => ({ issue, st: issueState(issue, trainingState.painLogs, today) }))
      .sort((a, b) => (b.issue.endDate ?? '9999').localeCompare(a.issue.endDate ?? '9999') || b.issue.startDate.localeCompare(a.issue.startDate)),
  );
  const open = $derived(withState.filter((x) => !x.issue.endDate));
  const resolved = $derived(withState.filter((x) => x.issue.endDate));
  let showResolved = $state(false);

  const STATUS_TONE: Record<string, string> = {
    worse: 'text-danger', improving: 'text-success', steady: 'text-content-muted', new: 'text-primary', resolved: 'text-success',
  };
  const sevClass = (s: number | undefined) => (s === undefined ? 'bg-surface-elevated text-content-subtle' : s >= 7 ? 'bg-status-risk/15 text-status-risk' : s >= 4 ? 'bg-status-caution/15 text-status-caution' : 'bg-surface-elevated text-content-muted');
</script>

<div class="card space-y-4">
  <div class="px-1">
    <h3 class="text-section uppercase text-content-muted">Pain &amp; injuries</h3>
    <p class="text-caption text-content-subtle mt-0.5">{open.length ? `${open.length} open` : 'Nothing open'}{resolved.length ? ` · ${resolved.length} resolved` : ''}</p>
  </div>

  {#if open.length}
    <div class="divide-y divide-border">
      {#each open as { issue, st } (issue.id)}
        <button onclick={() => openPainIssue(issue.id)} class="w-full flex items-center gap-3 py-2.5 text-left group">
          <span class="shrink-0 w-8 text-center py-1 rounded-control text-caption font-bold tabular-nums {sevClass(st.severity)}">{st.severity ?? '–'}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-body font-semibold text-content truncate group-hover:text-primary">{issue.bodyPart}</span>
            <span class="block text-caption text-content-subtle truncate">
              <span class={STATUS_TONE[st.status]}>{STATUS_LABELS[st.status]}</span> · {st.durationDays + 1} day{st.durationDays === 0 ? '' : 's'} · checked {st.daysSinceCheckIn === 0 ? 'today' : `${st.daysSinceCheckIn} d ago`}
            </span>
          </span>
          <Icon icon="ic:baseline-chevron-right" class="text-lg text-content-subtle shrink-0" />
        </button>
      {/each}
    </div>
  {/if}

  <button onclick={openPainReport} class="w-full py-3 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control flex items-center justify-center gap-1.5">
    <Icon icon="ic:baseline-plus" class="text-base" /> New pain issue
  </button>

  {#if resolved.length}
    <div class="pt-1 border-t border-border">
      <button onclick={() => showResolved = !showResolved} class="w-full flex items-center justify-between py-2 text-left">
        <span class="text-label text-content-subtle">Resolved · {resolved.length}</span>
        <Icon icon={showResolved ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-lg text-content-subtle" />
      </button>
      {#if showResolved}
        <div class="divide-y divide-border">
          {#each resolved as { issue, st } (issue.id)}
            <button onclick={() => openPainIssue(issue.id)} class="w-full flex items-center gap-3 py-2 text-left">
              <span class="min-w-0 flex-1">
                <span class="block text-label text-content truncate">{issue.bodyPart}</span>
                <span class="block text-caption text-content-subtle tabular-nums">{formatDate(issue.startDate)} – {formatDate(issue.endDate!)}{issue.endEstimated ? ' (est.)' : ''} · {st.durationDays + 1} d · peak {st.peak}</span>
              </span>
              <Icon icon="ic:baseline-chevron-right" class="text-lg text-content-subtle shrink-0" />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
