import { describe, it, expect } from "vitest";
import type { Benchmark, BenchmarkTypeDef, OutdoorAscent, Workout } from "../types";
import { buildWeeklyHistory } from "../analytics/weekSummary";
import { buildOutdoorSummary, condenseBenchmarks, summarizeWorkout } from "./context";
import { exerciseModalityLines } from "./coachPrompt";

const planned = (id: string, weekId: string, notes: string, skipped = false): Workout =>
  ({ id, status: "planned", date: null, weekId, notes, loadFactor: 0, exercises: skipped ? [{ id: "s", typeId: "x", skipped: true }] : [{ id: "s", typeId: "x" }] }) as unknown as Workout;
const done = (id: string, weekId: string): Workout => ({ id, status: "completed", date: "2026-10-13T18:30:00.000Z", weekId, notes: "Done", loadFactor: 100, exercises: [] }) as unknown as Workout;

describe("missed sessions in the weekly history", () => {
  it("names the planned sessions that were left undone, not the ones skipped on purpose", () => {
    const ws = [done("a", "2026-W41"), planned("b", "2026-W41", "Board session"), planned("c", "2026-W41", "Max hangs", true), planned("d", "2026-W40", "Core")];
    const [w40, w41] = buildWeeklyHistory(ws, [], [], ["2026-W40", "2026-W41"], undefined, { missed: true });
    expect(w41.missed).toEqual(["Board session"]);
    expect(w40).toEqual({ week: "2026-W40", sessions: 0, missed: ["Core"] });
  });

  it("is off unless asked for - Home and Insights read the same function", () => {
    const [w] = buildWeeklyHistory([planned("d", "2026-W40", "Core")], [], [], ["2026-W40"]);
    expect(w).not.toHaveProperty("missed");
  });
});

describe("a session line", () => {
  it("has the day and weekday, and no status for a completed session", () => {
    const s = summarizeWorkout(done("a", "2026-W42"), []);
    expect(s).toMatchObject({ date: "2026-10-13", day: "Tue" });
    expect(s).not.toHaveProperty("status");
    expect(summarizeWorkout(planned("p", "2026-W42", "Later"), []).status).toBe("planned");
  });
});

describe("test results for the prompt", () => {
  const type = (id: string, direction?: "lower"): BenchmarkTypeDef => ({ id, name: id, unit: "kg", ...(direction ? { direction } : {}) }) as BenchmarkTypeDef;
  const result = (n: number, value: number, typeId = "hang"): Benchmark => ({ id: `r${n}`, typeId, type: typeId, value, unit: "kg", date: `2026-0${n}-10`, weekId: "2026-W10" }) as Benchmark;

  it("keeps the latest four of each test and the best when it is older, without ids", () => {
    const results = [1, 2, 3, 4, 5, 6, 7].map((n) => result(n, n === 2 ? 99 : n));
    const out = condenseBenchmarks(results, [type("hang")], []);
    expect(out.map((r) => r.date)).toEqual(["2026-02-10", "2026-04-10", "2026-05-10", "2026-06-10", "2026-07-10"]);
    expect(out[0]).toMatchObject({ value: 99, best: true });
    expect(out[1]).not.toHaveProperty("best");
    expect(out[0]).not.toHaveProperty("id");
    expect(out[0]).not.toHaveProperty("weekId");
  });

  it("takes the lowest as best where lower is better", () => {
    const out = condenseBenchmarks([1, 2, 3, 4, 5, 6].map((n) => result(n, n === 1 ? 5 : 20 + n)), [type("hang", "lower")], []);
    expect(out[0]).toMatchObject({ value: 5, best: true, better: "lower" });
  });

  it("keeps everything when asked for no limit (Analyze Past)", () => {
    expect(condenseBenchmarks([1, 2, 3, 4, 5, 6].map((n) => result(n, n)), [type("hang")], [], Infinity)).toHaveLength(6);
  });
});

describe("outdoor ascents as a grade picture", () => {
  const asOf = new Date("2026-10-24T12:00:00Z");
  const a = (date: string, grade: string, style?: string): OutdoorAscent => ({ id: date + grade, date, grade, style }) as OutdoorAscent;

  it("counts the last year by grade, hardest first, and names the hardest per style", () => {
    const sum = buildOutdoorSummary([a("2026-09-24", "6C", "Flash"), a("2026-08-25", "7a", "Redpoint"), a("2026-07-01", "6C"), a("2024-01-01", "7B", "Redpoint"), a("2025-12-01", "7A", "Flash")], asOf)!;
    expect(sum.total).toBe(5);
    expect(sum.since).toBe("2024-01");
    expect(Object.entries(sum.last12Months)).toEqual([["7A", 2], ["6C", 2]]);
    expect(sum.hardest.redpoint).toEqual({ grade: "7B", date: "2024-01-01" });
    expect(sum.hardest.flash).toEqual({ grade: "7A", date: "2025-12-01" });
  });

  it("is nothing for an empty log", () => {
    expect(buildOutdoorSummary([], asOf)).toBeUndefined();
  });
});

describe("the exercise list", () => {
  const m = (name: string, params: string[], category = "Fingers", group = category) => ({ name, category, group, params }) as never;

  it("names a field list shared by two exercises once, and drops a group equal to the category", () => {
    const text = exerciseModalityLines([m("Max Hangs", ["sets", "timeOn"]), m("Repeaters", ["sets", "timeOn"]), m("Pull-ups", ["sets", "reps"], "Arms", "Strength")]);
    const [first, ...rows] = text.split("\n");
    expect(JSON.parse(first)).toEqual({ fieldLists: { P1: ["sets", "timeOn"] } });
    expect(JSON.parse(rows[0])).toEqual({ name: "Max Hangs", category: "Fingers", params: "P1" });
    expect(JSON.parse(rows[2])).toEqual({ name: "Pull-ups", category: "Arms", group: "Strength", params: ["sets", "reps"] });
  });

  it("has no field-list line when nothing repeats", () => {
    expect(exerciseModalityLines([m("A", ["sets"]), m("B", ["reps"])])).not.toContain("fieldLists");
    expect(exerciseModalityLines([])).toBe("(none)");
  });
});
