import { describe, expect, it } from "vitest";
import { hasAnyData, isHiddenWhileNew, SIMPLE_HOME_HIDDEN } from "./newUser";
import { buildChecklist, type ChecklistInput } from "./starterChecklist";

const empty = { workouts: [], dailyMetrics: [], benchmarks: [], painLogs: [], outdoorAscents: [] };
const done = (n: number) => Array.from({ length: n }, () => ({ status: "completed" }));

describe("hasAnyData", () => {
  it("is false for a fresh install, even with planned sessions", () => {
    expect(hasAnyData(empty)).toBe(false);
    expect(hasAnyData({ ...empty, workouts: [{ status: "planned" }] })).toBe(false);
  });

  it("is true once anything real is logged", () => {
    expect(hasAnyData({ ...empty, workouts: done(1) })).toBe(true);
    expect(hasAnyData({ ...empty, dailyMetrics: [{}] })).toBe(true);
    expect(hasAnyData({ ...empty, benchmarks: [{}] })).toBe(true);
    expect(hasAnyData({ ...empty, painLogs: [{}] })).toBe(true);
    expect(hasAnyData({ ...empty, outdoorAscents: [{}] })).toBe(true);
  });
});

describe("isHiddenWhileNew", () => {
  it("hides the empty-without-data cards only while simple Home is on and there is no data", () => {
    for (const id of SIMPLE_HOME_HIDDEN) {
      expect(isHiddenWhileNew(id, true, false)).toBe(true);
      expect(isHiddenWhileNew(id, false, false)).toBe(false);
      expect(isHiddenWhileNew(id, true, true)).toBe(false);
    }
  });

  it("never hides the cards a new user needs", () => {
    for (const id of ["checklist", "today", "thisWeek", "trainingBlock", "competition", "weather", "crags"]) {
      expect(isHiddenWhileNew(id, true, false)).toBe(false);
    }
    expect([...SIMPLE_HOME_HIDDEN].sort()).toEqual(["alerts", "fatigue", "metrics", "progress", "readiness", "recentActivity"]);
  });
});

describe("buildChecklist", () => {
  const input = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
    ...empty, trainingBlocks: [], tourSeen: false, dismissed: false, syncAvailable: false, syncConnected: false, goals: [], ...over,
  });

  it("starts with nothing ticked and is shown", () => {
    const c = buildChecklist(input());
    expect(c.items.map((i) => [i.id, i.done])).toEqual([["plan", false], ["session", false], ["metric", false], ["tour", false], ["goal", false]]);
    expect(c.visible).toBe(true);
    expect(c.doneCount).toBe(0);
  });

  it("ticks each item from real data", () => {
    const c = buildChecklist(input({ trainingBlocks: [{}], workouts: done(1), dailyMetrics: [{}], tourSeen: true, goals: [{}] }));
    expect(c.items.every((i) => i.done)).toBe(true);
    expect(c.visible).toBe(false);
  });

  it("counts planned sessions as a plan, not as a first session", () => {
    const c = buildChecklist(input({ workouts: [{ status: "planned" }] }));
    expect(c.items.find((i) => i.id === "plan")!.done).toBe(true);
    expect(c.items.find((i) => i.id === "session")!.done).toBe(false);
  });

  it("goes away when dismissed, and for someone with a few sessions logged already", () => {
    expect(buildChecklist(input({ dismissed: true })).visible).toBe(false);
    expect(buildChecklist(input({ workouts: done(3) })).visible).toBe(false);
    expect(buildChecklist(input({ workouts: done(2) })).visible).toBe(true);
  });

  it("adds an optional sync item on devices that can sync, which never keeps the card open", () => {
    const c = buildChecklist(input({ syncAvailable: true }));
    expect(c.items.at(-1)).toMatchObject({ id: "sync", optional: true, done: false });
    const finished = buildChecklist(input({ syncAvailable: true, trainingBlocks: [{}], workouts: done(1), dailyMetrics: [{}], tourSeen: true }));
    expect(finished.visible).toBe(false);
  });
});
