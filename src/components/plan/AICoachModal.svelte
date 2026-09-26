<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * The plan's one AI entry point, full screen like the session's "Ask AI".
   *
   * - Change plan: three steps - ask (timeframe + goal, copy the prompt),
   *   paste the reply, review every change with a tick box and apply. Used
   *   to be two separate buttons (prompt / import) with nothing tying them
   *   together.
   * - Analyze and Context only produce a prompt: the answer is read in the
   *   chat, so they're one screen with a copy button, not steps.
   *
   * Prompt text lives in `lib/ai/coachPrompt.ts`; the review is the change
   * planner (`planWithSelection`): unticking something re-plans the rest,
   * and anything that relied on it is unticked too, with the reason shown.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekIdRange } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import type { AIPromptMode } from '../../lib/ai/context';
  import { buildCoachPromptFor, estimateTokens, formatTokens } from '../../lib/ai/coachPrompt';
  import type { AIHistoryWindow } from '../../lib/preferences/migrate';
  import AIHistoryPicker from '../settings/AIHistoryPicker.svelte';
  import { parsePlanImport } from '../../lib/ai/planImportEntry';
  import { planWithSelection, allItemIds, type ChangeItem, type ChangeSection } from '../../lib/ai/changePlanner';
  import { groupIssues, formatIssuesForAI } from '../../lib/ai/issueSummary';
  import Icon from '@iconify/svelte';

  let { onClose }: { onClose: () => void } = $props();

  let mode = $state<AIPromptMode>('generate');
  let step = $state<'ask' | 'paste' | 'review'>('ask');
  let startWeek = $state(trainingState.currentWeekId);
  let endWeek = $state(trainingState.currentWeekId);
  let goal = $state('');
  /** Analyze/Context: the prompt is on the clipboard - show the "now paste it" note. */
  let copiedFor = $state<AIPromptMode | null>(null);
  /** Change plan: brief "Copied" feedback on the paste step's copy button. */
  let copiedAgain = $state(false);
  /** Whether the prompt was copied this time - "I have a reply" skips straight to pasting. */
  let promptCopied = $state(false);

  const MODES: { id: AIPromptMode; label: string; title: string }[] = [
    { id: 'generate', label: 'Change plan', title: 'Change your plan' },
    { id: 'analyze', label: 'Analyze', title: 'Analyze past training' },
    { id: 'context', label: 'Context', title: 'Share your context' },
  ];
  const STEPS = [
    { id: 'ask', label: 'Ask' },
    { id: 'paste', label: 'Paste' },
    { id: 'review', label: 'Review' },
  ] as const;
  const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));

  const weekOptions = $derived.by(() => {
    const opts = [];
    for (let i = -5; i <= 24; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i * 7);
      const id = getWeekId(d);
      opts.push({ id, label: `Week ${id.split('-W')[1]} (${d.getUTCFullYear()})` + (i === 0 ? ' · this week' : '') });
    }
    return opts;
  });
  const rangeValid = $derived(startWeek <= endWeek);
  const selectedWeekIds = $derived(rangeValid ? getWeekIdRange(startWeek, endWeek) : []);

  function setMode(next: AIPromptMode) {
    mode = next;
    copiedFor = null;
  }

  /** How much history this request sends - starts from the Settings default. */
  let history = $state<AIHistoryWindow>({ ...trainingState.aiHistory });
  let showHistory = $state(false);
  const historyIsDefault = $derived(
    history.fullWeeks === trainingState.aiHistory.fullWeeks && history.summaryWeeks === trainingState.aiHistory.summaryWeeks,
  );

  /** The prompt exactly as it will be copied - also what the size shown is measured on. */
  const prompt = $derived(buildCoachPromptFor(trainingState, { mode, targetWeekIds: selectedWeekIds, goal, history }));
  const tokens = $derived(estimateTokens(prompt));

  async function copyPrompt() {
    if (mode !== 'context' && !rangeValid) return;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch (err: any) {
      await showAlert('Copy failed', 'Your browser blocked the clipboard: ' + (err?.message ?? 'unknown error'));
      return;
    }
    if (mode === 'generate') {
      promptCopied = true;
      step = 'paste';
      copiedAgain = true;
      setTimeout(() => (copiedAgain = false), 2000);
    } else {
      copiedFor = mode;
    }
  }

  // --- Undo the last applied AI change ---
  let lastAiChange = $state<{ source: 'ai' | 'copy'; appliedAt: string; changedSince: boolean } | null>(null);
  $effect(() => {
    trainingState.planUndoVersion;
    trainingState.getPlanUndo().then((u) => (lastAiChange = u));
  });

  // --- Paste & review (Change plan) ---

  let pasteText = $state('');
  let applying = $state(false);
  let copiedErrors = $state(false);
  let showRepairs = $state(false);

  const parsed = $derived(
    pasteText.trim() ? parsePlanImport(pasteText, { exerciseTypes: trainingState.exerciseTypes, phaseDefs: trainingState.phaseDefs }) : null,
  );
  const changeSet = $derived(parsed?.result.valid ? parsed.result.data : null);
  const issues = $derived(parsed?.result.issues ?? []);
  const repairs = $derived(parsed?.result.repairs ?? []);
  const issueGroups = $derived(groupIssues(issues));

  // What's ticked. Reset to "everything" only when a new reply is pasted -
  // not when the change set is merely re-derived after a data change.
  let requested = $state<Set<string>>(new Set());
  let tickedFor = '';
  $effect(() => {
    if (pasteText === tickedFor) return;
    tickedFor = pasteText;
    requested = changeSet ? allItemIds(changeSet) : new Set();
  });
  const plan = $derived(changeSet ? planWithSelection(changeSet, trainingState.plannerState, requested) : null);
  const canReview = $derived(!!plan && plan.items.length > 0);
  const appliedCount = $derived(plan?.selected.size ?? 0);

  const SECTIONS: { id: ChangeSection; label: string; icon: string }[] = [
    { id: 'exercise', label: 'Exercises', icon: 'ic:baseline-fitness-center' },
    { id: 'phase', label: 'Phases', icon: 'ic:baseline-view-week' },
    { id: 'week', label: 'Weeks', icon: 'ic:baseline-calendar-month' },
  ];

  function toggle(id: string) {
    const next = new Set(requested);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    requested = next;
  }

  /** Why a ticked item didn't make it: its own errors, or an unticked change it needs. */
  function blockedReason(item: ChangeItem): string | undefined {
    if (!plan || !requested.has(item.id) || plan.selected.has(item.id)) return undefined;
    if (item.errors.length) return item.errors.join(' ');
    const missing = item.dependsOn.filter((d) => !plan.selected.has(d));
    const titles = missing.map((d) => plan.items.find((i) => i.id === d)?.title ?? d);
    return titles.length ? `Needs ${titles.join(', ')}, which isn't being applied.` : undefined;
  }

  // A clean paste goes straight to review.
  function handlePaste() {
    setTimeout(() => { if (canReview) step = 'review'; }, 0);
  }

  async function copyFixRequest() {
    await navigator.clipboard.writeText(formatIssuesForAI(issues));
    copiedErrors = true;
    setTimeout(() => (copiedErrors = false), 2000);
  }

  async function apply() {
    if (!changeSet || !plan || appliedCount === 0) return;
    applying = true;
    try {
      // Re-plan once more for the final writes, so ids are fresh and nothing stale is applied.
      const final = planWithSelection(changeSet, trainingState.plannerState, plan.selected);
      await trainingState.applyPlanWrites(final.writes);
      onClose();
    } catch (err: any) {
      await showAlert('Apply failed', err?.message || 'Something went wrong applying the changes.');
    } finally {
      applying = false;
    }
  }

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onClose());
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

{#snippet stepper()}
  <ol class="flex items-center gap-2">
    {#each STEPS as s, i}
      <li class="flex-1 flex items-center gap-1.5 min-w-0">
        <span class="shrink-0 w-5 h-5 rounded-full grid place-items-center text-caption font-bold {i < stepIndex ? 'bg-success/15 text-success' : i === stepIndex ? 'bg-primary text-white' : 'bg-surface-elevated text-content-subtle'}">
          {#if i < stepIndex}<Icon icon="ic:baseline-check" class="text-xs" />{:else}{i + 1}{/if}
        </span>
        <span class="text-caption truncate {i === stepIndex ? 'text-content font-bold' : 'text-content-subtle'}">{s.label}</span>
        {#if i < STEPS.length - 1}<span class="flex-1 h-px bg-border"></span>{/if}
      </li>
    {/each}
  </ol>
{/snippet}

<div class="fixed inset-0 z-[130] safe-y bg-app-bg flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="AI Coach">
  <header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 space-y-3">
      <div class="flex items-start gap-3">
        <button onclick={onClose} class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
          <Icon icon="ic:baseline-close" class="text-2xl" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-caption uppercase text-primary flex items-center gap-1">
            <Icon icon="ic:baseline-auto-awesome" class="text-sm" /> AI Coach
          </p>
          <h2 class="text-title text-content">{MODES.find((m) => m.id === mode)?.title}</h2>
        </div>
      </div>
      {#if step === 'ask'}
        <div class="flex bg-surface-elevated/50 p-1 rounded-control">
          {#each MODES as m}
            <button
              onclick={() => setMode(m.id)}
              class="flex-1 py-2 text-label rounded-control transition-all {mode === m.id ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
            >{m.label}</button>
          {/each}
        </div>
      {/if}
      {#if mode === 'generate'}{@render stepper()}{/if}
    </div>
  </header>

  <div class="flex-1 overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full px-4 py-4 pb-32 space-y-4">
      {#if step === 'ask'}
        {#if mode === 'context'}
          <div class="p-3.5 bg-surface/40 border border-border rounded-card space-y-1.5">
            <p class="text-body text-content">Just your training profile, with no question attached.</p>
            <p class="text-caption text-content-subtle leading-relaxed">Paste it into any AI chat first, then ask it whatever you like. It knows your exercises, recent sessions, benchmarks, goals and anything else you share.</p>
          </div>
        {:else}
          <div class="p-3.5 bg-surface/40 border border-border rounded-card space-y-2.5">
            <p class="text-label text-content-subtle flex items-center justify-between">
              <span>{mode === 'generate' ? 'Weeks the AI may change' : 'Weeks to analyze'}</span>
              {#if rangeValid}<span class="text-caption tabular-nums">{selectedWeekIds.length} week{selectedWeekIds.length === 1 ? '' : 's'}</span>{/if}
            </p>
            <div class="grid grid-cols-2 gap-2">
              <label class="space-y-1 min-w-0">
                <span class="text-caption text-content-subtle block">From</span>
                <select bind:value={startWeek} class="w-full bg-surface-elevated text-content px-3 py-2 rounded-control border border-border-strong outline-none text-label">
                  {#each weekOptions as opt}<option value={opt.id}>{opt.label}</option>{/each}
                </select>
              </label>
              <label class="space-y-1 min-w-0">
                <span class="text-caption text-content-subtle block">To</span>
                <select bind:value={endWeek} class="w-full bg-surface-elevated text-content px-3 py-2 rounded-control border border-border-strong outline-none text-label">
                  {#each weekOptions as opt}<option value={opt.id}>{opt.label}</option>{/each}
                </select>
              </label>
            </div>
            {#if !rangeValid}
              <p class="text-caption text-danger flex items-center gap-1"><Icon icon="ic:baseline-error-outline" class="text-sm" /> "From" has to be before "To".</p>
            {/if}
          </div>

          <label class="block space-y-1.5">
            <span class="text-label text-content-subtle px-1 block">{mode === 'generate' ? 'What do you want?' : 'What were you going for?'}</span>
            <textarea
              bind:value={goal}
              rows="4"
              placeholder={mode === 'generate'
                ? 'e.g. Font trip in 4 weeks - build power endurance and slopers. Or: swap Thursday for a rest day next week.'
                : 'e.g. I was building finger strength for a comp - did it work?'}
              class="w-full p-3.5 bg-surface/40 border border-border rounded-card text-body text-content leading-relaxed outline-none focus:border-primary/40 transition-colors resize-y placeholder:text-content-subtle"
            ></textarea>
          </label>

          <p class="text-caption text-content-subtle px-1 leading-relaxed">
            {#if mode === 'generate'}
              The AI sees your phases' typical weeks and these weeks, and can change anything from the whole plan to one exercise. Its reply comes back here, and you review every change before anything is applied.
            {:else}
              The AI replies with feedback to read in the chat. Nothing comes back into the app.
            {/if}
          </p>
        {/if}

        {#if copiedFor === mode}
          <div class="p-3.5 bg-success/10 border border-success/30 rounded-card flex items-start gap-3 animate-in fade-in duration-200">
            <Icon icon="ic:baseline-check-circle" class="text-xl text-success shrink-0" />
            <p class="text-body text-content">Copied. Paste it into any AI chat{mode === 'context' ? ', then ask your question' : ''}.</p>
          </div>
        {/if}

        <!-- What history goes along, and what that costs in prompt size. -->
        <div class="bg-surface/40 border border-border rounded-card">
          <button
            onclick={() => showHistory = !showHistory}
            disabled={mode === 'analyze'}
            class="w-full p-3.5 flex items-center gap-3 text-left disabled:cursor-default"
            aria-expanded={showHistory}
          >
            <Icon icon="ic:baseline-history" class="text-xl text-content-subtle shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="text-label text-content block">
                {#if mode === 'analyze'}
                  History: the sessions in the chosen weeks
                {:else}
                  History: {history.fullWeeks} week{history.fullWeeks === 1 ? '' : 's'} in full{history.summaryWeeks ? `, ${history.summaryWeeks} summarized` : ''}
                {/if}
              </span>
              <span class="text-caption text-content-subtle block">Prompt size {formatTokens(tokens)}{!historyIsDefault && mode !== 'analyze' ? ' · changed for this request' : ''}</span>
            </span>
            {#if mode !== 'analyze'}
              <Icon icon="ic:baseline-expand-more" class="text-lg text-content-subtle shrink-0 transition-transform {showHistory ? 'rotate-180' : ''}" />
            {/if}
          </button>
          {#if showHistory && mode !== 'analyze'}
            <div class="px-3.5 pb-3.5 space-y-2.5 animate-in fade-in duration-150">
              <AIHistoryPicker value={history} onchange={(next) => history = next} />
              <p class="text-caption text-content-subtle leading-relaxed">
                Recent weeks go session by session; older weeks as one line each (sessions, minutes per category, load, average ratings).
              </p>
              {#if !historyIsDefault}
                <div class="flex items-center gap-3">
                  <button onclick={() => history = { ...trainingState.aiHistory }} class="text-label text-content-subtle hover:text-content">Reset</button>
                  <button onclick={() => trainingState.setAiHistory(history)} class="text-label text-primary hover:underline">Make this my default</button>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        {#if mode === 'generate' && lastAiChange?.source === 'ai'}
          <div class="p-3.5 bg-surface/40 border border-border rounded-card flex items-center gap-3">
            <Icon icon="ic:baseline-history" class="text-xl text-content-subtle shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-label text-content">Last AI change</p>
              <p class="text-caption text-content-subtle">
                Applied {new Date(lastAiChange.appliedAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{lastAiChange.changedSince ? ' · edited since' : ''}
              </p>
            </div>
            <button onclick={() => trainingState.undoPlanChange()} class="shrink-0 px-3 py-1.5 text-label font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-control transition-colors">
              Undo
            </button>
          </div>
        {/if}

        <p class="text-caption text-content-subtle px-1 flex items-start gap-1.5">
          <Icon icon="ic:baseline-info" class="text-sm shrink-0 mt-px" />
          What's shared (blocks, readiness, pain logs…) is set in Settings → Data & Exports → AI Sharing.
        </p>

      {:else if step === 'paste'}
        <div class="p-3.5 bg-surface/40 border border-border rounded-card flex items-start gap-3">
          <Icon icon="ic:baseline-content-paste-go" class="text-xl text-primary shrink-0 mt-0.5" />
          <div class="min-w-0 flex-1 space-y-1">
            <p class="text-body text-content">{promptCopied ? 'Prompt copied. Paste it into your AI chat and send it.' : 'Paste the reply from your AI chat.'}</p>
            <p class="text-caption text-content-subtle">Then copy the AI's whole reply and paste it below.</p>
          </div>
        </div>

        <textarea
          bind:value={pasteText}
          onpaste={handlePaste}
          rows="8"
          placeholder="Paste the AI's reply here…"
          class="w-full p-3.5 bg-surface-elevated text-content rounded-card border border-border-strong outline-none focus:border-primary/40 text-xs font-mono resize-y"
        ></textarea>

        {#if pasteText.trim() && issues.length > 0}
          <div class="p-3.5 bg-danger/10 border border-danger/30 rounded-card space-y-2.5">
            <div class="flex items-start justify-between gap-3">
              <p class="text-label text-danger flex items-center gap-1.5">
                <Icon icon="ic:baseline-error-outline" class="text-sm" />
                {issueGroups.length} problem{issueGroups.length === 1 ? '' : 's'} in the reply
              </p>
              <button onclick={copyFixRequest} class="shrink-0 text-label text-primary flex items-center gap-1 hover:underline">
                <Icon icon={copiedErrors ? 'ic:baseline-check' : 'ic:baseline-content-copy'} class="text-sm" />
                {copiedErrors ? 'Copied' : 'Copy fix request'}
              </button>
            </div>
            <ul class="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
              {#each issueGroups as group (group.label + group.message)}
                <li class="bg-surface/60 rounded-control px-3 py-2">
                  <span class="block text-body text-content font-medium break-words">{group.label || 'Reply'}{group.count > 1 ? ` ×${group.count}` : ''}</span>
                  <span class="block text-caption text-content-muted leading-snug">{group.message}</span>
                </li>
              {/each}
            </ul>
            <p class="text-caption text-content-subtle leading-snug">"Copy fix request" puts a correction on your clipboard. Send it in the same chat, then paste the new reply here.</p>
          </div>
        {:else if canReview}
          <p class="text-label text-success flex items-center gap-1.5 px-1">
            <Icon icon="ic:baseline-check-circle" class="text-base" /> Looks good: {plan?.items.length} change{plan?.items.length === 1 ? '' : 's'}
          </p>
        {:else if changeSet}
          <p class="text-label text-content-subtle px-1">The reply is valid but doesn't change anything.</p>
        {/if}

      {:else if changeSet && plan}
        {#if parsed?.legacyFormat}
          <p class="text-caption text-content-subtle flex items-start gap-1.5 px-1">
            <Icon icon="ic:baseline-info" class="text-sm shrink-0 mt-px" />
            <span>This is an older {parsed.legacyFormat === 'phase' ? 'phase-plan' : 'week-by-week'} reply. It has been converted to the changes below.</span>
          </p>
        {/if}
        {#if changeSet.summary}
          <div class="p-3.5 rounded-card bg-primary/5 border border-primary/20">
            <p class="text-caption uppercase text-primary mb-1">What the AI changed</p>
            <p class="text-body text-content leading-relaxed whitespace-pre-wrap break-words">{changeSet.summary}</p>
          </div>
        {/if}
        <p class="text-body text-content px-1">
          <strong>{appliedCount}</strong> of {plan.items.length} change{plan.items.length === 1 ? '' : 's'} ticked.
          <span class="text-content-subtle">Untick anything you don't want; changes that depend on it are left out too.</span>
        </p>
        {#if repairs.length > 0}
          <div class="p-3 bg-warning/10 border border-warning/30 rounded-card space-y-1.5">
            <button onclick={() => showRepairs = !showRepairs} class="w-full text-left text-caption text-warning font-bold flex items-center gap-1">
              <Icon icon="ic:baseline-auto-fix-high" class="text-sm" /> Fixed {repairs.length} value{repairs.length === 1 ? '' : 's'} in the reply automatically
              <Icon icon={showRepairs ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-sm ml-auto" />
            </button>
            {#if showRepairs}
              <ul class="text-caption text-content-subtle space-y-0.5 pl-5 list-disc">
                {#each repairs as r}<li><span class="font-mono">{r.path}</span>: {r.message}</li>{/each}
              </ul>
            {/if}
          </div>
        {/if}

        {#each SECTIONS as section (section.id)}
          {@const items = plan.items.filter((i) => i.section === section.id)}
          {#if items.length > 0}
            <div class="space-y-2">
              <p class="text-section uppercase text-content-muted flex items-center gap-1.5 px-1">
                <Icon icon={section.icon} class="text-sm" /> {section.label}
              </p>
              {#each items as item (item.id)}
                {@const on = plan.selected.has(item.id)}
                {@const reason = blockedReason(item)}
                <div class="rounded-card border p-3.5 space-y-1.5 transition-colors {on ? 'bg-surface/40 border-border' : 'bg-surface/10 border-border/60'}">
                  <label class="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onchange={() => toggle(item.id)}
                      class="w-5 h-5 mt-0.5 accent-primary shrink-0"
                      aria-label="Apply: {item.title}"
                    />
                    <span class="text-body font-bold break-words {on ? 'text-content' : 'text-content-subtle line-through'}">{item.title}</span>
                  </label>
                  {#if item.details.length > 0}
                    <ul class="pl-8 space-y-0.5">
                      {#each item.details as line}
                        <li class="text-caption font-mono leading-snug break-words {line.startsWith('+') || line.includes(': +') ? 'text-status-good' : line.startsWith('−') || line.includes(': −') ? 'text-status-risk' : 'text-content-muted'}">{line}</li>
                      {/each}
                    </ul>
                  {/if}
                  {#each item.warnings as warning}
                    <p class="pl-8 text-caption text-warning flex items-start gap-1"><Icon icon="ic:baseline-warning-amber" class="text-sm shrink-0 mt-px" /><span>{warning}</span></p>
                  {/each}
                  {#if reason}
                    <p class="pl-8 text-caption text-danger flex items-start gap-1"><Icon icon="ic:baseline-block" class="text-sm shrink-0 mt-px" /><span>{reason}</span></p>
                  {:else if !on && item.errors.length}
                    <p class="pl-8 text-caption text-danger flex items-start gap-1"><Icon icon="ic:baseline-block" class="text-sm shrink-0 mt-px" /><span>{item.errors.join(' ')}</span></p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 py-3 flex items-center gap-2">
      {#if step === 'ask'}
        {#if mode === 'generate'}
          <button onclick={() => step = 'paste'} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors">
            I have a reply
          </button>
        {:else if copiedFor === mode}
          <button onclick={onClose} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors">
            Done
          </button>
        {/if}
        <div class="flex-1"></div>
        <button
          onclick={copyPrompt}
          disabled={mode !== 'context' && !rangeValid}
          class="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
        >
          <Icon icon={copiedFor === mode ? 'ic:baseline-check' : 'ic:baseline-content-copy'} class="text-base" />
          {copiedFor === mode ? 'Copy again' : mode === 'context' ? 'Copy context' : 'Copy prompt'}
        </button>
      {:else if step === 'paste'}
        <button onclick={() => step = 'ask'} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center gap-1.5">
          <Icon icon="ic:baseline-arrow-back" class="text-base" /> Back
        </button>
        <button onclick={copyPrompt} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center gap-1.5">
          <Icon icon={copiedAgain ? 'ic:baseline-check' : 'ic:baseline-content-copy'} class="text-base" /> {copiedAgain ? 'Copied' : 'Copy again'}
        </button>
        <div class="flex-1"></div>
        <button
          onclick={() => step = 'review'}
          disabled={!canReview}
          class="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
        >
          Review <Icon icon="ic:baseline-arrow-forward" class="text-base" />
        </button>
      {:else}
        <button onclick={() => step = 'paste'} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center gap-1.5">
          <Icon icon="ic:baseline-arrow-back" class="text-base" /> Back
        </button>
        <div class="flex-1"></div>
        <button
          onclick={apply}
          disabled={applying || appliedCount === 0}
          class="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
        >
          <Icon icon="ic:baseline-check" class="text-base" />
          {applying ? 'Applying…' : `Apply ${appliedCount} of ${plan?.items.length ?? 0}`}
        </button>
      {/if}
    </div>
  </footer>
</div>
