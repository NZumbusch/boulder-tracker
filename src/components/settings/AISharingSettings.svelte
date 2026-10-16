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
  import { aiSharingOn } from '../../lib/preferences/migrate';
  import { AI_SHARING_CATEGORIES as CATEGORIES, sharingHint } from '../../lib/ai/sharingCategories';
  import { buildCoachPromptFor, estimateTokens, formatTokens } from '../../lib/ai/coachPrompt';
  import { getWeekIdRange, incrementWeekId } from '../../lib/dateUtils';
  import AIPromptTuning from './AIPromptTuning.svelte';
  import { loadCompact } from '../../lib/ai/promptSize';
  import Icon from "@iconify/svelte";
  import Toggle from '../ui/Toggle.svelte';
  import InfoButton from '../common/InfoButton.svelte';
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';


  let compact = $state(loadCompact());

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
