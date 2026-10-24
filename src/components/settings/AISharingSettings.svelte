<script lang="ts">
  /**
   * What gets included in an AI prompt's condensed training profile - a separate privacy decision from "does the
   * AI have enough context", since these prompts are copy/pasted into an
   * external AI chat by the user themselves (`AICoachModal.svelte`), not
   * sent anywhere by this app directly. Each category is independently
   * togglable; a disabled one is simply omitted from the generated prompt,
   * never sent-but-redacted (`src/lib/ai/context.ts`).
   *
   * Placed under Settings' "AI & coach" section, next to the coach notes
   * export - the app's other "what leaves this device" surface - rather
   * than a new top-level tab, same reasoning as nesting
   * Notifications into Appearance & Behaviour instead of promoting it.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { aiFields, aiSharingOn, type AIFields } from '../../lib/preferences/migrate';
  import { AI_FIELD_INFO, fieldCosts } from '../../lib/ai/fieldSwitches';
  import { AI_SHARING_CATEGORIES as CATEGORIES, sharingHint } from '../../lib/ai/sharingCategories';
  import { buildCoachPromptFor, estimateTokens, formatTokens } from '../../lib/ai/coachPrompt';
  import { getWeekIdRange, incrementWeekId } from '../../lib/dateUtils';
  import AIPromptTuning from './AIPromptTuning.svelte';
  import { loadCompact } from '../../lib/ai/promptSize';
  import Icon from "@iconify/svelte";
  import Toggle from '../ui/Toggle.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { AI_OTHER_DETAILS, AI_RECOVERY_DETAILS, buildOtherTrainingContext, buildRecoveryContext } from '../../lib/ai/wellnessContext';
  import InfoButton from '../common/InfoButton.svelte';
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';


  let compact = $state(loadCompact());

  // What each detail level costs on your own data, so the choice is informed.
  const hist = $derived(trainingState.aiHistory);
  const weeks = $derived(Math.min(12, Math.max(1, hist.fullWeeks + hist.summaryWeeks)));
  const hasRecovery = $derived(trainingState.dailyMetrics.length > 0);
  const hasOther = $derived(trainingState.externalActivities.length > 0);
  const recoveryCost = $derived(Object.fromEntries(AI_RECOVERY_DETAILS.map((d) => [d.value, estimateTokens(JSON.stringify(buildRecoveryContext(trainingState.dailyMetrics, trainingState.today, d.value, weeks) ?? ''))])));
  const otherCost = $derived(Object.fromEntries(AI_OTHER_DETAILS.map((d) => [d.value, estimateTokens(JSON.stringify(buildOtherTrainingContext(trainingState.externalActivities, trainingState.today, d.value, hist, trainingState.externalLoadConfig) ?? ''))])));
  const fields = $derived(aiFields(trainingState.aiDetail));
  const costs = $derived(fieldCosts({ activities: trainingState.externalActivities, dailyMetrics: trainingState.dailyMetrics, today: trainingState.today, history: hist, loadConfig: trainingState.externalLoadConfig, recoveryDetail: trainingState.aiDetail.recovery }));
  const setField = (key: keyof AIFields, on: boolean) => trainingState.setAiDetail({ ...trainingState.aiDetail, fields: { ...fields, [key]: on } });
  const costText = (key: keyof AIFields) => {
    const c = costs[key];
    return c.hasData ? `About +${formatTokens(c.tokens)} on your data` : 'Nothing to send yet: no such data in your imports';
  };
  const recoveryOn = $derived(aiSharingOn(trainingState.aiSharing, 'readinessMetrics'));
  const otherOn = $derived(aiSharingOn(trainingState.aiSharing, 'otherTraining'));

  // What the defaults cost: a "Change plan" prompt for the next four weeks,
  // and the context-only one - measured on the real prompts, not estimated.
  const nextFourWeeks = $derived.by(() => {
    let end = trainingState.currentWeekId;
    for (let i = 0; i < 3; i++) end = incrementWeekId(end);
    return getWeekIdRange(trainingState.currentWeekId, end);
  });
  const planTokens = $derived(estimateTokens(buildCoachPromptFor(trainingState, { mode: 'generate', targetWeekIds: nextFourWeeks, goal: '', history: trainingState.aiHistory, compact })));
  const contextTokens = $derived(estimateTokens(buildCoachPromptFor(trainingState, { mode: 'context', targetWeekIds: [], goal: '', history: trainingState.aiHistory, compact })));
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">AI sharing</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Controls what the AI Coach (Training Plan screen) includes in its prompt. Nothing leaves this device automatically: the prompt goes out only when you paste it into an AI yourself - or, if you set up a direct connection, when you confirm "Ask directly" and its cost.
    </p>
  </div>

  <div class="divide-y divide-border">
    {#each CATEGORIES.filter((c) => c.id !== 'phoneCalendar' || deviceCalendar.supported) as category}
      <Toggle
        checked={aiSharingOn(trainingState.aiSharing, category.id)}
        onChange={(v) => trainingState.setAiSharing(category.id, v)}
        label={category.label}
        hint={sharingHint(category.id)}
      />
    {/each}
  </div>

  <div class="space-y-4 pt-3 border-t border-border">
    <div class="space-y-1">
      <h3 class="text-section uppercase text-content-muted px-1">Detail</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">How much of the watch and activity data goes in, once its switch is on. More detail costs more tokens; the numbers are what each level adds on your own data.</p>
    </div>

    <div class="space-y-1.5">
      <p class="text-label font-semibold px-1">Recovery data (sleep, HRV, resting heart rate, Body Battery...)</p>
      {#if !recoveryOn}
        <p class="text-caption text-content-subtle px-1">Off: switch on "Readiness and daily metrics" above to send it.</p>
      {:else if !hasRecovery}
        <p class="text-caption text-content-subtle px-1">No daily values yet - they come from what you log or a Garmin import.</p>
      {/if}
      <Segmented full label="Recovery detail" options={AI_RECOVERY_DETAILS.map((d) => ({ value: d.value, label: d.label }))} value={trainingState.aiDetail.recovery} onChange={(v) => trainingState.setAiDetail({ ...trainingState.aiDetail, recovery: v })} />
      <p class="text-caption text-content-subtle px-1">{AI_RECOVERY_DETAILS.find((d) => d.value === trainingState.aiDetail.recovery)?.hint}{hasRecovery ? `. About ${formatTokens(recoveryCost[trainingState.aiDetail.recovery])}.` : ''}</p>
    </div>

    <div class="space-y-1.5">
      <p class="text-label font-semibold px-1">Other training (runs, rides, walks, workouts)</p>
      {#if !otherOn}
        <p class="text-caption text-content-subtle px-1">Off: switch on "Other training" above to send it.</p>
      {:else if !hasOther}
        <p class="text-caption text-content-subtle px-1">No imported activities yet.</p>
      {/if}
      <Segmented full label="Other training detail" options={AI_OTHER_DETAILS.map((d) => ({ value: d.value, label: d.label }))} value={trainingState.aiDetail.otherTraining} onChange={(v) => trainingState.setAiDetail({ ...trainingState.aiDetail, otherTraining: v })} />
      <p class="text-caption text-content-subtle px-1">{AI_OTHER_DETAILS.find((d) => d.value === trainingState.aiDetail.otherTraining)?.hint}{hasOther ? `. About ${formatTokens(otherCost[trainingState.aiDetail.otherTraining])}.` : ''}</p>
    </div>
  </div>

  <div class="space-y-2 pt-3 border-t border-border">
    <div class="space-y-1">
      <h3 class="text-section uppercase text-content-muted px-1">Watch detail</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Switch single kinds of detail on or off. The first four go in with each activity when "Other training detail" is "Every activity"; the last three go in with the recovery data. The cost is measured on your own data, and the prompt size below follows as you switch.</p>
    </div>
    <div class="divide-y divide-border">
      {#each AI_FIELD_INFO as info (info.key)}
        <Toggle checked={fields[info.key]} onChange={(v) => setField(info.key, v)} label={info.label} hint={`${info.hint} ${costText(info.key)}${info.section === 'activity' && trainingState.aiDetail.otherTraining !== 'list' ? ' (only when activities are listed one by one)' : ''}.`} />
      {/each}
    </div>
  </div>

  <div class="space-y-3 pt-3 border-t border-border">
    <AIPromptTuning bind:compact />
    <p class="text-caption text-content-subtle flex items-center gap-1.5">
      <Icon icon="ic:baseline-straighten" class="text-sm shrink-0" />
      Prompt size now: change plan (next 4 weeks) {formatTokens(planTokens)}, context only {formatTokens(contextTokens)} <InfoButton term="tokens" />
    </p>
    <p class="text-caption text-content-subtle">The AI Coach has a tune icon that opens these same two settings, so you can change them there too.</p>
  </div>

  <div class="flex items-start gap-2 p-3 rounded-control bg-surface-elevated/50">
    <Icon icon="ic:baseline-info" class="text-content-muted text-lg shrink-0 mt-0.5" />
    <p class="text-caption text-content-muted leading-relaxed">Exercise catalog, training history, phases and test results are always included - these switches only cover the categories above.</p>
  </div>
</div>
