import { describe, it, expect } from "vitest";
import { cleanOptions, customIdOf, customParam, defProblem, defUsage, formatCustomValue, isCustomParam, newDefId, paramLabel, scrubValueDef } from "./valueDefs";
import type { ValueDef } from "../types";

const defs: ValueDef[] = [{ id: "elevation", name: "Height / elevation", unit: "m", kind: "number" }];

describe("ids and labels", () => {
  it("round-trips the custom parameter name and tells it from built-ins", () => {
    expect(customParam("elevation")).toBe("v:elevation");
    expect(isCustomParam("v:elevation")).toBe(true);
    expect(isCustomParam("weight")).toBe(false);
    expect(isCustomParam("v:")).toBe(false);
    expect(customIdOf("v:elevation")).toBe("elevation");
  });
  it("labels built-ins, known defs and unknown defs", () => {
    expect(paramLabel("weight", defs)).toBe("Weight");
    expect(paramLabel("v:elevation", defs)).toBe("Height / elevation");
    expect(paramLabel("v:gone", defs)).toBe("gone");
  });
  it("makes unique camelCase ids", () => {
    expect(newDefId("Box jump height!", [])).toBe("boxJumpHeight");
    expect(newDefId("Box jump height", ["boxJumpHeight"])).toBe("boxJumpHeight2");
    expect(newDefId("???", [])).toBe("value");
  });
  it("formats values", () => {
    expect(formatCustomValue(defs[0], 120)).toBe("120 m");
    expect(formatCustomValue({ id: "n", name: "n", kind: "number" }, 3)).toBe("3");
    expect(formatCustomValue({ id: "c", name: "c", kind: "choice", options: ["a", "b"] }, "a")).toBe("a");
    expect(formatCustomValue(defs[0], undefined)).toBe("");
  });
});

describe("drafting", () => {
  it("asks for a unique name and, for a pick-list, two options", () => {
    expect(defProblem({ name: " ", kind: "number" }, [])).toMatch(/name/);
    expect(defProblem({ name: "speed", kind: "number" }, ["Speed"])).toMatch(/already/);
    expect(defProblem({ name: "Terrain", kind: "choice", options: ["Flat", " flat "] }, [])).toMatch(/two options/);
    expect(defProblem({ name: "Terrain", kind: "choice", options: ["Flat", "Hilly"] }, [])).toBeNull();
  });
  it("cleans options", () => {
    expect(cleanOptions([" a ", "A", "", "b"])).toEqual(["a", "b"]);
  });
});

const sample = (): any => ({
  workouts: [
    { id: "w1", exercises: [{ id: "s1", activeParameters: ["sets", "v:elevation"], prescribed: { sets: 3, custom: { elevation: 100, speed: 5 } }, logged: { custom: { elevation: 90 } } }] },
    { id: "w2", exercises: [{ id: "s2", prescribed: { sets: 1 } }] },
  ],
  exerciseTypes: [{ id: "t1", parameters: ["sets", "v:elevation"], possibleParameters: ["sets", "v:elevation", "v:speed"] }, { id: "t2", parameters: ["sets"] }],
  templates: { p1: [{ exercises: [{ prescribed: { custom: { elevation: 5 } } }] }] },
});

describe("usage and removal", () => {
  it("counts values, sessions and tracking types", () => {
    expect(defUsage("elevation", sample())).toEqual({ values: 2, workouts: 1, trackedBy: 1 });
    expect(defUsage("count", sample())).toEqual({ values: 0, workouts: 0, trackedBy: 0 });
  });
  it("scrubs a def everywhere and leaves the rest", () => {
    const data = sample();
    expect(scrubValueDef(data, "elevation")).toBe(3);
    expect(data.workouts[0].exercises[0].prescribed).toEqual({ sets: 3, custom: { speed: 5 } });
    expect(data.workouts[0].exercises[0].logged).toEqual({});
    expect(data.workouts[0].exercises[0].activeParameters).toEqual(["sets"]);
    expect(data.exerciseTypes[0].parameters).toEqual(["sets"]);
    expect(data.exerciseTypes[0].possibleParameters).toEqual(["sets", "v:speed"]);
    expect(data.templates.p1[0].exercises[0].prescribed).toEqual({});
  });
});
