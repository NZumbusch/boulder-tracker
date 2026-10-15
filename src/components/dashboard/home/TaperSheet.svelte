<script lang="ts">
  /**
   * The taper towards a goal: for each of the last weeks before it, the load
   * a taper would aim for (the volume eases off, the intensity stays), set
   * against what the plan holds and what has been done. A plan that piles
   * load on just before the event is marked, and the AI can be asked to
   * ease it off. See `lib/goals/taper.ts`.
   */
  import Icon from '@iconify/svelte';
  import Sheet from '../../ui/Sheet.svelte';
  import { trainingState } from '../../../lib/state.svelte';
  import { taperView } from '../../../lib/goals/taperView.svelte';
  import { baseLoad, taperPlan } from '../../../lib/goals/taper';
  import { ratingScale } from '../../../lib/analytics/insights';
  import { formatGoalDates } from '../../../lib/goals/goals';
  import { formatWeek } from '../../../lib/dateUtils';

  const close = () => (taperView.goalId = null);

  const goal = $derived(trainingState.goals.find((g) => g.id === taperView.goalId));
  const base = $derived(baseLoad(trainingState.workouts, trainingState.today));
  const plan = $derived(goal ? taperPlan({ goal, asOf: trainingState.today, base, workoutsForWeek: (id) => trainingState.getWorkoutsForWeek(id), scale: ratingScale(trainingState.workouts) }) : undefined);
  const scaleMax = $derived(Math.max(1, ...(plan?.weeks.flatMap((w) => [w.target, (w.done ?? 0) + (w.planned ?? 0)]) ?? [0])));
  const n0 = (v: number) => Math.round(v).toLocaleString();
  const out = (w: number) => (w === 0 ? 'goal week' : `${w} week${w === 1 ? '' : 's'} out`);
  let asking = $state(false);
</script>

{#if goal}
  <Sheet title="Taper for {goal.name}" subtitle="{formatGoalDates(goal)}{plan ? ` · ${plan.daysToGo} day${plan.daysToGo === 1 ? '' : 's'} to go` : ''}" level="nested" onClose={close}>
    {#if !plan}
      <p class="text-body text-content-muted">{base <= 0 ? 'A taper needs a few weeks of training to ease off from - log some sessions first.' : 'This goal has passed.'}</p>
    {:else}
      <p class="text-caption text-content-subtle leading-relaxed">Volume comes down in the last weeks, intensity stays: about 100%, 85%, 65% and then 40% of your usual week ({n0(plan.baseLoad)} load). The bar is what the week adds up to - done plus still planned; the line is the taper.</p>
      <div class="space-y-3">
        {#each plan.weeks as w (w.weekId)}
          {@const total = (w.done ?? 0) + (w.planned ?? 0)}
          <div class="space-y-1">
            <div class="flex items-baseline justify-between gap-2">
              <p class="text-label text-content">{formatWeek(w.weekId, 'short')} <span class="text-content-subtle font-normal">· {out(w.weeksOut)}</span></p>
              <p class="text-caption tabular-nums {w.over ? 'text-status-caution' : 'text-content-subtle'}">{total > 0 ? n0(total) : '–'} <span class="text-content-subtle">of {n0(w.target)}</span></p>
            </div>
            <div class="relative h-2.5 rounded-full bg-surface-elevated overflow-hidden">
              <div class="absolute inset-y-0 left-0 {w.over ? 'bg-status-caution' : 'bg-primary/60'}" style="width: {(total / scaleMax) * 100}%"></div>
              <div class="absolute inset-y-0 w-0.5 bg-content" style="left: {(w.target / scaleMax) * 100}%"></div>
            </div>
            {#if w.over}<p class="text-caption text-status-caution">Heavier than a taper would be.</p>{/if}
          </div>
        {/each}
      </div>
      <p class="text-caption text-content-subtle flex items-center gap-x-3 gap-y-1 flex-wrap">
        <span class="inline-flex items-center gap-1.5"><span class="w-0.5 h-3 bg-content inline-block" aria-hidden="true"></span>Taper target</span>
        <span class="inline-flex items-center gap-1.5"><span class="w-3 h-2 rounded-full bg-primary/60 inline-block" aria-hidden="true"></span>Done plus planned</span>
        <span class="inline-flex items-center gap-1.5"><span class="w-3 h-2 rounded-full bg-status-caution inline-block" aria-hidden="true"></span>Over the target</span>
      </p>
      <p class="text-caption text-content-subtle leading-relaxed">The plan's sessions are counted at the rate your ratings usually run against the plan, so this is an estimate.</p>
    {/if}

    {#snippet footer()}
      {#if plan}
        <button onclick={() => (asking = true)} class="btn btn-primary flex-1"><Icon icon="ic:baseline-auto-awesome" class="text-base" />Have the AI taper the plan</button>
      {/if}
    {/snippet}
  </Sheet>
{/if}

{#if asking && goal}
  {#await import('../../plan/AICoachModal.svelte') then { default: AICoachModal }}
    <AICoachModal taperFor={goal.id} onClose={() => { asking = false; close(); }} />
  {/await}
{/if}
