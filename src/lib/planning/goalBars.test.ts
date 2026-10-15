import { describe, it, expect } from "vitest";
import { goalsByDay } from "./goalBars";
import { toUtcDayIndex } from "../dateUtils";
import type { GoalEvent } from "../types";

const day = (iso: string) => toUtcDayIndex(iso);
const week = Array.from({ length: 7 }, (_, i) => day("2026-10-05") + i); // Mon 5 - Sun 11 Oct
const trip = (id: string, date: string, endDate?: string): GoalEvent => ({ id, kind: "trip", name: id, date, ...(endDate ? { endDate } : {}) });
const comp = (id: string, date: string): GoalEvent => ({ id, kind: "competition", name: id, date });

describe("goalsByDay", () => {
  it("lists the goals on each day they cover", () => {
    const map = goalsByDay([trip("t", "2026-10-07", "2026-10-08"), comp("c", "2026-10-08")], week);
    expect([...map].map(([d, gs]) => [d - week[0], gs.map((g) => g.id)])).toEqual([[2, ["t"]], [3, ["t", "c"]]]);
  });
  it("is empty when nothing is on", () => {
    expect(goalsByDay([comp("c", "2026-11-08")], week).size).toBe(0);
  });
});
