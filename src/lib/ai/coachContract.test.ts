import { describe, it, expect } from "vitest";
import { buildChangeSetInstructions, AI_CHANGESET_INSTRUCTIONS } from "./changeSetPrompt";
import { contractFor } from "./coachPrompt";
import { estimateTokens } from "./coachPrompt";

const none = { planB: false, tests: false, coachNotes: false, places: false };
const profile = { recentWorkouts: [], benchmarks: [] };

describe("the reply contract, by what the request can use", () => {
  it("is the whole contract when nothing is left out", () => {
    expect(buildChangeSetInstructions()).toBe(AI_CHANGESET_INSTRUCTIONS);
    for (const part of ['"planB"', '"coachNotes"', '"places"', '{ "test": "Max Hang"']) expect(AI_CHANGESET_INSTRUCTIONS).toContain(part);
  });

  it("leaves out Plan B, tests, coach notes and places, in the shape and the order line too", () => {
    const p = buildChangeSetInstructions(none);
    for (const part of ['"planB"', "PLAN B", '"coachNotes"', '"places"', '{ "test"', "TEST (in"]) expect(p, part).not.toContain(part);
    expect(p).toContain('Applied in this order: "categories", then "exerciseTypes", then "circuits", then "phases", then "weeks".');
    expect(p).toContain('"weeks": [ ...week changes... ]\n}');
  });

  it("keeps each optional part on its own", () => {
    expect(buildChangeSetInstructions({ ...none, planB: true })).toContain('"planB": [');
    expect(buildChangeSetInstructions({ ...none, tests: true })).toContain("Write the test plan down");
    expect(buildChangeSetInstructions({ ...none, coachNotes: true })).toContain("zero changes is a fine answer");
    expect(buildChangeSetInstructions({ ...none, places: true })).toContain("never invent prices or opening hours");
  });

  it("is a good deal shorter without the optional parts", () => {
    expect(estimateTokens(buildChangeSetInstructions(none))).toBeLessThan(estimateTokens(AI_CHANGESET_INSTRUCTIONS) * 0.75);
  });

  it("includes Plan B for uncertain days, an existing Plan B or a request that mentions one", () => {
    const base = { profile, goal: "Lighter week", coachNotes: true };
    expect(contractFor(base).planB).toBe(false);
    expect(contractFor({ ...base, uncertainDays: ["Saturday"] }).planB).toBe(true);
    expect(contractFor({ ...base, planContext: "PLAN B - uncertain stretches already planned" }).planB).toBe(true);
    expect(contractFor({ ...base, goal: "Saturday depends on the weather" }).planB).toBe(true);
  });

  it("includes tests only with a Tests section and places only with My Places or a request for one", () => {
    const base = { goal: "Lighter week", coachNotes: false };
    expect(contractFor({ ...base, profile }).tests).toBe(false);
    expect(contractFor({ ...base, profile: { ...profile, tests: [{ name: "Max Hang" }] as never } }).tests).toBe(true);
    expect(contractFor({ ...base, profile }).places).toBe(false);
    expect(contractFor({ ...base, profile: { ...profile, places: [{ name: "Gym" }] as never } }).places).toBe(true);
    expect(contractFor({ ...base, profile, goal: "add the gym Boulderwelt" }).places).toBe(true);
    expect(contractFor({ ...base, profile }).coachNotes).toBe(false);
  });
});
