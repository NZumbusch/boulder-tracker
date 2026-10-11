import { describe, it, expect } from "vitest";
import { appendChange, loadChangeLog, CHANGE_LOG_MAX } from "./changeLog";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("AI change log", () => {
  it("starts empty and survives garbage", () => {
    expect(loadChangeLog(memory())).toEqual([]);
    const s = memory();
    s.setItem("bt.aiChangeLog", "{not json");
    expect(loadChangeLog(s)).toEqual([]);
  });

  it("keeps entries in order, trims long text and caps the length", () => {
    const s = memory();
    for (let i = 0; i < CHANGE_LOG_MAX + 3; i++) {
      appendChange({ goal: `goal ${i}`, weeks: ["2026-W41"], lines: ["x".repeat(500)], at: new Date(2026, 9, 1 + i) }, s);
    }
    const log = loadChangeLog(s);
    expect(log).toHaveLength(CHANGE_LOG_MAX);
    expect(log[log.length - 1].goal).toBe(`goal ${CHANGE_LOG_MAX + 2}`);
    expect(log[0].lines[0].length).toBe(140);
  });

  it("works without storage", () => {
    expect(appendChange({ goal: "g", weeks: [], lines: [] }, undefined)).toHaveLength(1);
  });
});
