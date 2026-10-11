<script lang="ts">
  /**
   * Renders one topic of the adjustable thresholds (`preferences/tunables.ts`)
   * generically: grouped under their headings, numbers as fields with their
   * unit, switches for on/off entries, and a reset for the whole topic.
   * Everything is validated (clamped, kept in order) on save by the store.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { TUNABLES, type NumberTunable, type TunableTopic } from '../../lib/preferences/tunables';
  import { displayTemp, toCelsius, temperatureUnit } from '../../lib/units';
  import { showConfirm } from '../../lib/utils';
  import Icon from '@iconify/svelte';

  /** `ids` shows only those entries of the topic (a topic can be split over pages); reset then applies to them alone. */
  let { topic, title, ids }: { topic: TunableTopic; title: string; ids?: string[] } = $props();

  const defs = TUNABLES.filter((t) => t.topic === topic && (!ids || ids.includes(t.id)));
  const groups = [...new Set(defs.map((d) => d.group))].map((group) => ({ group, defs: defs.filter((d) => d.group === group) }));

  const isTemp = (def: NumberTunable) => def.unit === '°C';

  /** The value as shown: percentages x100, temperatures in the chosen unit. */
  function shown(def: NumberTunable): number {
    const v = trainingState.tunable(def.id);
    if (def.percent) return Math.round(v * 1000) / 10;
    if (isTemp(def)) return Math.round(displayTemp(v, trainingState.units.temperature));
    return v;
  }
  function unitLabel(def: NumberTunable): string {
    if (def.percent) return '%';
    if (isTemp(def)) return temperatureUnit(trainingState.units.temperature);
    return def.unit ?? '';
  }
  function commit(def: NumberTunable, raw: string) {
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return;
    const value = def.percent ? n / 100 : isTemp(def) ? toCelsius(n, trainingState.units.temperature) : n;
    trainingState.setTunable(def.id, value);
  }

  async function reset() {
    if (!(await showConfirm('Reset to defaults', `Put every ${title} setting back to its default?`))) return;
    if (ids) for (const def of defs) trainingState.setTunable(def.id, def.default);
    else trainingState.resetTunables(topic);
  }
</script>

<div class="card space-y-5 animate-in fade-in">
  <div class="flex items-center justify-between gap-3">
    <h3 class="text-section uppercase text-content-muted px-1">{title}</h3>
    <button onclick={reset} class="flex items-center gap-1 text-caption text-content-subtle hover:text-primary transition-colors">
      <Icon icon="ic:baseline-restore" class="text-sm" /> Reset to defaults
    </button>
  </div>

  {#each groups as { group, defs: items }}
    <div class="divide-y divide-border">
      <p class="text-label text-content-subtle pb-1">{group}</p>
      {#each items as def (def.id)}
        {#if def.kind === 'boolean'}
          <label class="flex items-center justify-between gap-3 py-3 cursor-pointer">
            <div class="min-w-0">
              <p class="text-body text-content">{def.label}</p>
              {#if def.hint}<p class="text-caption text-content-subtle">{def.hint}</p>{/if}
            </div>
            <input
              type="checkbox"
              checked={trainingState.tunables[def.id] as boolean}
              onchange={(e) => trainingState.setTunable(def.id, e.currentTarget.checked)}
              class="w-5 h-5 rounded accent-primary shrink-0"
            />
          </label>
        {:else}
          {@const value = shown(def)}
          <div class="flex items-center justify-between gap-3 py-3">
            <div class="min-w-0">
              <p class="text-body text-content">{def.label}</p>
              {#if def.hint}<p class="text-caption text-content-subtle">{def.hint}</p>{/if}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              {#key value}
                <input
                  type="number"
                  value={value}
                  step={def.percent ? def.step * 100 : def.step}
                  onchange={(e) => commit(def, e.currentTarget.value)}
                  class="w-20 bg-surface-elevated text-content text-right p-2 rounded-control border border-border-strong outline-none text-sm tabular-nums"
                  aria-label={def.label}
                />
              {/key}
              <span class="w-12 text-caption text-content-subtle">{def.zeroMeansOff && value === 0 ? 'off' : unitLabel(def)}</span>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/each}
</div>
