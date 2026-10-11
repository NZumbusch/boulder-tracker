<script lang="ts">
  /**
   * The weekly check-in: on and after the chosen day (Settings -> Training
   * model) Home offers one button that opens the AI coach with this week
   * reviewed and next week asked for. "Not this week" hides it until next
   * week. See `lib/home/checkin.ts`.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../../lib/state.svelte';
  import { checkinDue, loadCheckinDone, markCheckinDone } from '../../../lib/home/checkin';

  let doneWeek = $state(loadCheckinDone());
  let open = $state(false);
  const hasSessions = $derived(trainingState.completedWorkouts.length > 0);
  const show = $derived(checkinDue(trainingState.today, trainingState.tunable('checkin.day'), doneWeek, hasSessions));

  function putOff() {
    doneWeek = trainingState.currentWeekId;
    markCheckinDone(doneWeek);
  }
  function closed() {
    open = false;
    doneWeek = loadCheckinDone();
  }
</script>

{#if show}
  <div class="card space-y-3 animate-in fade-in" data-tour="home-checkin">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="text-section uppercase text-content-muted">Weekly check-in</h3>
        <p class="text-caption text-content-subtle leading-relaxed">Review how the week went and plan the next one with your AI coach - the prompt carries what you did against the plan.</p>
      </div>
      <button onclick={putOff} class="shrink-0 text-caption text-content-subtle hover:text-content px-2 py-1">Not this week</button>
    </div>
    <button onclick={() => (open = true)} class="w-full py-2.5 bg-primary text-white text-label font-semibold rounded-control flex items-center justify-center gap-1.5">
      <Icon icon="ic:baseline-auto-awesome" class="text-base" />Review week &amp; plan next
    </button>
  </div>
{/if}

{#if open}
  {#await import('../../plan/AICoachModal.svelte') then { default: AICoachModal }}
    <AICoachModal preset="checkin" onClose={closed} />
  {/await}
{/if}
