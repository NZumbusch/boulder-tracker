<script lang="ts">
  /**
   * "Still there?" - on Home while an open pain issue hasn't had a check-in
   * today (Settings -> Pain check-ins). One tap answers; "Gone" closes it.
   * An issue quiet for longer than the stale limit is asked about
   * differently: still an issue, or close it? "Not today" hides the card
   * until tomorrow, on this device only.
   */
  import { trainingState } from '../../../lib/state.svelte';
    import { dueToday, issueState } from '../../../lib/pain/issues';
  import { openPainIssue } from '../../../lib/pain/painUi.svelte';
  import PainCheckInButtons from '../../health/PainCheckInButtons.svelte';
  import Icon from '@iconify/svelte';

  const DISMISS_KEY = 'boulder_tracker_pain_card_dismissed';
  const today = trainingState.todayIso;
  let dismissed = $state(readDismissed());
  function readDismissed(): boolean {
    try { return localStorage.getItem(DISMISS_KEY) === today; } catch { return false; }
  }
  function dismiss() {
    dismissed = true;
    try { localStorage.setItem(DISMISS_KEY, today); } catch { /* shown again next launch */ }
  }

  const due = $derived(
    dueToday(trainingState.painIssues, trainingState.painLogs, today).map((issue) => {
      const st = issueState(issue, trainingState.painLogs, today);
      return { issue, st, stale: st.daysSinceCheckIn >= trainingState.painCheckIns.staleDays };
    }),
  );
  const show = $derived(trainingState.painCheckIns.home && !dismissed && due.length > 0);
</script>

{#if show}
  <div class="card space-y-3 animate-in fade-in">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="text-section uppercase text-content-muted">Pain check-in</h3>
        <p class="text-caption text-content-subtle">A tap keeps each issue's course - and when it ended - straight.</p>
      </div>
      <button onclick={dismiss} class="shrink-0 text-caption text-content-subtle hover:text-content px-2 py-1">Not today</button>
    </div>
    {#each due as { issue, st, stale } (issue.id)}
      <div class="space-y-2">
        <button onclick={() => openPainIssue(issue.id)} class="w-full text-left flex items-center gap-1.5 min-w-0">
          <span class="text-body font-semibold text-content truncate">{issue.bodyPart}</span>
          <span class="text-caption text-content-subtle shrink-0 tabular-nums">
            {st.severity !== undefined ? `${st.severity}/10 · ` : ''}{stale ? `no check-in for ${st.daysSinceCheckIn} days` : `day ${st.durationDays + 1}`}
          </span>
          <Icon icon="ic:baseline-chevron-right" class="text-base text-content-subtle shrink-0 ml-auto" />
        </button>
        {#if stale}
          <p class="text-caption text-content-muted">Still an issue, or can it be closed?</p>
        {/if}
        <PainCheckInButtons onPick={(trend) => trainingState.checkInPain(issue.id, trend)} />
      </div>
    {/each}
  </div>
{/if}
