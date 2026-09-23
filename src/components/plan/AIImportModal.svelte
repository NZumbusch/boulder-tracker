<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { showAlert } from '../../lib/utils';
  import type { ExerciseSlot } from '../../lib/types';
  import { parseAIWorkoutLogOutput, AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS } from '../../lib/ai/schema';
  import { normalizeName, type NameMapping } from '../../lib/ai/planImport';
  import { buildWorkoutLogPreview, buildWorkoutLogCommit } from '../../lib/ai/workoutLogImport';
  import { groupIssues, formatIssuesForAI } from '../../lib/ai/issueSummary';
  import Icon from '@iconify/svelte';

  // --- Props ---
  // Structures free-text training notes into exercises for one open workout
  // (WorkoutForm.svelte) and hands the resolved ExerciseSlot[] back rather
  // than writing anything - the workout isn't saved until that form is.
  // Whole-plan imports live in AIPlanImportModal (AI change sets).
  let {
    onClose,
    bucket = 'prescribed',
    onImportWorkoutLog,
  } = $props<{
    onClose: () => void;
    bucket?: 'prescribed' | 'logged';
    onImportWorkoutLog?: (slots: ExerciseSlot[]) => void;
  }>();

  // --- State ---
  let pasteText = $state('');
  let exerciseTypeMapping = $state<Record<string, NameMapping>>({});
  let committing = $state(false);
  let showInstructions = $state(false);
  let showRepairs = $state(false);
  let expandedIssue = $state<string | null>(null);
  let copiedErrors = $state(false);

  // --- Parsing (validate on every keystroke - cheap, and lets the preview/
  // error list update live rather than only on an explicit "Parse" click) ---
  const logResult = $derived(pasteText.trim() ? parseAIWorkoutLogOutput(pasteText) : null);

  const logPreview = $derived(
    logResult?.valid && logResult.data ? buildWorkoutLogPreview(logResult.data, trainingState.exerciseTypes) : null,
  );

  // Default every newly-seen unresolved name to "create" so the preview
  // always has a well-defined mapping to show/commit - the user can still
  // change any of them to "map to existing" before confirming. Never
  // resets a choice the user already made for a name still present.
  $effect(() => {
    const unresolvedExerciseNames = logPreview?.unresolvedExerciseTypeNames ?? [];
    for (const name of unresolvedExerciseNames) {
      const key = normalizeName(name);
      if (!(key in exerciseTypeMapping)) exerciseTypeMapping[key] = { action: 'create' };
    }
  });

  const canConfirm = $derived.by(() => {
    return !!logResult?.valid && !!logPreview && logPreview.totalExercises > 0;
  });

  function mappingSelectValue(mapping: NameMapping | undefined): string {
    return mapping?.action === 'map' ? mapping.id : 'create';
  }

  function setExerciseMapping(name: string, value: NameMapping) {
    exerciseTypeMapping[normalizeName(name)] = value;
  }
  async function handleCopyInstructions() {
    await navigator.clipboard.writeText(AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS);
    await showAlert('Copied!', 'Paste this into your preferred AI, then paste your own training notes after it. Paste the JSON it replies with back here.');
  }

  async function handleConfirm() {
    committing = true;
    try {
      {
        if (!logResult?.data) return;
        const commit = buildWorkoutLogCommit(
          logResult.data,
          { exerciseTypes: exerciseTypeMapping },
          { exerciseTypes: trainingState.exerciseTypes, analyticsCategories: trainingState.analyticsCategories },
          bucket,
        );
        if (commit.newExerciseTypes.length) {
          await trainingState.updateExerciseTypes([...trainingState.exerciseTypes, ...commit.newExerciseTypes]);
        }
        onImportWorkoutLog?.(commit.slots);
      }
      onClose();
    } catch (err: any) {
      await showAlert('Import Failed', err?.message || 'Something went wrong committing the import.');
    } finally {
      committing = false;
    }
  }

  const issues = $derived(logResult?.issues ?? []);
  const repairs = $derived(logResult?.repairs ?? []);

  // ~170 raw issues from one real plan collapse to a handful of distinct
  // problems - see issueSummary.ts.
  const issueGroups = $derived(groupIssues(issues));
  const repairGroups = $derived(groupIssues(repairs));

  async function handleCopyErrors() {
    await navigator.clipboard.writeText(formatIssuesForAI(issues));
    copiedErrors = true;
    setTimeout(() => (copiedErrors = false), 2000);
  }

  function toggleIssue(key: string) {
    expandedIssue = expandedIssue === key ? null : key;
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300 p-0 sm:p-4 pb-[80px]">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="0" aria-label="Close AI Import"></div>

  <div class="relative w-full sm:max-w-lg bg-surface border-t sm:border border-border-strong rounded-t-2xl sm:rounded-card shadow-2xl flex flex-col max-h-[85vh]">
    <div class="p-5 border-b border-border-strong flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-title text-content flex items-center gap-2">
          <Icon icon="ic:baseline-auto-awesome" class="text-primary text-xl" />
          Import AI Workout Log
        </h2>
        <p class="text-caption text-content-subtle mt-1">Paste JSON - nothing is saved until you confirm</p>
      </div>
      <button onclick={onClose} class="p-2 text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-control transition-all"><Icon icon="ic:baseline-close" class="text-lg" /></button>
    </div>

    <div class="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
        <div class="space-y-2">
          <button onclick={() => showInstructions = !showInstructions} class="text-label text-primary flex items-center gap-1">
            <Icon icon="ic:baseline-info" class="text-sm" /> How does this work?
          </button>
          {#if showInstructions}
            <div class="p-3.5 bg-surface-elevated/50 border border-border-strong rounded-control text-body text-content-muted space-y-2">
              <p>Copy the instructions below, paste them into any AI chat followed by your own free-text training notes ("did 5x hangboard sets, 30 min bouldering..."), then paste the AI's JSON reply into the box below.</p>
              <button onclick={handleCopyInstructions} class="text-label text-primary flex items-center gap-1">
                <Icon icon="ic:baseline-content-copy" class="text-sm" /> Copy Instructions
              </button>
            </div>
          {/if}
        </div>

      <div class="space-y-1.5">
        <label for="ai-import-paste" class="text-label text-content-subtle ml-1">Paste JSON Here</label>
        <textarea
          id="ai-import-paste"
          bind:value={pasteText}
          rows="6"
          placeholder="Paste the structured workout JSON your AI generated..."
          class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-xs font-mono resize-none"
        ></textarea>
      </div>

      {#if pasteText.trim() && issues.length > 0}
        <div class="p-3.5 bg-danger/10 border border-danger/30 rounded-control space-y-3">
          <div class="flex items-start justify-between gap-3">
            <p class="text-label text-danger flex items-center gap-1.5">
              <Icon icon="ic:baseline-error-outline" class="text-sm" />
              {issueGroups.length} problem{issueGroups.length === 1 ? '' : 's'} to fix
              {#if issues.length !== issueGroups.length}
                <span class="text-content-subtle font-normal">({issues.length} occurrences)</span>
              {/if}
            </p>
            <button
              onclick={handleCopyErrors}
              class="shrink-0 text-label text-primary flex items-center gap-1 hover:underline"
            >
              <Icon icon={copiedErrors ? 'ic:baseline-check' : 'ic:baseline-content-copy'} class="text-sm" />
              {copiedErrors ? 'Copied' : 'Copy fix request'}
            </button>
          </div>

          <ul class="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
            {#each issueGroups as group (group.label + group.message)}
              {@const key = group.label + group.message}
              <li class="bg-surface/60 rounded-control overflow-hidden">
                <button
                  onclick={() => toggleIssue(key)}
                  class="w-full text-left px-3 py-2 flex items-start justify-between gap-2"
                >
                  <span class="min-w-0">
                    <span class="block text-body text-content font-medium truncate">
                      {group.label.split('.').pop()}
                    </span>
                    <span class="block text-caption text-content-muted leading-snug">{group.message}</span>
                  </span>
                  <span class="shrink-0 flex items-center gap-1.5">
                    {#if group.count > 1}
                      <span class="text-caption text-content-subtle tabular-nums">x{group.count}</span>
                    {/if}
                    <Icon icon={expandedIssue === key ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-sm text-content-muted" />
                  </span>
                </button>
                {#if expandedIssue === key}
                  <ul class="px-3 pb-2 space-y-1">
                    {#each group.examples as example}
                      <li class="text-caption text-content-subtle font-mono break-all">
                        {example.path}: {example.message}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {/each}
          </ul>

          <p class="text-caption text-content-subtle leading-snug">
            "Copy fix request" puts a correction note on your clipboard - paste it back into the same AI chat and it
            will resend the corrected JSON.
          </p>
        </div>
      {/if}

      {#if pasteText.trim() && issues.length === 0 && repairs.length > 0}
        <div class="p-3.5 bg-warning/10 border border-warning/30 rounded-control space-y-2">
          <button onclick={() => showRepairs = !showRepairs} class="w-full flex items-center justify-between gap-2 text-left">
            <span class="text-label text-warning flex items-center gap-1.5">
              <Icon icon="ic:baseline-auto-fix-high" class="text-sm" />
              Fixed {repairs.length} value{repairs.length === 1 ? '' : 's'} automatically
            </span>
            <Icon icon={showRepairs ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-sm text-content-muted" />
          </button>
          <p class="text-caption text-content-subtle leading-snug">
            Values the AI wrote in the wrong shape were corrected where that was unambiguous. Anything that couldn't be
            represented was moved into the exercise's notes rather than guessed at - review those sessions after importing.
          </p>
          {#if showRepairs}
            <ul class="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
              {#each repairGroups as group (group.label + group.message)}
                <li class="bg-surface/60 rounded-control px-3 py-2">
                  <span class="flex items-start justify-between gap-2">
                    <span class="text-body text-content font-medium truncate">{group.label.split('.').pop()}</span>
                    {#if group.count > 1}
                      <span class="shrink-0 text-caption text-content-subtle tabular-nums">x{group.count}</span>
                    {/if}
                  </span>
                  <span class="block text-caption text-content-muted leading-snug">{group.message}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      {#if logPreview}
        <div class="space-y-3">
          <p class="text-label text-content-subtle">
            Preview - {logPreview.workouts.length} workout(s), {logPreview.totalExercises} exercise(s) will be added to this session
          </p>
        </div>
      {/if}

      {#if (logPreview?.unresolvedExerciseTypeNames.length ?? 0) > 0}
        <div class="space-y-2">
          <p class="text-label text-warning">Unresolved Exercise Types</p>
          {#each logPreview?.unresolvedExerciseTypeNames ?? [] as name}
            <div class="flex items-center justify-between gap-2 px-1">
              <span class="text-body text-content truncate">{name}</span>
              <select
                value={mappingSelectValue(exerciseTypeMapping[normalizeName(name)])}
                onchange={(e) => {
                  const v = e.currentTarget.value;
                  setExerciseMapping(name, v === 'create' ? { action: 'create' } : { action: 'map', id: v });
                }}
                class="bg-surface-elevated text-content text-xs p-2 rounded-control border border-border-strong outline-none"
              >
                <option value="create">+ Create new type "{name}"</option>
                {#each trainingState.exerciseTypes.filter(t => !t.archived) as type}
                  <option value={type.id}>Use "{type.name}"</option>
                {/each}
              </select>
            </div>
          {/each}
        </div>
      {/if}

      <button
        onclick={handleConfirm}
        disabled={!canConfirm || committing}
        class="w-full py-4 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-control shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <Icon icon={committing ? 'ic:baseline-hourglass-empty' : 'ic:baseline-check'} />
        {committing ? 'Importing...' : 'Confirm Import'}
      </button>
    </div>
  </div>
</div>
