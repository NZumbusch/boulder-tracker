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
  import type { AISharingPreferences } from '../../lib/preferences/migrate';
  import { buildCoachPromptFor, estimateTokens, formatTokens } from '../../lib/ai/coachPrompt';
  import { getWeekIdRange, incrementWeekId } from '../../lib/dateUtils';
  import AIPromptTuning from './AIPromptTuning.svelte';
  import { loadCompact } from '../../lib/ai/promptSize';
  import Icon from "@iconify/svelte";
  import Toggle from '../ui/Toggle.svelte';
  import InfoButton from '../common/InfoButton.svelte';
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';

  const CATEGORIES: { id: keyof AISharingPreferences; label: string; description: string }[] = [
    { id: 'trainingBlocks', label: 'Training blocks', description: 'Active/upcoming phase blocks covering or near the prompt\'s target weeks.' },
    { id: 'competitions', label: 'Goals', description: 'Upcoming competitions and outdoor trips (dates, place, projects), what you\'re peaking for.' },
    { id: 'places', label: 'Places', description: 'Where you train - names, kind, price, opening hours and notes (never the coordinates), so the coach can place sessions. On by default.' },
    { id: 'phoneCalendar', label: 'Phone calendar', description: 'The titles and times of your phone calendar\'s events in the weeks the coach plans (never where, notes or guests), so it plans around them. Android app with the phone calendar switched on. Off by default - titles can be private.' },
    { id: 'readinessMetrics', label: 'Readiness and daily metrics', description: 'Current readiness score plus sleep/HRV/RHR/bodyweight trends. Health data - off by default.' },
    { id: 'painLogs', label: 'Pain issues', description: 'Open pain issues and those resolved in the last 90 days, with their course; also lets open pain count in the readiness snapshot. Health data - off by default.' },
    { id: 'outdoorAscents', label: 'Outdoor ascents', description: 'Recent outdoor grade history.' },
    { id: 'notes', label: 'Block and week notes', description: 'Your notes on training blocks, and week notes within four weeks of the prompt\'s weeks.' },
    { id: 'sessionNotes', label: 'Session notes (how it went)', description: 'The note you write when you finish a session, sent with your recent sessions.' },
    { id: 'planNotesInHistory', label: 'Plan notes on past sessions', description: 'The session note written beforehand (goals, cues) for sessions you have already done. Off by default - it is usually stale once you have logged what happened.' },
    { id: 'coachNotes', label: 'Coach notes and about me', description: 'Your About me, standing goal and the coach notes (Settings → Coach notes) - so you don\'t have to repeat them.' },
  ];

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
        checked={category.id === 'planNotesInHistory' || category.id === 'phoneCalendar' ? trainingState.aiSharing[category.id] === true : trainingState.aiSharing[category.id] !== false}
        onChange={(v) => trainingState.setAiSharing(category.id, v)}
        label={category.label}
        hint={category.description}
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
