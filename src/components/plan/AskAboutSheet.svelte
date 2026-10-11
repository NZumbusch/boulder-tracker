<script lang="ts">
  /**
   * "Ask the AI about this": a short prompt about one group of Insights or
   * one session. Copy it into any chat, or - with a direct connection set up
   * - send it from here and read the answer below. Nothing comes back into
   * the app's data: it is a question, not a plan change.
   */
  import Icon from '@iconify/svelte';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { askAbout } from '../../lib/ai/askAbout.svelte';
  import { buildInsights, INSIGHT_GROUPS } from '../../lib/analytics/insights';
  import { buildSinceLastPlan } from '../../lib/ai/sinceLastPlan';
  import { loadChangeLog } from '../../lib/ai/changeLog';
  import { renderCoachMemory } from '../../lib/ai/coachNotes';
  import { workoutNoteSharing } from '../../lib/ai/context';
  import { buildBlockAskPrompt, buildInsightAskPrompt, buildSessionAskPrompt, DEFAULT_BLOCK_QUESTION, DEFAULT_INSIGHT_QUESTION, DEFAULT_SESSION_QUESTION } from '../../lib/ai/askPrompt';
  import { blockInputsFrom } from '../../lib/analytics/insights';
  import { blockReviewLines, buildBlockReview } from '../../lib/analytics/blockReview';
  import { estimateTokens, formatTokens } from '../../lib/ai/coachPrompt';
  import { loadConfig, loadKey } from '../../lib/ai/direct/store';
  import { modelInfo, providerInfo } from '../../lib/ai/direct/providers';
  import { estimateCost, formatUsd } from '../../lib/ai/direct/cost';
  import AiSendSheet from './AiSendSheet.svelte';

  const subject = $derived(askAbout.subject);
  const close = () => (askAbout.subject = null);
  backWhile(() => askAbout.subject !== null, close);

  let question = $state('');
  let copied = $state(false);
  let reply = $state('');
  let replyInfo = $state('');
  let sendOpen = $state(false);
  let lastKey = '';
  // A new subject starts from its own default question.
  $effect(() => {
    const key = subject ? JSON.stringify(subject) : '';
    if (key === lastKey) return;
    lastKey = key;
    question = subject ? (subject.kind === 'insights' ? DEFAULT_INSIGHT_QUESTION : subject.kind === 'block' ? DEFAULT_BLOCK_QUESTION : DEFAULT_SESSION_QUESTION) : '';
    copied = false;
    reply = '';
    replyInfo = '';
  });

  const title = $derived.by(() => {
    if (!subject) return '';
    if (subject.kind === 'insights') return INSIGHT_GROUPS.find((g) => g.id === subject.group)?.label ?? 'Insights';
    if (subject.kind === 'block') return trainingState.trainingBlocks.find((b) => b.id === subject.blockId)?.name ?? 'This block';
    return trainingState.getWorkoutById(subject.workoutId)?.notes || 'This session';
  });

  const prompt = $derived.by(() => {
    if (!subject) return '';
    const sharing = trainingState.aiSharing;
    const coachMemory = sharing.coachNotes !== false ? renderCoachMemory(trainingState.athleteProfile, trainingState.coachNotes ?? [], trainingState.analyticsCategories) : '';
    if (subject.kind === 'insights') {
      const inputs = trainingState.insightInputs();
      const group = INSIGHT_GROUPS.find((g) => g.id === subject.group);
      const findings = buildInsights(inputs).filter((i) => i.group === subject.group);
      const sinceLast = buildSinceLastPlan({ inputs, changeLog: loadChangeLog(), share: { readinessMetrics: sharing.readinessMetrics, outdoorAscents: sharing.outdoorAscents } });
      return buildInsightAskPrompt({ groupLabel: group?.label ?? '', findings, sinceLast, coachMemory, question });
    }
    if (subject.kind === 'block') {
      const block = trainingState.trainingBlocks.find((b) => b.id === subject.blockId);
      const inputs = trainingState.insightInputs();
      const review = block ? buildBlockReview(blockInputsFrom(inputs, block)) : undefined;
      if (!review) return '';
      const sinceLast = buildSinceLastPlan({ inputs, changeLog: loadChangeLog(), share: { readinessMetrics: sharing.readinessMetrics, outdoorAscents: sharing.outdoorAscents } });
      return buildBlockAskPrompt({ reviewLines: blockReviewLines(review), sinceLast, coachMemory, question });
    }
    const workout = trainingState.getWorkoutById(subject.workoutId);
    if (!workout) return '';
    const before = trainingState.completedWorkouts
      .filter((w) => w.id !== workout.id && w.date && (!workout.date || w.date < workout.date))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 3)
      .reverse();
    return buildSessionAskPrompt({ workout, before, exerciseTypes: trainingState.exerciseTypes, noteSharing: workoutNoteSharing(sharing), coachMemory, question });
  });
  const tokens = $derived(estimateTokens(prompt));

  const direct = loadConfig();
  const directReady = !!loadKey(direct.provider);
  const service = providerInfo(direct.provider).label.split(' (')[0];
  const price = $derived.by(() => {
    const listed = modelInfo(direct.provider, direct.model);
    const rates = direct.priceOverride ?? (listed ? { inputPerM: listed.inputPerM, outputPerM: listed.outputPerM } : undefined);
    return rates ? estimateCost({ ...rates, long: direct.priceOverride ? undefined : listed?.long }, tokens, 1500) : undefined;
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
    } catch {
      copied = false;
    }
  }
  async function copyReply() {
    try { await navigator.clipboard.writeText(reply); } catch { /* the text is on screen */ }
  }
</script>

{#if subject}
  <div class="fixed inset-0 z-[150] pb-safe bg-app-bg/90 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-150">
    <div class="absolute inset-0" role="presentation" onclick={close}></div>
    <div class="relative bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={close} role="dialog" aria-modal="true" aria-label="Ask the AI about this">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-title text-content">Ask the AI</h3>
          <p class="text-caption text-content-subtle truncate">About: {title}</p>
        </div>
        <button onclick={close} class="text-content-subtle hover:text-content shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
      </div>

      {#if reply}
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-label text-content-subtle">Answer{replyInfo ? ` · ${replyInfo}` : ''}</p>
            <button onclick={copyReply} class="chip text-content-subtle hover:text-content"><Icon icon="ic:baseline-content-copy" class="text-sm" />Copy</button>
          </div>
          <div class="rounded-card bg-surface-elevated/50 border border-border p-3.5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-body text-content leading-relaxed">{reply}</div>
        </div>
      {/if}

      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle px-1 block">Your question</span>
        <textarea bind:value={question} rows="3" class="w-full p-3.5 bg-surface-elevated border border-border-strong rounded-card text-body text-content outline-none focus:border-primary/40 resize-y"></textarea>
      </label>
      <p class="text-caption text-content-subtle px-1">The prompt carries the findings or the session, your coaching memory and the last weeks' digest · {formatTokens(tokens)}</p>

      {#if copied}
        <p class="text-body text-content flex items-center gap-2"><Icon icon="ic:baseline-check-circle" class="text-xl text-success shrink-0" />Copied. Paste it into any AI chat.</p>
      {/if}

      <div class="space-y-2">
        <button onclick={copy} disabled={!prompt} class="w-full py-3 bg-primary text-white text-label font-bold rounded-control flex items-center justify-center gap-1.5 disabled:opacity-40">
          <Icon icon="ic:baseline-content-copy" class="text-base" />{copied ? 'Copy again' : 'Copy prompt'}
        </button>
        {#if directReady}
          <button onclick={() => (sendOpen = true)} disabled={!prompt} class="w-full py-3 border border-border-strong rounded-control text-label font-bold text-content flex items-center justify-center gap-1.5 disabled:opacity-40">
            <Icon icon="ic:baseline-bolt" class="text-base text-status-caution" />Ask {service} directly{price ? ` · about ${formatUsd(price.typicalUsd)}` : ''}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if sendOpen}
  <AiSendSheet {prompt} onReply={(text, info) => { reply = text; replyInfo = info.cost !== undefined ? `cost about ${formatUsd(info.cost)}` : info.model; sendOpen = false; }} onClose={() => (sendOpen = false)} />
{/if}
