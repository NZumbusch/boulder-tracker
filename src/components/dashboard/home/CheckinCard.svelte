<script lang="ts">
  /**
   * The weekly check-in: on and after the chosen day (Settings -> Training
   * model) Home offers one button that opens the AI coach with this week
   * reviewed and next week asked for. "Not this week" hides it until next
   * week. See `lib/home/checkin.ts`.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../../lib/state.svelte';
  import SectionHeader from './SectionHeader.svelte';
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
    <SectionHeader label="Weekly check-in" subtitle="Review how the week went and plan the next one with your AI coach - the prompt carries what you did against the plan." />
    <div class="flex gap-2">
    <button onclick={() => (open = true)} class="btn btn-secondary flex-1">
      <Icon icon="ic:baseline-auto-awesome" class="text-base" />Review week &amp; plan next
    </button>
    <button onclick={putOff} class="btn btn-ghost shrink-0">Not this week</button>
    </div>
  </div>
{/if}

{#if open}
  {#await import('../../plan/AICoachModal.svelte') then { default: AICoachModal }}
    <AICoachModal preset="checkin" onClose={closed} />
  {/await}
{/if}
