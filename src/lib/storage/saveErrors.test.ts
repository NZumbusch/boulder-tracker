import { describe, it, expect, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("localforage", () => ({
  default: { config: vi.fn(), getItem: vi.fn(async () => null), setItem: vi.fn(async () => { throw new Error("QuotaExceededError"); }), removeItem: vi.fn() },
}));

import { flushDB, setDbState, setSaveErrorListener } from "./persistence";

describe("a save that doesn't reach storage", () => {
  it("is reported instead of failing silently", async () => {
    const seen: unknown[] = [];
    setSaveErrorListener((err) => seen.push(err));
    setDbState({ workouts: [] });
    await flushDB(["workouts"]);
    expect(seen).toHaveLength(1);
    expect(String(seen[0])).toMatch(/Quota/);
    setSaveErrorListener(null);
  });
});
