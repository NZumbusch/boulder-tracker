import type { ModelInfo } from "./providers";

/**
 * What a request is expected to cost, before it is sent. The input side is
 * known to within the token estimate (characters / 3.5, so a fifth either
 * way); the output side is a range: a typical change set, up to the cap
 * that is sent with the request (reasoning models bill their thinking as
 * output, so the cap is what the worst case is measured on).
 */

/** Roughly what a change-set reply (or a thinking-and-reply) comes to. */
export const TYPICAL_OUTPUT_TOKENS = 8_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

export interface Rates { inputPerM: number; outputPerM: number }

/** The rates that apply to a prompt of this size (a model may charge more for long prompts). */
export function ratesFor(model: Pick<ModelInfo, "inputPerM" | "outputPerM" | "long">, inputTokens: number): Rates {
  const l = model.long;
  return l && inputTokens > l.above ? { inputPerM: l.inputPerM, outputPerM: l.outputPerM } : { inputPerM: model.inputPerM, outputPerM: model.outputPerM };
}

export interface CostEstimate {
  inputTokens: number;
  inputUsd: number;
  /** A typical reply. */
  typicalUsd: number;
  /** The most the capped reply can cost, input included. */
  maxUsd: number;
}

export function estimateCost(
  model: Pick<ModelInfo, "inputPerM" | "outputPerM" | "long">,
  inputTokens: number,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
): CostEstimate {
  const r = ratesFor(model, inputTokens);
  const inputUsd = (inputTokens / 1e6) * r.inputPerM;
  const out = (tokens: number) => (tokens / 1e6) * r.outputPerM;
  return {
    inputTokens,
    inputUsd,
    typicalUsd: inputUsd + out(Math.min(TYPICAL_OUTPUT_TOKENS, maxOutputTokens)),
    maxUsd: inputUsd + out(maxOutputTokens),
  };
}

/** What a finished request cost, from the token counts the provider reported. */
export function actualCost(model: Pick<ModelInfo, "inputPerM" | "outputPerM" | "long">, inputTokens: number, outputTokens: number): number {
  const r = ratesFor(model, inputTokens);
  return (inputTokens / 1e6) * r.inputPerM + (outputTokens / 1e6) * r.outputPerM;
}

/** "$0.31", "$0.004", "under $0.001" - cents where it matters, more digits where it is tiny. */
export function formatUsd(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd < 0.001) return "under $0.001";
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}
