import { describe, it, expect, vi, beforeEach } from "vitest";

const { setItem } = vi.hoisted(() => ({ setItem: vi.fn(async (_k: string, v: unknown) => { structuredClone(v); }) }));
vi.mock("localforage", () => ({ default: { config: vi.fn(), setItem, getItem: vi.fn(async () => null) } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState, _dbState } from "./persistence";

beforeEach(() => {
  setItem.mockClear();
  setDbState({
    workouts: [{ id: "w1", exercises: [{ id: "s1", activeParameters: ["sets", "v:elevation"], prescribed: { sets: 3, custom: { elevation: 100, speed: 8 } }, logged: { custom: { elevation: 90 } } }] }],
    trainingBlocks: [], weekOverrides: [], benchmarks: [], benchmarkTypes: [], analyticsCategories: [], circuits: [], planAlternatives: [],
    templates: { p1: [{ exercises: [{ prescribed: { custom: { elevation: 5 } } }] }] },
    phaseDefs: [], metricDefs: [], dailyMetrics: [], painLogs: [], outdoorAscents: [],
    exerciseTypes: [{ id: "t1", parameters: ["sets", "v:elevation"] }],
    valueDefs: [{ id: "elevation", name: "Elevation", kind: "number" }, { id: "speed", name: "Speed", kind: "number" }],
  });
});

describe("storage.deleteValueDef", () => {
  it("removes the def, every value of it and its place in tracked fields - and nothing else", async () => {
    const removed = await storage.deleteValueDef("elevation");
    expect(removed).toBe(3);
    expect(_dbState.valueDefs.map((d: any) => d.id)).toEqual(["speed"]);
    expect(_dbState.workouts[0].exercises[0].prescribed).toEqual({ sets: 3, custom: { speed: 8 } });
    expect(_dbState.workouts[0].exercises[0].activeParameters).toEqual(["sets"]);
    expect(_dbState.exerciseTypes[0].parameters).toEqual(["sets"]);
    expect(_dbState.templates.p1[0].exercises[0].prescribed).toEqual({});
    const written = setItem.mock.calls.map((c) => c[0]);
    expect(written).toEqual(expect.arrayContaining(["workouts", "exerciseTypes", "templates", "valueDefs"]));
  });
});
