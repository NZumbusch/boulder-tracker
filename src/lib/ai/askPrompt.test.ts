import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import { buildInsightAskPrompt, buildSessionAskPrompt, ASK_PREAMBLE, DEFAULT_SESSION_QUESTION } from "./askPrompt";

const w = (over: Partial<Workout>): Workout =>
  ({ id: "w", status: "completed", date: "2026-10-09T12:00:00Z", weekId: "2026-W41", notes: "Konstanz session", loadFactor: 1970, fingers: 6, systemic: 6, logNotes: "Tired by the end", exercises: [{ id: "e", typeId: "hb", logged: { sets: 4, reps: 6 } }], ...over }) as Workout;

describe("ask prompts", () => {
  it("an insights question carries the findings, the digest and the question", () => {
    const p = buildInsightAskPrompt({
      groupLabel: "Push or rest",
      findings: [{ id: "a", group: "push", tone: "caution", title: "Load is 1.55× your usual week", detail: "2,870 against 1,850." }],
      sinceLast: "Since the plan was last changed (computed by the app):\n- W41: 3 of 7 sessions done",
      coachMemory: "Recovers slowly from max hangs.",
      question: "Should I rest tomorrow?",
    });
    expect(p.startsWith(ASK_PREAMBLE)).toBe(true);
    expect(p).toContain("Recovers slowly from max hangs.");
    expect(p).toContain("Load is 1.55× your usual week - 2,870 against 1,850.");
    expect(p).toContain("W41: 3 of 7 sessions done");
    expect(p.endsWith("Should I rest tomorrow?")).toBe(true);
  });

  it("a session question has the session, the sessions before it and a default question", () => {
    const p = buildSessionAskPrompt({ workout: w({}), before: [w({ id: "b", notes: "Before" })], exerciseTypes: [{ id: "hb", name: "Hangboard", category: "Fingers", parameters: [] }], noteSharing: { logNotes: true, planNotes: false }, question: "" });
    expect(p).toContain('"name":"Konstanz session"');
    expect(p).toContain('"howItWent":"Tired by the end"');
    expect(p).toContain("My previous sessions, for comparison");
    expect(p).toContain('"name":"Before"');
    expect(p.endsWith(DEFAULT_SESSION_QUESTION)).toBe(true);
  });

  it("leaves out the session note when it isn't shared, and empty parts", () => {
    const p = buildSessionAskPrompt({ workout: w({}), before: [], exerciseTypes: [], noteSharing: { logNotes: false, planNotes: false }, question: "Why?" });
    expect(p).not.toContain("Tired by the end");
    expect(p).not.toContain("My previous sessions");
    expect(p).not.toContain("My coaching memory");
  });
});
