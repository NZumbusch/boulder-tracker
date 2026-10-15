<script lang="ts">
  /**
   * How much goes into an AI prompt: the history window and the prompt detail. One place for both - Settings
   * shows it as part of "AI Sharing", the AI Coach opens it from its tune icon, and the choice is the same
   * for every kind of prompt (change plan, analyze, context), so changing it in either place is changing it everywhere.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { formatTokens } from '../../lib/ai/coachPrompt';
  import { promptBreakdown, saveCompact } from '../../lib/ai/promptSize';
  import AIHistoryPicker from './AIHistoryPicker.svelte';
  import Icon from '@iconify/svelte';
  import Segmented from '../ui/Segmented.svelte';

  let { compact = $bindable(true), prompt, showHistory = true }: {
    compact?: boolean;
    /** The prompt as it will be copied: with it the panel can show what takes the space. */
    prompt?: string;
    /** Analyze sends the sessions of the chosen weeks, so the history window doesn't apply there. */
    showHistory?: boolean;
  } = $props();

  function setCompact(next: boolean) {
    compact = next;
    saveCompact(next);
  }

  let showBreakdown = $state(false);
  const breakdown = $derived(prompt && showBreakdown ? promptBreakdown(prompt).slice(0, 6) : []);
</script>

<div class="space-y-4">
  {#if showHistory}
    <div class="space-y-2">
      <div>
        <p class="text-body text-content">Training history</p>
        <p class="text-caption text-content-subtle mt-0.5 leading-relaxed">Recent weeks go session by session; older weeks as one line each (sessions, minutes per category, load, average ratings).</p>
      </div>
      <AIHistoryPicker value={trainingState.aiHistory} onchange={(next) => trainingState.setAiHistory(next)} />
    </div>
  {/if}

  <div class="space-y-2">
    <div class="flex items-center justify-between gap-3">
      <p class="text-body text-content">Prompt detail</p>
      <Segmented
        variant="setting"
        label="Prompt detail"
        value={compact ? 'compact' : 'full'}
        onChange={(v) => setCompact(v === 'compact')}
        options={[{ value: 'compact', label: 'Compact' }, { value: 'full', label: 'Full' }]}
      />
    </div>
    <ul class="text-caption text-content-subtle leading-relaxed space-y-1 list-disc pl-4">
      {#if compact}
        <li><span class="text-content-muted">Phases:</span> the ones your target weeks use are listed without exercise notes; the others by session name only.</li>
        <li><span class="text-content-muted">Outdoor ascents:</span> only the latest 8.</li>
        <li>Smaller and cheaper. The AI can still change any exercise - changes merge into what is there, so no note is lost.</li>
      {:else}
        <li><span class="text-content-muted">Phases:</span> every phase's typical week in full, with every exercise note.</li>
        <li><span class="text-content-muted">Outdoor ascents:</span> the whole log.</li>
        <li>Larger. Worth it when the AI should reason about your notes and cues, or about phases far from the target weeks.</li>
      {/if}
      <li>Doesn't touch what's shared (see the switches under AI sharing).</li>
    </ul>
  </div>

  {#if prompt}
    <div>
      <button onclick={() => (showBreakdown = !showBreakdown)} class="btn-quiet text-label text-primary gap-1 px-1" aria-expanded={showBreakdown}>
        <Icon icon={showBreakdown ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-lg" />What takes the space
      </button>
      {#if showBreakdown}
        <ul class="space-y-1 mt-2">
          {#each breakdown as part (part.label)}
            <li class="flex items-center gap-2 text-caption">
              <span class="w-24 shrink-0 h-1.5 rounded-full bg-surface-elevated overflow-hidden"><span class="block h-full bg-primary/60" style="width: {Math.max(4, (part.tokens / breakdown[0].tokens) * 100)}%"></span></span>
              <span class="flex-1 min-w-0 truncate text-content-muted">{part.label}</span>
              <span class="tabular-nums text-content-subtle shrink-0">{formatTokens(part.tokens)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
