import { describe, it, expect } from "vitest";
import type { Benchmark, OutdoorAscent, Workout } from "../types";
import { consistency, latestBenchmarks, retestDue, sendsSummary } from "./progress";

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
