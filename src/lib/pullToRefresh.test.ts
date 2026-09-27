import { describe, it, expect } from "vitest";
import { pullOffset, pullTriggers, PULL_THRESHOLD, PULL_MAX } from "./pullToRefresh";

describe("pull to refresh", () => {
  it("follows the finger at half speed, up to a limit, and never upwards", () => {
    expect(pullOffset(-20)).toBe(0);
    expect(pullOffset(40)).toBe(20);
    expect(pullOffset(1000)).toBe(PULL_MAX);
  });

  it("needs a deliberate pull to refresh", () => {
    expect(pullTriggers(pullOffset(PULL_THRESHOLD))).toBe(false);
    expect(pullTriggers(pullOffset(PULL_THRESHOLD * 2))).toBe(true);
  });
});
