import { describe, it, expect } from "vitest";
import type { AIContextProfile } from "./context";
import { buildCoachPrompt } from "./coachPrompt";

const profile: AIContextProfile = {
  exerciseModalities: [{ name: "Hangboard", category: "Fingers", params: ["sets"] }],
  phases: ["Strength"],
  recentWorkouts: [],
  benchmarks: [],
};

describe("buildCoachPrompt", () => {
  it("generate: asks for a change set over the target weeks, with goal and current plan", () => {
    const p = buildCoachPrompt({ mode: "generate", profile, targetWeekIds: ["2026-W40", "2026-W41"], goal: "Font trip", planContext: "PHASES - x" });
    expect(p).toContain("2026-W40, 2026-W41");
    expect(p).toContain("Font trip");
    expect(p).toContain("PHASES - x");
    expect(p).toContain("CHANGE SET");
    // The plan context lists phases itself.
    expect(p).not.toContain("Available Phases");
  });

  it("analyze: asks for feedback, never a change set", () => {
    const p = buildCoachPrompt({ mode: "analyze", profile, targetWeekIds: ["2026-W38"], goal: "" });
    expect(p).toContain("2026-W38");
    expect(p).toContain("what I did well");
    expect(p).not.toContain("CHANGE SET");
  });

  it("context: only the profile", () => {
    const p = buildCoachPrompt({ mode: "context", profile, targetWeekIds: [], goal: "ignored" });
    expect(p).toContain("Hangboard");
    expect(p).not.toContain("ignored");
    expect(p).not.toContain("CHANGE SET");
  });
});
