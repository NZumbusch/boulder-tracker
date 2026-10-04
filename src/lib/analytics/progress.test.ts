import { describe, it, expect } from "vitest";
import type { Benchmark, OutdoorAscent, ValueDef, Workout } from "../types";
import { benchmarkChanges, consistency, latestBenchmarks, retestDue, sendsSummary } from "./progress";
import { toUtcDayIndex } from "../dateUtils";

const asOf = new Date("2026-09-23T12:00:00Z"); // Wednesday of 2026-W39
const bench = (typeId: string, date: string, value: number): Benchmark => ({ id: typeId + date, typeId, type: typeId, value, unit: "kg", date, weekId: "x" });

describe("latestBenchmarks / retestDue", () => {
  const list = [bench("hang", "2026-06-01", 28), bench("hang", "2026-09-01", 32), bench("pull", "2026-07-01", 20)];

  it("gives each type's latest result and change, newest first", () => {
    const progress = latestBenchmarks(list, [{ id: "hang", name: "Max hang 20mm", unit: "kg" }]);
    expect(progress.map((p) => [p.name, p.latest, p.change])).toEqual([
      ["Max hang 20mm", 32, 4],
      ["pull", 20, undefined],
    ]);
  });

  it("nudges a retest for types untested for six weeks or more", () => {
    expect(retestDue(latestBenchmarks(list, []), asOf)).toEqual([{ name: "pull", weeks: 12 }]);
    // "hang" was last tested 3 weeks ago, "pull" 12: the window decides who's due.
    expect(retestDue(latestBenchmarks(list, []), asOf, 4).map((r) => r.name)).toEqual(["pull"]);
    expect(retestDue(latestBenchmarks(list, []), asOf, 3).map((r) => r.name)).toEqual(["pull", "hang"]);
  });
});

describe("sendsSummary", () => {
  it("finds the last send and the hardest Font grade this season", () => {
    const ascents: OutdoorAscent[] = [
      { id: "a", date: "2026-09-20", grade: "6C+" },
      { id: "b", date: "2026-05-01", grade: "7A" },
      { id: "c", date: "2024-05-01", grade: "7B" }, // too old
      { id: "d", date: "2026-08-01", grade: "V5" }, // not Font
    ];
    const s = sendsSummary(ascents, asOf);
    expect(s.last?.id).toBe("a");
    expect(s.hardest?.id).toBe("b");
    expect(s.countThisSeason).toBe(3);
  });
});

describe("consistency", () => {
  const w = (weekId: string, dayOfWeek: string, status: "planned" | "completed") =>
    ({ id: weekId + dayOfWeek + status, weekId, dayOfWeek, status, date: status === "completed" ? "2026-09-01" : null, loadFactor: 0, exercises: [] }) as unknown as Workout;

  it("counts due sessions done and ignores what hasn't happened yet", () => {
    const c = consistency(
      [
        w("2026-W38", "Monday", "completed"),
        w("2026-W38", "Thursday", "planned"), // missed
        w("2026-W39", "Monday", "completed"),
        w("2026-W39", "Friday", "planned"), // not due yet
        w("2026-W40", "Monday", "planned"), // future
      ],
      asOf,
    );
    expect(c).toMatchObject({ done: 2, due: 3 });
  });

  it("counts the weekly streak back from this week", () => {
    const c = consistency([w("2026-W37", "Monday", "completed"), w("2026-W38", "Monday", "completed"), w("2026-W39", "Monday", "completed")], asOf);
    expect(c.weekStreak).toBe(3);
    const gap = consistency([w("2026-W36", "Monday", "completed"), w("2026-W38", "Monday", "completed")], asOf);
    expect(gap.weekStreak).toBe(1);
  });
});

describe("benchmarkChanges", () => {
  const b = (typeId: string, date: string, value: number) => ({ id: typeId + date, typeId, type: typeId, value, unit: "kg", date, weekId: "" });
  const types = [{ id: "hang", name: "Max hang", unit: "kg" }, { id: "old", name: "Old", unit: "kg", archived: true }];
  it("is % change from the first result ever, for results inside the window", () => {
    const got = benchmarkChanges([b("hang", "2026-01-01", 20), b("hang", "2026-09-01", 25), b("old", "2026-09-02", 5)], types, toUtcDayIndex("2026-08-01"), toUtcDayIndex("2026-09-30"));
    expect(got).toHaveLength(1);
    expect(got[0].points).toHaveLength(1);
    expect(got[0].points[0].pct).toBeCloseTo(25);
  });
});

describe("benchmarks with fields", () => {
  const defs: ValueDef[] = [
    { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" },
    { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length" },
    { id: "time", name: "Time", unit: "s", kind: "number", measure: "time" },
  ];
  const hang = { id: "hang", name: "Max Hang", unit: "kg", fields: [{ valueId: "edge", role: "condition" as const }, { valueId: "weight", role: "result" as const, label: "Added weight" }] };
  const circuit = { id: "circ", name: "Circuit", unit: "s", direction: "lower" as const, fields: [{ valueId: "time", role: "result" as const }] };
  const res = (id: string, typeId: string, date: string, value: number, values: Record<string, number>): Benchmark => ({ id, typeId, type: typeId, value, unit: typeId === "circ" ? "s" : "kg", date, weekId: "", values });

  it("keeps an edge's results apart: the change is within the same edge", () => {
    const list = [
      res("a", "hang", "2026-06-01", 40, { edge: 20, weight: 40 }),
      res("b", "hang", "2026-07-01", 20, { edge: 15, weight: 20 }),
      res("c", "hang", "2026-09-01", 45, { edge: 20, weight: 45 }),
    ];
    const p = latestBenchmarks(list, [hang], defs, "kg");
    expect(p.map((x) => [x.name, x.latest, x.change, x.latestText, x.changeText])).toEqual([
      ["Max Hang · 20 mm", 45, 5, "45 kg", "+5 kg"],
      ["Max Hang · 15 mm", 20, undefined, "20 kg", undefined],
    ]);
  });

  it("shows weights in the chosen unit and counts a lower time as a gain", () => {
    const w = latestBenchmarks([res("a", "hang", "2026-06-01", 40, { edge: 20, weight: 40 }), res("b", "hang", "2026-07-01", 45, { edge: 20, weight: 45 })], [hang], defs, "lb");
    expect(w[0].latestText).toBe("99.2 lb");
    expect(w[0].improved).toBe(true);
    const t = latestBenchmarks([res("a", "circ", "2026-06-01", 100, { time: 100 }), res("b", "circ", "2026-07-01", 90, { time: 90 })], [circuit], defs, "kg");
    expect([t[0].change, t[0].improved]).toEqual([-10, true]);
  });

  it("charts % change as a gain when lower is better", () => {
    const got = benchmarkChanges(
      [res("a", "circ", "2026-06-01", 100, { time: 100 }), res("b", "circ", "2026-09-01", 90, { time: 90 })],
      [circuit], toUtcDayIndex("2026-01-01"), toUtcDayIndex("2026-12-31"), defs, "kg",
    );
    expect(got[0].points.map((p) => Math.round(p.pct))).toEqual([0, 10]);
  });
});
