<script lang="ts">
  /**
   * What gets included in an AI prompt's condensed training profile - a separate privacy decision from "does the
   * AI have enough context", since these prompts are copy/pasted into an
   * external AI chat by the user themselves (`AICoachModal.svelte`), not
   * sent anywhere by this app directly. Each category is independently
   * togglable; a disabled one is simply omitted from the generated prompt,
   * never sent-but-redacted (`src/lib/ai/context.ts`).
   *
   * Placed under Settings' "Connections & Exports" page, next to the calendar
   * export - the app's other "what leaves this device" surface - rather
   * than a new top-level tab, same reasoning as nesting
   * Notifications into Appearance & Behaviour instead of promoting it.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { AISharingPreferences } from '../../lib/preferences/migrate';
  import { buildCoachPromptFor, estimateTokens, formatTokens } from '../../lib/ai/coachPrompt';
  import { getWeekIdRange, incrementWeekId } from '../../lib/dateUtils';
  import AIHistoryPicker from './AIHistoryPicker.svelte';
  import Icon from "@iconify/svelte";

  const CATEGORIES: { id: keyof AISharingPreferences; label: string; description: string }[] = [
    { id: 'trainingBlocks', label: 'Training Blocks', description: 'Active/upcoming phase blocks covering or near the prompt\'s target weeks.' },
    { id: 'competitions', label: 'Goals', description: 'Upcoming competitions and outdoor trips (dates, place, projects) - what you\'re peaking for.' },
    { id: 'readinessMetrics', label: 'Readiness & Daily Metrics', description: 'Current readiness score plus sleep/HRV/RHR/bodyweight trends. Health data - off by default.' },
    { id: 'painLogs', label: 'Pain issues', description: 'Open pain issues and those resolved in the last 90 days, with their course; also lets open pain count in the readiness snapshot. Health data - off by default.' },
    { id: 'outdoorAscents', label: 'Outdoor Ascents', description: 'Recent outdoor grade history.' },
    { id: 'notes', label: 'Block & Week Notes', description: 'Your notes on training blocks, and week notes within four weeks of the prompt\'s weeks.' },
    { id: 'coachNotes', label: 'Coach Notes & About Me', description: 'Your About me, standing goal and the coach notes (Settings → Coach notes) - so you don\'t have to repeat them.' },
  ];

  // What the defaults cost: a "Change plan" prompt for the next four weeks,
  // and the context-only one - measured on the real prompts, not estimated.
  const nextFourWeeks = $derived.by(() => {
    let end = trainingState.currentWeekId;
    for (let i = 0; i < 3; i++) end = incrementWeekId(end);
    return getWeekIdRange(trainingState.currentWeekId, end);
  });
  const planTokens = $derived(estimateTokens(buildCoachPromptFor(trainingState, { mode: 'generate', targetWeekIds: nextFourWeeks, goal: '', history: trainingState.aiHistory })));
  const contextTokens = $derived(estimateTokens(buildCoachPromptFor(trainingState, { mode: 'context', targetWeekIds: [], goal: '', history: trainingState.aiHistory })));
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">AI Sharing</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Controls what the AI Coach (Training Plan screen) includes when you copy a prompt. Nothing here leaves this device automatically - the prompt is only ever sent when you paste it into an AI yourself.
    </p>
  </div>

  <div class="divide-y divide-border">
    {#each CATEGORIES as category}
      <label class="flex items-center justify-between gap-3 py-3 cursor-pointer">
        <div class="min-w-0">
          <p class="text-body text-content">{category.label}</p>
          <p class="text-caption text-content-subtle mt-0.5">{category.description}</p>
        </div>
        <input
          type="checkbox"
          checked={trainingState.aiSharing[category.id] !== false}
          onchange={(e) => trainingState.setAiSharing(category.id, e.currentTarget.checked)}
          class="w-5 h-5 rounded accent-primary shrink-0"
        />
      </label>
    {/each}
  </div>

  <div class="space-y-2.5 pt-3 border-t border-border">
    <div>
      <p class="text-body text-content">Training History</p>
      <p class="text-caption text-content-subtle mt-0.5">Recent weeks go session by session; older weeks as one line each (sessions, minutes per category, load, average ratings). The AI Coach can change this per request.</p>
    </div>
    <AIHistoryPicker value={trainingState.aiHistory} onchange={(next) => trainingState.setAiHistory(next)} />
    <p class="text-caption text-content-subtle flex items-center gap-1.5">
      <Icon icon="ic:baseline-straighten" class="text-sm shrink-0" />
      Prompt size now: change plan (next 4 weeks) {formatTokens(planTokens)} · context only {formatTokens(contextTokens)}
    </p>
  </div>

  <div class="flex items-start gap-2 p-3 rounded-control bg-primary/5 border border-primary/20">
    <Icon icon="ic:baseline-info" class="text-primary text-lg shrink-0 mt-0.5" />
    <p class="text-caption text-content-muted leading-relaxed">Exercise catalog, training history, phases and benchmarks are always included - these toggles only cover the categories above.</p>
  </div>
</div>
