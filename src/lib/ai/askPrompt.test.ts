import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import { buildInsightAskPrompt, buildSessionAskPrompt, buildActivityAskPrompt, activitiesBefore, ASK_PREAMBLE, DEFAULT_SESSION_QUESTION, DEFAULT_ACTIVITY_QUESTION } from "./askPrompt";
import type { ExternalActivity } from "../types";

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

describe("activity ask prompt", () => {
  const act = (id: string, start: string, over: Partial<ExternalActivity> = {}): ExternalActivity => ({ id, source: "garmin", sourceId: id, date: start.slice(0, 10), start, name: id, type: "Run", durationSec: 2400, distanceM: 8000, avgHr: 150, maxHr: 175, ...over });
  const stats = { splitsSec: [300, 310], paceDriftPct: 5, hrBinsSec: [0, 0, 0, 0, 1800, 0, 0, 0, 300, 0, 0], effectLabel: "tempo" };

  it("is the preamble, the activity with everything its recording gave, the earlier ones of its kind, and the question", () => {
    const a = act("today", "2026-10-20T06:30:00.000Z", { stats });
    const p = buildActivityAskPrompt({ activity: a, before: [act("earlier", "2026-10-13T06:30:00.000Z")], maxHr: 190, recoveryLine: '{"sleepScore":71}', coachMemory: "Hates 4x4", question: "" });
    expect(p.startsWith(ASK_PREAMBLE)).toBe(true);
    expect(p).toContain("Hates 4x4");
    expect(p).toContain('"kmSplits":"5:00 5:10"');
    expect(p).toContain('"zonesMin":"Z3 30 · Z5 5"');
    expect(p).toContain('"garminEffect":"trained: tempo"');
    expect(p).toContain("My previous run activities, for comparison");
    expect(p).toContain('"sleepScore":71');
    expect(p).toContain(DEFAULT_ACTIVITY_QUESTION);
    expect(p).toContain("kmSplits are minutes:seconds");
  });

  it("leaves out the comparison, the recovery and the legend when there is none", () => {
    const p = buildActivityAskPrompt({ activity: act("x", "2026-10-20T06:30:00.000Z"), before: [], maxHr: 190, question: "Why so slow?" });
    expect(p).not.toContain("previous");
    expect(p).not.toContain("recovering");
    expect(p).not.toContain("kmSplits are");
    expect(p).toContain("Why so slow?");
  });

  it("picks the latest earlier activities of the same kind", () => {
    const now = act("now", "2026-10-20T06:30:00.000Z");
    const all = [act("r1", "2026-10-01T06:30:00.000Z"), act("r2", "2026-10-05T06:30:00.000Z"), act("r3", "2026-10-10T06:30:00.000Z"), act("r4", "2026-10-15T06:30:00.000Z"), act("ride", "2026-10-18T06:30:00.000Z", { type: "Ride" }), act("later", "2026-10-25T06:30:00.000Z"), now];
    expect(activitiesBefore(now, all).map((a) => a.id)).toEqual(["r2", "r3", "r4"]);
  });
});
