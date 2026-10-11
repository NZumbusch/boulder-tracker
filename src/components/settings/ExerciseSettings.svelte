<script lang="ts">
  import type { ExerciseTypeDef, AnalyticsCategory, WorkoutTemplate } from '../../lib/types';
  import ExerciseLibrary from './ExerciseLibrary.svelte';
  import AnalyticsCategorySettings from './AnalyticsCategorySettings.svelte';
  import AICoachModal from '../plan/AICoachModal.svelte';
  import Icon from '@iconify/svelte';

  let {
    exerciseTypes = $bindable(),
    analyticsCategories = $bindable(),
    templates,
  }: {
    exerciseTypes: ExerciseTypeDef[];
    analyticsCategories: AnalyticsCategory[];
    templates: Record<string, WorkoutTemplate[]>;
  } = $props();

  type SubTab = 'modalities' | 'categories';
  let subTab = $state<SubTab>('modalities');
  let organising = $state(false);
</script>

<div class="card space-y-4">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Exercises</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Everything you can put in a session, in groups - each with the fields it tracks and an optional how-to.</p>
  </div>

  <button
    onclick={() => organising = true}
    class="w-full flex items-center justify-between gap-3 p-3 rounded-control bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors text-left"
  >
    <span class="flex items-center gap-3 min-w-0">
      <Icon icon="ic:baseline-auto-awesome" class="text-xl text-primary shrink-0" />
      <span class="min-w-0">
        <span class="block text-body font-semibold text-content">Organise with AI</span>
        <span class="block text-caption text-content-subtle">Split "Other", regroup exercises - you tick what to apply</span>
      </span>
    </span>
    <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" />
  </button>

  <div class="seg p-1">
    <button
      onclick={() => subTab = 'modalities'}
      class="seg-item flex-1 py-1.5 text-label {subTab === 'modalities' ? 'seg-on' : 'hover:text-content'}"
    >
      Library
    </button>
    <button
      onclick={() => subTab = 'categories'}
      class="seg-item flex-1 py-1.5 text-label {subTab === 'categories' ? 'seg-on' : 'hover:text-content'}"
    >
      Analytics Categories
    </button>
  </div>

  {#if subTab === 'modalities'}
    <ExerciseLibrary bind:exerciseTypes {analyticsCategories} {templates} />
  {:else}
    <div class="space-y-2">
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Groupings used only by the charts in the Analytics tab (e.g. "Fingers", "Power Bouldering") — reorder them to change chart legend order. Every modality picks one of these as its default; nothing here changes what you can log.</p>
    </div>
    <AnalyticsCategorySettings bind:analyticsCategories {templates} />
  {/if}
</div>

{#if organising}
  <AICoachModal initialMode="organise" onClose={() => organising = false} />
{/if}
