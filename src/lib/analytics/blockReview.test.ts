import { describe, it, expect } from "vitest";
import type { ExerciseSlot, TrainingBlock, Workout } from "../types";
import { blockReviewLines, blockToReview, buildBlockReview, type BlockReviewInputs } from "./blockReview";
import { getWeekId } from "../dateUtils";
import { weekMondayIso, weekSundayIso } from "../dateUtils";

const asOf = new Date(2026, 9, 11, 12); // Sunday of W41
const block = (id: string, name: string, a: string, b: string): TrainingBlock => ({ id, name, phaseId: "cap", startDate: weekMondayIso(a), endDate: weekSundayIso(b) });
const slot = (cat: string, mins: number): ExerciseSlot => ({ id: Math.random().toString(), typeId: cat, logged: { duration: mins } }) as ExerciseSlot;
const done = (d: Date, load: number, exercises: ExerciseSlot[] = []): Workout => ({ id: `d${d.getTime()}`, status: "completed", date: d.toISOString(), weekId: getWeekId(d), loadFactor: load, exercises }) as Workout;
const planned = (weekId: string, day: Workout["dayOfWeek"]): Workout => ({ id: `p${weekId}${day}`, status: "planned", date: null, weekId, dayOfWeek: day, loadFactor: 0, exercises: [{ id: "x", typeId: "t", prescribed: {} }] }) as Workout;

function inputs(over: Partial<BlockReviewInputs> = {}): BlockReviewInputs {
  const all: Workout[] = [
    done(new Date(2026, 8, 22, 12), 1000, [slot("tech", 60)]), // W39
    done(new Date(2026, 8, 29, 12), 1200, [slot("tech", 60), slot("finger", 20)]), // W40
    planned("2026-W40", "Friday"), // missed
    done(new Date(2026, 9, 6, 12), 1500, [slot("finger", 40)]), // W41 (running)
  ];
  return {
    block: block("b", "Capacity", "2026-W39", "2026-W42"),
    asOf,
    workouts: all,
    workoutsForWeek: (id) => all.filter((w) => w.weekId === id),
    exerciseTypes: [{ id: "tech", name: "Tech", category: "Technique", parameters: [] }, { id: "finger", name: "Fingers", category: "Fingers", parameters: [] }] as never[],
    analyticsCategories: [{ id: "Technique", name: "Technique", color: "x" }, { id: "Fingers", name: "Fingers", color: "y" }] as never[],
    benchmarks: [], benchmarkTypes: [], valueDefs: [], weightUnit: "kg", ascents: [],
    ...over,
  };
}

describe("buildBlockReview", () => {
  it("counts the weeks so far, the sessions done against due, and the load per week", () => {
    const r = buildBlockReview(inputs())!;
    expect(r.weeks).toBe(3);
    expect(r.running).toBe(true);
    expect(r.sessions).toEqual({ done: 3, planned: 4 });
    expect(r.weeklyLoad.map((w) => w.load)).toEqual([1000, 1200, 1500]);
    // First to last FULL week: W39 1000 -> W40 1200.
    expect(r.loadChange).toBeCloseTo(20, 5);
  });

  it("shows where the time went", () => {
    const r = buildBlockReview(inputs())!;
    expect(r.mix[0]).toMatchObject({ name: "Technique" });
    expect(r.mix.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1, 5);
  });

  it("reports sends in the block's dates and the hardest", () => {
    const r = buildBlockReview(inputs({ ascents: [
      { id: "a", date: "2026-09-27", grade: "6C", name: "A" },
      { id: "b", date: "2026-10-03", grade: "7A", name: "B" },
      { id: "c", date: "2026-08-01", grade: "7C", name: "Old" },
    ] as never[] }))!;
    expect(r.sends).toEqual({ count: 2, hardest: "7A" });
  });

  it("reports a test's change over the block against the result before it", () => {
    const hang = { id: "hang", name: "Max Hang", unit: "kg" };
    const result = (id: string, date: string, v: number) => ({ id, typeId: "hang", type: "Max Hang", value: v, unit: "kg", date, weekId: "2026-W30", values: { weight: v } });
    const r = buildBlockReview(inputs({ benchmarkTypes: [hang], benchmarks: [result("1", "2026-08-10T12:00:00Z", 50), result("2", "2026-10-02T12:00:00Z", 55)] as never[] }))!;
    expect(r.tests).toHaveLength(1);
    expect(r.tests[0]).toMatchObject({ name: "Max Hang", before: 50, after: 55 });
    expect(r.tests[0].change).toBeCloseTo(10, 5);
  });

  it("has nothing for a block that hasn't started", () => {
    expect(buildBlockReview(inputs({ block: block("n", "Next", "2026-W45", "2026-W47") }))).toBeUndefined();
  });

  it("writes the review as lines", () => {
    const lines = blockReviewLines(buildBlockReview(inputs())!);
    expect(lines[0]).toBe("Capacity W39-W42 (3 weeks, still running)");
    expect(lines).toContain("Sessions: 3 of 4 done (75%)");
    expect(lines.find((l) => l.startsWith("Load per week"))).toContain("+20% first to last full week");
  });
});

describe("blockToReview", () => {
  const blocks = [block("a", "Capacity", "2026-W34", "2026-W37"), block("b", "Strength", "2026-W38", "2026-W40"), block("c", "Power", "2026-W41", "2026-W44")];
  it("is the block that ended in the last two weeks", () => {
    expect(blockToReview(blocks, asOf)?.id).toBe("b");
  });
  it("is nothing when the last block ended longer ago", () => {
    expect(blockToReview([blocks[0]], asOf)).toBeUndefined();
  });
});
