import { describe, it, expect } from "vitest";
import { goalBars, goalsByDay } from "./goalBars";
import { toUtcDayIndex } from "../dateUtils";
import type { GoalEvent } from "../types";

const day = (iso: string) => toUtcDayIndex(iso);
const week = Array.from({ length: 7 }, (_, i) => day("2026-10-05") + i); // Mon 5 - Sun 11 Oct
const trip = (id: string, date: string, endDate?: string): GoalEvent => ({ id, kind: "trip", name: id, date, ...(endDate ? { endDate } : {}) });
const comp = (id: string, date: string): GoalEvent => ({ id, kind: "competition", name: id, date });
const show = (bars: ReturnType<typeof goalBars>) => bars.map((b) => `${b.goal.id}:${b.from}+${b.span}@${b.lane}${b.startsBefore ? "<" : ""}${b.endsAfter ? ">" : ""}`);

describe("goalBars", () => {
  it("draws a trip over its days, a competition over its one day", () => {
    expect(show(goalBars([trip("t", "2026-10-07", "2026-10-09"), comp("c", "2026-10-11")], week))).toEqual(["t:2+3@0", "c:6+1@0"]);
  });
  it("clips a goal to the days shown and says which side was cut", () => {
    expect(show(goalBars([trip("t", "2026-10-02", "2026-10-06")], week))).toEqual(["t:0+2@0<"]);
    expect(show(goalBars([trip("t", "2026-10-10", "2026-10-20")], week))).toEqual(["t:5+2@0>"]);
    expect(show(goalBars([trip("t", "2026-10-01", "2026-10-30")], week))).toEqual(["t:0+7@0<>"]);
  });
  it("leaves out goals that miss the days shown", () => {
    expect(goalBars([trip("t", "2026-10-12", "2026-10-14"), comp("c", "2026-10-04")], week)).toEqual([]);
  });
  it("puts goals that overlap on their own rows, and reuses a row once it is free", () => {
    const bars = goalBars([trip("a", "2026-10-05", "2026-10-08"), trip("b", "2026-10-07", "2026-10-10"), comp("c", "2026-10-09")], week);
    expect(show(bars)).toEqual(["a:0+4@0", "b:2+4@1", "c:4+1@0"]);
  });
  it("works for a single day", () => {
    expect(show(goalBars([trip("t", "2026-10-07", "2026-10-09")], [day("2026-10-08")]))).toEqual(["t:0+1@0<>"]);
  });
});

describe("goalsByDay", () => {
  it("lists the goals on each day they cover", () => {
    const map = goalsByDay([trip("t", "2026-10-07", "2026-10-08"), comp("c", "2026-10-08")], week);
    expect([...map].map(([d, gs]) => [d - week[0], gs.map((g) => g.id)])).toEqual([[2, ["t"]], [3, ["t", "c"]]]);
  });
  it("is empty when nothing is on", () => {
    expect(goalsByDay([comp("c", "2026-11-08")], week).size).toBe(0);
  });
});
