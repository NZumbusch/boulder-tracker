<script lang="ts">
  /**
   * Settings -> Training setup -> Targets: a few numbers a normal week should
   * add up to. Home shows the week against them, Insights notes where the
   * last weeks fell short or ran over, and the AI plans to them. Every one is
   * optional - leave a box empty for no target.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { describeTargets, hasTargets } from '../../lib/analytics/targets';
  import { fingerCategoryIds } from '../../lib/analytics/proMetrics';
  import type { AthleteProfile, TrainingTargets } from '../../lib/types';

  const categories = $derived(trainingState.analyticsCategories.filter((c) => !c.archived));

  type Draft = { sessions: string; loadMin: string; loadMax: string; fingerDays: string; shares: Record<string, string> };
  function toDraft(t: TrainingTargets | undefined): Draft {
    return {
      sessions: t?.sessionsPerWeek !== undefined ? String(t.sessionsPerWeek) : '',
      loadMin: t?.loadMin !== undefined ? String(t.loadMin) : '',
      loadMax: t?.loadMax !== undefined ? String(t.loadMax) : '',
      fingerDays: t?.fingerDays !== undefined ? String(t.fingerDays) : '',
      shares: Object.fromEntries(Object.entries(t?.categoryShares ?? {}).map(([id, v]) => [id, String(Math.round(v * 100))])),
    };
  }
  // svelte-ignore state_referenced_locally
  let draft = $state<Draft>(toDraft(trainingState.athleteProfile?.targets));
  // svelte-ignore state_referenced_locally
  let saved = $state<Draft>(toDraft(trainingState.athleteProfile?.targets));
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(saved));
  let justSaved = $state(false);

  const num = (text: string, min: number, max: number): number | undefined => {
    const t = text.trim().replace(',', '.');
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
  };

  const targets = $derived.by((): TrainingTargets => {
    const shares: Record<string, number> = {};
    for (const [id, text] of Object.entries(draft.shares)) {
      const n = num(text, 0, 100);
      if (n !== undefined) shares[id] = n / 100;
    }
    const lo = num(draft.loadMin, 0, 20000);
    const hi = num(draft.loadMax, 0, 20000);
    return {
      ...(num(draft.sessions, 0, 14) !== undefined ? { sessionsPerWeek: Math.round(num(draft.sessions, 0, 14)!) } : {}),
      ...(lo !== undefined ? { loadMin: Math.round(lo) } : {}),
      ...(hi !== undefined ? { loadMax: Math.round(hi) } : {}),
      ...(num(draft.fingerDays, 0, 7) !== undefined ? { fingerDays: Math.round(num(draft.fingerDays, 0, 7)!) } : {}),
      ...(Object.keys(shares).length ? { categoryShares: shares } : {}),
    };
  });
  const shareTotal = $derived(Object.values(targets.categoryShares ?? {}).reduce((a, b) => a + b, 0));
  const rangeProblem = $derived(targets.loadMin !== undefined && targets.loadMax !== undefined && targets.loadMin > targets.loadMax ? 'The lowest load is above the highest.' : '');
  const fingerNames = $derived([...fingerCategoryIds(trainingState.analyticsCategories, trainingState.fingerCategoryIds)].map((id) => trainingState.analyticsCategories.find((c) => c.id === id)?.name ?? id));

  async function save() {
    if (rangeProblem) return;
    const profile = { ...(trainingState.athleteProfile ?? {}), id: 'me' } as AthleteProfile;
    if (hasTargets(targets)) profile.targets = targets;
    else delete profile.targets;
    await trainingState.saveAthleteProfile(profile);
    saved = toDraft(profile.targets);
    draft = toDraft(profile.targets);
    justSaved = true;
    setTimeout(() => (justSaved = false), 2000);
  }

  const input = 'w-full max-w-[12rem] bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm';
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Weekly targets</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">What a normal week should add up to. Home shows the week against these, Insights points out where the last weeks fell short or ran over, and the AI plans to them. Leave a box empty for no target.</p>
  </div>

  <div class="grid grid-cols-2 gap-x-4 gap-y-3">
    <label class="space-y-1 block"><span class="text-label text-content-subtle ml-1 block">Sessions a week</span>
      <input class={input} type="text" inputmode="numeric" placeholder="4" bind:value={draft.sessions} />
    </label>
    <label class="space-y-1 block"><span class="text-label text-content-subtle ml-1 block">Days with finger work</span>
      <input class={input} type="text" inputmode="numeric" placeholder="2" bind:value={draft.fingerDays} />
    </label>
    <label class="space-y-1 block"><span class="text-label text-content-subtle ml-1 block">Weekly load, from</span>
      <input class={input} type="text" inputmode="numeric" placeholder="1500" bind:value={draft.loadMin} />
    </label>
    <label class="space-y-1 block"><span class="text-label text-content-subtle ml-1 block">Weekly load, up to</span>
      <input class={input} type="text" inputmode="numeric" placeholder="2800" bind:value={draft.loadMax} />
    </label>
  </div>
  {#if rangeProblem}<p class="text-caption text-danger px-1">{rangeProblem}</p>{/if}
  {#if draft.fingerDays.trim()}
    <p class="text-caption text-content-subtle px-1">Finger days count sessions with {fingerNames.length ? fingerNames.join(', ') : 'finger categories (none are set yet)'}. Change which under History &amp; Analytics → Filtered load.</p>
  {/if}

  <div class="space-y-2 pt-1">
    <div class="px-1">
      <p class="text-label text-content-subtle">Time split</p>
      <p class="text-caption text-content-subtle">How much of your training time each category should get. Categories you leave empty are free.</p>
    </div>
    <div class="divide-y divide-border">
      {#each categories as c (c.id)}
        <label class="flex items-center justify-between gap-3 py-2">
          <span class="flex items-center gap-2 min-w-0"><span class="w-2 h-2 rounded-full shrink-0 {c.color}"></span><span class="text-body text-content truncate">{c.name}</span></span>
          <span class="flex items-center gap-1.5 shrink-0">
            <input class="w-16 bg-surface-elevated text-content p-2 rounded-control border border-border-strong outline-none text-sm text-right" type="text" inputmode="numeric" placeholder="–" bind:value={draft.shares[c.id]} aria-label="{c.name} share, percent" />
            <span class="text-caption text-content-subtle">%</span>
          </span>
        </label>
      {/each}
    </div>
    {#if shareTotal > 0}
      <p class="text-caption px-1 {shareTotal > 1.0001 ? 'text-status-caution' : 'text-content-subtle'}">{Math.round(shareTotal * 100)}% set{shareTotal > 1.0001 ? ' - more than the whole, so not every target can be met' : `; ${Math.round((1 - shareTotal) * 100)}% is free`}.</p>
    {/if}
  </div>

  {#if hasTargets(targets)}
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The AI is told: {describeTargets(targets, trainingState.analyticsCategories)}.</p>
  {/if}

  <div class="flex items-center gap-3">
    <button onclick={save} disabled={!dirty || !!rangeProblem} class="px-5 py-2.5 bg-primary text-white text-label font-bold rounded-control disabled:opacity-40">Save targets</button>
    {#if justSaved}<span class="text-caption text-success">Saved</span>{/if}
  </div>
</div>
