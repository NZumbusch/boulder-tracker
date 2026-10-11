import type { ProviderId } from "./providers";

/**
 * The HTTP request each provider wants for "send this prompt, give me the
 * reply", and how to read what comes back. Pure - `send.ts` does the
 * network call - so the shapes are testable without a key.
 */

export interface PreparedRequest {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: string };
}

export interface AiReply {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

export function prepareRequest(provider: ProviderId, key: string, model: string, prompt: string, maxOutputTokens: number): PreparedRequest {
  switch (provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/messages",
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            // The browser (and the app's web view) is where the key lives; Anthropic asks for this to say so.
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({ model, max_tokens: maxOutputTokens, messages: [{ role: "user", content: prompt }] }),
        },
      };
    case "openai":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        init: {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, max_completion_tokens: maxOutputTokens, messages: [{ role: "user", content: prompt }] }),
        },
      };
    case "gemini":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens } }),
        },
      };
  }
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The reply text and token counts from a successful response body; throws a plain message if there is no text. */
export function parseReply(provider: ProviderId, body: unknown): AiReply {
  const b = body as Record<string, any>;
  if (provider === "anthropic") {
    const text = Array.isArray(b?.content) ? b.content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("") : "";
    if (!text) throw new Error(b?.stop_reason === "max_tokens" ? "The reply was cut off before any text (the output limit was reached)." : "The reply had no text.");
    return { text, inputTokens: num(b.usage?.input_tokens), outputTokens: num(b.usage?.output_tokens) };
  }
  if (provider === "openai") {
    const choice = b?.choices?.[0];
    const text = typeof choice?.message?.content === "string" ? choice.message.content : "";
    if (!text) throw new Error(choice?.finish_reason === "length" ? "The reply was cut off before any text (the output limit was reached)." : "The reply had no text.");
    return { text, inputTokens: num(b.usage?.prompt_tokens), outputTokens: num(b.usage?.completion_tokens) };
  }
  const cand = b?.candidates?.[0];
  const parts: any[] = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
  const text = parts.filter((p) => typeof p?.text === "string" && !p.thought).map((p) => p.text).join("");
  if (!text) throw new Error(cand?.finishReason === "MAX_TOKENS" ? "The reply was cut off before any text (the output limit was reached)." : b?.promptFeedback?.blockReason ? `Google declined the request (${b.promptFeedback.blockReason}).` : "The reply had no text.");
  // Thinking tokens are billed as output.
  const out = (num(b.usageMetadata?.candidatesTokenCount) ?? 0) + (num(b.usageMetadata?.thoughtsTokenCount) ?? 0);
  return { text, inputTokens: num(b.usageMetadata?.promptTokenCount), outputTokens: out || undefined };
}

/** A friendly line for a failed response - never includes the key or the prompt. */
export function describeFailure(provider: ProviderId, status: number, body: unknown): string {
  const b = body as Record<string, any>;
  const detail: unknown = b?.error?.message ?? b?.message;
  const said = typeof detail === "string" ? detail.replace(/\s+/g, " ").slice(0, 240) : "";
  if (status === 401 || status === 403) return `The key was refused (${status}). Check it under Settings, and that the account has billing set up.${said ? ` ${said}` : ""}`;
  if (status === 404) return `The model wasn't found. Pick another in Settings, or check its name.${said ? ` ${said}` : ""}`;
  if (status === 429) return `Rate or spending limit reached. Try again in a minute, or check the account's limits.${said ? ` ${said}` : ""}`;
  if (status === 413 || status === 400) return `The request was refused (${status}).${said ? ` ${said}` : " The prompt may be too long for this model."}`;
  if (status >= 500) return `${provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : "Google"} had a problem (${status}). Nothing was charged for a failed request; try again later.`;
  return `The request failed (${status}).${said ? ` ${said}` : ""}`;
}
