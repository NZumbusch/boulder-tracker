import { describe, it, expect } from "vitest";
import { buildOrganisePrompt, sessionsPerType } from "./organisePrompt";
import { validateChangeSet } from "./changeSet";
import type { Workout } from "../types";

const done = (typeIds: string[]): Workout => ({ id: Math.random().toString(), status: "completed", date: "2026-09-01", weekId: "2026-W36", loadFactor: 0, exercises: typeIds.map((t, i) => ({ id: `s${i}`, typeId: t })) }) as Workout;

describe("buildOrganisePrompt", () => {
  const source = {
    exerciseTypes: [
      { id: "a", name: "Pigeon pose", category: "Other", group: "Stretching", parameters: [] },
      { id: "b", name: "Hangboard", category: "Fingers", parameters: [] },
      { id: "c", name: "Old", category: "Other", parameters: [], archived: true },
    ],
    analyticsCategories: [{ id: "1", name: "Fingers", color: "x" }, { id: "2", name: "Other", color: "y" }, { id: "3", name: "Gone", color: "z", archived: true }],
    workouts: [done(["a", "a", "b"]), done(["b"]), { ...done(["a"]), status: "planned" } as Workout],
  };
  it("counts logged sessions per exercise, once per session and never planned ones", () => {
    expect([...sessionsPerType(source.workouts)]).toEqual([["a", 1], ["b", 2]]);
  });
  it("lists live categories with their sizes and live exercises with their use", () => {
    const p = buildOrganisePrompt(source, "");
    expect(p).toContain('{"name":"Other","exercises":1}');
    expect(p).not.toContain("Gone");
    expect(p).toContain('{"name":"Pigeon pose","category":"Other","group":"Stretching","sessionsLogged":1}');
    expect(p).not.toContain('"Old"');
    expect(p).toContain("split any catch-all");
  });
  it("uses the request when there is one", () => {
    expect(buildOrganisePrompt(source, "separate legs from core")).toContain("separate legs from core");
  });
  it("the reply shape it asks for is a valid change set", () => {
    const reply = { summary: "x", categories: [{ action: "add", name: "Mobility" }], exerciseTypes: [{ action: "edit", name: "Pigeon pose", categoryName: "Mobility", group: "Stretching" }] };
    expect(validateChangeSet(reply).valid).toBe(true);
  });
});
