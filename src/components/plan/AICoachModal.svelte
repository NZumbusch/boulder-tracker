<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { settingsPath } from '../../lib/settings/tree';
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
  import { portal } from '../../lib/ui/portal';
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekIdRange } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import type { AIPromptMode } from '../../lib/ai/context';
  import { buildCoachPromptFor, estimateTokens, formatTokens } from '../../lib/ai/coachPrompt';
  import AIPromptTuning from '../settings/AIPromptTuning.svelte';
  import { parsePlanImport } from '../../lib/ai/planImportEntry';
  import { planWithSelection, allItemIds, type ChangeItem, type ChangeSection } from '../../lib/ai/changePlanner';
  import { buildOrganisePrompt, ORGANISE_AREAS, type OrganiseArea } from '../../lib/ai/organisePrompt';
  import { groupIssues, formatIssuesForAI } from '../../lib/ai/issueSummary';
  import Icon from '@iconify/svelte';
  import { WEEK_DAYS } from '../../lib/constants';
  import { hasProfile } from '../../lib/ai/coachNotes';
  import { hasTargets } from '../../lib/analytics/targets';
  import { baseLoad, taperPlan } from '../../lib/goals/taper';
  import { ratingScale } from '../../lib/analytics/insights';
  import type { DayOfWeek } from '../../lib/types';
  import { QUICK_ADAPTS, spanWeeks, withGoal, toggleGoal, hasGoal, loadLastRequest, saveLastRequest } from '../../lib/ai/quickAdapt';
  import { loadChangeLog, appendChange } from '../../lib/ai/changeLog';
  import { markCheckinDone } from '../../lib/home/checkin';
  import AiSendSheet from './AiSendSheet.svelte';
  import PlanHistorySheet from './PlanHistorySheet.svelte';
  import { looksLikeReply } from '../../lib/ai/clipboardReply';
  import { loadCompact } from '../../lib/ai/promptSize';
  import { loadConfig as loadDirectConfig, loadKey as loadDirectKey } from '../../lib/ai/direct/store';
  import { providerInfo, modelInfo } from '../../lib/ai/direct/providers';
  import { estimateCost, formatUsd } from '../../lib/ai/direct/cost';

  /** "organise" is a Change plan flavour (same paste and review) that only regroups exercises and categories. */
  type CoachMode = AIPromptMode | 'organise';

  let { onClose, initialMode = 'generate', preset, taperFor }: { onClose: () => void; initialMode?: CoachMode; /** A quick-adapt id (`QUICK_ADAPTS`) applied on open - the weekly check-in card uses 'checkin'. */ preset?: string; /** A goal id: ask for the plan to taper towards it. */ taperFor?: string } = $props();

  // svelte-ignore state_referenced_locally
  let mode = $state<CoachMode>(initialMode);
  /** Modes that end in paste-and-review. */
  const flows = $derived(mode === 'generate' || mode === 'organise');
  let step = $state<'ask' | 'paste' | 'review'>('ask');
  let startWeek = $state(trainingState.currentWeekId);
  let endWeek = $state(trainingState.currentWeekId);
  let goal = $state('');
  /** The log of applied changes the prompt's "since the last plan" part reads. */
  const changeLog = loadChangeLog();
  const lastRequest = loadLastRequest();

  /** The weekly check-in was the starting point - copying the prompt counts it as done for this week. */
  let usedCheckin = false;
  function applyQuick(id: string) {
    const q = QUICK_ADAPTS.find((x) => x.id === id);
    if (!q) return;
    const weeks = spanWeeks(q.span, trainingState.currentWeekId);
    startWeek = weeks.start;
    endWeek = weeks.end;
    const wasOn = hasGoal(goal, q.goal);
    goal = toggleGoal(goal, q.goal, QUICK_ADAPTS.map((x) => x.goal));
    if (id === 'checkin' && !wasOn) usedCheckin = true;
  }

  function applyLast() {
    if (!lastRequest) return;
    startWeek = lastRequest.start;
    endWeek = lastRequest.end;
    goal = lastRequest.goal;
  }
  // svelte-ignore state_referenced_locally
  if (preset) applyQuick(preset);
  // svelte-ignore state_referenced_locally
  if (taperFor) applyTaper(taperFor);

  /** The weeks up to the goal, and a request that names the taper's loads. */
  function applyTaper(goalId: string) {
    const target = trainingState.goals.find((g) => g.id === goalId);
    if (!target) return;
    const plan = taperPlan({ goal: target, asOf: trainingState.today, base: baseLoad(trainingState.workouts, trainingState.today), workoutsForWeek: (id) => trainingState.getWorkoutsForWeek(id), scale: ratingScale(trainingState.workouts) });
    if (!plan) return;
    startWeek = plan.weeks[0].weekId;
    endWeek = plan.weeks[plan.weeks.length - 1].weekId;
    const loads = plan.weeks.map((w) => `W${w.weekId.split('-W')[1]} about ${Math.round(w.target).toLocaleString()}`).join(', ');
    goal = `Taper for ${target.name} on ${target.date}: ease the volume off over the last weeks and keep the intensity - no new hard exercises, nothing new in the last days. Weekly load to aim for: ${loads} (my usual week is about ${Math.round(plan.baseLoad).toLocaleString()}). Note the plan in the coach notes.`;
  }
  /** Analyze/Context: the prompt is on the clipboard - show the "now paste it" note. */
  let copiedFor = $state<CoachMode | null>(null);
  /** Change plan: brief "Copied" feedback on the paste step's copy button. */
  let copiedAgain = $state(false);
  /** Whether the prompt was copied this time - "I have a reply" skips straight to pasting. */
  let promptCopied = $state(false);

  const MODES: { id: CoachMode; label: string; title: string }[] = [
    { id: 'generate', label: 'Change plan', title: 'Change your plan' },
    { id: 'analyze', label: 'Analyze', title: 'Analyze past training' },
    { id: 'context', label: 'Context', title: 'Share your context' },
    { id: 'organise', label: 'Organise', title: 'Tidy your data' },
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

  function setMode(next: CoachMode) {
    mode = next;
    copiedFor = null;
  }

  /** How much history goes along: the Settings choice, changed from the tune panel here or in Settings. */
  const history = $derived(trainingState.aiHistory);
  let tuneOpen = $state(false);

  /** What of the coaching memory this prompt carries, for the line under the request box. */
  const memoryParts = $derived.by(() => {
    if (trainingState.aiSharing.coachNotes === false) return [];
    const p = trainingState.athleteProfile;
    const parts: string[] = [];
    if (p?.standingGoal?.trim()) parts.push('your standing goal');
    if (p && hasProfile({ ...p, standingGoal: undefined })) parts.push('About me');
    if (hasTargets(p?.targets)) parts.push('your targets');
    const n = trainingState.coachNotes.length;
    if (n) parts.push(`${n} coach note${n === 1 ? '' : 's'}`);
    return parts;
  });

  /** What Organise may tidy: the athlete's pick, everything by default. */
  let organiseAreas = $state<OrganiseArea[]>(ORGANISE_AREAS.map((a) => a.id));
  /** Areas that hold health or personal data stay out of the prompt when AI Sharing says so. */
  const blockedAreas = $derived<Partial<Record<OrganiseArea, string>>>({
    ...(trainingState.aiSharing.painLogs ? {} : { pain: 'Off in AI Sharing' }),
    ...(trainingState.aiSharing.competitions ? {} : { goals: 'Off in AI Sharing' }),
    ...(trainingState.aiSharing.coachNotes === false ? { notes: 'Off in AI Sharing' } : {}),
  });
  const effectiveAreas = $derived(organiseAreas.filter((a) => !blockedAreas[a]));
  const organiseSource = $derived({
    exerciseTypes: trainingState.exerciseTypes, analyticsCategories: trainingState.analyticsCategories, workouts: trainingState.workouts,
    circuits: trainingState.circuits, phaseDefs: trainingState.phaseDefs, trainingBlocks: trainingState.trainingBlocks, templates: trainingState.templates,
    coachNotes: trainingState.coachNotes, valueDefs: trainingState.valueDefs, benchmarkTypes: trainingState.benchmarkTypes, benchmarks: trainingState.benchmarks,
    goals: trainingState.goals, painIssues: trainingState.painIssues, today: trainingState.todayIso,
  });
  function toggleArea(id: OrganiseArea) {
    organiseAreas = organiseAreas.includes(id) ? organiseAreas.filter((a) => a !== id) : ORGANISE_AREAS.map((a) => a.id).filter((a) => a === id || organiseAreas.includes(a));
  }

  /** Days that may go either way every week (e.g. outdoor if dry) - the AI is asked to give them a Plan B. */
  let uncertainDays = $state<DayOfWeek[]>([]);
  function toggleUncertain(day: DayOfWeek) {
    uncertainDays = uncertainDays.includes(day) ? uncertainDays.filter((d) => d !== day) : WEEK_DAYS.filter((d) => d === day || uncertainDays.includes(d));
  }


  /** The compact prompt leaves out the detail of phases the target weeks don't use and trims the lists; kept per device. */
  let compact = $state(loadCompact());
  /** The prompt exactly as it will be copied - also what the size shown is measured on. */
  const prompt = $derived(
    mode === 'organise'
      ? buildOrganisePrompt(organiseSource, goal, effectiveAreas)
      : buildCoachPromptFor(trainingState, { mode, targetWeekIds: selectedWeekIds, goal, history, uncertainDays: mode === 'generate' ? uncertainDays : undefined, changeLog, compact }),
  );
  const tokens = $derived(estimateTokens(prompt));

  // --- Ask directly (optional, with the athlete's own key) ---
  const direct = loadDirectConfig();
  const directService = providerInfo(direct.provider).label.split(' (')[0];
  const directReady = !!loadDirectKey(direct.provider);
  const directRates = (() => {
    const listed = modelInfo(direct.provider, direct.model);
    return direct.priceOverride ?? (listed ? { inputPerM: listed.inputPerM, outputPerM: listed.outputPerM } : undefined);
  })();
  const directPriced = (() => {
    const listed = modelInfo(direct.provider, direct.model);
    return directRates ? { ...directRates, long: direct.priceOverride ? undefined : listed?.long } : undefined;
  })();
  const directEstimate = $derived(directPriced ? estimateCost(directPriced, tokens, direct.maxOutputTokens) : undefined);
  let sendOpen = $state(false);
  let historyOpen = $state(false);
  /** Set when the reply came straight from the service rather than a paste. */
  let directInfo = $state<{ model: string; cost?: number; inputTokens?: number; outputTokens?: number } | null>(null);
  function gotReply(text: string, info: { cost?: number; inputTokens?: number; outputTokens?: number; model: string }) {
    sendOpen = false;
    pasteText = text;
    directInfo = info;
    promptCopied = true;
    if (mode === 'generate') saveLastRequest({ goal, start: startWeek, end: endWeek });
    if (usedCheckin) markCheckinDone(trainingState.currentWeekId);
    // A clean reply goes straight to review, like a clean paste.
    setTimeout(() => { step = canReview ? 'review' : 'paste'; }, 0);
  }

  async function copyPrompt() {
    if (mode !== 'context' && mode !== 'organise' && !rangeValid) return;
    if (mode === 'organise' && effectiveAreas.length === 0) return;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch (err: any) {
      await showAlert('Copy failed', 'Your browser blocked the clipboard: ' + (err?.message ?? 'unknown error'));
      return;
    }
    if (mode === 'generate') saveLastRequest({ goal, start: startWeek, end: endWeek });
    if (usedCheckin) markCheckinDone(trainingState.currentWeekId);
    if (flows) {
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
    { id: 'category', label: 'Categories', icon: 'ic:baseline-category' },
    { id: 'exercise', label: 'Exercises', icon: 'ic:baseline-fitness-center' },
    { id: 'circuit', label: 'Circuits', icon: 'ic:baseline-repeat' },
    { id: 'phase', label: 'Phases', icon: 'ic:baseline-view-week' },
    { id: 'week', label: 'Weeks', icon: 'ic:baseline-calendar-month' },
    { id: 'planB', label: 'Plan B', icon: 'ic:baseline-call-split' },
    { id: 'coach', label: 'Coach notes', icon: 'ic:baseline-psychology' },
    { id: 'valueType', label: 'Custom fields', icon: 'ic:baseline-tune' },
    { id: 'benchmark', label: 'Benchmark tests', icon: 'ic:baseline-speed' },
    { id: 'goal', label: 'Goals', icon: 'ic:baseline-flag' },
    { id: 'pain', label: 'Pain issues', icon: 'ic:baseline-healing' },
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

  /** Reads the clipboard into the box: the button's job (a tap is what lets a browser or web view allow it). */
  let clipboardNote = $state('');
  async function pasteFromClipboard() {
    clipboardNote = '';
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { clipboardNote = 'The clipboard is empty - copy the AI\'s reply first.'; return; }
      pasteText = text;
      handlePaste();
    } catch {
      clipboardNote = 'This browser didn\'t let the app read the clipboard - paste into the box instead.';
    }
  }

  /** Coming back from the AI chat with its reply on the clipboard (and the clipboard already allowed): take it, no tap needed. */
  $effect(() => {
    if (step !== 'paste') return;
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || pasteText.trim()) return;
      try {
        const perm = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
        if (perm?.state !== 'granted') return;
        const text = await navigator.clipboard.readText();
        if (looksLikeReply(text)) { pasteText = text; handlePaste(); }
      } catch { /* not allowed here: the button is there */ }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

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
      const applied = final.items.filter((i) => final.selected.has(i.id)).map((i) => i.title);
      await trainingState.applyPlanWrites(final.writes, { goal: goal.trim() || undefined, lines: applied.slice(0, 10) });
      appendChange({ goal, weeks: selectedWeekIds, lines: final.items.filter((i) => final.selected.has(i.id)).map((i) => i.title) });
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

{#snippet heading(title: string, hint: string)}
  <div class="flex items-baseline justify-between gap-3 px-1">
    <h3 class="text-label text-content">{title}</h3>
    {#if hint}<span class="text-caption text-content-subtle text-right">{hint}</span>{/if}
  </div>
{/snippet}

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

<div use:portal class="fixed inset-0 z-[130] safe-y bg-app-bg flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="AI Coach">
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
      {#if flows}{@render stepper()}{/if}
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
        {:else if mode === 'organise'}
          <section class="space-y-2.5">
            {@render heading('What may the AI tidy?', 'Pick any')}
            <div class="grid grid-cols-2 gap-2">
              {#each ORGANISE_AREAS as a (a.id)}
                {@const blocked = blockedAreas[a.id]}
                {@const on = organiseAreas.includes(a.id) && !blocked}
                <button
                  onclick={() => toggleArea(a.id)}
                  disabled={!!blocked}
                  aria-pressed={on}
                  class="p-3 rounded-card border text-left transition-colors disabled:opacity-50 {on ? 'border-primary/40 bg-primary/10' : 'border-border bg-surface/40 text-content-subtle hover:text-content'}"
                >
                  <span class="text-label block {on ? 'text-primary' : ''}">{a.label}</span>
                  <span class="text-caption text-content-subtle block leading-snug">{blocked ?? a.hint}</span>
                </button>
              {/each}
            </div>
            {#if effectiveAreas.length === 0}
              <p class="text-caption text-danger flex items-center gap-1"><Icon icon="ic:baseline-error-outline" class="text-sm" /> Pick at least one.</p>
            {/if}
          </section>
          <section class="space-y-2.5">
            {@render heading('What do you want?', 'Optional')}
            <textarea
              bind:value={goal}
              rows="3"
              placeholder="e.g. Split Other into mobility and conditioning, keep it to 8 categories, and merge my overlapping coach notes."
              class="w-full p-3.5 bg-surface/40 border border-border rounded-card text-body text-content leading-relaxed outline-none focus:border-primary/40 transition-colors resize-y placeholder:text-content-subtle"
            ></textarea>
          </section>
          <p class="text-caption text-content-subtle px-1 flex items-center gap-1.5"><Icon icon="ic:baseline-straighten" class="text-sm shrink-0" /> Prompt size {formatTokens(tokens)}. The AI only sees the areas you pick - no sessions, no plan - and you review every change before it is applied.</p>
        {:else}
          <!-- 1. What you want (with the usual requests above it), 2. which weeks, 3. optional extras. -->
          <section class="space-y-2.5">
            {@render heading(mode === 'generate' ? 'What do you want?' : 'What were you going for?', mode === 'generate' ? 'Tap a starting point or write your own' : 'Optional')}
            {#if mode === 'generate'}
              <div class="flex flex-wrap gap-1.5">
                {#each QUICK_ADAPTS as q (q.id)}
                  <button onclick={() => applyQuick(q.id)} class="chip transition-colors {hasGoal(goal, q.goal) ? 'text-primary border-primary/40 bg-primary/10' : 'text-content-muted hover:text-content'}" aria-pressed={hasGoal(goal, q.goal)}>{q.label}</button>
                {/each}
                {#if lastRequest}
                  <button onclick={applyLast} class="chip text-primary border-primary/30 hover:bg-primary/10 transition-colors" title={lastRequest.goal}>Same as last time</button>
                {/if}
              </div>
            {/if}
            <textarea
              bind:value={goal}
              rows="4"
              placeholder={mode === 'generate'
                ? 'e.g. Font trip in 4 weeks - build power endurance and slopers. Or: swap Thursday for a rest day next week.'
                : 'e.g. I was building finger strength for a comp - did it work?'}
              class="w-full p-3.5 bg-surface/40 border border-border rounded-card text-body text-content leading-relaxed outline-none focus:border-primary/40 transition-colors resize-y placeholder:text-content-subtle"
            ></textarea>
            {#if memoryParts.length}
              <p class="text-caption text-content-subtle px-1 flex items-start gap-1.5">
                <Icon icon="ic:baseline-psychology" class="text-sm shrink-0 mt-0.5" />
                <span>Sent along: {memoryParts.join(' · ')} <span class="text-content-subtle/70">({settingsPath('coach')})</span></span>
              </p>
            {/if}
          </section>

          <section class="space-y-2.5">
            {@render heading(mode === 'generate' ? 'Weeks the AI may change' : 'Weeks to analyze', rangeValid ? `${selectedWeekIds.length} week${selectedWeekIds.length === 1 ? '' : 's'}` : '')}
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <select bind:value={startWeek} aria-label="From" class="w-full min-w-0 bg-surface-elevated text-content px-3 py-2.5 rounded-control border border-border-strong outline-none text-label">
                {#each weekOptions as opt}<option value={opt.id}>{opt.label}</option>{/each}
              </select>
              <Icon icon="ic:baseline-arrow-forward" class="text-content-subtle" />
              <select bind:value={endWeek} aria-label="To" class="w-full min-w-0 bg-surface-elevated text-content px-3 py-2.5 rounded-control border border-border-strong outline-none text-label">
                {#each weekOptions as opt}<option value={opt.id}>{opt.label}</option>{/each}
              </select>
            </div>
            {#if !rangeValid}
              <p class="text-caption text-danger flex items-center gap-1"><Icon icon="ic:baseline-error-outline" class="text-sm" /> "From" has to be before "To".</p>
            {/if}
          </section>

          {#if mode === 'generate'}
            <section class="space-y-2.5">
              {@render heading('Uncertain days', 'Optional - they get a Plan B, e.g. outdoor if dry')}
              <div class="grid grid-cols-7 gap-1" role="group" aria-label="Uncertain days">
                {#each WEEK_DAYS as day}
                  {@const on = uncertainDays.includes(day)}
                  <button
                    onclick={() => toggleUncertain(day)}
                    aria-pressed={on}
                    class="py-2 rounded-control text-label border transition-colors {on ? 'bg-primary text-white border-primary' : 'border-border text-content-subtle hover:text-content'}"
                  >{day.slice(0, 2)}</button>
                {/each}
              </div>
            </section>
          {/if}
        {/if}

        {#if copiedFor === mode}
          <div class="p-3.5 bg-success/10 border border-success/30 rounded-card flex items-start gap-3 animate-in fade-in duration-200">
            <Icon icon="ic:baseline-check-circle" class="text-xl text-success shrink-0" />
            <p class="text-body text-content">Copied. Paste it into any AI chat{mode === 'context' ? ', then ask your question' : ''}.</p>
          </div>
        {/if}

        <!-- One line for everything about the size of the prompt; the tune icon opens the two settings that drive it. -->
        {#if mode !== 'organise'}
          <div class="bg-surface/40 border border-border rounded-card">
            <div class="p-3.5 flex items-center gap-3">
              <Icon icon="ic:baseline-straighten" class="text-xl text-content-subtle shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="text-label text-content block">Prompt size {formatTokens(tokens)}</span>
                <span class="text-caption text-content-subtle block">
                  {mode === 'analyze' ? 'The sessions of the chosen weeks' : `${history.fullWeeks} week${history.fullWeeks === 1 ? '' : 's'} in full${history.summaryWeeks ? `, ${history.summaryWeeks} summarized` : ''}`} · {compact ? 'compact' : 'full'}
                </span>
              </span>
              <button
                onclick={() => (tuneOpen = !tuneOpen)}
                class="shrink-0 p-2 rounded-control transition-colors {tuneOpen ? 'bg-primary/10 text-primary' : 'text-content-subtle hover:text-content'}"
                aria-label="Prompt settings"
                aria-expanded={tuneOpen}
              ><Icon icon="ic:baseline-tune" class="text-xl" /></button>
            </div>
            {#if tuneOpen}
              <div class="px-3.5 pb-3.5 pt-3 border-t border-border space-y-3 animate-in fade-in duration-150">
                <AIPromptTuning bind:compact {prompt} showHistory={mode !== 'analyze'} />
                <p class="text-caption text-content-subtle">Saved as your settings, for every prompt - what's shared (blocks, readiness, pain…) is set in {settingsPath('aiSharing')}.</p>
              </div>
            {/if}
          </div>
        {/if}

        {#if flows && lastAiChange?.source === 'ai'}
          <p class="text-caption text-content-subtle px-1 flex items-center gap-2 flex-wrap">
            <span>Last AI change {new Date(lastAiChange.appliedAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{lastAiChange.changedSince ? ' · edited since' : ''}</span>
            <button onclick={() => (historyOpen = true)} class="text-primary hover:underline">History</button>
            <button onclick={() => trainingState.undoPlanChange()} class="text-primary hover:underline">Undo</button>
          </p>
        {/if}

        {#if flows && directReady && (mode === 'organise' || rangeValid)}
          <!-- Optional: send it from the app with your own key. The price is on the button, and a confirmation follows. -->
          <button onclick={() => (sendOpen = true)} class="w-full p-3.5 rounded-card border border-border-strong text-left flex items-center gap-3 hover:bg-surface-elevated/50 transition-colors">
            <Icon icon="ic:baseline-bolt" class="text-xl text-status-caution shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="text-label text-content block">Ask {directService} directly</span>
              <span class="text-caption text-content-subtle block">{directEstimate ? `${formatTokens(tokens)} · about ${formatUsd(directEstimate.typicalUsd)}, at most ${formatUsd(directEstimate.maxUsd)} - you confirm first` : 'No price set for this model - set it in Settings first'}</span>
            </span>
            <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0" />
          </button>
        {/if}


        <p class="text-caption text-content-subtle leading-relaxed px-1">{mode === 'generate' ? 'You review every change before anything is applied. ' : mode === 'analyze' ? 'The reply is for reading in the chat. ' : ''}An AI's suggestions are ideas to check, not medical advice - for pain or injury, ask a doctor or physiotherapist.</p>

      {:else if step === 'paste'}
        <div class="p-3.5 bg-surface/40 border border-border rounded-card flex items-start gap-3">
          <Icon icon="ic:baseline-content-paste-go" class="text-xl text-primary shrink-0 mt-0.5" />
          <div class="min-w-0 flex-1 space-y-1">
            {#if directInfo}
              <p class="text-body text-content">Reply received from {directService}.</p>
              <p class="text-caption text-content-subtle">{directInfo.model}{directInfo.cost !== undefined ? ` · cost about ${formatUsd(directInfo.cost)}` : ''}{directInfo.inputTokens !== undefined ? ` (${formatTokens(directInfo.inputTokens)} in, ${formatTokens(directInfo.outputTokens ?? 0)} out)` : ''}</p>
            {:else}
              <p class="text-body text-content">{promptCopied ? 'Prompt copied. Paste it into your AI chat and send it.' : 'Paste the reply from your AI chat.'}</p>
              <p class="text-caption text-content-subtle">Then copy the AI's whole reply and paste it below.</p>
            {/if}
          </div>
        </div>

        {#if !pasteText.trim()}
          <button onclick={pasteFromClipboard} class="w-full py-3 rounded-control border border-border-strong text-label font-bold text-content flex items-center justify-center gap-1.5 hover:bg-surface-elevated/50 transition-colors">
            <Icon icon="ic:baseline-content-paste-go" class="text-base" />Paste the reply from the clipboard
          </button>
          {#if clipboardNote}<p class="text-caption text-content-subtle px-1">{clipboardNote}</p>{/if}
        {/if}

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
        {#if flows}
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
          disabled={(mode !== 'context' && mode !== 'organise' && !rangeValid) || (mode === 'organise' && effectiveAreas.length === 0)}
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

{#if sendOpen}
  <AiSendSheet {prompt} onReply={gotReply} onClose={() => (sendOpen = false)} />
{/if}

{#if historyOpen}
  <PlanHistorySheet onClose={() => (historyOpen = false)} />
{/if}
