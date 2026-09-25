<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * "Ask AI" for the one session open in the editor, as three steps:
   * say what you want and copy the prompt, paste the reply, review exactly
   * what will change. The prompt carries your exercise list and the session
   * itself (`buildSessionPrompt`), so the AI reuses your exercise names.
   *
   * Add vs replace is chosen up front because it changes what the AI is
   * asked for (only new exercises, or the complete list) - and is shown
   * again at review. Nothing is written here: the resolved slots go back
   * to the editor, which saves them with the rest of the session. The one
   * exception is a brand-new exercise type, which has to exist for the
   * slots to point at.
   */
  import type { ExerciseSlot, Workout } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { showAlert } from '../../lib/utils';
  import { parseAIWorkoutLogOutput } from '../../lib/ai/schema';
  import { normalizeName, type NameMapping } from '../../lib/ai/planImport';
  import { buildWorkoutLogCommit, buildWorkoutLogPreview } from '../../lib/ai/workoutLogImport';
  import { buildSessionPrompt } from '../../lib/ai/sessionPrompt';
  import { groupIssues, formatIssuesForAI } from '../../lib/ai/issueSummary';
  import { slotSummary } from '../../lib/session/slotDetails';
  import Icon from '@iconify/svelte';

  let {
    workout,
    onImport,
    onClose,
  }: {
    workout: Workout;
    onImport: (slots: ExerciseSlot[], mode: 'add' | 'replace') => void;
    onClose: () => void;
  } = $props();

  const isLog = $derived(workout.status === 'completed');
  const bucket = $derived<'prescribed' | 'logged'>(isLog ? 'logged' : 'prescribed');
  const hasExercises = $derived(workout.exercises.length > 0);

  let step = $state<'ask' | 'paste' | 'review'>('ask');
  let mode = $state<'add' | 'replace'>('add');
  let request = $state('');
  let pasteText = $state('');
  let copied = $state(false);
  /** Whether the prompt was copied this time - "I have a reply" skips straight to pasting. */
  let promptCopied = $state(false);
  let copiedErrors = $state(false);
  let committing = $state(false);
  let exerciseTypeMapping = $state<Record<string, NameMapping>>({});

  const STEPS = [
    { id: 'ask', label: 'Ask' },
    { id: 'paste', label: 'Paste' },
    { id: 'review', label: 'Review' },
  ] as const;
  const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));

  const result = $derived(pasteText.trim() ? parseAIWorkoutLogOutput(pasteText) : null);
  const issues = $derived(result?.issues ?? []);
  const issueGroups = $derived(groupIssues(issues));
  const repairs = $derived(result?.repairs ?? []);
  const preview = $derived(result?.valid && result.data ? buildWorkoutLogPreview(result.data, trainingState.exerciseTypes) : null);
  const canReview = $derived(!!preview && preview.totalExercises > 0);

  // New names default to "create"; a choice already made is kept.
  $effect(() => {
    for (const name of preview?.unresolvedExerciseTypeNames ?? []) {
      const key = normalizeName(name);
      if (!(key in exerciseTypeMapping)) exerciseTypeMapping[key] = { action: 'create' };
    }
  });

  /** What will actually land in the session, with the current name choices applied. */
  const commit = $derived(
    result?.valid && result.data
      ? buildWorkoutLogCommit(
          result.data,
          { exerciseTypes: exerciseTypeMapping },
          { exerciseTypes: trainingState.exerciseTypes, analyticsCategories: trainingState.analyticsCategories },
          bucket,
        )
      : null,
  );

  function typeName(typeId: string): string {
    return [...trainingState.exerciseTypes, ...(commit?.newExerciseTypes ?? [])].find((t) => t.id === typeId)?.name ?? 'Unknown';
  }

  /** The AI's name for each returned exercise, in slot order. */
  const aiNames = $derived(result?.data?.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseTypeName)) ?? []);

  /** The AI's name behind slot `i`, when it didn't match one of your exercises - for the "new exercise" choice. */
  function unresolvedNameFor(i: number): string | undefined {
    const name = aiNames[i];
    return name && preview?.unresolvedExerciseTypeNames.includes(name) ? name : undefined;
  }

  async function copyPrompt() {
    const prompt = buildSessionPrompt({
      workout,
      request,
      mode: hasExercises ? mode : 'add',
      exerciseTypes: trainingState.exerciseTypes,
      analyticsCategories: trainingState.analyticsCategories,
    });
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
      setTimeout(() => (copied = false), 2000);
      promptCopied = true;
      step = 'paste';
    } catch {
      await showAlert('Copy failed', 'Your browser blocked the clipboard. Try again, or allow clipboard access for this site.');
    }
  }

  async function copyFixRequest() {
    await navigator.clipboard.writeText(formatIssuesForAI(issues));
    copiedErrors = true;
    setTimeout(() => (copiedErrors = false), 2000);
  }

  // A clean paste goes straight to review - that's the whole point of pasting.
  function handlePaste() {
    setTimeout(() => { if (canReview) step = 'review'; }, 0);
  }

  async function confirm() {
    if (!commit) return;
    committing = true;
    try {
      if (commit.newExerciseTypes.length) {
        await trainingState.updateExerciseTypes([...trainingState.exerciseTypes, ...commit.newExerciseTypes]);
      }
      onImport(commit.slots, hasExercises ? mode : 'add');
    } catch (err: any) {
      await showAlert('Import failed', err?.message || 'Something went wrong adding the exercises.');
    } finally {
      committing = false;
    }
  }

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onClose());
</script>

{#snippet modeSwitch()}
  <div class="flex bg-surface-elevated/50 p-1 rounded-control">
    <button
      onclick={() => mode = 'add'}
      class="flex-1 py-2 text-label rounded-control transition-all {mode === 'add' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
    >Add to session</button>
    <button
      onclick={() => mode = 'replace'}
      class="flex-1 py-2 text-label rounded-control transition-all {mode === 'replace' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
    >Replace exercises</button>
  </div>
{/snippet}

<div class="fixed inset-0 z-[130] bg-app-bg flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Ask AI">
  <header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 space-y-3">
      <div class="flex items-start gap-3">
        <button onclick={onClose} class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
          <Icon icon="ic:baseline-close" class="text-2xl" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-caption uppercase text-primary flex items-center gap-1">
            <Icon icon="ic:baseline-auto-awesome" class="text-sm" /> Ask AI
          </p>
          <h2 class="text-title text-content break-words">{workout.notes || 'Session'}</h2>
        </div>
      </div>
      <!-- Where you are in the three steps -->
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
    </div>
  </header>

  <div class="flex-1 overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full px-4 py-4 pb-32 space-y-4">
      {#if step === 'ask'}
        {#if hasExercises}
          <div class="space-y-2">
            <p class="text-label text-content-subtle px-1">This session already has {workout.exercises.length} exercise{workout.exercises.length === 1 ? '' : 's'}. The AI's exercises should…</p>
            {@render modeSwitch()}
            <p class="text-caption text-content-subtle px-1">
              {mode === 'add'
                ? 'The AI suggests extra exercises; the current ones stay as they are.'
                : 'The AI rewrites the whole list (it sees the current one and can keep or change any of it).'}
            </p>
          </div>
        {/if}

        <label class="block space-y-1.5">
          <span class="text-label text-content-subtle px-1 block">{isLog ? 'What did you do?' : 'What should this session be?'}</span>
          <textarea
            bind:value={request}
            rows="5"
            placeholder={isLog
              ? 'e.g. warmed up 15 min, 5 max hangs on 20mm +10kg, then 45 min limit bouldering around 7A'
              : 'e.g. a 90 min power session: short warm-up, max hangs, limit boulders, some core at the end'}
            class="w-full p-3.5 bg-surface/40 border border-border rounded-card text-body text-content leading-relaxed outline-none focus:border-primary/40 transition-colors resize-y placeholder:text-content-subtle"
          ></textarea>
        </label>

        <p class="text-caption text-content-subtle px-1 leading-relaxed">
          Copying builds a prompt with your request, this session, and your exercise list, so the AI reuses your exercise names. Paste it into any AI chat, then come back with its reply.
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
                  <span class="block text-body text-content font-medium truncate">{group.label.split('.').pop() || 'Reply'}{group.count > 1 ? ` ×${group.count}` : ''}</span>
                  <span class="block text-caption text-content-muted leading-snug">{group.message}</span>
                </li>
              {/each}
            </ul>
            <p class="text-caption text-content-subtle leading-snug">"Copy fix request" puts a correction on your clipboard. Send it in the same chat, then paste the new reply here.</p>
          </div>
        {:else if canReview}
          <p class="text-label text-success flex items-center gap-1.5 px-1">
            <Icon icon="ic:baseline-check-circle" class="text-base" /> Looks good: {preview?.totalExercises} exercise{preview?.totalExercises === 1 ? '' : 's'}
          </p>
        {/if}

      {:else}
        <div class="space-y-2">
          {#if hasExercises}{@render modeSwitch()}{/if}
          <p class="text-body text-content px-1">
            {#if !hasExercises || mode === 'add'}
              <strong>{commit?.slots.length}</strong> exercise{commit?.slots.length === 1 ? '' : 's'} will be added{hasExercises ? ` after the current ${workout.exercises.length}` : ''}.
            {:else}
              The current {workout.exercises.length} exercise{workout.exercises.length === 1 ? '' : 's'} will be <strong>replaced</strong> by these {commit?.slots.length}.
            {/if}
            <span class="text-content-subtle">Nothing is saved until you save the session.</span>
          </p>
        </div>

        {#if repairs.length > 0}
          <p class="p-3 bg-warning/10 border border-warning/30 rounded-card text-caption text-content-muted leading-snug">
            <span class="text-warning font-bold">Fixed {repairs.length} value{repairs.length === 1 ? '' : 's'} automatically.</span>
            Anything that couldn't be represented was moved into the exercise's notes. Worth a quick look after saving.
          </p>
        {/if}

        <div class="space-y-2">
          {#each commit?.slots ?? [] as slot, i (slot.id)}
            {@const newName = unresolvedNameFor(i)}
            <div class="p-3.5 bg-surface/40 border border-border rounded-card space-y-2">
              <div class="flex items-center gap-3">
                <span class="shrink-0 w-7 h-7 rounded-full grid place-items-center text-caption font-bold bg-surface-elevated text-content-subtle">{(mode === 'add' && hasExercises ? workout.exercises.length : 0) + i + 1}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-body font-bold text-content break-words">
                    {typeName(slot.typeId)}
                    {#if newName && exerciseTypeMapping[normalizeName(newName)]?.action !== 'map'}
                      <span class="ml-1 text-caption font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded-control align-middle">New</span>
                    {/if}
                  </p>
                  <p class="text-caption text-content-subtle">{slotSummary(slot) || '—'}</p>
                </div>
              </div>
              {#if newName}
                <select
                  value={exerciseTypeMapping[normalizeName(newName)]?.action === 'map' ? (exerciseTypeMapping[normalizeName(newName)] as { id: string }).id : 'create'}
                  onchange={(e) => {
                    const v = e.currentTarget.value;
                    exerciseTypeMapping[normalizeName(newName)] = v === 'create' ? { action: 'create' } : { action: 'map', id: v };
                  }}
                  class="w-full bg-surface-elevated text-content text-label p-2 rounded-control border border-border-strong outline-none"
                  aria-label="What is {newName}?"
                >
                  <option value="create">Create new exercise "{newName}"</option>
                  {#each trainingState.exerciseTypes.filter((t) => !t.archived) as type}
                    <option value={type.id}>Same as my "{type.name}"</option>
                  {/each}
                </select>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 py-3 flex items-center gap-2">
      {#if step === 'ask'}
        <button onclick={() => step = 'paste'} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors">
          I have a reply
        </button>
        <div class="flex-1"></div>
        <button onclick={copyPrompt} class="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5">
          <Icon icon="ic:baseline-content-copy" class="text-base" /> Copy prompt
        </button>
      {:else if step === 'paste'}
        <button onclick={() => step = 'ask'} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center gap-1.5">
          <Icon icon="ic:baseline-arrow-back" class="text-base" /> Back
        </button>
        <button onclick={copyPrompt} class="px-3 py-2.5 rounded-control text-label font-bold text-content-subtle hover:text-content transition-colors flex items-center gap-1.5">
          <Icon icon={copied ? 'ic:baseline-check' : 'ic:baseline-content-copy'} class="text-base" /> {copied ? 'Copied' : 'Copy again'}
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
          onclick={confirm}
          disabled={!commit || committing}
          class="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
        >
          <Icon icon="ic:baseline-check" class="text-base" />
          {hasExercises && mode === 'replace' ? `Replace with ${commit?.slots.length ?? 0}` : `Add ${commit?.slots.length ?? 0}`}
        </button>
      {/if}
    </div>
  </footer>
</div>
