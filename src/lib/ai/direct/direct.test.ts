import { describe, it, expect } from "vitest";
import { PROVIDERS, modelInfo } from "./providers";
import { estimateCost, actualCost, formatUsd, ratesFor, TYPICAL_OUTPUT_TOKENS } from "./cost";
import { prepareRequest, parseReply, describeFailure } from "./request";
import { loadConfig, saveConfig, saveKey, loadKey, recordSpend, loadSpend, spentThisMonth, DEFAULT_CONFIG } from "./store";
import { sendPrompt, AiRequestError } from "./send";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
}

describe("model prices", () => {
  it("every provider lists models with sane prices", () => {
    for (const p of PROVIDERS) {
      expect(p.models.length).toBeGreaterThan(0);
      for (const m of p.models) {
        expect(m.inputPerM).toBeGreaterThan(0);
        expect(m.outputPerM).toBeGreaterThanOrEqual(m.inputPerM);
      }
    }
  });
});

describe("cost", () => {
  const sonnet = modelInfo("anthropic", "claude-sonnet-5-5")!;
  it("adds the input to a typical and a worst-case reply", () => {
    const c = estimateCost(sonnet, 50_000, 16_000);
    expect(c.inputUsd).toBeCloseTo(0.1, 6); // 50k at $2/M
    expect(c.typicalUsd).toBeCloseTo(0.1 + (TYPICAL_OUTPUT_TOKENS / 1e6) * 10, 6);
    expect(c.maxUsd).toBeCloseTo(0.1 + 0.16, 6);
  });
  it("never expects more typical output than the cap allows", () => {
    expect(estimateCost(sonnet, 1000, 2000).typicalUsd).toBeCloseTo(0.002 + 0.02, 6);
  });
  it("uses the long-prompt rate above the threshold", () => {
    const haiku = modelInfo("anthropic", "claude-haiku-5-5")!;
    expect(ratesFor(haiku, 90_000).inputPerM).toBe(0.1);
    expect(ratesFor(haiku, 120_000).inputPerM).toBe(0.5);
  });
  it("prices a finished request from the reported tokens", () => {
    expect(actualCost(sonnet, 40_000, 5_000)).toBeCloseTo(0.08 + 0.05, 6);
  });
  it("formats small amounts without rounding them to nothing", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0004)).toBe("under $0.001");
    expect(formatUsd(0.004)).toBe("$0.004");
    expect(formatUsd(0.31)).toBe("$0.31");
    expect(formatUsd(2)).toBe("$2.00");
  });
});

describe("requests", () => {
  it("builds each provider's call, with the key only in its header", () => {
    const a = prepareRequest("anthropic", "KEY", "claude-sonnet-5-5", "hi", 100);
    expect(a.url).toBe("https://api.anthropic.com/v1/messages");
    expect(a.init.headers["x-api-key"]).toBe("KEY");
    expect(a.init.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(JSON.parse(a.init.body)).toEqual({ model: "claude-sonnet-5-5", max_tokens: 100, messages: [{ role: "user", content: "hi" }] });

    const o = prepareRequest("openai", "KEY", "gpt-6.1-sol", "hi", 100);
    expect(o.init.headers.authorization).toBe("Bearer KEY");
    expect(JSON.parse(o.init.body).max_completion_tokens).toBe(100);

    const g = prepareRequest("gemini", "KEY", "gemini-3.8-flash", "hi", 100);
    expect(g.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(g.init.headers["x-goog-api-key"]).toBe("KEY");
    for (const r of [a, o, g]) { expect(r.url).not.toContain("KEY"); expect(r.init.body).not.toContain("KEY"); }
  });

  it("reads replies and token counts", () => {
    expect(parseReply("anthropic", { content: [{ type: "text", text: "{}" }], usage: { input_tokens: 10, output_tokens: 5 } })).toEqual({ text: "{}", inputTokens: 10, outputTokens: 5 });
    expect(parseReply("openai", { choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })).toEqual({ text: "{}", inputTokens: 10, outputTokens: 5 });
    expect(parseReply("gemini", { candidates: [{ content: { parts: [{ text: "x", thought: true }, { text: "{}" }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 20 } })).toEqual({ text: "{}", inputTokens: 10, outputTokens: 25 });
  });

  it("explains an empty reply", () => {
    expect(() => parseReply("anthropic", { content: [], stop_reason: "max_tokens" })).toThrow(/cut off/);
    expect(() => parseReply("openai", { choices: [{ message: { content: "" }, finish_reason: "length" }] })).toThrow(/cut off/);
    expect(() => parseReply("gemini", { promptFeedback: { blockReason: "SAFETY" } })).toThrow(/SAFETY/);
  });

  it("describes failures plainly", () => {
    expect(describeFailure("openai", 401, { error: { message: "bad key" } })).toMatch(/key was refused/);
    expect(describeFailure("anthropic", 429, {})).toMatch(/limit/);
    expect(describeFailure("gemini", 500, {})).toMatch(/Google had a problem/);
  });
});

describe("storage", () => {
  it("falls back to defaults and keeps keys apart from the config", () => {
    const s = memory();
    expect(loadConfig(s)).toEqual(DEFAULT_CONFIG);
    saveConfig({ provider: "openai", model: "gpt-6.1-sol", maxOutputTokens: 8000 }, s);
    saveKey("openai", "  sk-123  ", s);
    expect(loadConfig(s).provider).toBe("openai");
    expect(loadKey("openai", s)).toBe("sk-123");
    expect(loadKey("anthropic", s)).toBe("");
    expect(s.data.get("bt.aiDirect")).not.toContain("sk-123");
    saveKey("openai", "", s);
    expect(loadKey("openai", s)).toBe("");
  });
  it("rejects a bad config", () => {
    const s = memory();
    s.setItem("bt.aiDirect", JSON.stringify({ provider: "nope", model: "x" }));
    expect(loadConfig(s)).toEqual(DEFAULT_CONFIG);
    s.setItem("bt.aiDirect", JSON.stringify({ provider: "gemini", model: "m", maxOutputTokens: 5, priceOverride: { inputPerM: -1, outputPerM: 1 } }));
    expect(loadConfig(s)).toEqual({ provider: "gemini", model: "m", maxOutputTokens: DEFAULT_CONFIG.maxOutputTokens });
  });
  it("totals this month's estimated spend", () => {
    const s = memory();
    recordSpend({ at: "2026-10-03T10:00:00.000Z", provider: "openai", model: "m", usd: 0.2 }, s);
    recordSpend({ at: "2026-10-09T10:00:00.000Z", provider: "openai", model: "m", usd: 0.3 }, s);
    recordSpend({ at: "2026-09-30T10:00:00.000Z", provider: "openai", model: "m", usd: 5 }, s);
    expect(loadSpend(s)).toHaveLength(3);
    expect(spentThisMonth(loadSpend(s), new Date(2026, 9, 11))).toBeCloseTo(0.5, 6);
  });
});

describe("sendPrompt", () => {
  const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const base = { provider: "anthropic" as const, key: "K", model: "m", prompt: "p", maxOutputTokens: 100 };
  it("returns the reply", async () => {
    const r = await sendPrompt({ ...base, fetchImpl: ok({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 1, output_tokens: 2 } }) });
    expect(r.text).toBe("hi");
  });
  it("turns a refusal into a plain error without the key", async () => {
    await expect(sendPrompt({ ...base, fetchImpl: ok({ error: { message: "invalid x-api-key" } }, 401) })).rejects.toThrow(AiRequestError);
    try { await sendPrompt({ ...base, fetchImpl: ok({}, 401) }); } catch (e: any) { expect(e.message).not.toContain("K,"); expect(e.message).toMatch(/refused/); }
  });
  it("says so when the network is down", async () => {
    await expect(sendPrompt({ ...base, fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch })).rejects.toThrow(/Couldn't reach/);
  });
  it("can be cancelled", async () => {
    const ac = new AbortController();
    const slow = ((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))))) as unknown as typeof fetch;
    const p = sendPrompt({ ...base, signal: ac.signal, fetchImpl: slow });
    ac.abort();
    await expect(p).rejects.toThrow("Cancelled.");
  });
});
