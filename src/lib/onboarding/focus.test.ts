import { describe, expect, it } from "vitest";
import { defaultPlanChoice, focusToProfile } from "./focus";
import { buildChecklist } from "../home/starterChecklist";

describe("focusToProfile", () => {
  it("writes nothing when nothing was answered", () => {
    expect(focusToProfile(null, null, undefined)).toBeNull();
  });

  it("turns each answer into a plain sentence for the AI coach's About me", () => {
    expect(focusToProfile("boulder", null, undefined)).toEqual({ id: "me", other: "I mainly boulder." });
    expect(focusToProfile("routes", "stronger", undefined)).toMatchObject({ other: expect.stringMatching(/routes/), standingGoal: expect.stringMatching(/stronger/i) });
    expect(focusToProfile(null, "trip", undefined)?.standingGoal).toMatch(/trip|competition/i);
    expect(focusToProfile(null, "log", undefined)?.standingGoal).toMatch(/no particular target/i);
  });

  it("keeps what was already in the profile, and never overwrites something the person wrote", () => {
    const existing = { id: "me" as const, heightCm: 180, other: "Left shoulder is cranky.", standingGoal: "Send my first 7A." };
    const merged = focusToProfile("boulder", "stronger", existing)!;
    expect(merged.heightCm).toBe(180);
    expect(merged.standingGoal).toBe("Send my first 7A.");
    expect(merged.other).toBe("Left shoulder is cranky. I mainly boulder.");
  });
});

describe("defaultPlanChoice", () => {
  it("a person who only wants to log starts with an empty plan, everyone else with the base block", () => {
    expect(defaultPlanChoice("log")).toBe("none");
    expect(defaultPlanChoice("stronger")).toBe("base-4");
    expect(defaultPlanChoice("trip")).toBe("base-4");
    expect(defaultPlanChoice(null)).toBe("base-4");
  });
});

describe("checklist goal item", () => {
  const base = { workouts: [], dailyMetrics: [], benchmarks: [], painLogs: [], outdoorAscents: [], trainingBlocks: [], tourSeen: false, dismissed: false, syncAvailable: false, syncConnected: false };
  it("offers an optional 'add a trip or competition' until there is one, and it never keeps the card open", () => {
    const c = buildChecklist({ ...base, goals: [] });
    expect(c.items.find((i) => i.id === "goal")).toMatchObject({ optional: true, done: false });
    expect(buildChecklist({ ...base, goals: [{}] }).items.find((i) => i.id === "goal")!.done).toBe(true);
    const finished = buildChecklist({ ...base, goals: [], trainingBlocks: [{}], workouts: [{ status: "completed" }], dailyMetrics: [{}], tourSeen: true });
    expect(finished.visible).toBe(false);
  });
});
