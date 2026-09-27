<script lang="ts">
  /**
   * Settings -> Coach notes: the AI coach's memory, visible and editable.
   * About me and the standing goal are yours; coach notes are proposed by an
   * AI (and ticked by you in the AI Coach's review) or written here. All of
   * it goes with every AI Coach prompt - see lib/ai/coachNotes.ts.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { MAX_COACH_NOTES, MAX_COACH_NOTE_LENGTH } from '../../lib/ai/coachNotes';
  import type { AthleteProfile } from '../../lib/types';

  type Draft = { [K in keyof Omit<AthleteProfile, 'id'>]-?: string };
  const FIELDS: { key: keyof Draft; label: string; placeholder: string; kind: 'number' | 'text' | 'area' }[] = [
    { key: 'heightCm', label: 'Height (cm)', placeholder: '178', kind: 'number' },
    { key: 'apeIndexCm', label: 'Ape index (cm)', placeholder: '+4', kind: 'number' },
    { key: 'climbingSince', label: 'Climbing since', placeholder: '2019', kind: 'number' },
    { key: 'maxBoulderIndoor', label: 'Hardest boulder indoors', placeholder: '7A', kind: 'text' },
    { key: 'maxBoulderOutdoor', label: 'Hardest boulder outdoors', placeholder: '7A+', kind: 'text' },
    { key: 'boardLevels', label: 'Board levels', placeholder: 'Kilter 40°: 7A · Moonboard 2016: 6C+', kind: 'text' },
    { key: 'injuries', label: 'Injuries / careful with', placeholder: 'Left elbow gets irritated by one-arm lock-offs', kind: 'area' },
    { key: 'availability', label: 'Availability & equipment', placeholder: '4 days a week, evenings; hangboard at home', kind: 'area' },
    { key: 'longTermGoals', label: 'Long-term goals', placeholder: 'Climb 7B outdoors, get stronger on slopers', kind: 'area' },
    { key: 'other', label: 'Anything else', placeholder: 'Anything a coach should know about you', kind: 'area' },
  ];

  function toDraft(p: AthleteProfile | undefined): Draft {
    const d = {} as Draft;
    for (const f of [...FIELDS.map((x) => x.key), 'standingGoal' as const]) d[f] = p?.[f] !== undefined ? String(p[f]) : '';
    return d;
  }
  // svelte-ignore state_referenced_locally
  let draft = $state<Draft>(toDraft(trainingState.athleteProfile));
  let saved = $state<Draft>(toDraft(trainingState.athleteProfile));
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(saved));
  let justSaved = $state(false);

  async function saveProfile() {
    const fields: Record<string, string | number> = {};
    for (const f of FIELDS) {
      const v = draft[f.key].trim();
      if (!v) continue;
      if (f.kind === 'number') {
        const n = Number(v.replace(',', '.'));
        if (Number.isFinite(n)) fields[f.key] = n;
      } else {
        fields[f.key] = v;
      }
    }
    if (draft.standingGoal.trim()) fields.standingGoal = draft.standingGoal.trim();
    const profile = { ...fields, id: 'me' } as AthleteProfile;
    await trainingState.saveAthleteProfile(profile);
    draft = toDraft(profile);
    saved = toDraft(profile);
    justSaved = true;
    setTimeout(() => (justSaved = false), 2000);
  }

  // --- Coach notes ---
  let editingId = $state<string | null>(null);
  let editText = $state('');
  let newText = $state('');
  const notes = $derived(trainingState.coachNotes);
  const sharingOff = $derived(trainingState.aiSharing.coachNotes === false);
  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  async function saveEdit() {
    if (editingId && (await trainingState.saveCoachNote(editText, editingId))) editingId = null;
  }
  async function addNote() {
    if (await trainingState.saveCoachNote(newText)) newText = '';
  }
</script>

<div class="space-y-4">
  <div class="card space-y-2 animate-in fade-in">
    <p class="text-caption text-content-subtle leading-relaxed">
      What the AI Coach knows about you before it reads your data - sent with every prompt, so you don't have to repeat it in each chat, in any AI app.
      {#if sharingOff}<span class="text-status-caution">Currently not sent: turn on "Coach Notes & About Me" in Connections & Exports → AI Sharing.</span>{/if}
    </p>
  </div>

  <!-- About me + standing goal: yours. -->
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-1 px-1">
      <h3 class="text-section uppercase text-content-muted">About me</h3>
      <p class="text-caption text-content-subtle">Only what the app doesn't track already - leave anything blank.</p>
    </div>
    <div class="grid grid-cols-3 gap-2">
      {#each FIELDS.filter((f) => f.kind === 'number') as f (f.key)}
        <label class="space-y-1 min-w-0">
          <span class="text-caption text-content-subtle block truncate">{f.label}</span>
          <input bind:value={draft[f.key]} inputmode="decimal" placeholder={f.placeholder} class="w-full bg-surface-elevated/50 text-content px-2.5 py-2 rounded-control border border-border-strong outline-none text-sm focus:border-primary/60" />
        </label>
      {/each}
    </div>
    {#each FIELDS.filter((f) => f.kind !== 'number') as f (f.key)}
      <label class="block space-y-1">
        <span class="text-caption text-content-subtle">{f.label}</span>
        {#if f.kind === 'area'}
          <textarea bind:value={draft[f.key]} rows="2" placeholder={f.placeholder} class="w-full bg-surface-elevated/50 text-content px-3 py-2 rounded-control border border-border-strong outline-none text-sm leading-relaxed resize-y focus:border-primary/60"></textarea>
        {:else}
          <input bind:value={draft[f.key]} placeholder={f.placeholder} class="w-full bg-surface-elevated/50 text-content px-3 py-2 rounded-control border border-border-strong outline-none text-sm focus:border-primary/60" />
        {/if}
      </label>
    {/each}
    <div class="pt-3 border-t border-border space-y-1">
      <span class="text-body text-content block">Standing goal</span>
      <span class="text-caption text-content-subtle block">What the coach works towards unless a request says otherwise - no need to type it into every request.</span>
      <textarea bind:value={draft.standingGoal} rows="2" placeholder="Flash 7A outdoors by spring, without flaring the elbow" class="w-full bg-surface-elevated/50 text-content px-3 py-2 rounded-control border border-border-strong outline-none text-sm leading-relaxed resize-y focus:border-primary/60"></textarea>
    </div>
    <button onclick={saveProfile} disabled={!dirty} class="w-full py-2.5 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
      {#if justSaved}<Icon icon="ic:baseline-check" class="text-base" /> Saved{:else}Save{/if}
    </button>
  </div>

  <!-- Coach notes: the AI's memory, ticked by you. -->
  <div class="card space-y-3 animate-in fade-in">
    <div class="space-y-1 px-1">
      <h3 class="text-section uppercase text-content-muted flex items-center justify-between">
        <span>Coach notes</span>
        <span class="normal-case tracking-normal font-normal text-caption text-content-subtle tabular-nums">{notes.length} of {MAX_COACH_NOTES}</span>
      </h3>
      <p class="text-caption text-content-subtle leading-relaxed">What earlier AI coaches learned about you. An AI can propose adding, changing or removing notes when you change your plan with it - nothing is saved until you tick it in the review. Notes you write or edit are yours, and AIs leave them alone.</p>
    </div>

    <div class="divide-y divide-border">
      {#each notes as note (note.id)}
        <div class="py-2.5">
          {#if editingId === note.id}
            <textarea bind:value={editText} rows="3" maxlength={MAX_COACH_NOTE_LENGTH} class="w-full bg-surface-elevated/50 text-content px-3 py-2 rounded-control border border-border-strong outline-none text-sm leading-relaxed resize-y focus:border-primary/60"></textarea>
            <div class="flex items-center gap-2 mt-1.5">
              <button onclick={saveEdit} class="px-3 py-1.5 rounded-control bg-primary text-white text-label font-semibold">Save</button>
              <button onclick={() => (editingId = null)} class="px-2 py-1.5 text-label text-content-subtle">Cancel</button>
              <span class="ml-auto text-caption text-content-subtle tabular-nums">{editText.length}/{MAX_COACH_NOTE_LENGTH}</span>
            </div>
          {:else}
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <p class="text-body text-content leading-snug">{note.text}</p>
                <p class="text-caption text-content-subtle mt-0.5">{note.source === 'me' ? 'You' : 'AI coach'} · {note.updatedOn ? `changed ${fmtDay(note.updatedOn)}` : fmtDay(note.addedOn)}</p>
              </div>
              <button onclick={() => { editingId = note.id; editText = note.text; }} class="p-1 text-content-subtle hover:text-content shrink-0" aria-label="Edit note"><Icon icon="ic:baseline-edit" class="text-base" /></button>
              <button onclick={() => trainingState.deleteCoachNote(note.id)} class="p-1 text-content-subtle hover:text-danger shrink-0" aria-label="Delete note"><Icon icon="ic:baseline-delete" class="text-base" /></button>
            </div>
          {/if}
        </div>
      {:else}
        <p class="text-caption text-content-subtle italic py-2">No notes yet. They appear as AI coaches learn about you - or add your own.</p>
      {/each}
    </div>

    {#if notes.length < MAX_COACH_NOTES}
      <div class="flex items-start gap-2 pt-2 border-t border-border">
        <textarea bind:value={newText} rows="1" maxlength={MAX_COACH_NOTE_LENGTH} placeholder="Add a note for your AI coach…" class="flex-1 min-w-0 bg-surface-elevated/50 text-content px-3 py-2 rounded-control border border-border-strong outline-none text-sm leading-relaxed resize-y focus:border-primary/60"></textarea>
        <button onclick={addNote} disabled={!newText.trim()} class="px-3 py-2 rounded-control bg-primary text-white text-label font-semibold disabled:opacity-40 shrink-0">Add</button>
      </div>
    {/if}
  </div>
</div>
