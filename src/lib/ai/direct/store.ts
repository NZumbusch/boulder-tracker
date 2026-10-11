import type { ProviderId } from "./providers";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "./cost";

/**
 * The direct-AI connection's own storage, on this device only: the chosen
 * service and model, the keys, price corrections, and a running log of what
 * requests cost. Keys are kept apart from everything else - never in the
 * preferences, so never in a backup, a settings file or Drive sync.
 */

export interface DirectAiConfig {
  provider: ProviderId;
  /** A model id - one of the provider's list or the athlete's own. */
  model: string;
  maxOutputTokens: number;
  /** Corrected prices (USD per million tokens) for the chosen model, when the listed ones are out of date. */
  priceOverride?: { inputPerM: number; outputPerM: number };
}

export interface SpendEntry { at: string; provider: ProviderId; model: string; usd: number; inputTokens?: number; outputTokens?: number }

export const CONFIG_KEY = "bt.aiDirect";
export const SPEND_KEY = "bt.aiSpend";
const keyName = (p: ProviderId) => `bt.aiKey.${p}`;
const SPEND_MAX = 60;

type Store = Pick<Storage, "getItem" | "setItem"> & { removeItem?: (k: string) => void };
function browserStore(): Store | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export const DEFAULT_CONFIG: DirectAiConfig = { provider: "anthropic", model: "claude-sonnet-5-5", maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS };

export function loadConfig(store: Store | undefined = browserStore()): DirectAiConfig {
  try {
    const raw = store?.getItem(CONFIG_KEY);
    const v = raw ? JSON.parse(raw) : undefined;
    if (!v || !["anthropic", "openai", "gemini"].includes(v.provider) || typeof v.model !== "string" || !v.model.trim()) return { ...DEFAULT_CONFIG };
    const max = typeof v.maxOutputTokens === "number" && v.maxOutputTokens >= 1000 && v.maxOutputTokens <= 64_000 ? Math.round(v.maxOutputTokens) : DEFAULT_MAX_OUTPUT_TOKENS;
    const p = v.priceOverride;
    const priceOverride = p && Number.isFinite(p.inputPerM) && Number.isFinite(p.outputPerM) && p.inputPerM >= 0 && p.outputPerM >= 0 ? { inputPerM: p.inputPerM, outputPerM: p.outputPerM } : undefined;
    return { provider: v.provider, model: v.model.trim(), maxOutputTokens: max, ...(priceOverride ? { priceOverride } : {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: DirectAiConfig, store: Store | undefined = browserStore()): void {
  try {
    store?.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* blocked storage: the settings just don't stick */
  }
}

export function loadKey(provider: ProviderId, store: Store | undefined = browserStore()): string {
  try {
    return store?.getItem(keyName(provider)) ?? "";
  } catch {
    return "";
  }
}

export function saveKey(provider: ProviderId, key: string, store: Store | undefined = browserStore()): void {
  try {
    const trimmed = key.trim();
    if (!trimmed) store?.removeItem?.(keyName(provider));
    else store?.setItem(keyName(provider), trimmed);
  } catch {
    /* as above */
  }
}

export function loadSpend(store: Store | undefined = browserStore()): SpendEntry[] {
  try {
    const raw = store?.getItem(SPEND_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((e): e is SpendEntry => !!e && typeof e.usd === "number" && typeof e.at === "string") : [];
  } catch {
    return [];
  }
}

export function recordSpend(entry: SpendEntry, store: Store | undefined = browserStore()): SpendEntry[] {
  const log = [...loadSpend(store), entry].slice(-SPEND_MAX);
  try {
    store?.setItem(SPEND_KEY, JSON.stringify(log));
  } catch {
    /* a convenience */
  }
  return log;
}

/** What requests from this month came to (by the token counts the services reported - not a bill). */
export function spentThisMonth(log: SpendEntry[], now: Date = new Date()): number {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return log.filter((e) => e.at.startsWith(month)).reduce((s, e) => s + e.usd, 0);
}
