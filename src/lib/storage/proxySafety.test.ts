import { describe, it, expect, vi, beforeEach } from "vitest";

// `setItem` structured-clones, exactly as the real localforage does - so a
// Svelte `$state` proxy reaching it throws here the same way it does in the
// browser ("Proxy object could not be cloned").
const { setItem } = vi.hoisted(() => ({
  setItem: vi.fn(async (_key: string, value: unknown) => {
    structuredClone(value);
  }),
}));
vi.mock("localforage", () => ({
  default: { config: vi.fn(), setItem, getItem: vi.fn(async () => null) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState, toPlain, _dbState } from "./persistence";
import type { Workout } from "../types";

/**
 * Stands in for a Svelte `$state` proxy: reads pass through, but a
 * structured clone of it throws, which is the property that broke saving.
 */
function reactive<T extends object>(target: T): T {
  return new Proxy(target, {});
}

beforeEach(() => {
  setItem.mockClear();
  setDbState({
    workouts: [],
    trainingBlocks: [],
    weekOverrides: [],
    competitionEvents: [],
    benchmarks: [],
    benchmarkTypes: [],
    analyticsCategories: [],
    templates: {},
    phaseDefs: [],
    exerciseTypes: [],
    metricDefs: [],
    dailyMetrics: [],
    painLogs: [],
    outdoorAscents: [],
  });
});

describe("toPlain", () => {
  it("unwraps a proxy into structured-cloneable data", () => {
    const plain = toPlain(reactive({ a: 1, nested: reactive({ b: 2 }) }));
    expect(() => structuredClone(plain)).not.toThrow();
    expect(plain).toEqual({ a: 1, nested: { b: 2 } });
  });

  it("unwraps proxies nested inside plain objects - the case a shallow spread misses", () => {
    const shallowSpread = { ...reactive({ id: "w1" }), prescribed: reactive({ duration: 30 }) };
    expect(() => structuredClone(shallowSpread)).toThrow();
    expect(() => structuredClone(toPlain(shallowSpread))).not.toThrow();
  });

  it("passes primitives and null through untouched", () => {
    expect(toPlain(null)).toBeNull();
    expect(toPlain(7)).toBe(7);
    expect(toPlain("x")).toBe("x");
  });
});

describe("storage never persists reactive proxies", () => {
  /** A projected session as `weekProjection` builds it: plain at the top, proxies underneath. */
  function projectedWorkout(): Workout {
    return {
      id: "prov:2026-W25:tpl1:0",
      status: "planned",
      date: null,
      weekId: "2026-W25",
      loadFactor: 0,
      exercises: [
        {
          ...reactive({ id: "s1", typeId: "t1" }),
          activeParameters: reactive([]) as never,
          prescribed: reactive({ duration: 30 }),
        },
      ],
    } as Workout;
  }

  it("materializeWeek stores a projected week without throwing", async () => {
    await expect(storage.materializeWeek("2026-W25", [projectedWorkout()])).resolves.not.toThrow();
    expect(_dbState.workouts).toHaveLength(1);
  });

  it("leaves the blob structured-cloneable, so later unrelated writes still flush", async () => {
    // The original bug: the bad value landed in memory, and the throw
    // surfaced on the *next* write (assigning a phase), which then kept
    // failing forever.
    await storage.materializeWeek("2026-W25", [projectedWorkout()]);
    await expect(
      storage.saveTrainingBlock({
        id: "b1",
        name: "Capacity",
        phaseId: "p1",
        startWeekId: "2026-W25",
        endWeekId: "2026-W25",
      }),
    ).resolves.not.toThrow();
    expect(() => structuredClone(_dbState)).not.toThrow();
  });

  it("stores the projected values faithfully, not just safely", async () => {
    await storage.materializeWeek("2026-W25", [projectedWorkout()]);
    expect(_dbState.workouts[0].exercises[0].prescribed).toEqual({ duration: 30 });
    expect(_dbState.workouts[0].id).toBe("prov:2026-W25:tpl1:0");
  });

  it("also holds for templates written straight from reactive state", async () => {
    await storage.saveTemplates({
      p1: [reactive({ id: "tpl1", name: "Board", exercises: [reactive({ id: "s1", typeId: "t1" })] })] as never,
    });
    expect(() => structuredClone(_dbState)).not.toThrow();
    expect(_dbState.templates.p1[0].name).toBe("Board");
  });

  it("also holds for exercise types written straight from reactive state", async () => {
    await storage.saveExerciseTypes([
      reactive({ id: "t1", name: "Hangboard", category: "Strength", parameters: reactive([]) }),
    ] as never);
    expect(() => structuredClone(_dbState)).not.toThrow();
  });
});
