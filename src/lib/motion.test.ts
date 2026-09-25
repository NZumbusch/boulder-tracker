import { describe, it, expect, afterEach } from "vitest";
import { motionReduced, motionMs, scrollBehavior } from "./motion";

const g = globalThis as { document?: unknown };
const original = g.document;
function setMotion(motion: string | undefined) {
  g.document = { documentElement: { dataset: motion ? { motion } : {} } };
}
afterEach(() => {
  g.document = original;
});

describe("motion", () => {
  it("follows the app's resolved setting", () => {
    setMotion("reduced");
    expect(motionReduced()).toBe(true);
    expect(motionMs(200)).toBe(0);
    expect(scrollBehavior()).toBe("auto");
    setMotion("full");
    expect(motionReduced()).toBe(false);
    expect(motionMs(200)).toBe(200);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("treats a missing document (tests, SSR) as full motion", () => {
    g.document = undefined;
    expect(motionReduced()).toBe(false);
  });
});
