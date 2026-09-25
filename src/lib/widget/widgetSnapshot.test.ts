import { describe, it, expect } from "vitest";
import { buildWidgetSnapshot, localIsoDate } from "./widgetSnapshot";
import type { Workout } from "../types";

const workout = (notes: string, extra: Partial<Workout> = {}): Workout =>
  ({ id: notes, status: "planned", date: null, notes, exercises: [], ...extra }) as Workout;

describe("widget snapshot", () => {
  it("dates by the phone's calendar, not UTC", () => {
    expect(localIsoDate(new Date(2026, 8, 25, 23, 59))).toBe("2026-09-25");
    expect(localIsoDate(new Date(2026, 0, 3, 0, 1))).toBe("2026-01-03");
  });

  it("carries readiness, each day's sessions and the running session", () => {
    const now = new Date(2026, 8, 25, 8, 0);
    const snap = buildWidgetSnapshot({
      now,
      readiness: { score: 71.6, status: "good" } as never,
      days: [
        { date: "2026-09-25", planned: [workout("Board", { startTime: "18:00", plannedDuration: 90 })], done: 1 },
        { date: "2026-09-26", planned: [], done: 0 },
      ],
      exerciseTypes: [],
      active: { name: "Board", settled: 1, total: 4, paused: false, elapsedMs: 60_000 },
    });
    expect(snap.readiness).toEqual({ date: "2026-09-25", score: 72, status: "good" });
    expect(snap.days[0]).toEqual({ date: "2026-09-25", done: 1, planned: [{ name: "Board", time: "18:00", minutes: 90, exercises: 0 }] });
    expect(snap.active?.settled).toBe(1);
    expect(snap.updatedAt).toBe(now.getTime());
  });

  it("names an unnamed session, and has no score before anything is logged", () => {
    const snap = buildWidgetSnapshot({
      now: new Date(2026, 8, 25),
      readiness: { score: undefined, status: "neutral" } as never,
      days: [{ date: "2026-09-25", planned: [workout("  ")], done: 0 }],
      exerciseTypes: [],
      active: null,
    });
    expect(snap.days[0].planned[0].name).toBe("Session");
    expect(snap.readiness.score).toBeNull();
  });
});
