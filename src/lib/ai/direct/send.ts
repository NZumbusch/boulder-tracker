import type { ProviderId } from "./providers";
import { prepareRequest, parseReply, describeFailure, type AiReply } from "./request";

/** How long a request may take - a long prompt to a thinking model is slow. */
export const REQUEST_TIMEOUT_MS = 5 * 60_000;

export class AiRequestError extends Error {}

/**
 * Sends the prompt and returns the reply. Only ever called after the
 * athlete confirmed the estimate. Errors carry a plain message, never the
 * key or the prompt. `signal` cancels it (the sheet's Cancel button).
 */
export async function sendPrompt(opts: {
  provider: ProviderId;
  key: string;
  model: string;
  prompt: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<AiReply> {
  const { provider, key, model, prompt, maxOutputTokens, signal } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const req = prepareRequest(provider, key, model, prompt, maxOutputTokens);
  const timeout = AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined;
  const combined = signal && timeout && "any" in AbortSignal ? (AbortSignal as any).any([signal, timeout]) : (signal ?? timeout);
  let res: Response;
  try {
    res = await doFetch(req.url, { ...req.init, signal: combined });
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      throw new AiRequestError(signal?.aborted ? "Cancelled." : "No answer after 5 minutes. A request that was already received may still be charged.");
    }
    throw new AiRequestError("Couldn't reach the service. Check your connection (and that the app may call this address).");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) throw new AiRequestError(describeFailure(provider, res.status, body));
  try {
    return parseReply(provider, body);
  } catch (err: any) {
    throw new AiRequestError(err?.message ?? "The reply couldn't be read.");
  }
}
