<script lang="ts">
  /**
   * Optional direct connection to an AI service with the athlete's own API
   * key. The default stays copy-paste into any chat (free with a chat
   * plan); this adds "Ask <service> directly" to the Change plan screen,
   * and every request is confirmed with its estimated cost first. Keys live
   * on this device only: not in backups, settings files or Drive sync.
   */
  import { PROVIDERS, providerInfo, modelInfo, PRICES_AS_OF, type ProviderId } from '../../lib/ai/direct/providers';
  import { formatUsd, DEFAULT_MAX_OUTPUT_TOKENS } from '../../lib/ai/direct/cost';
  import { loadConfig, saveConfig, loadKey, saveKey, loadSpend, spentThisMonth, SPEND_KEY, type DirectAiConfig } from '../../lib/ai/direct/store';
  import Icon from '@iconify/svelte';

  const initial = loadConfig();
  let config = $state<DirectAiConfig>(initial);
  let keyDraft = $state(loadKey(initial.provider));
  let keySaved = $state(!!loadKey(initial.provider));
  let spend = $state(loadSpend());
  let reveal = $state(false);

  const info = $derived(providerInfo(config.provider));
  const listed = $derived(modelInfo(config.provider, config.model));
  const custom = $derived(!listed);
  const rates = $derived(config.priceOverride ?? (listed ? { inputPerM: listed.inputPerM, outputPerM: listed.outputPerM } : undefined));
  const month = $derived(spentThisMonth(spend));

  function commit(next: DirectAiConfig) {
    config = next;
    saveConfig(next);
  }
  function pickProvider(id: ProviderId) {
    if (id === config.provider) return;
    const p = providerInfo(id);
    commit({ provider: id, model: p.models[0].id, maxOutputTokens: config.maxOutputTokens });
    keyDraft = loadKey(id);
    keySaved = !!keyDraft;
  }
  function pickModel(id: string) {
    if (id === '__custom') commit({ ...config, model: '', priceOverride: config.priceOverride ?? { inputPerM: 0, outputPerM: 0 } });
    else commit({ provider: config.provider, model: id, maxOutputTokens: config.maxOutputTokens });
  }
  function setPrice(which: 'inputPerM' | 'outputPerM', value: string) {
    const n = Number(value);
    const base = rates ?? { inputPerM: 0, outputPerM: 0 };
    if (!Number.isFinite(n) || n < 0) return;
    commit({ ...config, priceOverride: { ...base, [which]: n } });
  }
  function resetPrice() {
    const { priceOverride: _drop, ...rest } = config;
    commit(rest);
  }
  function setMax(value: string) {
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n >= 1000 && n <= 64000) commit({ ...config, maxOutputTokens: n });
  }
  function storeKey() {
    saveKey(config.provider, keyDraft);
    keySaved = !!keyDraft.trim();
  }
  function removeKey() {
    keyDraft = '';
    saveKey(config.provider, '');
    keySaved = false;
  }
  function clearSpend() {
    try { localStorage.removeItem(SPEND_KEY); } catch { /* nothing to clear */ }
    spend = [];
  }
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Direct AI connection</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Optional. Copying the prompt into a chat you already have stays the default, and costs nothing extra on a chat plan. With a key, "Change plan" also offers <em>Ask directly</em>, which sends the prompt from this app and brings the reply straight into the review.
    </p>
  </div>

  <div class="p-3.5 rounded-card bg-status-caution/10 flex items-start gap-2.5">
    <Icon icon="ic:baseline-attach-money" class="text-xl text-status-caution shrink-0 mt-0.5" />
    <p class="text-caption text-content leading-relaxed">
      <strong>This can cost money.</strong> API usage is billed to your account by the provider, separately from any chat plan. A full Change plan request is a long prompt (tens of thousands of tokens). Nothing is sent without you confirming its estimated cost each time.
    </p>
  </div>

  <div class="space-y-1.5">
    <p class="text-label text-content-subtle px-1">Service</p>
    <div class="seg" role="group" aria-label="AI service">
      {#each PROVIDERS as p (p.id)}
        <button class="seg-item flex-1 py-1.5 text-label {config.provider === p.id ? 'bg-primary text-white' : ''}" aria-pressed={config.provider === p.id} onclick={() => pickProvider(p.id)}>{p.label.split(' (')[0]}</button>
      {/each}
    </div>
  </div>

  <div class="space-y-1.5">
    <label for="ai-key" class="text-label text-content-subtle px-1 block">API key <span class="text-caption">({info.keyHint})</span></label>
    <div class="flex gap-2">
      <input
        id="ai-key"
        type={reveal ? 'text' : 'password'}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        bind:value={keyDraft}
        oninput={() => (keySaved = false)}
        placeholder="Paste your key"
        class="flex-1 min-w-0 bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm"
      />
      <button onclick={() => (reveal = !reveal)} class="px-3 rounded-control border border-border-strong text-content-subtle" aria-label={reveal ? 'Hide key' : 'Show key'}>
        <Icon icon={reveal ? 'ic:baseline-visibility-off' : 'ic:baseline-visibility'} class="text-lg" />
      </button>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <button onclick={storeKey} disabled={!keyDraft.trim() || keySaved} class="chip text-primary border-primary/30 hover:bg-primary/10 disabled:opacity-40">Save key</button>
      {#if keySaved}<button onclick={removeKey} class="chip text-content-subtle hover:text-danger">Remove key</button>{/if}
      <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" class="text-caption text-primary">Get a key</a>
    </div>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      {keySaved ? 'Saved on this device only.' : 'Kept on this device only.'} It is never part of a backup, a settings file or Drive sync, and it is sent to {info.label.split(' (')[0]} and nowhere else.
    </p>
  </div>

  <div class="space-y-1.5">
    <label for="ai-model" class="text-label text-content-subtle px-1 block">Model</label>
    <select id="ai-model" value={custom ? '__custom' : config.model} onchange={(e) => pickModel(e.currentTarget.value)} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm">
      {#each info.models as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
      <option value="__custom">Another model…</option>
    </select>
    {#if custom}
      <input aria-label="Model id" value={config.model} onchange={(e) => commit({ ...config, model: e.currentTarget.value.trim() })} placeholder="Model id, exactly as the provider names it" class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
    {/if}
  </div>

  <div class="space-y-1.5">
    <p class="text-label text-content-subtle px-1">Price per million tokens (USD)</p>
    <div class="grid grid-cols-2 gap-3">
      <label class="space-y-1 block"><span class="text-caption text-content-subtle">Input</span>
        <input type="number" inputmode="decimal" step="any" min="0" value={rates?.inputPerM ?? ''} onchange={(e) => setPrice('inputPerM', e.currentTarget.value)} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
      </label>
      <label class="space-y-1 block"><span class="text-caption text-content-subtle">Output</span>
        <input type="number" inputmode="decimal" step="any" min="0" value={rates?.outputPerM ?? ''} onchange={(e) => setPrice('outputPerM', e.currentTarget.value)} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
      </label>
    </div>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      {#if listed}Listed prices as of {PRICES_AS_OF}; providers change them, so check yours.{:else}Enter the provider's prices for this model, or the estimate can't be shown.{/if}
      {#if config.priceOverride && listed}<button onclick={resetPrice} class="text-primary ml-1">Use the listed prices</button>{/if}
    </p>
  </div>

  <label class="flex items-center justify-between gap-3">
    <span class="min-w-0">
      <span class="block text-body text-content">Longest reply</span>
      <span class="block text-caption text-content-subtle">Output limit sent with each request, in tokens. It caps the worst-case cost; thinking models count their thinking in it.</span>
    </span>
    <input type="number" inputmode="numeric" min="1000" max="64000" step="1000" value={config.maxOutputTokens} onchange={(e) => setMax(e.currentTarget.value)} class="w-28 shrink-0 bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm text-right" />
  </label>
  {#if config.maxOutputTokens !== DEFAULT_MAX_OUTPUT_TOKENS}
    <button onclick={() => setMax(String(DEFAULT_MAX_OUTPUT_TOKENS))} class="text-caption text-primary px-1">Back to {DEFAULT_MAX_OUTPUT_TOKENS.toLocaleString('en')}</button>
  {/if}

  <div class="pt-2 border-t border-border flex items-center justify-between gap-3">
    <p class="text-caption text-content-subtle leading-relaxed">
      Estimated spend this month on this device: <span class="text-content tabular-nums">{formatUsd(month)}</span>
      <span class="block">From the token counts the services report - not a bill. Check the provider's usage page for that.</span>
    </p>
    {#if spend.length}<button onclick={clearSpend} class="chip text-content-subtle hover:text-content shrink-0">Clear</button>{/if}
  </div>
</div>
