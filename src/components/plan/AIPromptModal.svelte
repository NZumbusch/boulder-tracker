<script lang="ts">
  /**
   * Stage 10 (UI_PLAN.md §5.8): the condensed "training profile" embedded in
   * every mode below now comes from `buildAIContextProfile`
   * (`src/lib/ai/context.ts`) instead of being hand-assembled here field by
   * field - see that module's own doc comment for what changed and why
   * (training blocks/competitions/readiness/pain logs/outdoor ascents now
   * reach the AI, each gated by `trainingState.aiSharing`, Settings' new
   * "Data & Exports" > "AI Sharing" section). This component still owns the
   * surrounding prompt text (goal, mode framing, output instructions) - it
   * just renders whichever profile fields are present into the same
   * "- Section Name:\n<JSON>" shape the pre-Stage-10 prompt already used.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekIdRange } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import { AI_CHANGESET_INSTRUCTIONS } from '../../lib/ai/changeSetPrompt';
  import { buildPlanContext } from '../../lib/ai/planContext';
  import { buildAIContextProfile, type AIContextProfile, type AIPromptMode } from '../../lib/ai/context';
  import Icon from '@iconify/svelte';

  let { onClose } = $props<{ onClose: () => void }>();

  /** Renders every present field of `profile` as a "- Label:\n<JSON>" section, joined with blank lines - the same human-scannable shape the pre-Stage-10 hand-built prompt used, but data-driven. */
  function renderProfileSections(profile: AIContextProfile, mode: AIPromptMode): string {
    const sections: string[] = [];
    if (profile.exerciseModalities) {
      sections.push(`- Custom Exercise Modalities (name, category, tracked fields):\n${profile.exerciseModalities.map((m) => JSON.stringify(m)).join('\n')}`);
    }
    if (profile.analyticsCategories) {
      sections.push(`- Analytics Categories (pick one for a new exercise's "categoryName" if you invent one - see the rules below):\n${JSON.stringify(profile.analyticsCategories, null, 2)}`);
    }
    // In "generate" the current-plan section already lists phases and blocks in full.
    if (profile.phases && mode !== 'generate') {
      sections.push(`- Available Phases: ${profile.phases.join(', ')}.`);
    }
    sections.push(
      mode === 'analyze'
        ? `- Completed Workouts (Target Timeframe):\n${JSON.stringify(profile.recentWorkouts, null, 2)}`
        : `- Recent Workouts (Last ${profile.recentWorkouts.length}):\n${JSON.stringify(profile.recentWorkouts, null, 2)}`,
    );
    sections.push(
      mode === 'analyze'
        ? `- Benchmarks Recorded (Target Timeframe):\n${JSON.stringify(profile.benchmarks, null, 2)}`
        : `- My Benchmarks:\n${JSON.stringify(profile.benchmarks, null, 2)}`,
    );
    if (profile.trainingBlocks && mode !== 'generate') {
      sections.push(`- Training Blocks (covering or near the timeframe):\n${JSON.stringify(profile.trainingBlocks, null, 2)}`);
    }
    if (profile.goals) {
      sections.push(`- Upcoming Goals (competitions and outdoor trips I'm peaking for; trips list the problems I want to send there):\n${JSON.stringify(profile.goals, null, 2)}`);
    }
    if (profile.readiness) {
      sections.push(`- Readiness Snapshot:\n${JSON.stringify(profile.readiness, null, 2)}`);
    }
    if (profile.painLogs) {
      sections.push(`- Recent Pain/Discomfort Logs:\n${JSON.stringify(profile.painLogs, null, 2)}`);
    }
    if (profile.outdoorAscents) {
      sections.push(`- Recent Outdoor Ascents:\n${JSON.stringify(profile.outdoorAscents, null, 2)}`);
    }
    if (profile.weekNotes && profile.weekNotes.length > 0) {
      sections.push(`- My Week Notes (circumstances and ideas I wrote down for specific weeks - take them into account):\n${JSON.stringify(profile.weekNotes, null, 2)}`);
    }
    return sections.join('\n\n');
  }

  let startWeek = $state(trainingState.currentWeekId);
  let endWeek = $state(trainingState.currentWeekId);
  let goal = $state('');

  /** The weeks the prompt targets. */
  const selectedWeekIds = $derived(getWeekIdRange(startWeek, endWeek));
  let mode = $state<'generate' | 'analyze' | 'context'>('generate');

  const weekOptions = $derived.by(() => {
    const opts = [];
    for (let i = -5; i <= 24; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      opts.push({ id, label: `Week ${id.split('-W')[1]} (${d.getUTCFullYear()})` + (i === 0 ? ' - Current' : '') });
    }
    return opts;
  });

  async function handleCopyPrompt() {
    try {
      if (startWeek > endWeek) {
        await showAlert('Input Error', 'Start week must be before or equal to end week.');
        return;
      }
      const targetWeekIds = getWeekIdRange(startWeek, endWeek);
      const profile = buildAIContextProfile(
        mode,
        {
          exerciseTypes: trainingState.exerciseTypes,
          analyticsCategories: trainingState.analyticsCategories,
          phaseDefs: trainingState.phaseDefs,
          workouts: trainingState.workouts,
          benchmarks: trainingState.benchmarks,
          trainingBlocks: trainingState.trainingBlocks,
          goals: trainingState.goals,
          dailyMetrics: trainingState.dailyMetrics,
          painLogs: trainingState.painLogs,
          outdoorAscents: trainingState.outdoorAscents,
          weekNotes: trainingState.weekNotes,
        },
        trainingState.aiSharing,
        new Date(),
        targetWeekIds,
        { readiness: trainingState.readinessConfig, fatigueHalfLife: trainingState.fatigueHalfLife },
      );
      const profileText = renderProfileSections(profile, mode);

      let prompt = '';

      if (mode === 'context') {
        prompt = `Here is my condensed training profile (no specific question attached - I'll ask you directly after pasting this):

${profileText}`;
      } else if (mode === 'generate') {
        const planContext = buildPlanContext({
          exerciseTypes: trainingState.exerciseTypes,
          phaseDefs: trainingState.phaseDefs,
          templates: trainingState.templates,
          trainingBlocks: trainingState.trainingBlocks,
          workouts: trainingState.workouts,
          weekOverrides: trainingState.weekOverrides,
          weekNotes: trainingState.weekNotes,
          targetWeekIds,
        });
        prompt = `You are an elite climbing coach managing my training plan in an app. Based on my goal, my training history and my current plan below, decide what to change - from building a whole new plan to adjusting a single session - and reply with a change set.

Target Timeframe (the weeks you may change): ${targetWeekIds.join(', ')}

My Goal & Notes for this cycle:
${goal || 'No specific goals provided. Optimize for general climbing performance.'}

My training profile:
${profileText}

My current plan:
${planContext}

${AI_CHANGESET_INSTRUCTIONS}`;
      } else {
        prompt = `You are an elite climbing coach. Please analyze my training data and performance from the specified timeframe and give me detailed feedback.

Target Timeframe Analysed:
${targetWeekIds.join(', ')}

My Goal & Notes for this cycle:
${goal || 'No specific goals provided. Just tell me what I did well and what I should change.'}

Here is the data for the weeks in question:
${profileText}

Based on this data, please evaluate:
1. Did I train the right things for my goals?
2. Was my training load and frequency appropriate?
3. What are my apparent strengths and weaknesses?
4. What actionable changes should I make for my next training cycle?`;
      }

      await navigator.clipboard.writeText(prompt);
      await showAlert('Copied!', mode === 'context'
        ? 'Your training context has been copied to the clipboard. Paste it into your preferred AI, then ask it anything.'
        : 'Your detailed prompt and condensed context have been copied to the clipboard. Paste it into your preferred AI to generate a plan!');
      onClose();
    } catch (err: any) {
      await showAlert('Error', 'Failed to copy to clipboard: ' + err.message);
    }
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300 p-0 sm:p-4 pb-[80px]">
  <!-- Clickable backdrop to close -->
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="0" aria-label="Close AI Generator"></div>
  
  <div class="relative w-full sm:max-w-md bg-surface border-t sm:border border-border-strong rounded-t-2xl sm:rounded-card shadow-2xl flex flex-col max-h-[85vh]">
    <div class="p-5 border-b border-border-strong flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-title text-content flex items-center gap-2">
          <Icon icon="ic:baseline-auto-awesome" class="text-primary text-xl" />
          AI Coach Prompt
        </h2>
        <p class="text-caption text-content-subtle mt-1">Generate a prompt to copy/paste</p>
      </div>
      <button onclick={onClose} class="p-2 text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-control transition-all"><Icon icon="ic:baseline-close" class="text-lg" /></button>
    </div>

    <div class="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
      <div class="space-y-4">
        <div class="flex bg-surface-elevated/50 p-1 rounded-control">
          <button onclick={() => mode = 'generate'} class="flex-1 py-2 text-label rounded-control transition-all {mode === 'generate' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Generate Plan</button>
          <button onclick={() => mode = 'analyze'} class="flex-1 py-2 text-label rounded-control transition-all {mode === 'analyze' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Analyze Past</button>
          <button onclick={() => mode = 'context'} class="flex-1 py-2 text-label rounded-control transition-all {mode === 'context' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Context Only</button>
        </div>

        <p class="text-caption text-content-subtle px-1 flex items-center gap-1.5">
          <Icon icon="ic:baseline-info" class="text-sm shrink-0" />
          Manage what's included (training blocks, readiness, pain logs, ...) in Settings → Data & Exports → AI Sharing.
        </p>

        {#if mode === 'context'}
          <p class="text-body text-content-subtle px-1">
            Copies just your training profile - no coaching prompt attached. Paste it into any AI chat to ask your own free-form questions.
          </p>
        {:else}
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label for="ai-start-week" class="text-label text-content-subtle ml-1">Start Week</label>
              <select id="ai-start-week" bind:value={startWeek} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm appearance-none">
                {#each weekOptions as opt}
                  <option value={opt.id}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="space-y-1.5">
              <label for="ai-end-week" class="text-label text-content-subtle ml-1">End Week</label>
              <select id="ai-end-week" bind:value={endWeek} class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm appearance-none">
                {#each weekOptions as opt}
                  <option value={opt.id}>{opt.label}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="ai-goal" class="text-label text-content-subtle ml-1">Your Goal / Notes</label>
            <textarea id="ai-goal" bind:value={goal} rows="4" placeholder="e.g. I want to prepare for a trip to Font in 4 weeks. Focus on Power Endurance and slopers." class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-sm resize-none"></textarea>
          </div>

          {#if mode === 'generate'}
            <p class="text-caption text-content-subtle px-1 leading-snug">
              The AI sees your phases' typical weeks and these {selectedWeekIds.length} week{selectedWeekIds.length === 1 ? '' : 's'}, and replies with a change set - anything from a whole new plan to one changed exercise: new or edited exercises, phases and weeks, plus block, week and session notes. You review every change before it's applied. Paste its reply into "Import AI Plan" on the Training Plan screen.
            </p>
          {/if}
        {/if}
      </div>

      <button onclick={handleCopyPrompt} class="w-full py-4 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-control shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2">
        <Icon icon="ic:baseline-content-copy" /> Copy {mode === 'context' ? 'Context' : 'Prompt'}
      </button>
    </div>
  </div>
</div>
