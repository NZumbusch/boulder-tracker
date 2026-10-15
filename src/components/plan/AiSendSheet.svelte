<script lang="ts">
  /**
   * "Ask directly": the confirmation before a prompt is sent to an AI
   * service with the athlete's own key. It states where the data goes, how
   * many tokens it is and what it is expected to cost - a typical reply and
   * the most the output limit allows - and sends only on the explicit
   * button. The default Cancel keeps an accidental tap from spending money.
   */
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { providerInfo, modelInfo } from '../../lib/ai/direct/providers';
  import { estimateCost, actualCost, formatUsd } from '../../lib/ai/direct/cost';
  import { loadConfig, loadKey, recordSpend } from '../../lib/ai/direct/store';
  import { sendPrompt, AiRequestError } from '../../lib/ai/direct/send';
  import { estimateTokens, formatTokens } from '../../lib/ai/coachPrompt';

  let { prompt, onReply, onClose }: {
    prompt: string;
    onReply: (text: string, info: { cost?: number; inputTokens?: number; outputTokens?: number; model: string }) => void;
    onClose: () => void;
  } = $props();

  const config = loadConfig();
  const info = providerInfo(config.provider);
  const listed = modelInfo(config.provider, config.model);
  const rates = config.priceOverride ?? (listed ? { inputPerM: listed.inputPerM, outputPerM: listed.outputPerM } : undefined);
  // The long-prompt rate of a listed model applies unless the athlete set their own prices.
  const priced = $derived(rates ? { ...rates, long: config.priceOverride ? undefined : listed?.long } : undefined);
  const tokens = $derived(estimateTokens(prompt));
  const estimate = $derived(priced ? estimateCost(priced, tokens, config.maxOutputTokens) : undefined);
  const hasKey = !!loadKey(config.provider);
  const service = info.label.split(' (')[0];

  let sending = $state(false);
  let error = $state('');
  let abort: AbortController | undefined;

  async function send() {
    const key = loadKey(config.provider);
    if (!key || !estimate) return;
    sending = true;
    error = '';
    abort = new AbortController();
    try {
      const reply = await sendPrompt({ provider: config.provider, key, model: config.model, prompt, maxOutputTokens: config.maxOutputTokens, signal: abort.signal });
      const cost = priced && reply.inputTokens !== undefined && reply.outputTokens !== undefined ? actualCost(priced, reply.inputTokens, reply.outputTokens) : undefined;
      if (cost !== undefined) recordSpend({ at: new Date().toISOString(), provider: config.provider, model: config.model, usd: cost, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens });
      onReply(reply.text, { cost, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, model: config.model });
    } catch (err) {
      error = err instanceof AiRequestError ? err.message : 'Something went wrong sending the request.';
      sending = false;
    }
  }
  function cancel() {
    if (sending) abort?.abort();
    else onClose();
  }
</script>

<Sheet title="Send to {service}?" subtitle={listed?.label ?? config.model} onClose={cancel} level="top">
  {#if !hasKey}
    <p class="text-body text-content">No key is saved for {service}. Add one under Settings → AI &amp; coach → Direct AI connection.</p>
  {:else if !estimate}
    <p class="text-body text-content">There's no price set for this model, so the cost can't be estimated. Enter its prices under Settings → AI &amp; coach → Direct AI connection first.</p>
  {:else}
    <div class="rounded-card bg-surface-elevated/60 p-4 space-y-1.5">
      <div class="flex items-baseline justify-between gap-3"><span class="text-caption text-content-subtle">Prompt</span><span class="text-body tabular-nums text-content">{formatTokens(tokens)}</span></div>
      <div class="flex items-baseline justify-between gap-3"><span class="text-caption text-content-subtle">Expected cost</span><span class="text-metric tabular-nums text-content">about {formatUsd(estimate.typicalUsd)}</span></div>
      <div class="flex items-baseline justify-between gap-3"><span class="text-caption text-content-subtle">At most (longest reply)</span><span class="text-body tabular-nums text-content">{formatUsd(estimate.maxUsd)}</span></div>
    </div>
    <p class="text-caption text-content-subtle leading-relaxed flex gap-2">
      <Icon icon="ic:baseline-attach-money" class="text-xl text-status-caution shrink-0 -mt-0.5" />
      <span><strong class="text-content">This can cost money</strong>, billed by {service} to your API account. The token count is an estimate (give or take a fifth), and prices are the ones in your settings. Your prompt - the training data your sharing settings allow - is sent to {service}.</span>
    </p>
  {/if}

  {#if error}
    <p class="text-caption text-danger flex items-start gap-1.5" role="alert"><Icon icon="ic:baseline-error-outline" class="text-base shrink-0 mt-0.5" />{error}</p>
  {/if}

  {#snippet footer()}
    <button onclick={cancel} class="btn btn-secondary flex-1">{sending ? 'Cancel request' : 'Cancel'}</button>
    {#if hasKey && estimate}
      <button onclick={send} disabled={sending} class="btn btn-primary flex-1">
        {#if sending}<Icon icon="ic:baseline-sync" class="text-base animate-spin" />Waiting for {service}…{:else}Send · about {formatUsd(estimate.typicalUsd)}{/if}
      </button>
    {/if}
  {/snippet}
</Sheet>
