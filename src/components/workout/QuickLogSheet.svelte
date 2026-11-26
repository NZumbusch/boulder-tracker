<script lang="ts">
  /**
   * Quick log (lib/session/quickLog.ts): a planned or missed session as text,
   * one line per exercise prefilled from the plan, edited in one go and then
   * rated like "Log as planned" - for a session done without the live
   * session screen.
   */
  import Sheet from '../ui/Sheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { atQuery, matchExercises, newExerciseLine, nextLineNumber, replaceLine, sessionToText, textToSlots, type QuickLogContext } from '../../lib/session/quickLog';
  import { generateId } from '../../lib/utils';
  import { tick } from 'svelte';
  import { loggedDateFor } from '../../lib/planning/scheduledDate';
  import { log } from '../../lib/log';
  import type { Workout } from '../../lib/types';

  let { workout, onClose }: { workout: Workout; onClose: () => void } = $props();

  const ctx: QuickLogContext = {
    nameOf: (slot) => slot.test?.name ?? slotTypeName(slot, trainingState.exerciseTypes),
    tracked: (slot) => slot.activeParameters ?? trainingState.exerciseTypes.find((t) => t.id === slot.typeId)?.parameters ?? [],
    weightUnit: trainingState.units.weight,
    findType: (name) => {
      const n = name.trim().toLowerCase();
      const hit = trainingState.exerciseTypes.find((t) => !t.archived && t.name.toLowerCase() === n) ?? trainingState.exerciseTypes.find((t) => t.name.toLowerCase() === n);
      return hit ? { id: hit.id, parameters: hit.parameters } : undefined;
    },
    newId: generateId,
    addedTarget: trainingState.addedExerciseTarget,
  };
  // Taken once: the text is what you edit, the session underneath doesn't change meanwhile (App keys the sheet by session).
  // svelte-ignore state_referenced_locally
  const start = sessionToText(workout.exercises, ctx, workout.groups ?? []);
  let text = $state(start);
  const result = $derived(textToSlots(text, workout.exercises, ctx, workout.groups ?? []));

  // --- @ to add an exercise: what is typed after it filters the library; Enter or a tap puts the exercise's line there.
  let area = $state<HTMLTextAreaElement>();
  let caret = $state(0);
  let active = $state(0);
  /** The caret position where the list was closed with Escape - it stays closed until something else is typed. */
  let dismissedAt = $state<number | null>(null);
  const at = $derived(dismissedAt === caret ? null : atQuery(text, caret));
  const suggestions = $derived(at ? matchExercises(trainingState.exerciseTypes, at.query) : []);
  const trackCaret = () => { caret = area?.selectionStart ?? caret; };

  async function pick(type: { name: string; parameters: import('../../lib/types').ParameterBlock[] }) {
    if (!at) return;
    const indent = text.slice(at.lineStart, at.lineEnd).match(/^(\t| {2,})/)?.[1] ?? '';
    const line = indent + newExerciseLine(nextLineNumber(text, workout.exercises.length), type.name, type.parameters, ctx.weightUnit);
    const next = replaceLine(text, at.lineStart, at.lineEnd, line);
    text = next.text;
    await tick();
    area?.focus();
    area?.setSelectionRange(next.caret, next.caret);
    caret = next.caret;
    active = 0;
  }

  function onKeydown(e: KeyboardEvent) {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % suggestions.length; return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + suggestions.length) % suggestions.length; return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); void pick(suggestions[Math.min(active, suggestions.length - 1)]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismissedAt = caret; return; }
    }
    // A tab indents (a circuit's exercises) instead of leaving the field.
    if (e.key === 'Tab' && !e.shiftKey && area) {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b } = area;
      text = text.slice(0, a) + '\t' + text.slice(b);
      void tick().then(() => { area?.setSelectionRange(a + 1, a + 1); caret = a + 1; });
    }
  }
  $effect(() => { void at?.query; active = 0; });
  const errors = $derived('errors' in result ? result.errors : []);
  const unrated = $derived((text.match(/RPE\s*\?/gi) ?? []).length);

  function save() {
    if (!('slots' in result)) return;
    const w = $state.snapshot(workout) as Workout;
    w.exercises = result.slots;
    w.groups = result.groups.length ? result.groups : w.groups;
    w.status = 'completed';
    // A missed session is recorded on its planned day, not today.
    w.date = loggedDateFor(w);
    log.info('session', `Quick log of ${w.id} "${w.notes ?? ''}": ${result.slots.filter((s) => s.logged).length} logged, ${result.slots.filter((s) => s.skipped).length} skipped - on to the rating`);
    onClose();
    trainingState.openFatigueModal(w);
  }
</script>

<Sheet title="Quick log" subtitle={workout.notes || 'Session'} icon="ic:baseline-subject" level="nested" {onClose} dirty={text !== start} discardMessage="What you typed here will be lost." wide>
  <div class="space-y-3">
    <p class="text-caption text-content-subtle">
      Filled in from the plan: change what was different, set each RPE (1-10), <span class="font-mono">skip</span> what you didn't do. Type <span class="font-mono">@</span> to add an exercise.
    </p>
    <details class="text-caption text-content-subtle">
      <summary class="cursor-pointer text-primary font-semibold min-h-11 flex items-center">How to write it</summary>
      <ul class="list-disc pl-5 space-y-1 pb-2">
        <li>Each line starts with its exercise's number; the name after it is only there to read. Values in any order: <span class="font-mono">5 sets · 8 reps · +20 kg · 7 s on · 15 min · 40° · 20 mm · 6B-7A · RPE 7</span>.</li>
        <li>Per set: <span class="font-mono">10/8/8 reps</span>, <span class="font-mono">+20/22.5/25 kg</span>. A <span class="font-mono">-</span> is a set or circuit round not done: <span class="font-mono">8/-/6 reps</span> logs two sets.</li>
        <li>A comment on an exercise goes after its <span class="font-mono">note:</span> (empty = none). The comment on the whole session comes on the rating screen next.</li>
        <li>A circuit has its own line (rounds, <span class="font-mono">s switch</span>, <span class="font-mono">s round rest</span>) with its exercises indented under it. An exercise added with <span class="font-mono">@</span> indented under it, or between its exercises, joins it.</li>
        <li>Hold types, styles and your own value types stay as planned. Lines starting with <span class="font-mono">#</span> are yours.</li>
      </ul>
    </details>
    <textarea
      bind:this={area}
      bind:value={text}
      oninput={trackCaret}
      onkeyup={trackCaret}
      onclick={trackCaret}
      onkeydown={onKeydown}
      role="combobox"
      aria-expanded={suggestions.length > 0}
      aria-controls="quick-log-suggestions"
      aria-autocomplete="list"
      rows={Math.min(18, Math.max(6, workout.exercises.length * 2))}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      class="input w-full font-mono text-caption leading-relaxed"
      aria-label="The session, one line per exercise"
      aria-describedby="quick-log-status"
    ></textarea>
    {#if at}
      <div id="quick-log-suggestions" role="listbox" aria-label="Exercises" class="rounded-control border border-border bg-surface overflow-hidden">
        {#if suggestions.length === 0}
          <p class="px-3 py-2 text-caption text-content-subtle">No exercise matches "{at.query}".</p>
        {:else}
          {#each suggestions as t, i (t.id)}
            <button
              role="option"
              aria-selected={i === active}
              onmousedown={(e) => e.preventDefault()}
              onclick={() => pick(t)}
              class="w-full text-left px-3 min-h-11 flex items-center justify-between gap-2 {i === active ? 'bg-primary/10' : 'hover:bg-surface-elevated/60'}"
            >
              <span class="text-body text-content truncate">{t.name}</span>
              {#if t.group}<span class="text-caption text-content-subtle shrink-0">{t.group}</span>{/if}
            </button>
          {/each}
        {/if}
      </div>
    {/if}
    <div id="quick-log-status" aria-live="polite">
      <!-- While an exercise is being picked, its unfinished line isn't an error yet. -->
      {#if errors.length && !at}
        <ul class="space-y-1">
          {#each errors as e (`${e.line}|${e.message}`)}
            <li class="text-caption text-danger">{e.line ? `Line ${e.line}: ` : ''}{e.message}</li>
          {/each}
        </ul>
      {:else if unrated}
        <p class="text-caption text-content-subtle">{unrated} exercise{unrated === 1 ? '' : 's'} without an RPE - fine, they stay unrated.</p>
      {/if}
    </div>
  </div>

  {#snippet footer()}
    <button onclick={onClose} class="btn btn-ghost flex-1">Cancel</button>
    <button onclick={save} disabled={errors.length > 0} class="btn btn-primary flex-1">Rate and save</button>
  {/snippet}
</Sheet>
