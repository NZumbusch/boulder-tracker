/**
 * The AI services the app can call directly with the athlete's own API key
 * (an optional extra: copy-paste into any chat stays the default). Prices
 * are USD per million tokens as the providers listed them on
 * `PRICES_AS_OF`; they change, so the settings let the athlete correct them
 * and every estimate says "about".
 */

export type ProviderId = "anthropic" | "openai" | "gemini";

/** A rate that applies once the prompt is longer than `above` tokens. */
export interface LongRate { above: number; inputPerM: number; outputPerM: number }

export interface ModelInfo {
  id: string;
  label: string;
  inputPerM: number;
  outputPerM: number;
  long?: LongRate;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Where to make a key. */
  keyUrl: string;
  keyHint: string;
  models: ModelInfo[];
}

export const PRICES_AS_OF = "2026-10-11";

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyHint: "Starts with sk-ant-",
    models: [
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", inputPerM: 2, outputPerM: 10 },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", inputPerM: 4, outputPerM: 20 },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", inputPerM: 0.1, outputPerM: 0.5, long: { above: 100_000, inputPerM: 0.5, outputPerM: 2.5 } },
      { id: "claude-fable-5-1", label: "Claude Fable 5.1", inputPerM: 10, outputPerM: 50 },
    ],
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "Starts with sk-",
    models: [
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", inputPerM: 2, outputPerM: 10 },
      { id: "gpt-6-luna", label: "GPT-6 Luna (small)", inputPerM: 0.1, outputPerM: 0.5 },
      { id: "gpt-6-astra", label: "GPT-6 Astra", inputPerM: 10, outputPerM: 50 },
    ],
  },
  {
    id: "gemini",
    label: "Gemini (Google)",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "Starts with AIza",
    models: [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", inputPerM: 0.75, outputPerM: 3.75 },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", inputPerM: 2, outputPerM: 12, long: { above: 200_000, inputPerM: 4, outputPerM: 18 } },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", inputPerM: 0.3, outputPerM: 2.5 },
    ],
  },
];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export function modelInfo(provider: ProviderId, modelId: string): ModelInfo | undefined {
  return providerInfo(provider).models.find((m) => m.id === modelId);
}
