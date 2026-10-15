<script lang="ts">
  /**
   * Renders one topic of the adjustable thresholds (`preferences/tunables.ts`)
   * generically: grouped under their headings, numbers as fields with their
   * unit, switches for on/off entries, and a reset for the whole topic.
   * Everything is validated (clamped, kept in order) on save by the store; a number outside its range says so here
   * before it snaps back. A row that is not at its default shows the default and a Reset of its own.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { TUNABLES, type NumberTunable, type TunableDef, type TunableTopic } from '../../lib/preferences/tunables';
  import { displayTemp, toCelsius, temperatureUnit } from '../../lib/units';
  import { showUndo } from '../../lib/toast.svelte';
  import type { TermId } from '../../lib/help/glossary';
  import Icon from '@iconify/svelte';
  import Toggle from '../ui/Toggle.svelte';
  import InfoButton from '../common/InfoButton.svelte';

  /** `ids` shows only those entries of the topic (a topic can be split over pages); reset then applies to them alone. */
  let { topic, title, ids }: { topic: TunableTopic; title: string; ids?: string[] } = $props();

  const defs = TUNABLES.filter((t) => t.topic === topic && (!ids || ids.includes(t.id)));
  const groups = [...new Set(defs.map((d) => d.group))].map((group) => ({ group, defs: defs.filter((d) => d.group === group) }));

  const isTemp = (def: NumberTunable) => def.unit === '°C';

  /** Which entries only matter while another one is on (their hints say "only with ..."). */
  const DEPENDS_ON: Record<string, string[]> = {
    'plan.calendarPhaseNames': ['plan.calendarPhases'],
    'plan.calendarPhaseTint': ['plan.calendarPhases'],
    'plan.exerciseList': ['plan.weekAgenda'],
    'fatigue.soften': ['fatigue.sumStacking'],
    'fatigue.softKnee': ['fatigue.sumStacking', 'fatigue.soften'],
    'alerts.insightHour': ['alerts.insightNotify'],
  };
  const isOff = (def: TunableDef) => (DEPENDS_ON[def.id] ?? []).some((p) => trainingState.tunables[p] === false);

  /** The glossary entry that explains the term a heading or row is about. */
  const helpFor = (def: TunableDef): TermId | null => (def.group === 'ACWR zones' || def.id === 'readiness.useAcwr' ? 'acwr' : def.group === 'Fatigue' && def.id === 'fatigue.halfLifeDays' ? 'fatigue' : null);

  const UNIT_WORDS: Record<string, string> = { pts: 'points' };
  const WEEKDAYS = ['Never', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /** The value as shown: percentages x100, temperatures in the chosen unit. */
  function toShown(def: NumberTunable, v: number): number {
    if (def.percent) return Math.round(v * 1000) / 10;
    if (isTemp(def)) return Math.round(displayTemp(v, trainingState.units.temperature));
    return v;
  }
  const shown = (def: NumberTunable) => toShown(def, trainingState.tunable(def.id) as number);
  function unitLabel(def: NumberTunable): string {
    if (def.percent) return '%';
    if (isTemp(def)) return temperatureUnit(trainingState.units.temperature);
    return UNIT_WORDS[def.unit ?? ''] ?? def.unit ?? '';
  }
  const raw = (def: TunableDef) => trainingState.tunables[def.id];
  const changed = (def: TunableDef) => raw(def) !== def.default;
  const anyChanged = $derived(defs.some((d) => raw(d) !== d.default));

  /** Rows whose typed value was outside the allowed range: the message stays until the next edit. */
  let rangeNote = $state<Record<string, string>>({});
  function commit(def: NumberTunable, text: string) {
    const n = parseFloat(text.replace(',', '.'));
    if (Number.isNaN(n)) { delete rangeNote[def.id]; return; }
    const lo = toShown(def, def.min);
    const hi = toShown(def, def.max);
    rangeNote[def.id] = n < lo || n > hi ? `Allowed range is ${lo} to ${hi}, so it was set to ${Math.min(hi, Math.max(lo, n))}.` : '';
    const value = def.percent ? n / 100 : isTemp(def) ? toCelsius(n, trainingState.units.temperature) : n;
    trainingState.setTunable(def.id, value);
  }

  const defaultText = (def: TunableDef) =>
    def.kind === 'boolean' ? (def.default ? 'on' : 'off') : def.zeroMeansOff && def.default === 0 ? 'off' : `${toShown(def, def.default)} ${unitLabel(def)}`.trim();

  function resetOne(def: TunableDef) {
    const before = raw(def);
    trainingState.setTunable(def.id, def.default);
    delete rangeNote[def.id];
    showUndo(`${def.label} reset`, () => trainingState.setTunable(def.id, before));
  }
  function reset() {
    const before = defs.map((d) => [d.id, raw(d)] as const);
    if (ids) for (const def of defs) trainingState.setTunable(def.id, def.default);
    else trainingState.resetTunables(topic);
    rangeNote = {};
    showUndo(`${title} back to the defaults`, () => { for (const [id, v] of before) trainingState.setTunable(id, v); });
  }
</script>

<div class="card space-y-5 animate-in fade-in">
  <div class="flex items-center justify-between gap-3">
    <h2 class="text-section uppercase text-content-muted px-1">{title}</h2>
    <button onclick={reset} disabled={!anyChanged} class="btn-quiet gap-1 px-2 text-label text-content-muted hover:text-primary disabled:opacity-40">
      <Icon icon="ic:baseline-restore" class="text-base" /> Reset to defaults
    </button>
  </div>

  {#each groups as { group, defs: items }}
    <div class="divide-y divide-border">
      <p class="text-label text-content-subtle pb-1">{group}{#if group === 'ACWR zones'} <InfoButton term="acwr" />{/if}</p>
      {#each items as def (def.id)}
        {@const off = isOff(def)}
        <div class={off ? 'opacity-60' : ''}>
          {#if def.kind === 'boolean'}
            <Toggle checked={trainingState.tunables[def.id] as boolean} onChange={(v) => trainingState.setTunable(def.id, v)} label={def.label} hint={def.hint} disabled={off} />
          {:else}
            {@const value = shown(def)}
            {@const id = `tun-${def.id}`}
            <div class="flex items-center justify-between gap-3 py-2 min-h-11">
              <label for={id} class="min-w-0">
                <span class="block text-body text-content">{def.label}{#if helpFor(def) && group !== 'ACWR zones'} <InfoButton term={helpFor(def)!} />{/if}</span>
                {#if def.hint}<span class="block text-caption text-content-subtle mt-0.5">{def.hint}</span>{/if}
              </label>
              <div class="flex items-center gap-1.5 shrink-0">
                {#if def.id === 'checkin.day'}
                  <select
                    {id}
                    class="field !w-auto"
                    value={String(value)}
                    onchange={(e) => trainingState.setTunable(def.id, Number(e.currentTarget.value))}
                  >
                    {#each WEEKDAYS as day, n (n)}<option value={String(n)}>{day}</option>{/each}
                  </select>
                {:else}
                  {#key value}
                    <input
                      {id}
                      type="number"
                      inputmode="decimal"
                      value={value}
                      min={toShown(def, def.min)}
                      max={toShown(def, def.max)}
                      step={def.percent ? def.step * 100 : def.step}
                      onchange={(e) => commit(def, e.currentTarget.value)}
                      onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      class="field !w-24 text-right tabular-nums"
                    />
                  {/key}
                  <span class="w-14 text-caption text-content-subtle">{def.zeroMeansOff && value === 0 ? 'off' : unitLabel(def)}</span>
                {/if}
              </div>
            </div>
          {/if}
          {#if rangeNote[def.id]}<p class="text-caption text-status-caution pb-2" role="status">{rangeNote[def.id]}</p>{/if}
          {#if changed(def)}
            <p class="flex items-center gap-2 text-caption text-content-subtle pb-1.5">
              <span>Default: {defaultText(def)}</span>
              <button type="button" class="btn-quiet px-2 text-primary" onclick={() => resetOne(def)}>Reset</button>
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>
